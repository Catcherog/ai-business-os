/**
 * Application/report-store seam for the Evaluation surface.
 *
 * This module deliberately has no file or network I/O. A caller supplies the
 * canonical dataset loader, and every `recompute()` call loads it again before
 * running the existing deterministic harness. The UI therefore never treats a
 * cached report as the Golden Set truth.
 */

import type {
  EvaluationCaseV1,
  EvaluationDomain,
} from './case-schema.js';
import { evaluateGovernanceCase } from './evaluators/governance-evaluator.js';
import { evaluateMemoryCase } from './evaluators/memory-evaluator.js';
import {
  checkGates,
  type BaselineSnapshot,
  type GateConfig,
  type GateResult,
} from './gates.js';
import {
  runEvaluation,
  type DomainEvaluator,
  type EvaluationReport,
} from './runner.js';
import {
  DATASET_VERSION,
  EVALUATOR_VERSION,
} from './versions.js';

export interface EvaluationDatasetIssue {
  file: string;
  case_index?: number;
  errors: string[];
}

export interface EvaluationDataset {
  cases: EvaluationCaseV1[];
  issues: EvaluationDatasetIssue[];
}

export type EvaluationRunStatus =
  | 'SUCCESS'
  | 'HARD_GATE_FAILURE'
  | 'MALFORMED_DATASET';

export interface EvaluationRunResult {
  status: EvaluationRunStatus;
  report?: EvaluationReport;
  gate?: GateResult;
  issues: EvaluationDatasetIssue[];
}

export interface EvaluationReportStoreOptions {
  /** Read and validate the current canonical Golden Set. */
  loadDataset: () => Promise<EvaluationDataset>;
  /** Optional deterministic evaluator override for a controlled application test. */
  evaluators?: Partial<Record<EvaluationDomain, DomainEvaluator>>;
  dataset_version?: string;
  evaluator_version?: string;
  includeNonBaseline?: boolean;
  baseline?: BaselineSnapshot;
  require_baseline?: boolean;
  delta_thresholds?: GateConfig['delta_thresholds'];
  run_id?: string | (() => string);
  generated_at?: string | (() => string);
}

export interface EvaluationReportStore {
  /** Re-read the dataset and recompute the deterministic report. */
  recompute(): Promise<EvaluationRunResult>;
}

const DEFAULT_EVALUATORS: Partial<Record<EvaluationDomain, DomainEvaluator>> = {
  MEMORY: evaluateMemoryCase,
  GOVERNANCE: evaluateGovernanceCase,
};

function malformedDataset(issues: EvaluationDatasetIssue[]): EvaluationRunResult {
  return {
    status: 'MALFORMED_DATASET',
    issues: issues.map((issue) => ({
      file: issue.file,
      ...(issue.case_index === undefined ? {} : { case_index: issue.case_index }),
      errors: [...issue.errors],
    })),
  };
}

function loaderFailure(): EvaluationRunResult {
  // Do not forward filesystem/provider details across the application boundary.
  return malformedDataset([{ file: 'dataset', errors: ['dataset could not be loaded'] }]);
}

function resolve<T>(value: T | (() => T) | undefined): T | undefined {
  return typeof value === 'function' ? (value as () => T)() : value;
}

export function createEvaluationReportStore(
  options: EvaluationReportStoreOptions,
): EvaluationReportStore {
  return {
    async recompute(): Promise<EvaluationRunResult> {
      let dataset: EvaluationDataset;
      try {
        dataset = await options.loadDataset();
      } catch {
        return loaderFailure();
      }

      if (dataset.issues.length > 0) return malformedDataset(dataset.issues);

      const report = await runEvaluation({
        cases: dataset.cases,
        evaluators: { ...DEFAULT_EVALUATORS, ...options.evaluators },
        includeNonBaseline: options.includeNonBaseline,
        evaluator_version: options.evaluator_version ?? EVALUATOR_VERSION,
        dataset_version: options.dataset_version ?? DATASET_VERSION,
        run_id: resolve(options.run_id),
        generated_at: resolve(options.generated_at),
      });
      const gate = checkGates(report, {
        baseline: options.baseline,
        require_baseline: options.require_baseline,
        delta_thresholds: options.delta_thresholds,
      });

      return {
        status: gate.passed ? 'SUCCESS' : 'HARD_GATE_FAILURE',
        report,
        gate,
        issues: [],
      };
    },
  };
}
