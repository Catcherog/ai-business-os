import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.js';

/**
 * Canonical domain objects (project-control/04-INTERFACES.md §4).
 *
 * These are business facts, not candidates. They are storage-agnostic: no
 * Feishu record id, table id or field name appears here (D008/D017/D018).
 *
 * Schemas are provided in addition to types because the repository boundary
 * must be able to validate what comes back from an external store (readback,
 * D019) instead of trusting it.
 */

/* ------------------------------------------------------------------ Session */

export const SESSION_STATUSES = ['OPEN', 'CLOSED'] as const;
export const SessionStatusSchema = z.enum(SESSION_STATUSES);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionSchema = z
  .object({
    session_id: IdSchema,
    /** `null` for anonymous entry points (D010 allows anonymous leads). */
    user_id: z.string().nullable(),
    channel: z.string().min(1),
    status: SessionStatusSchema,
    created_at: IsoDateTimeSchema,
    updated_at: IsoDateTimeSchema,
  })
  .strict();

export type Session = z.infer<typeof SessionSchema>;

/* ----------------------------------------------------------------- AgentRun */

export const AGENT_RUN_STATUSES = [
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'HANDED_OFF',
] as const;
export const AgentRunStatusSchema = z.enum(AGENT_RUN_STATUSES);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

export const AgentRunSchema = z
  .object({
    agent_run_id: IdSchema,
    session_id: IdSchema,
    agent_type: z.string().min(1),
    status: AgentRunStatusSchema,
    started_at: IsoDateTimeSchema,
    /** `null` while the run is still in progress. */
    completed_at: IsoDateTimeSchema.nullable(),
  })
  .strict();

export type AgentRun = z.infer<typeof AgentRunSchema>;

/* --------------------------------------------------------------------- Lead */

export const LEAD_STATUSES = [
  'NEW',
  'QUALIFIED',
  'CONVERTED',
  'LOST',
] as const;
export const LeadStatusSchema = z.enum(LEAD_STATUSES);
export type LeadStatus = z.infer<typeof LeadStatusSchema>;

/** Lead = business opportunity, distinct from Customer (D009). */
export const LeadSchema = z
  .object({
    lead_id: IdSchema,
    /** `null` for an anonymous lead (D010). */
    customer_id: z.string().nullable(),
    source_session_id: IdSchema,
    source_candidate_id: IdSchema,
    service_type: z.string().min(1),
    budget_min: z.number().min(0).nullable(),
    budget_max: z.number().min(0).nullable(),
    /** Original wording preserved in V1, e.g. "下个月". */
    preferred_date_text: z.string().nullable(),
    status: LeadStatusSchema,
    created_at: IsoDateTimeSchema,
    updated_at: IsoDateTimeSchema,
  })
  .strict();

export type Lead = z.infer<typeof LeadSchema>;

/* ----------------------------------------------------------------- Customer */

export const CUSTOMER_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export const CustomerStatusSchema = z.enum(CUSTOMER_STATUSES);
export type CustomerStatus = z.infer<typeof CustomerStatusSchema>;

/** Customer = person/entity, distinct from Lead (D009). */
export const CustomerSchema = z
  .object({
    customer_id: IdSchema,
    display_name: z.string().min(1),
    phone: z.string().nullable(),
    wechat: z.string().nullable(),
    status: CustomerStatusSchema,
    created_at: IsoDateTimeSchema,
    updated_at: IsoDateTimeSchema,
  })
  .strict();

export type Customer = z.infer<typeof CustomerSchema>;

/* ------------------------------------------------------------------ Project */

export const PROJECT_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'IN_PROGRESS',
  'DELIVERED',
  'CANCELLED',
] as const;
export const ProjectStatusSchema = z.enum(PROJECT_STATUSES);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

/**
 * Project represents delivery/execution state and is created after conversion
 * (D011). It is not part of GP-001 itself, but the type is required by P1-01.
 */
export const ProjectSchema = z
  .object({
    project_id: IdSchema,
    customer_id: IdSchema,
    lead_id: IdSchema,
    project_type: z.string().min(1),
    title: z.string().min(1),
    status: ProjectStatusSchema,
    /**
     * Business date as agreed with the customer. Left as an unconstrained
     * string in V1 because 04-INTERFACES.md does not fix date vs date-time.
     */
    scheduled_date: z.string().nullable(),
    created_at: IsoDateTimeSchema,
    updated_at: IsoDateTimeSchema,
  })
  .strict();

export type Project = z.infer<typeof ProjectSchema>;
