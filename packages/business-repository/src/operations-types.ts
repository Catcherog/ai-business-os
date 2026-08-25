import type {
  AvailabilitySlot,
  CommunicationScript,
  KnowledgeItem,
  ProjectAssignment,
  ProjectRequirement,
  Project,
  Resource,
} from '@busos/contracts';
import type { FeishuBaseRecord } from './feishu-adapter.js';
import type { OperationsCustomer, OperationsOrder } from './operations-customer.js';
import type { OperationsDashboard } from './operations-dashboard.js';
import type {
  OperationsAuditEvent,
  OperationsReviewCase,
  OperationsReviewSummary,
  ReviewDecision,
  ReviewDecideOptions,
  ReviewQueueListFilter,
  ReviewQueueListResult,
} from './operations-review-queue.js';

/**
 * Raw Feishu read boundary. The CONNECTED adapter and the FAKE adapter both
 * implement exactly these — they are direct table reads. Derived/aggregate
 * operations (orders, dashboard, review queue, audit, patch) live on the
 * repository port, not on the adapter.
 */
export interface OperationsAdapter {
  listProjects(filter?: { limit?: number }): Promise<Project[]>;
  listResources(filter?: { type?: string; status?: string; limit?: number }): Promise<Resource[]>;
  listAvailability(resourceKeys: string[], window: { start: string; end: string }): Promise<AvailabilitySlot[]>;
  listProjectRequirements(projectId: string): Promise<ProjectRequirement[]>;
  listAssignments(projectId: string): Promise<ProjectAssignment[]>;
  listScripts(filter: { audience: string; scene?: string }): Promise<CommunicationScript[]>;
  listKnowledge(filter?: { type?: string; limit?: number }): Promise<KnowledgeItem[]>;
  listCustomers(filter?: { limit?: number; status?: string }): Promise<OperationsCustomer[]>;
  getCustomer(customerId: string): Promise<OperationsCustomer | null>;
}

export interface OperationsFilters {
  resource?: { type?: string; status?: string; limit?: number };
  availability?: { resourceKeys: string[]; window: { start: string; end: string } };
  scripts?: { audience: string; scene?: string };
  knowledge?: { type?: string; limit?: number };
  customers?: { limit?: number; status?: string };
}

/** Full domain read port exposed to the Business Data API. */
export interface OperationsRepositoryPort extends OperationsAdapter {
  listOrders(filter?: { limit?: number; customerId?: string; status?: string }): Promise<OperationsOrder[]>;
  getOrder(orderId: string): Promise<OperationsOrder | null>;
  getDashboard(): Promise<OperationsDashboard>;
  listReviewQueue(filter?: ReviewQueueListFilter): Promise<ReviewQueueListResult>;
  getReviewQueueItem(reviewId: string): Promise<OperationsReviewCase | null>;
  decideReviewQueueItem(
    reviewId: string,
    decision: ReviewDecision,
    options?: ReviewDecideOptions,
  ): Promise<OperationsReviewCase>;
  listAuditEvents(limit?: number): Promise<OperationsAuditEvent[]>;
  patchBusinessFields(input: {
    entityType: string;
    entityId: string;
    patch: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<BusinessPatchResult>;
}

export type OperationsTableName =
  | 'projects'
  | 'resources'
  | 'availability'
  | 'projectRequirements'
  | 'projectAssignments'
  | 'scripts'
  | 'knowledge'
  | 'customers';

export const OPERATIONS_TABLE_NAMES: Readonly<Record<OperationsTableName, string>> = {
  projects: 'Projects',
  resources: 'Resources',
  availability: 'Resource Availability',
  projectRequirements: 'Project Requirements',
  projectAssignments: 'Project Assignments',
  scripts: 'Communication Scripts',
  knowledge: 'Knowledge',
  customers: 'Customers',
};

export type OperationsTableIds = Partial<Record<OperationsTableName, string>>;

export interface OperationsAdapterConfig {
  appId: string;
  appSecret: string;
  targetBaseToken: string;
  /** Table ids are optional because the connected adapter discovers them by name. */
  tableIds?: OperationsTableIds;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  maxRetries?: number;
}

export interface BusinessPatchResult {
  status: 'APPLIED' | 'NOT_AUTHORIZED' | 'INVALID' | 'NOT_FOUND';
  entityType?: string;
  entityId?: string;
  updatedAt?: string;
  reason?: string;
}

/** Safe error boundary: only table and business-key context is exposed. */
export class OperationsAdapterError extends Error {
  readonly table?: string;
  readonly businessKey?: string;

  constructor(message: string, context: { table?: string; businessKey?: string } = {}) {
    super(message);
    this.name = 'OperationsAdapterError';
    this.table = context.table;
    this.businessKey = context.businessKey;
  }
}

export type OperationsRecordMapper<T> = (record: FeishuBaseRecord) => T;
