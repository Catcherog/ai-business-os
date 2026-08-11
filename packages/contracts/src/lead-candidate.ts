import { z } from 'zod';
import {
  CONTRACT_VERSIONS,
  IdSchema,
  IsoDateTimeSchema,
  assertWith,
  validateWith,
  type ValidationResult,
} from './common.js';

/**
 * LeadCandidateV1 — the first cross-module contract (D006).
 *
 * Produced by Service Agent. It is NOT a business fact (D015): only governance
 * turns a candidate into a canonical record.
 *
 * Authoritative language-neutral shape: contracts/lead_candidate.v1.schema.json
 */

/** Risk levels recognised in V1. */
export const RISK_LEVELS = ['R0', 'R1', 'R2', 'R3'] as const;
export const RiskLevelSchema = z.enum(RISK_LEVELS);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const IntentSchema = z
  .object({
    type: z.string().min(1),
    confidence: z.number().min(0).max(1),
  })
  .strict();

/**
 * Customer identity as *extracted*, not as *resolved*.
 * Every field is required to be present and `null` when unknown — the Service
 * Agent must not hallucinate customer data.
 */
export const CustomerCandidateSchema = z
  .object({
    name: z.string().nullable(),
    phone: z.string().nullable(),
    wechat: z.string().nullable(),
  })
  .strict();

/**
 * `preferred_date_text` intentionally keeps the original wording in V1
 * (e.g. "下个月"); no date normalisation happens at this layer.
 */
export const RequirementSchema = z
  .object({
    service_type: z.string().nullable(),
    budget_min: z.number().min(0).nullable(),
    budget_max: z.number().min(0).nullable(),
    preferred_date_text: z.string().nullable(),
    notes: z.string().nullable(),
  })
  .strict();

/** Evidence keeps the source text that supports an extracted field (D012). */
export const EvidenceItemSchema = z
  .object({
    field: z.string().min(1),
    source_text: z.string().min(1),
  })
  .strict();

/**
 * Candidate-level governance marker.
 * A candidate is always `PENDING_REVIEW`; the decision lives in
 * GovernanceResultV1, not here.
 */
export const CandidateGovernanceSchema = z
  .object({
    status: z.literal('PENDING_REVIEW'),
    risk_level: RiskLevelSchema,
    missing_fields: z.array(z.string()),
  })
  .strict();

export const LeadCandidateV1Schema = z
  .object({
    version: z.literal(CONTRACT_VERSIONS.LEAD_CANDIDATE_V1),
    candidate_id: IdSchema,
    session_id: IdSchema,
    agent_run_id: IdSchema,
    intent: IntentSchema,
    customer_candidate: CustomerCandidateSchema,
    requirement: RequirementSchema,
    evidence: z.array(EvidenceItemSchema),
    governance: CandidateGovernanceSchema,
    created_at: IsoDateTimeSchema,
  })
  .strict();

export type Intent = z.infer<typeof IntentSchema>;
export type CustomerCandidate = z.infer<typeof CustomerCandidateSchema>;
export type Requirement = z.infer<typeof RequirementSchema>;
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;
export type CandidateGovernance = z.infer<typeof CandidateGovernanceSchema>;
export type LeadCandidateV1 = z.infer<typeof LeadCandidateV1Schema>;

export function validateLeadCandidateV1(
  input: unknown,
): ValidationResult<LeadCandidateV1> {
  return validateWith(LeadCandidateV1Schema, input);
}

export function assertLeadCandidateV1(input: unknown): LeadCandidateV1 {
  return assertWith(
    LeadCandidateV1Schema,
    input,
    CONTRACT_VERSIONS.LEAD_CANDIDATE_V1,
  );
}

export function isLeadCandidateV1(input: unknown): input is LeadCandidateV1 {
  return LeadCandidateV1Schema.safeParse(input).success;
}
