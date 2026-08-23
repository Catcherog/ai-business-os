import { describe, expect, it } from 'vitest';

import type { ServiceAgentPort, ServiceAgentRunResult } from '@busos/service-agent-port';
import { InMemoryProcessRegistry } from '@busos/orchestrator';
import { InMemoryServiceAgentConversationStore } from '@busos/service-agent-port';
import {
  ServiceAgentRuntime,
  createServiceAgentEndpoint,
} from '../server/features/service-agent/service-agent-runtime.js';

function makeResult(overrides: Partial<ServiceAgentRunResult> = {}): ServiceAgentRunResult {
  return {
    answer: '受控答复 password=answer-secret',
    intent: 'I01',
    risk: 'R0',
    route: 'KB_PATH',
    handoff: {
      mustHandoff: false,
      needsClarification: false,
      answerRequiresDisclaimer: false,
      needsHumanConfirm: false,
    },
    evidence: {
      sourceModules: ['controlled_probe'],
      sourceRefs: [{ source_id: 'probe_ref' }],
      retrievalScore: 0.5,
      canonicalAnswerId: 'answer_probe',
      sourceBlockId: 'block_probe',
      hasRetrievalEvidence: true,
    },
    trace: {
      runId: 'run_runtime_1',
      requestId: 'request_runtime_1',
      conversationId: 'conv_runtime_1',
      latencyMs: 2,
      modelName: null,
      llmUsed: false,
      promptVersion: 'probe',
    },
    ...overrides,
  };
}

function createRuntime() {
  let calls = 0;
  const port: ServiceAgentPort = {
    async run() {
      calls += 1;
      return makeResult();
    },
  };
  const runtime = new ServiceAgentRuntime({
    serviceAgent: port,
    conversationStore: new InMemoryServiceAgentConversationStore(),
    processRegistry: new InMemoryProcessRegistry(),
    now: () => new Date('2026-08-24T03:00:00.000Z'),
  });
  return { runtime, getCalls: () => calls };
}

describe('Service Agent runtime and read endpoints', () => {
  it('records a consultation as a canonical run and bounded conversation read', async () => {
    const { runtime } = createRuntime();
    const consultation = await runtime.consult({
      query: '请介绍一下服务 password=query-secret',
      customerId: 'cust_runtime_1',
      idempotencyKey: 'runtime-key-1',
    });

    expect(consultation.run.status).toBe('SUCCEEDED');
    expect(consultation.run.output?.serviceAgent?.trace.runId).toBe('run_runtime_1');
    expect(consultation.conversation.conversationId).toBe('conv_runtime_1');
    expect(consultation.conversation.turns).toHaveLength(2);
    expect(JSON.stringify(consultation.conversation)).not.toContain('query-secret');
    expect(JSON.stringify(consultation.conversation)).not.toContain('answer-secret');
    expect(JSON.stringify(consultation.run.trace)).not.toContain('query-secret');

    await expect(runtime.listConversations()).resolves.toHaveLength(1);
    await expect(runtime.listRuns()).resolves.toEqual([
      expect.objectContaining({ processId: consultation.run.processId, status: 'SUCCEEDED' }),
    ]);
    await expect(runtime.getRun(consultation.run.processId)).resolves.toEqual(
      expect.objectContaining({ processId: consultation.run.processId }),
    );
  });

  it('replays an idempotent consultation without duplicating stored turns', async () => {
    const { runtime, getCalls } = createRuntime();
    const first = await runtime.consult({
      query: '重复请求',
      idempotencyKey: 'runtime-key-2',
    });
    const second = await runtime.consult({
      query: '重复请求',
      conversationId: first.conversation.conversationId,
      idempotencyKey: 'runtime-key-2',
    });

    expect(second.run.deduplicated).toBe(true);
    expect(getCalls()).toBe(1);
    expect(second.conversation.turns).toHaveLength(2);
  });

  it('exposes list/read and consultation routes without shared router registration', async () => {
    const { runtime } = createRuntime();
    const endpoint = createServiceAgentEndpoint(runtime);
    const created = await endpoint({
      method: 'POST',
      pathname: '/api/service-agent/consultations',
      body: { query: '新咨询', idempotencyKey: 'endpoint-key-1' },
    });

    expect(created.statusCode).toBe(200);
    const createdBody = created.body as { data?: { conversation?: { conversationId: string } } };
    const conversationId = createdBody.data?.conversation?.conversationId;
    expect(conversationId).toBeTruthy();

    const list = await endpoint({ method: 'GET', pathname: '/api/service-agent/conversations' });
    expect(list.statusCode).toBe(200);
    expect((list.body as { data?: unknown[] }).data).toHaveLength(1);

    const read = await endpoint({
      method: 'GET',
      pathname: `/api/service-agent/conversations/${encodeURIComponent(conversationId!)}`,
    });
    expect(read.statusCode).toBe(200);
    expect((read.body as { data?: { conversationId: string } }).data?.conversationId).toBe(conversationId);

    const invalid = await endpoint({
      method: 'POST',
      pathname: '/api/service-agent/consultations',
      body: { query: '缺少幂等键' },
    });
    expect(invalid.statusCode).toBe(422);
  });
});
