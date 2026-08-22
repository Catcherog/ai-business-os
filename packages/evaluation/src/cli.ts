/**
 * Evaluation CLI (BUSOS-R2-H2-03) — `npm run eval`.
 *
 * Pipeline:
 *   1. load the canonical Golden Set (`datasets/golden-set.v0.json`);
 *   2. wire the deterministic Tier-1 evaluators: MEMORY (real MemoryService +
 *      assembleMemoryContext) and GOVERNANCE (real `govern`); RETRIEVAL and
 *      GENERATION have no production surface in BUSOS today (KB-SNAPSHOT F-01),
 *      so their cases are honestly reported NOT_EVALUABLE — never faked;
 *   3. run the pipeline → machine-readable `reports/evaluation-report.json` +
 *      human-readable `reports/evaluation-summary.md`;
 *   4. apply the regression gates (hard gate + baseline delta);
 *   5. exit non-zero when the gate fails.
 *
 * node-only (node:fs) — run via `vite-node scripts/run-eval.ts` (repo
 * convention, same as @busos/human-review).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadGoldenSetFile } from './loader.js';
import { runEvaluation } from './runner.js';
import { checkGates, type BaselineSnapshot } from './gates.js';
import { renderSummaryMarkdown, caseTable } from './reporter.js';
import { evaluateMemoryCase } from './evaluators/memory-evaluator.js';
import { evaluateGovernanceCase } from './evaluators/governance-evaluator.js';
import {
  DATASET_VERSION,
  EVALUATOR_VERSION,
} from './versions.js';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Resolve CLI paths from the ENVIRONMENT on every invocation.
 *
 * Previously these were frozen as module-level constants at import time, so any
 * `process.env.EVAL_DATASET` / `EVAL_BASELINE` / `EVAL_REPORTS_DIR` mutation
 * made *after* the module was imported (e.g. by a test) silently had no effect
 * (BUSOS-R2-H2-03 CORR). Resolving inside the call path guarantees each run
 * honours the environment it was actually invoked with.
 */
export interface CliConfig {
  datasetPath: string;
  baselinePath: string;
  reportsDir: string;
  reportJson: string;
  reportMd: string;
}

export function resolveCliConfig(): CliConfig {
  const datasetPath = process.env.EVAL_DATASET ?? join(PKG_ROOT, 'datasets', 'golden-set.v0.json');
  const baselinePath = process.env.EVAL_BASELINE ?? join(PKG_ROOT, 'baseline', 'baseline.v0.json');
  // Reports dir is overridable (CI / tests write to a temp location to avoid
  // locking collisions with the workspace file watcher).
  const reportsDir = process.env.EVAL_REPORTS_DIR ?? join(PKG_ROOT, 'reports');
  return {
    datasetPath,
    baselinePath,
    reportsDir,
    reportJson: join(reportsDir, 'evaluation-report.json'),
    reportMd: join(reportsDir, 'evaluation-summary.md'),
  };
}

export async function main(argv: string[]): Promise<number> {
  const includeNonBaseline = argv.includes('--include-non-baseline');
  const skipBaseline = argv.includes('--skip-baseline');
  const printCases = argv.includes('--cases');

  const cfg = resolveCliConfig();
  const { cases, issues } = await loadGoldenSetFile(cfg.datasetPath);
  for (const issue of issues) {
    console.error(`[dataset] ${issue.file}${issue.case_index !== undefined ? `#${issue.case_index}` : ''}: ${issue.errors.join('; ')}`);
  }
  if (issues.length > 0) {
    console.error('dataset load failed — aborting');
    return 2;
  }

  const report = await runEvaluation({
    cases,
    evaluators: {
      MEMORY: evaluateMemoryCase,
      GOVERNANCE: evaluateGovernanceCase,
      // RETRIEVAL / GENERATION: no production surface in BUSOS (F-01) →
      // runner marks them NOT_EVALUABLE. A future authorized retriever/generator
      // wires its port here.
    },
    includeNonBaseline,
    evaluator_version: EVALUATOR_VERSION,
    dataset_version: DATASET_VERSION,
  });

  let baseline: BaselineSnapshot | null = null;
  if (!skipBaseline) {
    try {
      baseline = JSON.parse(await readFile(cfg.baselinePath, 'utf8')) as BaselineSnapshot;
    } catch {
      baseline = null;
    }
  }

  const gate = checkGates(report, { baseline: baseline ?? undefined, require_baseline: !skipBaseline });

  await mkdir(cfg.reportsDir, { recursive: true });
  await writeFile(cfg.reportJson, JSON.stringify(report, null, 2), 'utf8');
  await writeFile(cfg.reportMd, renderSummaryMarkdown(report, gate), 'utf8');

  const s = report.summary;
  console.log(`\n[busos-eval] run ${report.run_id}`);
  console.log(`[busos-eval] ${s.total} cases → PASS ${s.pass} · FAIL ${s.fail} · ERROR ${s.error} · NOT_EVALUABLE ${s.not_evaluable}`);
  if (printCases) {
    console.log(`\n${caseTable(report.cases)}`);
  }
  console.log(`[busos-eval] report: ${cfg.reportJson}`);
  console.log(`[busos-eval] summary: ${cfg.reportMd}`);
  console.log(`[busos-eval] gate: ${gate.passed ? 'PASS' : 'FAIL'}`);
  for (const b of gate.breaches) console.error(`  - ${b.kind}: ${b.detail}`);

  return gate.passed ? 0 : 1;
}
