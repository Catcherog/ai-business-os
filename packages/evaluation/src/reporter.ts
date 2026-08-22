/**
 * Reporter (BUSOS-R2-H2-03) — renders the machine-readable `EvaluationReport`
 * into a human-readable summary markdown. The report JSON itself (returned by
 * `runEvaluation`) IS the machine-readable artifact
 * (`evaluation-report.json`, §16).
 *
 * File I/O (writing reports/ files) lives in the CLI — this module is a pure
 * string builder so it stays unit-testable and barrel-safe.
 */

import type { GateResult } from './gates.js';
import type { CaseResult, EvaluationReport } from './runner.js';

function bucketRow(name: string, b: { total: number; pass: number; fail: number; error: number; not_evaluable: number }): string {
  return `| ${name} | ${b.total} | ${b.pass} | ${b.fail} | ${b.error} | ${b.not_evaluable} |`;
}

/** Render the full human-readable summary (§16). */
export function renderSummaryMarkdown(
  report: EvaluationReport,
  gate?: GateResult,
): string {
  const s = report.summary;
  const lines: string[] = [];

  lines.push('# Evaluation Summary');
  lines.push('');
  lines.push(`- run_id: \`${report.run_id}\``);
  lines.push(`- evaluator_version: \`${report.evaluator_version}\``);
  lines.push(`- dataset_version: \`${report.dataset_version}\``);
  lines.push(`- generated_at: ${report.generated_at}`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push('| bucket | total | PASS | FAIL | ERROR | NOT_EVALUABLE |');
  lines.push('|---|---|---|---|---|---|');
  lines.push(bucketRow('TOTAL', s));
  for (const [d, b] of Object.entries(s.by_domain).sort()) lines.push(bucketRow(`domain:${d}`, b));
  for (const [p, b] of Object.entries(s.by_provenance).sort()) lines.push(bucketRow(`provenance:${p}`, b));
  lines.push('');

  const m = report.metrics;
  lines.push('## Metrics');
  lines.push('');
  if (m.retrieval) {
    lines.push('### Retrieval');
    lines.push('');
    lines.push(`- Recall@1/3/5/10: ${fmt(m.retrieval.recall_at_k[1])} / ${fmt(m.retrieval.recall_at_k[3])} / ${fmt(m.retrieval.recall_at_k[5])} / ${fmt(m.retrieval.recall_at_k[10])}`);
    lines.push(`- MRR: ${fmt(m.retrieval.mrr)} · nDCG@3/5/10: ${fmt(m.retrieval.ndcg_at_k[3])} / ${fmt(m.retrieval.ndcg_at_k[5])} / ${fmt(m.retrieval.ndcg_at_k[10])}`);
    lines.push(`- Hit@1/3/5/10: ${fmt(m.retrieval.hit_at_k[1])} / ${fmt(m.retrieval.hit_at_k[3])} / ${fmt(m.retrieval.hit_at_k[5])} / ${fmt(m.retrieval.hit_at_k[10])}`);
    lines.push(`- queries with zero relevant evidence: ${m.retrieval.empty_recall_count}`);
    lines.push('');
  }
  if (m.memory) {
    lines.push('### Memory');
    lines.push('');
    lines.push(`- Memory Precision: ${fmt(m.memory.precision)}`);
    lines.push(`- Relevant Memory Recall: ${fmt(m.memory.relevant_recall)}`);
    lines.push(`- Context Pollution Rate: ${fmt(m.memory.pollution_rate)}`);
    lines.push(`- Stale Memory Usage Rate: ${fmt(m.memory.stale_memory_usage_rate)}`);
    lines.push(`- missing expected memories: ${m.memory.missing_count}`);
    lines.push('');
  }
  if (m.governance) {
    lines.push('### Governance');
    lines.push('');
    lines.push(`- decision accuracy: ${fmt(m.governance.decision_accuracy)}`);
    lines.push(`- human_required accuracy: ${fmt(m.governance.human_required_accuracy)}`);
    lines.push(`- unsafe pass: ${m.governance.unsafe_pass_count} · false escalation: ${m.governance.false_escalation_count} · missed escalation: ${m.governance.missed_escalation_count} · governance bypass: ${m.governance.governance_bypass_count}`);
    lines.push('');
  }
  if (m.generation) {
    lines.push('### Generation (deterministic)');
    lines.push('');
    lines.push(`- fact coverage: ${fmt(m.generation.fact_coverage)}`);
    lines.push(`- forbidden-claim violations: ${m.generation.forbidden_claim_violations}`);
    lines.push('');
  }
  if (!m.retrieval && !m.memory && !m.governance && !m.generation) {
    lines.push('_(no executed metrics — all cases NOT_EVALUABLE)_');
    lines.push('');
  }

  lines.push('## Gate');
  lines.push('');
  if (gate) {
    lines.push(gate.passed ? '**PASS**' : '**FAIL**');
    if (gate.breaches.length > 0) {
      lines.push('');
      lines.push('| kind | detail |');
      lines.push('|---|---|');
      for (const b of gate.breaches) lines.push(`| ${b.kind} | ${b.detail} |`);
    }
  } else {
    lines.push('_(gate not run)_');
  }
  lines.push('');

  lines.push('## Failure cases');
  lines.push('');
  const bad = report.cases.filter((c) => c.status === 'FAIL' || c.status === 'ERROR');
  if (bad.length === 0) {
    lines.push('_(none)_');
  } else {
    lines.push('| case_id | domain | status | reason |');
    lines.push('|---|---|---|---|');
    for (const c of bad) {
      lines.push(`| ${c.case_id} | ${c.domain} | ${c.status} | ${c.failure_reason ?? ''} |`);
    }
  }
  lines.push('');

  lines.push('## Regressions');
  lines.push('');
  const regressions = gate?.breaches.filter((b) => b.kind === 'METRIC_REGRESSION') ?? [];
  if (regressions.length === 0) {
    lines.push('_(none)_');
  } else {
    for (const r of regressions) lines.push(`- ${r.detail}`);
  }
  lines.push('');

  return lines.join('\n');
}

function fmt(n: number | undefined): string {
  return n === undefined ? '—' : n.toFixed(4);
}

/** One-line-per-case table (used by the CLI summary too). */
export function caseTable(cases: CaseResult[]): string {
  const rows = cases.map(
    (c) =>
      `| ${c.case_id} | ${c.domain} | ${c.provenance_type} | ${c.review_status} | ${c.status} | ${c.failure_reason ?? ''} |`,
  );
  return [
    '| case_id | domain | provenance | review | status | reason |',
    '|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}
