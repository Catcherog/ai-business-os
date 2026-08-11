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
 * GovernanceResultV1 — governance must produce an explicit result (D016).
 *
 * Authoritative language-neutral shape:
 * contracts/governance_result.v1.schema.json
 */

export const GOVERNANCE_DECISIONS = [
  'APPROVE',
  'REVIEW_REQUIRED',
  'REJECT',
] as const;
export const GovernanceDecisionSchema = z.enum(GOVERNANCE_DECISIONS);
export type GovernanceDecision = z.infer<typeof GovernanceDecisionSchema>;

export const CUSTOMER_RESOLUTION_STATUSES = [
  'RESOLVED',
  'UNRESOLVED',
  'NOT_REQUIRED',
] as const;
export const CustomerResolutionStatusSchema = z.enum(
  CUSTOMER_RESOLUTION_STATUSES,
);
export type CustomerResolutionStatus = z.infer<
  typeof CustomerResolutionStatusSchema
>;

/**
 * Issue codes used in V1. The contract keeps `code` as a free string so a new
 * rule does not require a contract version bump; these constants exist so
 * producers and consumers agree on spelling.
 */
export const GOVERNANCE_ISSUE_CODES = {
  CUSTOMER_IDENTITY_MISSING: 'CUSTOMER_IDENTITY_MISSING',
  SERVICE_TYPE_MISSING: 'SERVICE_TYPE_MISSING',
  BUDGET_RANGE_INVALID: 'BUDGET_RANGE_INVALID',
  INTENT_CONFIDENCE_LOW: 'INTENT_CONFIDENCE_LOW',
} as const;

export const GovernanceIssueSchema = z
  .object({
    code: z.string().min(1),
    /** `null` when the issue is not attributable to a single field. */
    field: z.string().nullable(),
  })
  .strict();

/**
 * V1 automatic matching is exact phone / exact WeChat only.
 * No fuzzy identity merge (04-INTERFACES.md §2).
 */
export const CustomerResolutionSchema = z
  .object({
    status: CustomerResolutionStatusSchema,
    customer_id: z.string().nullable(),
  })
  .strict();

export const GovernanceResultV1Schema = z
  .object({
    version: z.literal(CONTRACT_VERSIONS.GOVERNANCE_RESULT_V1),
    candidate_id: IdSchema,
    decision: GovernanceDecisionSchema,
    issues: z.array(GovernanceIssueSchema),
    customer_resolution: CustomerResolutionSchema,
    /**
     * Normalised, governance-approved values handed to the repository layer.
     * Deliberately open in V1: the domain shape is still settling.
     */
    normalized_data: z.record(z.unknown()),
    created_at: IsoDateTimeSchema,
  })
  .strict();

export type GovernanceIssue = z.infer<typeof GovernanceIssueSchema>;
export type CustomerResolution = z.infer<typeof CustomerResolutionSchema>;
export type GovernanceResultV1 = z.infer<typeof GovernanceResultV1Schema>;

export function validateGovernanceResultV1(
  input: unknown,
): ValidationResult<GovernanceResultV1> {
  return validateWith(GovernanceResultV1Schema, input);
}

export function assertGovernanceResultV1(input: unknown): GovernanceResultV1 {
  return assertWith(
    GovernanceResultV1Schema,
    input,
    CONTRACT_VERSIONS.GOVERNANCE_RESULT_V1,
  );
}

export function isGovernanceResultV1(
  input: unknown,
): input is GovernanceResultV1 {
  return GovernanceResultV1Schema.safeParse(input).success;
}
