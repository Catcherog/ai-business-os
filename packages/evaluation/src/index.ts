/**
 * @busos/evaluation — Evaluation Foundation & Golden Set Bootstrap
 * (BUSOS-R2-H2-03).
 *
 * Canonical Golden Set contract + deterministic judges + metrics + runner +
 * regression gates + reporters. Tier-1 CI: offline, deterministic, no secret,
 * no external API. LLM-as-a-judge is FOUNDATION READY (schema only).
 *
 * Barrel safety: only pure / node-safe modules are re-exported here. The
 * node-only modules (`loader.ts`, `cli.ts`) are imported by path from the CLI
 * and tests — never from this barrel — so nothing here can break a browser
 * bundle (repo rule for @busos/memory, applied identically here).
 */

export {
  EVALUATION_DOMAINS,
  PROVENANCE_TYPES,
  REVIEW_STATUSES,
  CASE_ORIGINS,
  EvaluationCaseV1Schema,
  EvaluationDomainSchema,
  ProvenanceTypeSchema,
  ReviewStatusSchema,
  CaseOriginSchema,
  EvaluationExpectedSchema,
  EvaluationSourceSchema,
  EvaluationFixtureSchema,
  assertEvaluationCaseV1,
  isBaselineEligible,
  validateEvaluationCaseV1,
  type EvaluationCaseV1,
  type EvaluationDomain,
  type ProvenanceType,
  type ReviewStatus,
  type CaseOrigin,
  type EvaluationExpected,
  type EvaluationSource,
} from './case-schema.js';

export {
  computeRetrievalMetrics,
  computeMemoryMetrics,
  computeGovernanceMetrics,
  ndcgAtK,
  recallAtK,
  reciprocalRank,
  hitAtK,
  type RetrievedEvidence,
  type RetrievalMetrics,
  type MemoryContextSample,
  type MemoryMetrics,
  type GovernanceSample,
  type GovernanceMetrics,
} from './metrics.js';

export {
  checkIdPresence,
  checkFacts,
  normalizeText,
  verdict,
  notEvaluable,
  type CaseOutcome,
  type CaseStatus,
  type DimensionScores,
  type LlmJudgeInput,
  type LlmJudgeVerdict,
} from './judges.js';

export {
  runEvaluation,
  type RunnerConfig,
  type DomainEvaluator,
  type CaseResult,
  type SummaryBucket,
  type EvaluationReport,
} from './runner.js';

export {
  checkGates,
  flattenMetrics,
  DEFAULT_DELTA_THRESHOLD,
  type GateConfig,
  type GateResult,
  type GateBreach,
  type BaselineSnapshot,
} from './gates.js';

export {
  renderSummaryMarkdown,
  caseTable,
} from './reporter.js';

export {
  evaluateMemoryCase,
  type MemorySetupFixture,
  type MemoryRecordInputFixture,
  type MemoryActionFixture,
  type MemoryDirectSaveFixture,
} from './evaluators/memory-evaluator.js';

export {
  evaluateGovernanceCase,
  buildCandidateFromFixture,
  type GovernanceCandidateFixture,
} from './evaluators/governance-evaluator.js';

export {
  judgeRetrievalCase,
  aggregateRetrievalRun,
  retrievalNotEvaluable,
  RETRIEVAL_PORT_NOT_WIRED,
  type RetrievalResult,
} from './evaluators/retrieval-judge.js';

export {
  judgeGenerationCase,
  generationNotEvaluable,
  GENERATION_PORT_NOT_WIRED,
  type GenerationResult,
} from './evaluators/generation-judge.js';

export {
  EVALUATOR_VERSION,
  DATASET_VERSION,
  EVALUATION_CASE_VERSION,
  REPORT_VERSION,
} from './versions.js';
