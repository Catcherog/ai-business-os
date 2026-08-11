/**
 * @busos/service-agent-candidate — BUSOS-P1-02.
 *
 * A bounded adapter: it takes the consultation context produced by the
 * existing Python/LangGraph Service Agent (`Catcherog/service-agent`) and emits
 * a `LeadCandidateV1` validated by the frozen `@busos/contracts` package.
 *
 * Scope discipline: candidates only. No governance decision, no customer
 * resolution, no Lead/Customer creation, no Feishu access, no readback, and no
 * I/O at all (D015, D017, D018).
 */

export {
  AGENT_INTENT_IDS,
  AGENT_INTENT_TO_CANDIDATE_INTENT,
  AgentIntentIdSchema,
  ConsultationContextV1Schema,
  assertConsultationContextV1,
  type AgentIntentId,
  type ConsultationContextV1,
} from './consultation-context.js';

export {
  extractBudget,
  extractIdentity,
  extractPreferredDateText,
  extractRequirement,
  extractServiceType,
  type ExtractedField,
  type IdentityExtraction,
  type RequirementExtraction,
} from './extract.js';

export {
  CANDIDATE_INITIAL_GOVERNANCE_STATUS,
  CANDIDATE_INITIAL_RISK_LEVEL,
  buildLeadCandidate,
  generateCandidateId,
  type BuildLeadCandidateOptions,
} from './candidate-builder.js';
