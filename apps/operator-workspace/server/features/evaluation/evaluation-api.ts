/**
 * Evaluation server feature boundary.
 *
 * The coordinator registers this handler in the shared server. Keeping the
 * handler isolated lets the Evaluation lane provide a complete endpoint
 * contract without editing `server.ts` or any shared Workspace API code.
 */

import { fileURLToPath } from 'node:url';
import {
  createEvaluationReportStore,
  type EvaluationReportStore,
  type EvaluationRunResult,
} from '../../../../../packages/evaluation/src/report-store.js';
import { loadGoldenSetFile } from '../../../../../packages/evaluation/src/loader.js';

export const EVALUATION_BASE_PATH = '/api/evaluation';
export const EVALUATION_REPORT_PATH = `${EVALUATION_BASE_PATH}/report`;

export interface EvaluationRequest {
  method: string;
  pathname: string;
}

export interface EvaluationHttpResponse {
  statusCode: 200 | 422;
  body: EvaluationRunResult;
}

export interface EvaluationServerFeature {
  handle(request: EvaluationRequest): Promise<EvaluationHttpResponse | null>;
}

export interface EvaluationServerFeatureOptions {
  store?: EvaluationReportStore;
  datasetPath?: string;
}

function defaultDatasetPath(): string {
  return fileURLToPath(new URL(
    '../../../../../packages/evaluation/datasets/golden-set.v0.json',
    import.meta.url,
  ));
}

function createDefaultStore(datasetPath: string): EvaluationReportStore {
  return createEvaluationReportStore({
    loadDataset: () => loadGoldenSetFile(datasetPath),
  });
}

function safeFileName(file: string): string {
  const parts = file.split(/[\\/]/);
  return parts[parts.length - 1] || 'dataset';
}

function sanitizeResult(result: EvaluationRunResult): EvaluationRunResult {
  if (result.issues.length === 0) return result;
  return {
    ...result,
    issues: result.issues.map((issue) => ({
      ...issue,
      file: safeFileName(issue.file),
      errors: [...issue.errors],
    })),
  };
}

export function createEvaluationServerFeature(
  options: EvaluationServerFeatureOptions = {},
): EvaluationServerFeature {
  const store = options.store ?? createDefaultStore(options.datasetPath ?? defaultDatasetPath());

  return {
    async handle(request): Promise<EvaluationHttpResponse | null> {
      if (
        request.method !== 'GET' ||
        (request.pathname !== EVALUATION_BASE_PATH && request.pathname !== EVALUATION_REPORT_PATH)
      ) {
        return null;
      }

      const result = sanitizeResult(await store.recompute());
      return {
        statusCode: result.status === 'MALFORMED_DATASET' ? 422 : 200,
        body: result,
      };
    },
  };
}
