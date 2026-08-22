/**
 * Deterministic judge primitives (BUSOS-R2-H2-03).
 *
 * A judge maps `(case, actual)` → a structured `CaseOutcome`. Everything in this
 * module is deterministic, offline and repeatable (Tier-1 CI). The
 * LLM-as-a-judge contract below is FOUNDATION READY: the schema exists so a
 * future Tier-2 judge can plug in without reshaping the report — it is NOT
 * wired to any model and never runs in CI.
 */

import type { EvaluationCaseV1 } from './case-schema.js';

/* -------------------------------------------------------------- outcome */

export type CaseStatus = 'PASS' | 'FAIL' | 'ERROR' | 'NOT_EVALUABLE';

/** Dimension → score in [0,1] (higher = better) for a case. */
export type DimensionScores = Record<string, number>;

export interface CaseOutcome {
  status: CaseStatus;
  /**
   * Safe, serializable "actual" — stable references only. Never content,
   * prompt, credential, token, or raw third-party payload (repo safety rules).
   */
  actual?: unknown;
  dimension_scores?: DimensionScores;
  /** Human-readable reason (FAIL / NOT_EVALUABLE / ERROR). */
  failure_reason?: string;
  latency_ms?: number;
}

/* --------------------------------------------------- LLM-as-a-judge (T2) */

/**
 * Contract for a future LLM-as-a-judge (Tier-2 / optional / cost-bearing).
 * FOUNDATION READY — never invoked in Tier-1 CI. A judge MUST return structured
 * JSON, never free text, so the report and gates can consume it.
 */
export interface LlmJudgeInput {
  case_id: string;
  domain: string;
  query: string;
  expected: Record<string, unknown>;
  /** Sanitised actual (refs / bounded text only — no secrets). */
  actual: Record<string, unknown>;
  /** Judge prompt / rubric version used. */
  rubric_version: string;
}

export interface LlmJudgeVerdict {
  verdict: 'PASS' | 'FAIL';
  /** Score in [0,1]. */
  score: number;
  reason: string;
  failed_dimensions: string[];
  /** Evidence the judge grounded its verdict on (stable refs / excerpts). */
  evidence: string[];
  /** Judge model + prompt metadata for auditability. */
  model: string;
  judge_version: string;
  rubric_version: string;
}

/* ------------------------------------------------------- check helpers */

export interface IdCheckResult {
  ok: boolean;
  missing: string[];
  present: string[];
  violations: string[];
}

/**
 * Check that `expectedIds` are present in `actualIds` and `forbiddenIds` are
 * absent. Pure, deterministic — the workhorse of retrieval / memory judges.
 */
export function checkIdPresence(
  actualIds: string[],
  expectedIds: string[],
  forbiddenIds: string[],
): IdCheckResult {
  const actual = new Set(actualIds);
  const present = expectedIds.filter((id) => actual.has(id));
  const missing = expectedIds.filter((id) => !actual.has(id));
  const violations = forbiddenIds.filter((id) => actual.has(id));
  return { ok: missing.length === 0 && violations.length === 0, missing, present, violations };
}

/**
 * Deterministic substring fact check for generation answers. Normalises
 * whitespace so "12 张精修" == "12张精修". Fact coverage = found/total.
 */
export function normalizeText(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

export interface FactCheckResult {
  coverage: number;
  found: string[];
  missing: string[];
  violations: string[];
}

export function checkFacts(
  answer: string,
  requiredFacts: string[],
  forbiddenClaims: string[],
): FactCheckResult {
  const norm = normalizeText(answer);
  const found = requiredFacts.filter((f) => norm.includes(normalizeText(f)));
  const missing = requiredFacts.filter((f) => !norm.includes(normalizeText(f)));
  const violations = forbiddenClaims.filter((c) => norm.includes(normalizeText(c)));
  const coverage = requiredFacts.length === 0 ? 1 : found.length / requiredFacts.length;
  return { coverage, found, missing, violations };
}

/** Convenience: build a PASS / FAIL outcome from a boolean + reason. */
export function verdict(
  ok: boolean,
  reason: string,
  scores?: DimensionScores,
  actual?: unknown,
): CaseOutcome {
  return {
    status: ok ? 'PASS' : 'FAIL',
    failure_reason: ok ? undefined : reason,
    dimension_scores: scores,
    actual,
  };
}

/** Convenience: mark a case honestly not evaluable (no production surface). */
export function notEvaluable(
  case_: Pick<EvaluationCaseV1, 'case_id' | 'domain'>,
  reason: string,
): CaseOutcome {
  return { status: 'NOT_EVALUABLE', failure_reason: reason };
}
