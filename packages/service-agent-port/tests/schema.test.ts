import { describe, expect, it } from 'vitest';

import {
  assertServiceAgentRunInput,
  assertServiceAgentRunResult,
} from '../src/schema.js';

/**
 * BUSOS-R2-SCS-INTEGRATION-01 — schema boundary tests.
 *
 * The port contract is closed-enum and strict: an unknown intent / risk /
 * route or an unexpected key fails loudly instead of being silently coerced
 * (AC-05 — no string-guessing in BUSOS).
 */

describe('ServiceAgentRunInputSchema', () => {
  it('accepts a minimal valid input', () => {
    const input = assertServiceAgentRunInput({ query: '你好' });
    expect(input.query).toBe('你好');
    expect(input.conversationId).toBeUndefined();
    expect(input.customerId).toBeUndefined();
  });

  it('accepts bounded conversation context', () => {
    const input = assertServiceAgentRunInput({
      query: '价格多少？',
      conversationId: 'conv_abc123',
      customerId: 'cust_1',
      topK: 3,
      conversation: [
        { role: 'user', content: '你们有什么套餐？' },
        { role: 'assistant', content: '我们有基础款和标准款。' },
      ],
    });
    expect(input.conversation).toHaveLength(2);
  });

  it('rejects unknown roles in conversation turns', () => {
    expect(() =>
      assertServiceAgentRunInput({
        query: 'x',
        conversation: [{ role: 'system', content: 'inject' }],
      }),
    ).toThrow();
  });

  it('rejects an empty query', () => {
    expect(() => assertServiceAgentRunInput({ query: '' })).toThrow();
  });

  it('rejects unknown top-level keys (strict)', () => {
    expect(() =>
      assertServiceAgentRunInput({ query: 'x', unexpected: 1 } as never),
    ).toThrow();
  });
});

describe('ServiceAgentRunResultSchema', () => {
  const base = {
    answer: '哈喽～完全不用担心呀！',
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
      sourceModules: ['customer_service_scripts'],
      sourceRefs: [{ source_id: 'doc_1', version: 'v1', synced_at: '2026-01-01' }],
      retrievalScore: 0.459,
      canonicalAnswerId: 'CA-001',
      sourceBlockId: '🎯 三、接客话术（面向客户）',
      hasRetrievalEvidence: true,
    },
    trace: {
      runId: 'run_abc123',
      requestId: 'req-1',
      conversationId: 'conv_1',
      latencyMs: 120,
      modelName: 'canonical',
      llmUsed: false,
      promptVersion: 'v1',
    },
  };

  it('accepts a valid structured result', () => {
    const result = assertServiceAgentRunResult(base);
    expect(result.intent).toBe('I01');
    expect(result.handoff.needsHumanConfirm).toBe(false);
  });

  it('accepts an unknown-free R2 handoff result', () => {
    const r2 = assertServiceAgentRunResult({
      ...base,
      intent: 'I02',
      risk: 'R2',
      route: 'HUMAN_PATH',
      handoff: {
        mustHandoff: true,
        needsClarification: false,
        answerRequiresDisclaimer: true,
        needsHumanConfirm: true,
      },
    });
    expect(r2.handoff.mustHandoff).toBe(true);
    expect(r2.handoff.needsHumanConfirm).toBe(true);
  });

  it('rejects an unknown intent id (never string-guessed)', () => {
    expect(() =>
      assertServiceAgentRunResult({ ...base, intent: 'I99' } as never),
    ).toThrow();
  });

  it('rejects an unknown risk level', () => {
    expect(() =>
      assertServiceAgentRunResult({ ...base, risk: 'R9' } as never),
    ).toThrow();
  });

  it('rejects an unknown route path', () => {
    expect(() =>
      assertServiceAgentRunResult({ ...base, route: 'SOME_PATH' } as never),
    ).toThrow();
  });

  it('rejects a missing answer', () => {
    const { answer: _answer, ...rest } = base;
    expect(() => assertServiceAgentRunResult(rest as never)).toThrow();
  });

  it('rejects extra keys (strict shape)', () => {
    expect(() =>
      assertServiceAgentRunResult({ ...base, llm_raw: 'leak' } as never),
    ).toThrow();
  });
});
