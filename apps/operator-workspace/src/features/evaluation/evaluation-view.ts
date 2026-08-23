import type {
  EvaluationReport,
  EvaluationRunResult,
  EvaluationRunStatus,
} from '@busos/evaluation';
import type { EvaluationReportClient } from './evaluation-client.js';

export type EvaluationViewResult = EvaluationRunResult;

export interface EvaluationViewCase {
  caseId: string;
  domain: string;
  status: string;
  reason?: string;
}

export interface EvaluationViewModel {
  statusLabel: EvaluationRunStatus;
  headline: string;
  description: string;
  counts: {
    total: number;
    pass: number;
    fail: number;
    error: number;
    notEvaluable: number;
  };
  cases: EvaluationViewCase[];
  issues: string[];
  gateBreaches: string[];
}

const EMPTY_COUNTS = {
  total: 0,
  pass: 0,
  fail: 0,
  error: 0,
  notEvaluable: 0,
};

function reportCounts(report: EvaluationReport | undefined): EvaluationViewModel['counts'] {
  if (!report) return { ...EMPTY_COUNTS };
  return {
    total: report.summary.total,
    pass: report.summary.pass,
    fail: report.summary.fail,
    error: report.summary.error,
    notEvaluable: report.summary.not_evaluable,
  };
}

function statusDescription(status: EvaluationRunStatus): string {
  switch (status) {
    case 'SUCCESS': return 'The deterministic Golden Set run passed its hard gate.';
    case 'HARD_GATE_FAILURE': return 'The dataset ran, but one or more deterministic checks failed.';
    case 'MALFORMED_DATASET': return 'The Golden Set could not be evaluated because its dataset is malformed.';
  }
}

export function evaluationViewModel(result: EvaluationViewResult): EvaluationViewModel {
  const counts = reportCounts(result.report);
  const reportCases = result.report?.cases ?? [];
  return {
    statusLabel: result.status,
    headline: `${counts.pass} PASS · ${counts.fail} FAIL · ${counts.error} ERROR · ${counts.notEvaluable} NOT_EVALUABLE`,
    description: statusDescription(result.status),
    counts,
    cases: reportCases.map((item) => ({
      caseId: item.case_id,
      domain: item.domain,
      status: item.status,
      ...(item.failure_reason ? { reason: item.failure_reason } : {}),
    })),
    issues: result.issues.flatMap((issue) => issue.errors.map((error) => `${issue.file}: ${error}`)),
    gateBreaches: result.gate?.breaches.map((breach) => `${breach.kind}: ${breach.detail}`) ?? [],
  };
}

function text(documentRef: Document, value: string): Text {
  return documentRef.createTextNode(value);
}

function element<K extends keyof HTMLElementTagNameMap>(
  documentRef: Document,
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = documentRef.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** Render the standalone Evaluation feature; the coordinator supplies its route slot. */
export function renderEvaluationResult(
  result: EvaluationViewResult,
  documentRef: Document = document,
): HTMLElement {
  const model = evaluationViewModel(result);
  const root = element(documentRef, 'section', 'section evaluation-feature');
  const heading = element(documentRef, 'h1');
  heading.append(text(documentRef, 'Evaluation'));
  root.append(heading);

  const status = element(documentRef, 'p', `pill evaluation-status evaluation-status-${model.statusLabel.toLowerCase()}`);
  status.append(text(documentRef, model.statusLabel));
  root.append(status);

  const description = element(documentRef, 'p', 'muted');
  description.append(text(documentRef, model.description));
  root.append(description);

  const headline = element(documentRef, 'p', 'evaluation-headline');
  headline.append(text(documentRef, model.headline));
  root.append(headline);

  const counts = element(documentRef, 'dl', 'evaluation-counts');
  for (const [label, value] of [
    ['Total', model.counts.total],
    ['PASS', model.counts.pass],
    ['FAIL', model.counts.fail],
    ['ERROR', model.counts.error],
    ['NOT_EVALUABLE', model.counts.notEvaluable],
  ] as const) {
    const term = element(documentRef, 'dt');
    term.append(text(documentRef, label));
    const definition = element(documentRef, 'dd');
    definition.append(text(documentRef, String(value)));
    counts.append(term, definition);
  }
  root.append(counts);

  if (model.issues.length > 0) {
    const issues = element(documentRef, 'ul', 'evaluation-issues');
    for (const issue of model.issues) {
      const item = element(documentRef, 'li');
      item.append(text(documentRef, issue));
      issues.append(item);
    }
    root.append(issues);
  }

  if (model.gateBreaches.length > 0) {
    const gate = element(documentRef, 'ul', 'evaluation-gate-breaches');
    for (const breach of model.gateBreaches) {
      const item = element(documentRef, 'li');
      item.append(text(documentRef, breach));
      gate.append(item);
    }
    root.append(gate);
  }

  if (model.cases.length > 0) {
    const table = element(documentRef, 'table', 'tbl evaluation-cases');
    const head = element(documentRef, 'thead');
    const row = element(documentRef, 'tr');
    for (const label of ['Case', 'Domain', 'Status', 'Reason']) {
      const cell = element(documentRef, 'th');
      cell.append(text(documentRef, label));
      row.append(cell);
    }
    head.append(row);
    table.append(head);
    const body = element(documentRef, 'tbody');
    for (const item of model.cases) {
      const caseRow = element(documentRef, 'tr');
      for (const value of [item.caseId, item.domain, item.status, item.reason ?? '—']) {
        const cell = element(documentRef, 'td');
        cell.append(text(documentRef, value));
        caseRow.append(cell);
      }
      body.append(caseRow);
    }
    table.append(body);
    root.append(table);
  }

  return root;
}

export interface EvaluationFeature {
  render(): Promise<HTMLElement>;
}

export function createEvaluationFeature(
  client: EvaluationReportClient,
  documentRef?: Document,
): EvaluationFeature {
  return {
    async render(): Promise<HTMLElement> {
      try {
        return renderEvaluationResult(await client.getReport(), documentRef);
      } catch (error) {
        const root = element(documentRef ?? document, 'section', 'section evaluation-feature');
        const heading = element(documentRef ?? document, 'h1');
        heading.append(text(documentRef ?? document, 'Evaluation'));
        const message = element(documentRef ?? document, 'p', 'err');
        message.append(text(documentRef ?? document, `加载失败：${(error as Error).message}`));
        root.append(heading, message);
        return root;
      }
    },
  };
}
