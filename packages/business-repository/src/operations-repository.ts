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
import type {
  BusinessPatchResult,
  OperationsAdapter,
  OperationsRepositoryPort,
} from './operations-types.js';
import {
  type OperationsCustomer,
  type OperationsOrder,
  mapOrderFromProject,
} from './operations-customer.js';
import { buildDashboard, type OperationsDashboard } from './operations-dashboard.js';
import {
  createReviewQueueStore,
  REVIEW_EDITABLE_FIELDS,
  type OperationsAuditEvent,
  type OperationsReviewCase,
  type OperationsReviewSummary,
  type ReviewDecision,
  type ReviewDecideOptions,
  type ReviewQueueListFilter,
  type ReviewQueueListResult,
  type ReviewQueueStore,
} from './operations-review-queue.js';
import { createOperationsAdapterFromEnv } from './operations-adapter.js';

const MAX_AGGREGATE = 500;

/** Allowlisted entities that may be patched through the server-only write path. */
const PATCHABLE_ENTITY_TYPES = new Set([
  'customer',
  'project',
  'resource',
  'requirement',
  'assignment',
]);

/** Domain-facing read repository; no Feishu record shape crosses this port. */
export class OperationsRepository implements OperationsRepositoryPort {
  private readonly reviewQueue: ReviewQueueStore;

  constructor(
    private readonly adapter: OperationsAdapter,
    options: { reviewQueue?: ReviewQueueStore } = {},
  ) {
    this.reviewQueue = options.reviewQueue ?? createReviewQueueStore({ synthetic: true });
  }

  listProjects(filter?: { limit?: number }): Promise<Project[]> {
    return this.adapter.listProjects(filter);
  }

  listResources(filter?: { type?: string; status?: string; limit?: number }): Promise<Resource[]> {
    return this.adapter.listResources(filter);
  }

  listAvailability(resourceKeys: string[], window: { start: string; end: string }): Promise<AvailabilitySlot[]> {
    return this.adapter.listAvailability(resourceKeys, window);
  }

  listProjectRequirements(projectId: string): Promise<ProjectRequirement[]> {
    return this.adapter.listProjectRequirements(projectId);
  }

  listAssignments(projectId: string): Promise<ProjectAssignment[]> {
    return this.adapter.listAssignments(projectId);
  }

  listScripts(filter: { audience: string; scene?: string }): Promise<CommunicationScript[]> {
    return this.adapter.listScripts(filter);
  }

  listKnowledge(filter?: { type?: string; limit?: number }): Promise<KnowledgeItem[]> {
    return this.adapter.listKnowledge(filter);
  }

  listCustomers(filter?: { limit?: number; status?: string }): Promise<OperationsCustomer[]> {
    return this.adapter.listCustomers(filter);
  }

  getCustomer(customerId: string): Promise<OperationsCustomer | null> {
    return this.adapter.getCustomer(customerId);
  }

  async listOrders(filter?: { limit?: number; customerId?: string; status?: string }): Promise<OperationsOrder[]> {
    const [projects, customers] = await Promise.all([
      this.adapter.listProjects({ limit: MAX_AGGREGATE }),
      this.adapter.listCustomers({ limit: MAX_AGGREGATE }),
    ]);
    const names = new Map(customers.map((customer) => [customer.customer_id, customer.display_name]));
    let orders = projects.map((project) => mapOrderFromProject(project, names.get(project.customer_id) ?? null));
    if (filter?.customerId) orders = orders.filter((order) => order.customer_id === filter.customerId);
    if (filter?.status) {
      const status = filter.status.toUpperCase();
      orders = orders.filter((order) => order.status === status);
    }
    if (filter?.limit !== undefined) orders = orders.slice(0, Math.max(0, filter.limit));
    return orders;
  }

  async getOrder(orderId: string): Promise<OperationsOrder | null> {
    const id = orderId.trim();
    if (!id) return null;
    const orders = await this.listOrders({ limit: MAX_AGGREGATE });
    return orders.find((order) => order.order_id === id) ?? null;
  }

  async getDashboard(): Promise<OperationsDashboard> {
    const [customers, projects, resources, orders, reviews] = await Promise.all([
      this.adapter.listCustomers({ limit: MAX_AGGREGATE }),
      this.adapter.listProjects({ limit: MAX_AGGREGATE }),
      this.adapter.listResources({ limit: MAX_AGGREGATE }),
      this.listOrders({ limit: MAX_AGGREGATE }),
      this.listReviewQueue({ limit: MAX_AGGREGATE }),
    ]);
    return buildDashboard({
      customers,
      projects,
      resources,
      orders,
      reviews: reviews.data,
      syntheticReviewData: this.reviewQueue.synthetic,
    });
  }

  listReviewQueue(filter?: ReviewQueueListFilter): Promise<ReviewQueueListResult> {
    return Promise.resolve(this.reviewQueue.list(filter));
  }

  getReviewQueueItem(reviewId: string): Promise<OperationsReviewCase | null> {
    return Promise.resolve(this.reviewQueue.get(reviewId));
  }

  decideReviewQueueItem(
    reviewId: string,
    decision: ReviewDecision,
    options?: ReviewDecideOptions,
  ): Promise<OperationsReviewCase> {
    return Promise.resolve(this.reviewQueue.decide(reviewId, decision, options));
  }

  listAuditEvents(limit = 200): Promise<OperationsAuditEvent[]> {
    const events: OperationsAuditEvent[] = [];
    for (const item of this.reviewQueue.list({ limit: MAX_AGGREGATE }).data) {
      const full = this.reviewQueue.get(item.review_id);
      if (full) events.push(...full.audit);
    }
    events.sort((a, b) => b.at.localeCompare(a.at));
    return Promise.resolve(events.slice(0, Math.max(0, limit)));
  }

  async patchBusinessFields(input: {
    entityType: string;
    entityId: string;
    patch: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<BusinessPatchResult> {
    const entityType = input.entityType?.trim();
    const entityId = input.entityId?.trim();
    if (!entityType || !entityId) {
      return { status: 'INVALID', reason: 'entityType and entityId are required' };
    }
    if (!PATCHABLE_ENTITY_TYPES.has(entityType)) {
      return { status: 'INVALID', reason: `entityType ${entityType} is not patchable` };
    }
    for (const key of Object.keys(input.patch ?? {})) {
      if (!(REVIEW_EDITABLE_FIELDS as readonly string[]).includes(key)) {
        return { status: 'INVALID', reason: `field ${key} is not editable` };
      }
    }
    // Server-only write path. This batch has no live Feishu write authorization,
    // so the patch is validated but fails closed (NOT_AUTHORIZED). The caller
    // must supply a connected write adapter to apply it (LIVE not claimed).
    return {
      status: 'NOT_AUTHORIZED',
      entityType,
      entityId,
      reason: 'Business field write requires a connected Feishu write adapter (not authorized this batch).',
    };
  }
}

export function createOperationsRepository(
  adapter: OperationsAdapter,
  options: { reviewQueue?: ReviewQueueStore } = {},
): OperationsRepository {
  return new OperationsRepository(adapter, options);
}

export function createOperationsRepositoryFromEnv(
  env: Record<string, string | undefined> = process.env,
): OperationsRepository {
  return new OperationsRepository(createOperationsAdapterFromEnv(env));
}
