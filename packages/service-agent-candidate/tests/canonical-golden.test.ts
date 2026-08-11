import { describe, it, expect } from 'vitest';
import { buildLeadCandidate } from '../src/candidate-builder';
import { assertLeadCandidateV1 } from '@busos/contracts';
import { CANONICAL_CONTEXT, FIXED_CANDIDATE_ID, FIXED_NOW } from './fixtures';

/**
 * Golden snapshot of the canonical P1-02 case.
 * Locks the exact LeadCandidateV1 output so any silent drift in extraction
 * or contract shape fails the build. Mirrors the canonical output cited in
 * TASK_PLAN.md / the P1-02 final report.
 */
describe('canonical golden output', () => {
  it('produces the exact documented candidate for the canonical input', () => {
    const candidate = buildLeadCandidate(CANONICAL_CONTEXT, {
      now: new Date(FIXED_NOW),
      candidateId: FIXED_CANDIDATE_ID,
    });

    expect(candidate).toEqual({
      version: 'lead_candidate.v1',
      candidate_id: 'cand_0123456789abcdef',
      session_id: 'conv_6f42baebac98',
      agent_run_id: 'run_e3cb2ca839a543cb',
      intent: { type: 'price_consultation', confidence: 1 },
      customer_candidate: { name: null, phone: null, wechat: null },
      requirement: {
        service_type: '新中式写真',
        budget_min: null,
        budget_max: 4000,
        preferred_date_text: '下个月',
        notes: null,
      },
      evidence: [
        { field: 'requirement.service_type', source_text: '新中式写真' },
        { field: 'requirement.budget_max', source_text: '预算大概4000' },
        { field: 'requirement.preferred_date_text', source_text: '下个月' },
      ],
      governance: { status: 'PENDING_REVIEW', risk_level: 'R0', missing_fields: [] },
      created_at: '2026-08-11T15:00:00.000Z',
    });

    // Contract validation must also pass on the golden output.
    expect(() => assertLeadCandidateV1(candidate)).not.toThrow();
  });
});
