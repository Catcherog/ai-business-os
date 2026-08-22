import { describe, expect, it } from 'vitest';
import { EVALUATION_CASE_VERSION } from '../src/versions.js';
import type { EvaluationCaseV1 } from '../src/case-schema.js';
import {
  detectKnowledgeContamination,
  evaluateMemoryCase,
} from '../src/evaluators/memory-evaluator.js';

function memCase(overrides: Partial<EvaluationCaseV1> = {}): EvaluationCaseV1 {
  return {
    version: EVALUATION_CASE_VERSION,
    case_id: 'MEM-T',
    domain: 'MEMORY',
    provenance_type: 'SYNTHETIC',
    query: 'q',
    tags: [],
    review_status: 'SYSTEM_REVIEWED',
    synthetic: true,
    ...overrides,
  };
}

const PREF = {
  subject_type: 'CUSTOMER',
  subject_id: 'cust_a_001',
  memory_type: 'PREFERENCE',
  content: '客户偏好：偏深色影调。',
  source_type: 'HUMAN_REVIEW',
  source_ref: 'case_0001',
  evidence_refs: [{ kind: 'REVIEW_CASE', ref: 'case_0001' }],
  confidence: 1,
};

describe('memory evaluator (real MemoryService + assembleMemoryContext)', () => {
  it('PASSes when the expected memory is in the governed context', async () => {
    const c = memCase({
      expected: { memory_required: true, expect_count: 1 },
      fixture: {
        memory_setup: {
          project_id: 'proj_a_101',
          customer_id: 'cust_a_001',
          records: [PREF],
        },
      },
    });
    const r = await evaluateMemoryCase(c);
    expect(r.status).toBe('PASS');
    expect((r.actual as { memory_ids: string[] }).memory_ids).toHaveLength(1);
  });

  it('correctly EXCLUDES cross-customer memory from the governed context (no leak → PASS)', async () => {
    // A memory scoped to a DIFFERENT customer must never enter cust_a_001's
    // context. The leak is verified at the content level (a unique token that
    // only the other customer's memory carries) — robust to id derivation.
    const other = {
      ...PREF,
      subject_id: 'cust_b_002',
      content: '客户偏好：婚纱套系、自然光。LEAKTOKEN_B002',
      source_ref: 'case_0002',
    };
    const c = memCase({
      expected: { memory_required: true, expect_count: 1, forbidden_content: ['LEAKTOKEN_B002'] },
      fixture: {
        memory_setup: {
          project_id: 'proj_a_101',
          customer_id: 'cust_a_001',
          records: [PREF, other],
        },
      },
    });
    const r = await evaluateMemoryCase(c);
    expect(r.status).toBe('PASS');
    expect((r.actual as { memory_ids: string[] }).memory_ids).toHaveLength(1);
  });

  it('FAILs when a forbidden content token DOES leak into the context', async () => {
    // Defensive check of the detection path itself: a record in scope that
    // carries a forbidden token must be caught. (Cross-customer leakage is
    // prevented upstream by scope isolation, so we exercise the detector with
    // an in-scope record.)
    const c = memCase({
      expected: { forbidden_content: ['LEAKTOKEN_INSCOPE'] },
      fixture: {
        memory_setup: {
          project_id: 'proj_a_101',
          customer_id: 'cust_a_001',
          records: [{ ...PREF, content: '客户偏好深色影调 LEAKTOKEN_INSCOPE' }],
        },
      },
    });
    const r = await evaluateMemoryCase(c);
    expect(r.status).toBe('FAIL');
    expect(r.failure_reason).toContain('forbidden content leaked into context');
  });

  it('PASSes fail_closed cases only when the system actually refused', async () => {
    // empty evidence_refs → recordMemory must throw
    const c = memCase({
      expected: { fail_closed: true },
      fixture: {
        memory_setup: {
          project_id: 'proj_a_101',
          customer_id: 'cust_a_001',
          records: [{ ...PREF, evidence_refs: [] }],
        },
      },
    });
    const r = await evaluateMemoryCase(c);
    expect(r.status).toBe('PASS');
    expect((r.actual as { error: string }).error).toBe('ContractValidationError');
  });

  it('FAILs fail_closed cases when the system silently proceeds (governance bypass)', async () => {
    const c = memCase({
      expected: { fail_closed: true },
      fixture: {
        memory_setup: {
          project_id: 'proj_a_101',
          customer_id: 'cust_a_001',
          records: [PREF],
        },
      },
    });
    const r = await evaluateMemoryCase(c);
    expect(r.status).toBe('FAIL');
    expect(r.failure_reason).toContain('governance bypass');
  });

  it('redacts secret material before it enters the context', async () => {
    const c = memCase({
      expected: { forbidden_content: ['sk-abc123'] },
      fixture: {
        memory_setup: {
          project_id: 'proj_a_101',
          customer_id: 'cust_a_001',
          records: [{ ...PREF, content: '客户偏好深色影调，api_key=sk-abc123。' }],
        },
      },
    });
    const r = await evaluateMemoryCase(c);
    expect(r.status).toBe('PASS');
  });

  it('is idempotent: duplicate seeding yields a single context record', async () => {
    const c = memCase({
      expected: { expect_count: 1 },
      fixture: {
        memory_setup: {
          project_id: 'proj_a_101',
          customer_id: 'cust_a_001',
          records: [PREF],
          repeat_seeds: true,
        },
      },
    });
    const r = await evaluateMemoryCase(c);
    expect(r.status).toBe('PASS');
  });

  it('clamps per-record content and sets truncated', async () => {
    const longContent = '客户偏好：这是一段很长的详细偏好说明，'.repeat(8);
    const c = memCase({
      expected: { expect_truncated: true },
      fixture: {
        memory_setup: {
          project_id: 'proj_a_101',
          customer_id: 'cust_a_001',
          records: [{ ...PREF, content: longContent }],
          context_limits: { maxContentLength: 50 },
        },
      },
    });
    const r = await evaluateMemoryCase(c);
    expect(r.status).toBe('PASS');
    expect((r.actual as { truncated: boolean }).truncated).toBe(true);
  });
});

describe('F-03 knowledge-in-memory guard', () => {
  it('detects store-wide pricing statements in memory content', () => {
    expect(detectKnowledgeContamination('客户偏好深色影调，基础款 1499 元。')).toBeTruthy();
    expect(detectKnowledgeContamination('客户问过定金怎么退。')).toBeTruthy();
    expect(detectKnowledgeContamination('客户偏好：古风汉服、暖调。')).toBeNull();
  });

  it('reports a FAIL for a seed that duplicates Knowledge (regression guard works)', async () => {
    const c = memCase({
      expected: { memory_required: true },
      fixture: {
        memory_setup: {
          project_id: 'proj_a_101',
          customer_id: 'cust_a_001',
          records: [{ ...PREF, content: '客户说基础款 1499 元很合适。' }],
        },
      },
    });
    const r = await evaluateMemoryCase(c);
    expect(r.status).toBe('FAIL');
    expect(r.failure_reason).toContain('knowledge-in-memory contamination');
  });
});
