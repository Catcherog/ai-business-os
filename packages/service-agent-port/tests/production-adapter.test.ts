import { describe, expect, it } from 'vitest';

import {
  ServiceAgentProductionAdapter,
  type ServiceAgentRunResult,
} from '../src/index.js';

const result: ServiceAgentRunResult = {
  answer: '这是一个受控探针答复。',
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
    retrievalScore: 0,
    canonicalAnswerId: null,
    sourceBlockId: null,
    hasRetrievalEvidence: false,
  },
  trace: {
    runId: 'run_probe_1',
    requestId: 'request_probe_1',
    conversationId: 'conv_probe_1',
    latencyMs: 1,
    modelName: null,
    llmUsed: false,
    promptVersion: 'probe',
  },
};

describe('ServiceAgentProductionAdapter controlled contract', () => {
  it('uses only an injected transport and validates its structured response', async () => {
    const calls: string[] = [];
    const adapter = new ServiceAgentProductionAdapter({
      async invoke(input) {
        calls.push(input.query);
        return result;
      },
    });

    await expect(adapter.run({ query: 'controlled probe' })).resolves.toEqual(result);
    expect(calls).toEqual(['controlled probe']);
  });

  it('fails closed when the controlled transport returns a non-contract payload', async () => {
    const adapter = new ServiceAgentProductionAdapter({
      async invoke() {
        return { answer: 'not a complete result' };
      },
    });

    await expect(adapter.run({ query: 'malformed probe' })).rejects.toThrow();
  });
});
