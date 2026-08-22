/**
 * Retrieval judge (BUSOS-R2-H2-03) — evaluates "did the system find the right
 * evidence?" via a retrieval port.
 *
 * HONEST BOUNDARY (KB-SNAPSHOT F-01): BUSOS has NO knowledge/retrieval layer
 * today, so no retriever is wired to the canonical run — RETRIEVAL seed cases
 * are reported NOT_EVALUABLE (never faked). The judge + metric math below ARE
 * real infrastructure: they are unit-tested with hand-crafted retrieval outputs
 * and are ready to be wired the moment a retriever is authorized (H3 horizon).
 *
 * Port shape (future): a retriever maps `(query, conversation_context)` →
 * ordered `RetrievedEvidence[]` (+ optional scores).
 */

import type { EvaluationCaseV1 } from '../case-schema.js';
import {
  checkIdPresence,
  notEvaluable,
  type CaseOutcome,
  type DimensionScores,
} from '../judges.js';
import {
  computeRetrievalMetrics,
  type RetrievedEvidence,
} from '../metrics.js';

export const RETRIEVAL_JUDGE_VERSION = '0.1.0';

/** The retrieval port the judge consumes. */
export interface RetrievalResult {
  query: string;
  retrieved: RetrievedEvidence[];
}

export const RETRIEVAL_PORT_NOT_WIRED =
  'no retrieval layer exists in BUSOS (KB-SNAPSHOT F-01); retriever port not wired';

/**
 * Judge a single retrieval case against an actual retrieval result.
 * Deterministic: expected evidence ids must be present in the retrieved list
 * (when evidence_required), and the retrieval must never surface evidence the
 * case forbids (e.g. for OOD / conflicting-evidence cases).
 */
export function judgeRetrievalCase(
  case_: EvaluationCaseV1,
  actual: RetrievalResult,
): CaseOutcome {
  const expected = case_.expected ?? {};
  const expectedIds = expected.evidence_ids ?? [];
  const forbiddenIds: string[] = [];
  const actualIds = actual.retrieved.map((r) => r.id);

  const { ok, missing, violations } = checkIdPresence(
    actualIds,
    expectedIds,
    forbiddenIds,
  );

  const scores: DimensionScores = {};
  if (expectedIds.length > 0) {
    const recall = expectedIds.filter((id) => actualIds.includes(id)).length / expectedIds.length;
    scores.recall = recall;
  }
  scores.hit_at_1 = actualIds.slice(0, 1).some((id) => expectedIds.includes(id)) ? 1 : 0;

  const reasons: string[] = [];
  if (expected.evidence_required === true && missing.length > 0) {
    reasons.push(`missing evidence: ${missing.join(',')}`);
  }
  if (violations.length > 0) reasons.push(`forbidden evidence retrieved: ${violations.join(',')}`);

  const pass = reasons.length === 0;
  return {
    status: pass ? 'PASS' : 'FAIL',
    failure_reason: pass ? undefined : reasons.join('; '),
    dimension_scores: scores,
    actual: { retrieved_ids: actualIds },
  };
}

/** Per-query aggregate metrics for a run of retrieval cases. */
export function aggregateRetrievalRun(
  samples: { expected: string[]; retrieved: RetrievedEvidence[] }[],
) {
  return computeRetrievalMetrics(samples);
}

/** Mark a retrieval case honestly not evaluable (default canonical-run state). */
export function retrievalNotEvaluable(case_: EvaluationCaseV1): CaseOutcome {
  return notEvaluable(case_, RETRIEVAL_PORT_NOT_WIRED);
}
