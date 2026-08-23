import { describe, expect, it } from 'vitest';
import {
  createServiceAgentFeature,
  type ServiceAgentFeatureClient,
} from '../src/features/service-agent/service-agent-feature.js';

describe('Service Agent feature controller', () => {
  it('sends only the frozen consultation contract and retains UI context for governance callbacks', async () => {
    const calls: unknown[] = [];
    const client: ServiceAgentFeatureClient = {
      listConversations: async () => [],
      getConversation: async () => null,
      listRuns: async () => [],
      getRun: async () => null,
      consult: async (input) => {
        calls.push(input);
        return {
          run: {
            processId: 'proc-1',
            status: 'SUCCEEDED',
            completedStages: [],
            startedAt: 'a',
            endedAt: 'b',
            durationMs: 1,
            trace: [],
          },
          conversation: {
            conversationId: 'conv-1',
            customerId: 'cust-1',
            turns: [{ role: 'user', content: input.query }],
            createdAt: 'a',
            updatedAt: 'b',
            lastRun: null,
          },
        };
      },
    };
    const feature = createServiceAgentFeature(client);

    const result = await feature.consult({
      query: '请查一下订单',
      idempotencyKey: 'idem-1',
      customerId: 'cust-1',
      context: { projectId: 'project-1', memoryRefs: ['memory-1'] },
    });

    expect(calls).toEqual([{
      query: '请查一下订单',
      idempotencyKey: 'idem-1',
      customerId: 'cust-1',
    }]);
    expect(result.context).toEqual({
      customerId: 'cust-1',
      projectId: 'project-1',
      memoryRefs: ['memory-1'],
    });
  });
});
