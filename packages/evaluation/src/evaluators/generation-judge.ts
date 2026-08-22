/**
 * Generation judge (BUSOS-R2-H2-03) — evaluates "is the answer correct AND
 * evidence-supported?"
 *
 * TIER-1 (this round) is the deterministic subset — fact coverage, forbidden
 * claims, evidence alignment — because BUSOS has no generative answer surface
 * inside CI and no model is called (Tier-2, cost-bearing). The seed GENERATION
 * cases are reported NOT_EVALUABLE in the canonical run; the deterministic
 * judge itself is unit-tested with hand-crafted answers (incl. hallucinated /
 * partially-grounded ones) so the failure detection is verified.
 *
 * The LLM-as-a-judge contract (`LlmJudgeVerdict`, judges.ts) is FOUNDATION
 * READY for the semantic dimensions (answer_correctness / groundedness /
 * faithfulness) — never invoked in Tier-1 CI.
 */

import type { EvaluationCaseV1 } from '../case-schema.js';
import {
  checkFacts,
  notEvaluable,
  type CaseOutcome,
  type DimensionScores,
} from '../judges.js';

export const GENERATION_JUDGE_VERSION = '0.1.0';

/** The generation output the judge consumes (sanitised — refs + bounded text). */
export interface GenerationResult {
  answer: string;
  /** Evidence ids the answer claims to be grounded on (may be empty). */
  evidence_ids: string[];
}

export const GENERATION_PORT_NOT_WIRED =
  'no generative answer surface runs inside Tier-1 CI (LLM-as-a-judge is Tier-2 / FOUNDATION READY)';

/**
 * Deterministic generation judge.
 *
 * Dimensions (schema §E2):
 *   answer_correctness — required facts found / total (coverage);
 *   groundedness       — evidence_required ⇒ answer must carry evidence ids;
 *   unsupported_claim  — forbidden claims present ⇒ violation (hallucination).
 */
export function judgeGenerationCase(
  case_: EvaluationCaseV1,
  actual: GenerationResult,
): CaseOutcome {
  const expected = case_.expected ?? {};
  const requiredFacts = expected.answer_facts ?? [];
  const forbiddenClaims = expected.forbidden_claims ?? [];

  const { coverage, found, missing, violations } = checkFacts(
    actual.answer,
    requiredFacts,
    forbiddenClaims,
  );

  const scores: DimensionScores = {
    answer_correctness: coverage,
    forbidden_claims_ok: violations.length === 0 ? 1 : 0,
  };

  const reasons: string[] = [];
  if (missing.length > 0) reasons.push(`missing facts: ${missing.join(',')}`);
  if (violations.length > 0) reasons.push(`forbidden claims present: ${violations.join(',')}`);

  if (expected.evidence_required === true && actual.evidence_ids.length === 0) {
    reasons.push('evidence_required=true but answer carries no evidence ids');
    scores.groundedness = 0;
  } else if (expected.evidence_required === true) {
    scores.groundedness = 1;
  }

  const pass = reasons.length === 0;
  return {
    status: pass ? 'PASS' : 'FAIL',
    failure_reason: pass ? undefined : reasons.join('; '),
    dimension_scores: scores,
    actual: {
      fact_coverage: coverage,
      facts_found: found,
      evidence_ids: actual.evidence_ids,
    },
  };
}

/** Mark a generation case honestly not evaluable (default canonical-run state). */
export function generationNotEvaluable(case_: EvaluationCaseV1): CaseOutcome {
  return notEvaluable(case_, GENERATION_PORT_NOT_WIRED);
}
