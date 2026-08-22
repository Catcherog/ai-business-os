/**
 * Evaluation runner (BUSOS-R2-H2-03) — the pipeline:
 *
 *   approved cases → per-domain evaluator → case outcomes → aggregate metrics
 *   → EvaluationReport (machine + human readable, gates applied downstream).
 *
 * The runner is domain-agnostic: evaluators are injected per domain. When no
 * evaluator is registered for a domain, cases of that domain are honestly
 * marked NOT_EVALUABLE (never faked, never auto-passed).
 */

import type {
  EvaluationCaseV1,
  EvaluationDomain,
  ProvenanceType,
  ReviewStatus,
} from './case-schema.js';
import { isBaselineEligible } from './case-schema.js';
import type { CaseOutcome, CaseStatus, DimensionScores } from './judges.js';
import {
  computeGovernanceMetrics,
  computeMemoryMetrics,
  computeRetrievalMetrics,
  type GovernanceMetrics,
  type MemoryMetrics,
  type RetrievalMetrics,
} from './metrics.js';
import { REPORT_VERSION } from './versions.js';

/** A per-domain evaluator: (case) → structured outcome. */
export type DomainEvaluator = (case_: EvaluationCaseV1) => Promise<CaseOutcome>;

export interface RunnerConfig {
  cases: EvaluationCaseV1[];
  evaluators: Partial<Record<EvaluationDomain, DomainEvaluator>>;
  /** Run DRAFT/REVIEWED too (dev mode). Canonical runs keep baseline-eligible only. */
  includeNonBaseline?: boolean;
  evaluator_version: string;
  dataset_version: string;
  run_id?: string;
  generated_at?: string;
}

export interface CaseResult {
  case_id: string;
  domain: EvaluationDomain;
  provenance_type: ProvenanceType;
  review_status: ReviewStatus;
  tags: string[];
  status: CaseStatus;
  expected: Record<string, unknown>;
  actual?: unknown;
  dimension_scores?: DimensionScores;
  failure_reason?: string;
  latency_ms?: number;
}

export interface SummaryBucket {
  total: number;
  pass: number;
  fail: number;
  error: number;
  not_evaluable: number;
}

export interface EvaluationReport {
  run_id: string;
  version: string;
  evaluator_version: string;
  dataset_version: string;
  generated_at: string;
  summary: SummaryBucket & {
    by_domain: Record<string, SummaryBucket>;
    by_provenance: Record<string, SummaryBucket>;
  };
  metrics: {
    retrieval?: RetrievalMetrics;
    memory?: MemoryMetrics;
    governance?: GovernanceMetrics;
    generation?: { fact_coverage: number; forbidden_claim_violations: number };
  };
  cases: CaseResult[];
}

function emptyBucket(): SummaryBucket {
  return { total: 0, pass: 0, fail: 0, error: 0, not_evaluable: 0 };
}

function bucketAdd(b: SummaryBucket, status: CaseStatus): void {
  b.total += 1;
  if (status === 'PASS') b.pass += 1;
  else if (status === 'FAIL') b.fail += 1;
  else if (status === 'ERROR') b.error += 1;
  else if (status === 'NOT_EVALUABLE') b.not_evaluable += 1;
}

function summarize(
  results: CaseResult[],
): EvaluationReport['summary'] {
  const total = emptyBucket();
  const byDomain: Record<string, SummaryBucket> = {};
  const byProvenance: Record<string, SummaryBucket> = {};

  for (const r of results) {
    bucketAdd(total, r.status);
    byDomain[r.domain] ??= emptyBucket();
    bucketAdd(byDomain[r.domain], r.status);
    byProvenance[r.provenance_type] ??= emptyBucket();
    bucketAdd(byProvenance[r.provenance_type], r.status);
  }

  return { ...total, by_domain: byDomain, by_provenance: byProvenance };
}

function aggregateMetrics(results: CaseResult[]): EvaluationReport['metrics'] {
  const metrics: EvaluationReport['metrics'] = {};

  // Retrieval — from executed retrieval cases (actual.retrieved_ids).
  const retSamples = results
    .filter((r) => r.domain === 'RETRIEVAL' && r.status !== 'NOT_EVALUABLE')
    .map((r) => {
      const actual = (r.actual ?? {}) as { retrieved_ids?: string[] };
      const expected = (r.expected as { evidence_ids?: string[] }) ?? {};
      return {
        expected: expected.evidence_ids ?? [],
        retrieved: (actual.retrieved_ids ?? []).map((id) => ({ id })),
      };
    });
  if (retSamples.length > 0) metrics.retrieval = computeRetrievalMetrics(retSamples);

  // Memory — from executed memory cases (fail-closed guard cases excluded: they
  // test the refusal path, not retrieval quality).
  const memSamples = results
    .filter(
      (r) =>
        r.domain === 'MEMORY' &&
        r.status !== 'NOT_EVALUABLE' &&
        ((r.expected as { fail_closed?: boolean })?.fail_closed !== true),
    )
    .map((r) => {
      const actual = (r.actual ?? {}) as { memory_ids?: string[] };
      const expected = (r.expected as {
        memory_ids?: string[];
        forbidden_memory_ids?: string[];
      }) ?? {};
      return {
        actual_ids: actual.memory_ids ?? [],
        expected_ids: expected.memory_ids ?? [],
        forbidden_ids: expected.forbidden_memory_ids ?? [],
      };
    });
  if (memSamples.length > 0) metrics.memory = computeMemoryMetrics(memSamples);

  // Governance — from executed governance cases.
  const govSamples = results
    .filter((r) => r.domain === 'GOVERNANCE' && r.status !== 'NOT_EVALUABLE')
    .map((r) => {
      const actual = (r.actual ?? {}) as {
        decision?: string;
        human_required?: boolean;
        issues?: string[];
      };
      const expected = (r.expected as {
        governance_decision?: string;
        human_required?: boolean;
        fail_closed?: boolean;
      }) ?? {};
      return {
        expected_decision: expected.governance_decision,
        expected_human_required: expected.human_required,
        expected_fail_closed: expected.fail_closed,
        actual_decision: actual.decision ?? 'ERROR',
        actual_human_required: actual.human_required ?? false,
        // The deterministic govern engine never throws — fail-closed IS the
        // REJECT decision. No governance case expects a thrown refusal.
        actual_failed_closed: false,
      };
    });
  if (govSamples.length > 0) metrics.governance = computeGovernanceMetrics(govSamples);

  // Generation — deterministic fact coverage across executed generation cases.
  const genCases = results.filter(
    (r) => r.domain === 'GENERATION' && r.status !== 'NOT_EVALUABLE',
  );
  if (genCases.length > 0) {
    let totalCoverage = 0;
    let violations = 0;
    for (const r of genCases) {
      const dims = r.dimension_scores ?? {};
      totalCoverage += dims.answer_correctness ?? 0;
      if ((dims.forbidden_claims_ok ?? 1) === 0) violations += 1;
    }
    metrics.generation = {
      fact_coverage: totalCoverage / genCases.length,
      forbidden_claim_violations: violations,
    };
  }

  return metrics;
}

/**
 * Run the evaluation pipeline. Deterministic given the same inputs — no model,
 * no network, no clock dependence (generated_at can be pinned by the caller).
 */
export async function runEvaluation(config: RunnerConfig): Promise<EvaluationReport> {
  const eligible = config.cases.filter(
    (c) => config.includeNonBaseline || isBaselineEligible(c),
  );

  const results: CaseResult[] = [];
  for (const c of eligible) {
    const evaluator = config.evaluators[c.domain];
    let outcome: CaseOutcome;
    if (!evaluator) {
      outcome = {
        status: 'NOT_EVALUABLE',
        failure_reason: `no evaluator wired for domain ${c.domain}`,
      };
    } else {
      try {
        outcome = await evaluator(c);
      } catch (e) {
        outcome = {
          status: 'ERROR',
          failure_reason: `evaluator threw: ${(e as Error).message}`,
        };
      }
    }

    results.push({
      case_id: c.case_id,
      domain: c.domain,
      provenance_type: c.provenance_type,
      review_status: c.review_status,
      tags: c.tags ?? [],
      status: outcome.status,
      expected: (c.expected ?? {}) as Record<string, unknown>,
      actual: outcome.actual,
      dimension_scores: outcome.dimension_scores,
      failure_reason: outcome.failure_reason,
      latency_ms: outcome.latency_ms,
    });
  }

  return {
    run_id: config.run_id ?? `run_${Date.now()}`,
    version: REPORT_VERSION,
    evaluator_version: config.evaluator_version,
    dataset_version: config.dataset_version,
    generated_at: config.generated_at ?? new Date().toISOString(),
    summary: summarize(results),
    metrics: aggregateMetrics(results),
    cases: results,
  };
}
