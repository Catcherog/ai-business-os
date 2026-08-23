import { describe, expect, it } from 'vitest';
import {
  createServiceAgentClient,
  ServiceAgentClientError,
} from '../src/features/service-agent/service-agent-client.js';

const conversation = {
  conversationId: 'conv-1',
  customerId: 'cust-1',
  turns: [{ role: 'user' as const, content: '需要退款' }],
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:01:00.000Z',
  lastRun: {
    processId: 'proc-1',
    status: 'HUMAN_REQUIRED' as const,
    runId: 'run-1',
    requestId: 'req-1',
    conversationId: 'conv-1',
    answer: '请转人工处理。',
    intent: 'I08',
    risk: 'R2' as const,
    route: 'HUMAN_PATH' as const,
    handoff: {
      mustHandoff: true,
      needsClarification: false,
      answerRequiresDisclaimer: false,
      needsHumanConfirm: true,
    },
    evidence: {
      sourceModules: ['refund'],
      retrievalScore: 0.91,
      canonicalAnswerId: null,
      sourceBlockId: null,
      hasRetrievalEvidence: true,
    },
  },
};

function ready(data: unknown): Response {
  return new Response(JSON.stringify({ status: 'READY', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Service Agent client', () => {
  it('uses the bounded consultation, conversation, and run endpoints', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const responses = [
      ready([conversation]),
      ready(conversation),
      ready({ run: { processId: 'proc-1', status: 'HUMAN_REQUIRED', completedStages: [], startedAt: 'a', endedAt: 'b', durationMs: 12, trace: [] }, conversation }),
      ready([]),
      ready(null),
    ];
    const client = createServiceAgentClient({
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), init });
        return responses.shift() ?? ready(null);
      },
    });

    await expect(client.listConversations({ customerId: 'cust-1', limit: 5 })).resolves.toEqual([conversation]);
    await expect(client.getConversation('conv-1')).resolves.toEqual(conversation);
    await expect(client.consult({
      query: '需要退款',
      customerId: 'cust-1',
      idempotencyKey: 'idem-1',
    })).resolves.toMatchObject({ conversation });
    await expect(client.listRuns()).resolves.toEqual([]);
    await expect(client.getRun('missing')).resolves.toBeNull();

    expect(calls.map((call) => call.url)).toEqual([
      '/api/service-agent/conversations?customerId=cust-1&limit=5',
      '/api/service-agent/conversations/conv-1',
      '/api/service-agent/consultations',
      '/api/service-agent/runs',
      '/api/service-agent/runs/missing',
    ]);
    expect(JSON.parse(String(calls[2]?.init?.body))).toEqual({
      query: '需要退款',
      customerId: 'cust-1',
      idempotencyKey: 'idem-1',
    });
  });

  it('surfaces sanitized API errors and rejects malformed ready data', async () => {
    const errorClient = createServiceAgentClient({
      fetchImpl: async () => new Response(JSON.stringify({
        status: 'ERROR',
        error: { code: 'SERVICE_AGENT_NOT_FOUND', message: 'Conversation not found.' },
      }), { status: 404 }),
    });

    await expect(errorClient.getConversation('missing')).resolves.toBeNull();

    const invalidClient = createServiceAgentClient({
      fetchImpl: async () => ready({ unexpected: true }),
    });
    await expect(invalidClient.listConversations()).rejects.toBeInstanceOf(ServiceAgentClientError);
    await expect(invalidClient.listConversations()).rejects.toMatchObject({
      code: 'SERVICE_AGENT_INVALID_RESPONSE',
    });
  });
});
