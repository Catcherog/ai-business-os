/**
 * Regression gates (BUSOS-R2-H2-03).
 *
 * The evaluation gate answers "did this change make BUSOS worse?" — never
 * "did every output match byte-for-byte?" (§23). Two layers:
 *
 *   1. HARD GATE — any executed case that is FAIL or ERROR (deterministic
 *      checks failing IS a regression; nothing is tolerated silently).
 *   2. BASELINE DELTA — current aggregate metrics vs the committed baseline,
 *      with per-metric allowed degradation thresholds.
 *
 * A `GateResult` with `passed:false` makes the runner exit non-zero.
 */

import type { EvaluationReport } from './runner.js';

export interface GateConfig {
  /** Max allowed FAIL cases (default 0 — deterministic checks must hold). */
  max_failures?: number;
  /** Max allowed ERROR cases (default 0). */
  max_errors?: number;
  /** Optional committed baseline to delta-compare against. */
  baseline?: BaselineSnapshot;
  /** Allowed absolute degradation per metric key (default 0.05). */
  delta_thresholds?: Record<string, number>;
  /** When no baseline is provided but `require_baseline` is true → FAIL. */
  require_baseline?: boolean;
}

/** Committed, versioned baseline snapshot (protocol §24). */
export interface BaselineSnapshot {
  dataset_version: string;
  evaluator_version: string;
  generated_at: string;
  /** Recorded externally post-push (closure-SHA rule — never self-referential). */
  commit_sha: string | null;
  metrics: Record<string, number>;
}

export interface GateBreach {
  kind: 'HARD_FAIL' | 'HARD_ERROR' | 'METRIC_REGRESSION' | 'NO_BASELINE' | 'VERSION_MISMATCH';
  detail: string;
}

export interface GateResult {
  passed: boolean;
  breaches: GateBreach[];
}

export const DEFAULT_DELTA_THRESHOLD = 0.05;

/** Flatten report metrics into a plain metric-key → value map. */
export function flattenMetrics(report: EvaluationReport): Record<string, number> {
  const out: Record<string, number> = {};
  const m = report.metrics;

  if (m.retrieval) {
    for (const [k, v] of Object.entries(m.retrieval.recall_at_k)) out[`retrieval.recall@${k}`] = v;
    out['retrieval.mrr'] = m.retrieval.mrr;
    for (const [k, v] of Object.entries(m.retrieval.ndcg_at_k)) out[`retrieval.ndcg@${k}`] = v;
    for (const [k, v] of Object.entries(m.retrieval.hit_at_k)) out[`retrieval.hit@${k}`] = v;
    out['retrieval.empty_recall_count'] = m.retrieval.empty_recall_count;
  }
  if (m.memory) {
    out['memory.precision'] = m.memory.precision;
    out['memory.relevant_recall'] = m.memory.relevant_recall;
    out['memory.pollution_rate'] = m.memory.pollution_rate;
    out['memory.stale_memory_usage_rate'] = m.memory.stale_memory_usage_rate;
    out['memory.missing_count'] = m.memory.missing_count;
  }
  if (m.governance) {
    out['governance.decision_accuracy'] = m.governance.decision_accuracy;
    out['governance.human_required_accuracy'] = m.governance.human_required_accuracy;
    out['governance.unsafe_pass_count'] = m.governance.unsafe_pass_count;
    out['governance.false_escalation_count'] = m.governance.false_escalation_count;
    out['governance.missed_escalation_count'] = m.governance.missed_escalation_count;
    out['governance.governance_bypass_count'] = m.governance.governance_bypass_count;
  }
  if (m.generation) {
    out['generation.fact_coverage'] = m.generation.fact_coverage;
    out['generation.forbidden_claim_violations'] = m.generation.forbidden_claim_violations;
  }

  return out;
}

export function checkGates(
  report: EvaluationReport,
  config: GateConfig = {},
): GateResult {
  const breaches: GateBreach[] = [];
  const maxFailures = config.max_failures ?? 0;
  const maxErrors = config.max_errors ?? 0;

  if (report.summary.fail > maxFailures) {
    breaches.push({
      kind: 'HARD_FAIL',
      detail: `${report.summary.fail} FAIL cases (max ${maxFailures})`,
    });
  }
  if (report.summary.error > maxErrors) {
    breaches.push({
      kind: 'HARD_ERROR',
      detail: `${report.summary.error} ERROR cases (max ${maxErrors})`,
    });
  }

  const baseline = config.baseline;
  if (config.require_baseline && !baseline) {
    breaches.push({ kind: 'NO_BASELINE', detail: 'baseline required but not provided' });
  }

  if (baseline) {
    if (baseline.dataset_version !== report.dataset_version) {
      breaches.push({
        kind: 'VERSION_MISMATCH',
        detail: `dataset_version ${report.dataset_version} != baseline ${baseline.dataset_version}`,
      });
    }
    if (baseline.evaluator_version !== report.evaluator_version) {
      breaches.push({
        kind: 'VERSION_MISMATCH',
        detail: `evaluator_version ${report.evaluator_version} != baseline ${baseline.evaluator_version}`,
      });
    }

    const current = flattenMetrics(report);
    const thresholds = config.delta_thresholds ?? {};
    for (const [key, baselineValue] of Object.entries(baseline.metrics)) {
      if (!(key in current)) continue;
      const allowed = thresholds[key] ?? DEFAULT_DELTA_THRESHOLD;
      const delta = current[key] - baselineValue;
      // For error/count metrics a higher value is worse.
      if (delta < -allowed) {
        breaches.push({
          kind: 'METRIC_REGRESSION',
          detail: `${key} dropped ${Math.abs(delta).toFixed(4)} (baseline ${baselineValue}, now ${current[key]})`,
        });
      }
    }
  }

  return { passed: breaches.length === 0, breaches };
}
