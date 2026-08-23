import { z } from 'zod';

import {
  AgentRiskLevelSchema,
  AgentRoutePathSchema,
  ServiceAgentConversationTurnSchema,
  ServiceAgentHandoffSchema,
  ServiceAgentRunInputSchema,
} from './schema.js';

/** BUSOS server command: a consultation must be replay-safe by construction. */
export const ServiceAgentConsultationInputSchema = ServiceAgentRunInputSchema.extend({
  idempotencyKey: z.string().min(1).max(200),
}).strict();

export type ServiceAgentConsultationInput = z.infer<
  typeof ServiceAgentConsultationInputSchema
>;

/** Validate an untrusted consultation command before it reaches the runtime. */
export function assertServiceAgentConsultationInput(
  input: unknown,
): ServiceAgentConsultationInput {
  return ServiceAgentConsultationInputSchema.parse(input);
}

/** Safe, bounded projection stored alongside a conversation, not raw provider data. */
export const ServiceAgentConversationRunSummarySchema = z
  .object({
    processId: z.string().min(1),
    status: z.enum(['RUNNING', 'SUCCEEDED', 'FAILED', 'REJECTED', 'HUMAN_REQUIRED']),
    runId: z.string().min(1).nullable(),
    requestId: z.string().min(1).nullable(),
    conversationId: z.string().min(1),
    answer: z.string().max(1000).nullable(),
    intent: z.string().min(1).nullable(),
    risk: AgentRiskLevelSchema.nullable(),
    route: AgentRoutePathSchema.nullable(),
    handoff: ServiceAgentHandoffSchema.nullable(),
    evidence: z
      .object({
        sourceModules: z.array(z.string()).max(50),
        retrievalScore: z.number().min(0).max(1),
        canonicalAnswerId: z.string().nullable(),
        sourceBlockId: z.string().nullable(),
        hasRetrievalEvidence: z.boolean(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export type ServiceAgentConversationRunSummary = z.infer<
  typeof ServiceAgentConversationRunSummarySchema
>;

/** Read contract for one bounded Service Agent conversation. */
export const ServiceAgentConversationRecordSchema = z
  .object({
    conversationId: z.string().min(1).max(200),
    customerId: z.string().min(1).max(200).optional(),
    turns: z.array(ServiceAgentConversationTurnSchema).max(20),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    lastRun: ServiceAgentConversationRunSummarySchema.nullable(),
  })
  .strict();

export type ServiceAgentConversationRecord = z.infer<
  typeof ServiceAgentConversationRecordSchema
>;

export interface ServiceAgentConversationListOptions {
  customerId?: string;
  limit?: number;
}

/** Persistence seam for conversation reads; no durable or external binding here. */
export interface ServiceAgentConversationStore {
  save(record: ServiceAgentConversationRecord): Promise<void>;
  list(
    options?: ServiceAgentConversationListOptions,
  ): Promise<ServiceAgentConversationRecord[]>;
  get(conversationId: string): Promise<ServiceAgentConversationRecord | null>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Local-only store for the bounded runtime. A durable store is a later,
 * separately authorized boundary; this implementation is intentionally
 * process-local and clone-safe.
 */
export class InMemoryServiceAgentConversationStore
  implements ServiceAgentConversationStore
{
  private readonly records = new Map<string, ServiceAgentConversationRecord>();

  async save(record: ServiceAgentConversationRecord): Promise<void> {
    const parsed = ServiceAgentConversationRecordSchema.parse(record);
    this.records.set(parsed.conversationId, clone(parsed));
  }

  async list(
    options: ServiceAgentConversationListOptions = {},
  ): Promise<ServiceAgentConversationRecord[]> {
    const limit = options.limit == null
      ? 100
      : Math.max(1, Math.min(100, Math.trunc(options.limit)));
    return [...this.records.values()]
      .filter((record) => options.customerId == null || record.customerId === options.customerId)
      .sort((left, right) => {
        const byUpdated = right.updatedAt.localeCompare(left.updatedAt);
        return byUpdated !== 0
          ? byUpdated
          : left.conversationId.localeCompare(right.conversationId);
      })
      .slice(0, limit)
      .map((record) => clone(record));
  }

  async get(conversationId: string): Promise<ServiceAgentConversationRecord | null> {
    const found = this.records.get(conversationId);
    return found ? clone(found) : null;
  }
}

/**
 * Conversation content may be customer-provided. Keep it bounded and remove
 * obvious credential-shaped values before it enters the read store.
 */
export function sanitizeServiceAgentContent(
  content: string,
  maxLength = 2000,
): string {
  return content
    .slice(0, maxLength)
    .replace(
      /(?:bearer\s+|(?:password|passwd|api[_ -]?key|secret|token)\s*[:=]\s*)[^\s,;]+/gi,
      '[REDACTED]',
    )
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[REDACTED]');
}
