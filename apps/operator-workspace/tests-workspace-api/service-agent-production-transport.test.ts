import { describe, expect, it, vi } from 'vitest';
import type { ServiceAgentRunInput, ServiceAgentRunResult } from '@busos/service-agent-port';
import { ServiceAgentProductionAdapter } from '@busos/service-agent-port';

import { loadServiceAgentProductionConfig } from '../server/features/service-agent/service-agent-production-config.js';
import {
  createServiceAgentProductionTransport,
} from '../server/features/service-agent/service-agent-production-transport.js';
import {
  failClosedServiceAgentPort,
  resolveServiceAgentPort,
} from '../server/features/service-agent/service-agent-production-binding.js';

const CONFIG = {
  baseUrl: 'https://scs.example.internal',
  apiKey: 'sensitive-agent-key-do-not-leak',
};

const INPUT: ServiceAgentRunInput = { query: '客户问退款政策' };

/** A FULL, contract-valid SCS /api/agent/chat response. */
function fullScsResponse(): Record<string, unknown> {
  return {
    run_id: 'run_abc123',
    request_id: 'req_abc123',
    conversation_id: 'conv_abc123',
    suggested_reply: '建议话术内容',
    source_modules: ['kb_module_a'],
    retrieval_score: 0.82,
    confidence: 0.82,
    confidence_semantics: 'heuristic_distance_score',
    needs_human_confirm: false,
    review_reasons: [],
    results: [
      { doc_ref: 'doc_abcdef12', category: 'pricing', section_title: '退款政策', distance: 0.1 },
    ],
    intent: 'I01',
    risk_level: 'R0',
    route_path: 'KB_PATH',
    must_handoff: false,
    needs_clarification: false,
    answer_requires_disclaimer: false,
    latency_ms: 1234,
    model_name: 'gpt-4o',
    llm_used: true,
    prompt_version: 'v3.2.1',
  };
}

interface MockFetchCall {
  url: string;
  init: RequestInit | undefined;
}
function jsonFetch(body: unknown, ok = true, status = 200): {
  fetchFn: typeof fetch;
  calls: MockFetchCall[];
} {
  const calls: MockFetchCall[] = [];
  const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return {
      ok,
      status,
      json: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

function adapterWith(fetchFn: typeof fetch) {
  return new ServiceAgentProductionAdapter(
    createServiceAgentProductionTransport({ config: CONFIG, fetchFn }),
  );
}

describe('A. production transport success', () => {
  it('maps a valid SCS response into a valid ServiceAgentRunResult', async () => {
    const { fetchFn, calls } = jsonFetch(fullScsResponse());
    const result = (await adapterWith(fetchFn).run(INPUT)) as ServiceAgentRunResult;

    expect(result.answer).toBe('建议话术内容');
    expect(result.intent).toBe('I01');
    expect(result.risk).toBe('R0');
    expect(result.route).toBe('KB_PATH');
    expect(result.handoff).toEqual({
      mustHandoff: false,
      needsClarification: false,
      answerRequiresDisclaimer: false,
      needsHumanConfirm: false,
    });
    expect(result.evidence.sourceModules).toEqual(['kb_module_a']);
    expect(result.evidence.sourceRefs[0]?.source_id).toBe('doc_abcdef12');
    expect(result.evidence.retrievalScore).toBe(0.82);
    expect(result.evidence.hasRetrievalEvidence).toBe(true);
    expect(result.trace.runId).toBe('run_abc123');
    expect(result.trace.requestId).toBe('req_abc123');
    expect(result.trace.conversationId).toBe('conv_abc123');
    expect(result.trace.latencyMs).toBe(1234);
    expect(result.trace.modelName).toBe('gpt-4o');
    expect(result.trace.llmUsed).toBe(true);
    expect(result.trace.promptVersion).toBe('v3.2.1');

    // Auth + canonical endpoint wiring confirmed.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://scs.example.internal/api/agent/chat');
    expect((calls[0]!.init?.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer sensitive-agent-key-do-not-leak',
    );
  });

  it('forwards query / topK / conversationId / customerId to the SCS body', async () => {
    const { fetchFn, calls } = jsonFetch(fullScsResponse());
    await adapterWith(fetchFn).run({
      query: 'q',
      topK: 5,
      conversationId: 'c1',
      customerId: 'u1',
    });
    const sent = JSON.parse((calls[0]!.init?.body as string) ?? '{}');
    expect(sent).toEqual({
      message: 'q',
      top_k: 5,
      conversation_id: 'c1',
      customer_id: 'u1',
    });
  });
});

describe('B. invalid response fails closed', () => {
  const badCases: Array<[string, Record<string, unknown>]> = [
    ['missing intent', { ...fullScsResponse(), intent: undefined }],
    ['unknown risk', { ...fullScsResponse(), risk_level: 'R9' }],
    ['unknown route', { ...fullScsResponse(), route_path: 'WEIRD' }],
    ['non-string intent', { ...fullScsResponse(), intent: 123 }],
    ['missing trace promptVersion', { ...fullScsResponse(), prompt_version: undefined }],
  ];

  for (const [label, payload] of badCases) {
    it(`rejects when SCS response has ${label}`, async () => {
      const { fetchFn } = jsonFetch(payload);
      await expect(adapterWith(fetchFn).run(INPUT)).rejects.toThrow();
    });
  }
});

describe('C. network failure fails closed', () => {
  it('rejects on transport network error', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('dns failure');
    }) as unknown as typeof fetch;
    await expect(adapterWith(fetchFn).run(INPUT)).rejects.toThrow();
  });

  it('rejects on timeout (abort signal)', async () => {
    const fetchFn = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true },
          );
        }),
    ) as unknown as typeof fetch;
    const adapter = new ServiceAgentProductionAdapter(
      createServiceAgentProductionTransport({ config: CONFIG, fetchFn, timeoutMs: 5 }),
    );
    await expect(adapter.run(INPUT)).rejects.toThrow();
  });

  it('rejects on non-2xx', async () => {
    const { fetchFn } = jsonFetch({ error: 'boom' }, false, 500);
    await expect(adapterWith(fetchFn).run(INPUT)).rejects.toThrow();
  });

  it('rejects on non-JSON body', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    })) as unknown as typeof fetch;
    await expect(adapterWith(fetchFn).run(INPUT)).rejects.toThrow();
  });
});

describe('D. missing configuration keeps fail-closed', () => {
  it('config loader returns null when env absent or malformed', () => {
    expect(loadServiceAgentProductionConfig({})).toBeNull();
    expect(
      loadServiceAgentProductionConfig({
        BUSOS_SCS_BASE_URL: 'https://scs.internal',
        SCS_AGENT_API_KEY: '',
      }),
    ).toBeNull();
    expect(
      loadServiceAgentProductionConfig({
        BUSOS_SCS_BASE_URL: 'not-a-url',
        SCS_AGENT_API_KEY: 'k',
      }),
    ).toBeNull();
    expect(
      loadServiceAgentProductionConfig({
        BUSOS_SCS_BASE_URL: '',
        SCS_AGENT_API_KEY: 'k',
      }),
    ).toBeNull();
  });

  it('valid config yields an adapter; null config yields the fail-closed port', () => {
    const live = resolveServiceAgentPort(CONFIG);
    expect(live).not.toBe(failClosedServiceAgentPort);
    const closed = resolveServiceAgentPort(null);
    expect(closed).toBe(failClosedServiceAgentPort);
  });

  it('fail-closed port rejects with SERVICE_AGENT_NOT_CONFIGURED', async () => {
    await expect(failClosedServiceAgentPort.run(INPUT)).rejects.toMatchObject({
      code: 'SERVICE_AGENT_NOT_CONFIGURED',
    });
  });

  it('server with null config still boots and stays fail-closed (no crash)', async () => {
    const { ServiceAgentRuntime } = await import(
      '../server/features/service-agent/service-agent-runtime.js'
    );
    const { InMemoryServiceAgentConversationStore } = await import(
      '@busos/service-agent-port'
    );
    const { InMemoryProcessRegistry } = await import('@busos/orchestrator');
    const runtime = new ServiceAgentRuntime({
      serviceAgent: resolveServiceAgentPort(null),
      conversationStore: new InMemoryServiceAgentConversationStore(),
      processRegistry: new InMemoryProcessRegistry(),
    });
    // The server boundary boots; a consultation with no configured SCS does NOT
    // crash and does NOT return a fake success — it resolves with a FAILED run
    // (fail-closed). The port-level SERVICE_AGENT_NOT_CONFIGURED error is
    // surfaced here as UPSTREAM_TEMPORARY_FAILURE per the orchestrator contract.
    const consultation = await runtime.consult({
      query: 'x',
      idempotencyKey: 'null-config-probe',
    });
    expect(consultation.run.status).toBe('FAILED');
    expect(consultation.run.error?.code).toBe('UPSTREAM_TEMPORARY_FAILURE');
  });
});

describe('E. secret leakage prevention', () => {
  it('request-failure errors never contain the URL, key, or auth header', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('dns failure including https://scs.example.internal and Bearer sensitive-agent-key-do-not-leak');
    }) as unknown as typeof fetch;
    let thrown: unknown;
    try {
      await adapterWith(fetchFn).run(INPUT);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    const msg = (thrown as Error).message;
    expect(msg).not.toContain('sensitive-agent-key-do-not-leak');
    expect(msg).not.toContain('https://scs.example.internal');
    expect(msg).not.toContain('Bearer');
    expect(msg).not.toContain('Authorization');
  });

  it('non-2xx errors never echo provider URL or token', async () => {
    const { fetchFn } = jsonFetch({ detail: 'unauthorized at https://scs.example.internal' }, false, 500);
    let thrown: unknown;
    try {
      await adapterWith(fetchFn).run(INPUT);
    } catch (e) {
      thrown = e;
    }
    const msg = (thrown as Error).message;
    expect(msg).not.toContain('sensitive-agent-key-do-not-leak');
    expect(msg).not.toContain('https://scs.example.internal');
  });

  it('mapped result carries no secret material', async () => {
    const { fetchFn } = jsonFetch(fullScsResponse());
    const result = (await adapterWith(fetchFn).run(INPUT)) as ServiceAgentRunResult;
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('sensitive-agent-key-do-not-leak');
    expect(serialized).not.toContain('Bearer');
  });
});
