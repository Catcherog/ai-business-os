import type { EvaluationRunResult } from '@busos/evaluation';

// Keep the browser feature independent from the Node-only server module. The
// coordinator registers the same path when it wires the server handler.
const EVALUATION_REPORT_PATH = '/api/evaluation/report';

export interface EvaluationReportClient {
  getReport(): Promise<EvaluationRunResult>;
}

export interface EvaluationClientOptions {
  baseUrl?: string;
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
}

function joinUrl(baseUrl: string, path: string): string {
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function isResult(value: unknown): value is EvaluationRunResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return (
    result.status === 'SUCCESS' ||
    result.status === 'HARD_GATE_FAILURE' ||
    result.status === 'MALFORMED_DATASET'
  ) && Array.isArray(result.issues);
}

export function createEvaluationReportClient(
  options: EvaluationClientOptions = {},
): EvaluationReportClient {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const baseUrl = options.baseUrl ?? '';

  return {
    async getReport(): Promise<EvaluationRunResult> {
      const response = await fetchImpl(joinUrl(baseUrl, EVALUATION_REPORT_PATH));
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new Error('Evaluation service returned an invalid response.');
      }
      if (!isResult(body)) throw new Error('Evaluation service returned an invalid result.');
      return body;
    },
  };
}
