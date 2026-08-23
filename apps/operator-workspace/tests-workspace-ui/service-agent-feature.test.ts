import { describe, expect, it } from 'vitest';
import {
  createCandidateReviewAction,
  serviceAgentConversationViewModel,
} from '../src/features/service-agent/service-agent-model.js';
import { serviceAgentConversationMarkup } from '../src/features/service-agent/service-agent-view.js';

const conversation = {
  conversationId: 'conv-1',
  customerId: 'cust-1',
  turns: [
    { role: 'user' as const, content: '我想申请退款' },
    { role: 'assistant' as const, content: '请转人工处理。' },
  ],
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

const run = {
  processId: 'proc-1',
  status: 'HUMAN_REQUIRED' as const,
  completedStages: [],
  startedAt: '2026-08-24T00:00:00.000Z',
  endedAt: '2026-08-24T00:00:00.042Z',
  durationMs: 42,
  output: {
    serviceAgent: {
      answer: '请转人工处理。',
      intent: 'I08',
      risk: 'R2',
      route: 'HUMAN_PATH',
      handoff: conversation.lastRun.handoff,
      evidence: {
        sourceModules: ['refund'],
        retrievalScore: 0.91,
        canonicalAnswerId: null,
        sourceBlockId: null,
        hasRetrievalEvidence: true,
      },
      trace: {
        runId: 'run-1',
        requestId: 'req-1',
        conversationId: 'conv-1',
        latencyMs: 37,
        llmUsed: false,
      },
    },
  },
  trace: [],
};

describe('Service Agent feature model', () => {
  it('projects context, evidence, risk, route, handoff, latency, and canonical Run link', () => {
    const model = serviceAgentConversationViewModel(conversation, {
      run,
      context: { projectId: 'project-1', memoryRefs: ['memory-1', 'memory-2'] },
    });

    expect(model.context).toEqual({
      customerId: 'cust-1',
      projectId: 'project-1',
      memoryRefs: ['memory-1', 'memory-2'],
    });
    expect(model.answer).toBe('请转人工处理。');
    expect(model.intent).toBe('I08');
    expect(model.risk).toBe('R2');
    expect(model.route).toBe('HUMAN_PATH');
    expect(model.evidence.sourceModules).toEqual(['refund']);
    expect(model.handoff).toMatchObject({ state: 'HUMAN_REQUIRED', requiresHuman: true });
    expect(model.latencyMs).toBe(37);
    expect(model.runLink).toEqual({ processId: 'proc-1', runId: 'run-1', href: '#/runs/proc-1' });
  });

  it('makes candidate creation an explicit governance/review intent, never a canonical write', () => {
    const model = serviceAgentConversationViewModel(conversation, { run });
    const action = createCandidateReviewAction(model, {
      projectId: 'project-1',
      memoryRefs: ['memory-1'],
    });

    expect(action).toMatchObject({
      kind: 'GENERATE_CANDIDATE',
      entry: 'GOVERNANCE_REVIEW',
      conversationId: 'conv-1',
      processId: 'proc-1',
      customerId: 'cust-1',
      projectId: 'project-1',
    });
    expect(action).not.toHaveProperty('repository');
    expect(action).not.toHaveProperty('writeCanonical');
  });

  it('keeps R2/handoff visibly human-required in rendered markup', () => {
    const model = serviceAgentConversationViewModel(conversation, { run });
    const markup = serviceAgentConversationMarkup(model);

    expect(markup).toContain('HUMAN_REQUIRED');
    expect(markup).toContain('转人工');
    expect(markup).toContain('治理 / 审阅');
    expect(markup).toContain('#/runs/proc-1');
    expect(markup).not.toContain('SUCCEEDED');
  });
});
