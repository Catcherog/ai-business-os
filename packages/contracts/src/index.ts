/**
 * @busos/contracts — shared contract + domain package for AI Business OS.
 *
 * Scope: BUSOS-P1-01 only. Contracts and domain types, nothing else.
 * No agent logic, no storage access, no Feishu knowledge, no UI.
 *
 * Modules interact through these contracts, not internal cross-imports (D014).
 */

export {
  CONTRACT_VERSIONS,
  ContractValidationError,
  IdSchema,
  IsoDateTimeSchema,
  assertWith,
  formatIssues,
  nullable,
  validateWith,
  type ContractVersion,
  type ValidationResult,
} from './common.js';

export {
  CandidateGovernanceSchema,
  CustomerCandidateSchema,
  EvidenceItemSchema,
  IntentSchema,
  LeadCandidateV1Schema,
  RISK_LEVELS,
  RequirementSchema,
  RiskLevelSchema,
  assertLeadCandidateV1,
  isLeadCandidateV1,
  validateLeadCandidateV1,
  type CandidateGovernance,
  type CustomerCandidate,
  type EvidenceItem,
  type Intent,
  type LeadCandidateV1,
  type Requirement,
  type RiskLevel,
} from './lead-candidate.js';

export {
  CUSTOMER_RESOLUTION_STATUSES,
  CustomerResolutionSchema,
  CustomerResolutionStatusSchema,
  GOVERNANCE_DECISIONS,
  GOVERNANCE_ISSUE_CODES,
  GovernanceDecisionSchema,
  GovernanceIssueSchema,
  GovernanceResultV1Schema,
  assertGovernanceResultV1,
  isGovernanceResultV1,
  validateGovernanceResultV1,
  type CustomerResolution,
  type CustomerResolutionStatus,
  type GovernanceDecision,
  type GovernanceIssue,
  type GovernanceResultV1,
} from './governance-result.js';

export {
  COMMIT_DOMAIN_OBJECTS,
  COMMIT_STATUSES,
  CommitDomainObjectSchema,
  CommitResultV1Schema,
  CommitStatusSchema,
  READBACK_STATUSES,
  ReadbackStatusSchema,
  WRITE_STATUSES,
  WriteStatusSchema,
  assertCommitResultV1,
  isBusinessCommitSuccess,
  isCommitResultV1,
  validateCommitResultV1,
  type CommitDomainObject,
  type CommitResultV1,
  type CommitStatus,
  type ReadbackStatus,
  type WriteStatus,
} from './commit-result.js';

export {
  AGENT_RUN_STATUSES,
  AgentRunSchema,
  AgentRunStatusSchema,
  CUSTOMER_STATUSES,
  CustomerSchema,
  CustomerStatusSchema,
  LEAD_STATUSES,
  LeadSchema,
  LeadStatusSchema,
  PROJECT_STATUSES,
  ProjectSchema,
  ProjectStatusSchema,
  SESSION_STATUSES,
  SessionSchema,
  SessionStatusSchema,
  TASK_STATUSES,
  TaskSchema,
  TaskStatusSchema,
  type AgentRun,
  type AgentRunStatus,
  type Customer,
  type CustomerStatus,
  type Lead,
  type LeadStatus,
  type Project,
  type ProjectStatus,
  type Session,
  type SessionStatus,
  type Task,
  type TaskStatus,
} from './domain.js';
