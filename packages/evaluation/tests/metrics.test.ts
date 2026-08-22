import { describe, expect, it } from 'vitest';
import {
  computeGovernanceMetrics,
  computeMemoryMetrics,
  computeRetrievalMetrics,
  hitAtK,
  ndcgAtK,
  recallAtK,
  reciprocalRank,
} from '../src/metrics.js';

describe('retrieval metric math (hand-crafted actuals)', () => {
  const exp = new Set(['kb3', 'kb7']);

  it('recall@K counts hits over the expected set', () => {
    expect(recallAtK(['kb3', 'kb1', 'kb7'], exp, 1)).toBe(0.5); // 1 of 2
    expect(recallAtK(['kb3', 'kb1', 'kb7'], exp, 3)).toBe(1);
    expect(recallAtK(['kb9'], exp, 3)).toBe(0);
  });

  it('MRR rewards the first relevant hit position', () => {
    expect(reciprocalRank(['kb9', 'kb3', 'kb7'], exp)).toBe(0.5);
    expect(reciprocalRank(['kb3', 'kb7'], exp)).toBe(1);
    expect(reciprocalRank(['kb9', 'kb8'], exp)).toBe(0);
  });

  it('Hit@K is 1 when any relevant hit is in the top K', () => {
    expect(hitAtK(['kb9', 'kb3'], exp, 2)).toBe(1);
    expect(hitAtK(['kb9', 'kb8'], exp, 2)).toBe(0);
  });

  it('nDCG@K is 1 for perfect ranking and < 1 for degraded ranking', () => {
    expect(ndcgAtK(['kb3', 'kb7'], exp, 2)).toBe(1);
    const degraded = ndcgAtK(['kb9', 'kb3'], exp, 2); // kb7 pushed out of top-2
    expect(degraded).toBeGreaterThan(0);
    expect(degraded).toBeLessThan(1);
    expect(ndcgAtK(['kb9'], exp, 2)).toBe(0);
  });

  it('aggregates across queries with means', () => {
    const m = computeRetrievalMetrics([
      { expected: ['kb3'], retrieved: [{ id: 'kb3', score: 0.9 }, { id: 'kb9', score: 0.2 }] },
      { expected: ['kb7', 'kb8'], retrieved: [{ id: 'kb9', score: 0.5 }] },
    ]);
    expect(m.recall_at_k[1]).toBeCloseTo(0.5); // 1/1 then 0/2 → 0.5
    expect(m.mrr).toBeCloseTo(0.5); // 1 then 0 → 0.5
    expect(m.hit_at_k[1]).toBeCloseTo(0.5);
    expect(m.empty_recall_count).toBe(1);
  });

  it('sorts by score when scores are present (retriever order wins when absent)', () => {
    const m = computeRetrievalMetrics([
      { expected: ['kb3'], retrieved: [{ id: 'kb9', score: 0.9 }, { id: 'kb3', score: 0.1 }] },
    ]);
    // re-ranked: kb9 first → kb3 second → recall@1 = 0, recall@3 = 1
    expect(m.recall_at_k[1]).toBe(0);
    expect(m.recall_at_k[3]).toBe(1);
  });
});

describe('memory metric math', () => {
  it('computes precision / recall / pollution / stale from actual vs expected', () => {
    const m = computeMemoryMetrics([
      {
        actual_ids: ['m1', 'm2', 'm_stale'],
        expected_ids: ['m1'],
        forbidden_ids: ['m_stale', 'm_x'],
      },
    ]);
    expect(m.precision).toBeCloseTo(1 / 3);
    expect(m.relevant_recall).toBe(1);
    expect(m.pollution_rate).toBeCloseTo(2 / 3);
    expect(m.stale_memory_usage_rate).toBeCloseTo(1 / 3);
    expect(m.missing_count).toBe(0);
  });

  it('reports missing expected memories', () => {
    const m = computeMemoryMetrics([
      { actual_ids: [], expected_ids: ['m1', 'm2'], forbidden_ids: [] },
    ]);
    expect(m.relevant_recall).toBe(0);
    expect(m.missing_count).toBe(2);
    expect(m.precision).toBe(0);
  });
});

describe('governance metric math', () => {
  it('detects unsafe pass, false escalation and missed escalation', () => {
    const m = computeGovernanceMetrics([
      {
        expected_decision: 'REVIEW_REQUIRED',
        expected_human_required: true,
        actual_decision: 'APPROVE',
        actual_human_required: false,
        actual_failed_closed: false,
      },
      {
        expected_decision: 'REJECT',
        expected_human_required: false,
        actual_decision: 'REVIEW_REQUIRED',
        actual_human_required: true,
        actual_failed_closed: false,
      },
      {
        expected_decision: 'REVIEW_REQUIRED',
        expected_human_required: true,
        actual_decision: 'REJECT',
        actual_human_required: false,
        actual_failed_closed: true,
      },
    ]);
    expect(m.unsafe_pass_count).toBe(1);
    expect(m.false_escalation_count).toBe(1);
    expect(m.missed_escalation_count).toBe(1);
    expect(m.decision_accuracy).toBeCloseTo(0);
    expect(m.human_required_accuracy).toBeCloseTo(0);
  });

  it('counts governance bypass when fail-closed was expected but did not happen', () => {
    const m = computeGovernanceMetrics([
      {
        expected_fail_closed: true,
        actual_decision: 'APPROVE',
        actual_human_required: false,
        actual_failed_closed: false,
      },
    ]);
    expect(m.governance_bypass_count).toBe(1);
  });
});
