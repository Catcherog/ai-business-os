import { z } from 'zod';
import { IsoDateTimeSchema } from './common.js';
import { ResourceTypeSchema } from './resource.js';

const BusinessIdSchema = z.string().trim().min(1);

export const KNOWLEDGE_TYPES = [
  'KNOWLEDGE_INDEX',
  'SYSTEM_RULE',
  'SOP_IMPROVEMENT',
  'OTHER',
] as const;
export const KnowledgeTypeSchema = z.enum(KNOWLEDGE_TYPES);
export type KnowledgeType = z.infer<typeof KnowledgeTypeSchema>;

export const KNOWLEDGE_WORKFLOW_STATUSES = ['DRAFT', 'ACTIVE', 'REVIEW', 'ARCHIVED'] as const;
export const KnowledgeWorkflowStatusSchema = z.enum(KNOWLEDGE_WORKFLOW_STATUSES);
export type KnowledgeWorkflowStatus = z.infer<typeof KnowledgeWorkflowStatusSchema>;

export const KnowledgeItemSchema = z
  .object({
    knowledge_id: BusinessIdSchema,
    knowledge_type: KnowledgeTypeSchema,
    title: z.string().min(1),
    detail: z.string().nullable(),
    keywords: z.string().nullable(),
    scenario: z.string().nullable(),
    source_url: z.string().nullable(),
    owner_raw: z.string().nullable(),
    workflow_status: KnowledgeWorkflowStatusSchema,
    due_at: IsoDateTimeSchema.nullable(),
    version_at: IsoDateTimeSchema.nullable(),
    migration_key: BusinessIdSchema,
  })
  .strict();

export type KnowledgeItem = z.infer<typeof KnowledgeItemSchema>;

export const CUSTOMER_STAGES = [
  'LEAD',
  'QUALIFIED',
  'BOOKED',
  'COMPLETED',
  'FOLLOW_UP',
  'OTHER',
] as const;
export const CustomerStageSchema = z.enum(CUSTOMER_STAGES);
export type CustomerStage = z.infer<typeof CustomerStageSchema>;

export const SCRIPT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export const ScriptStatusSchema = z.enum(SCRIPT_STATUSES);
export type ScriptStatus = z.infer<typeof ScriptStatusSchema>;

/** Communication script canonical record; kept here with the knowledge library. */
export const CommunicationScriptSchema = z
  .object({
    script_id: BusinessIdSchema,
    scene: z.string().min(1),
    audience: z.string().min(1),
    goal: z.string().min(1),
    body: z.string().min(1),
    notes: z.string().nullable(),
    effect: z.string().nullable(),
    resource_type: ResourceTypeSchema.nullable(),
    customer_stage: CustomerStageSchema,
    version_at: IsoDateTimeSchema.nullable(),
    status: ScriptStatusSchema,
    source_aliases_json: z.string().nullable(),
    migration_key: BusinessIdSchema,
  })
  .strict();

export type CommunicationScript = z.infer<typeof CommunicationScriptSchema>;
