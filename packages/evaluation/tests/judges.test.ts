import { describe, expect, it } from 'vitest';
import { EVALUATION_CASE_VERSION } from '../src/versions.js';
import type { EvaluationCaseV1 } from '../src/case-schema.js';
import {
  judgeGenerationCase,
  type GenerationResult,
} from '../src/evaluators/generation-judge.js';
import {
  judgeRetrievalCase,
  retrievalNotEvaluable,
  type RetrievalResult,
} from '../src/evaluators/retrieval-judge.js';

const baseCase: Pick<
  EvaluationCaseV1,
  'version' | 'case_id' | 'domain' | 'provenance_type' | 'query' | 'tags' | 'review_status' | 'synthetic'
> = {
  version: EVALUATION_CASE_VERSION,
  case_id: 'X-01',
  domain: 'GENERATION',
  provenance_type: 'SYNTHETIC',
  query: 'q',
  tags: [],
  review_status: 'SYSTEM_REVIEWED',
  synthetic: true,
};

describe('deterministic generation judge', () => {
  it('PASSes a fully grounded answer (all facts, no forbidden claims, evidence)', () => {
    const c = {
      ...baseCase,
      expected: { answer_facts: ['1499', '12张精修'], forbidden_claims: [], evidence_required: true },
    };
    const actual: GenerationResult = {
      answer: '基础款 1499 元，含 12 张精修与 30 张底片。',
      evidence_ids: ['KB-003'],
    };
    const r = judgeGenerationCase(c, actual);
    expect(r.status).toBe('PASS');
    expect(r.dimension_scores?.answer_correctness).toBe(1);
    expect(r.dimension_scores?.groundedness).toBe(1);
  });

  it('FAILs an unsupported (hallucinated) claim', () => {
    const c = {
      ...baseCase,
      expected: { answer_facts: ['暂未录入'], forbidden_claims: ['学生优惠'] },
    };
    const actual: GenerationResult = {
      answer: '我们有学生优惠价 899 元。',
      evidence_ids: [],
    };
    const r = judgeGenerationCase(c, actual);
    expect(r.status).toBe('FAIL');
    expect(r.failure_reason).toContain('forbidden claims');
  });

  it('FAILs a wrong fact (missing required fact)', () => {
    const c = {
      ...baseCase,
      expected: { answer_facts: ['100元'], forbidden_claims: ['50元'] },
    };
    const actual: GenerationResult = { answer: '精修加购 50 元一张。', evidence_ids: ['KB-007'] };
    const r = judgeGenerationCase(c, actual);
    expect(r.status).toBe('FAIL');
    expect(r.failure_reason).toContain('missing facts');
  });

  it('FAILs when evidence_required but no evidence ids are carried', () => {
    const c = {
      ...baseCase,
      expected: { answer_facts: ['返修到满意'], evidence_required: true },
    };
    const actual: GenerationResult = { answer: '精修可以返修到满意。', evidence_ids: [] };
    const r = judgeGenerationCase(c, actual);
    expect(r.status).toBe('FAIL');
    expect(r.failure_reason).toContain('evidence');
  });

  it('PASSes a correct refusal (facts present, no forbidden claims)', () => {
    const c = {
      ...baseCase,
      expected: { answer_facts: ['暂未录入'], forbidden_claims: ['学生优惠'] },
    };
    const actual: GenerationResult = {
      answer: '这部分暂未录入知识库，建议到店详询。',
      evidence_ids: [],
    };
    const r = judgeGenerationCase(c, actual);
    expect(r.status).toBe('PASS');
  });

  it('treats whitespace-normalised facts as equal (12 张精修 == 12张精修)', () => {
    const c = { ...baseCase, expected: { answer_facts: ['12张精修'] } };
    const actual: GenerationResult = { answer: '含 12 张精修', evidence_ids: [] };
    expect(judgeGenerationCase(c, actual).status).toBe('PASS');
  });
});

describe('deterministic retrieval judge', () => {
  const retCase = {
    ...baseCase,
    domain: 'RETRIEVAL' as const,
    expected: { evidence_ids: ['KB-003'], evidence_required: true },
  };

  it('PASSes when all expected evidence is retrieved', () => {
    const actual: RetrievalResult = { query: 'q', retrieved: [{ id: 'KB-003', score: 0.8 }] };
    const r = judgeRetrievalCase(retCase, actual);
    expect(r.status).toBe('PASS');
  });

  it('FAILs when expected evidence is missing and evidence_required', () => {
    const actual: RetrievalResult = { query: 'q', retrieved: [{ id: 'KB-009', score: 0.3 }] };
    const r = judgeRetrievalCase(retCase, actual);
    expect(r.status).toBe('FAIL');
    expect(r.failure_reason).toContain('missing evidence');
  });

  it('PASSes a knowledge-gap case when nothing relevant is retrieved (absence is correct)', () => {
    const gapCase = {
      ...baseCase,
      domain: 'RETRIEVAL' as const,
      expected: { evidence_required: false, forbidden_claims: ['宠物摄影套餐'] },
    };
    const actual: RetrievalResult = { query: 'q', retrieved: [] };
    const r = judgeRetrievalCase(gapCase, actual);
    expect(r.status).toBe('PASS');
  });

  it('honestly reports NOT_EVALUABLE via the port-not-wired marker', () => {
    const r = retrievalNotEvaluable(retCase);
    expect(r.status).toBe('NOT_EVALUABLE');
    expect(r.failure_reason).toContain('no retrieval layer');
  });
});
