/**
 * Version constants for the evaluation foundation (BUSOS-R2-H2-03).
 *
 * Every report / baseline / result carries these so a bare percentage is never
 * compared without a versioned dataset + evaluator (protocol §24).
 */

/** Version of the deterministic evaluator + judge + runner implementation. */
export const EVALUATOR_VERSION = '0.1.0';

/** Version of the Golden Set dataset file (datasets/golden-set.v0.json). */
export const DATASET_VERSION = 'golden-set.v0';

/** Version of the canonical EvaluationCaseV1 contract shape. */
export const EVALUATION_CASE_VERSION = 'evaluation_case.v1';

/** Version of the EvaluationReport shape. */
export const REPORT_VERSION = 'evaluation_report.v1';
