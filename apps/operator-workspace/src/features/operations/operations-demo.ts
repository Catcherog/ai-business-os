/**
 * Operations Demo channel (BUSOS-R2-FEISHU-V3-OS-PRODUCT-INTEGRATION-01).
 *
 * Provides a deterministic, in-memory DEMO implementation of the Operations
 * Client so the Dashboard / Customers / Orders / Review Queue surfaces are real
 * and clickable without a connected Feishu configuration. Honesty boundary: the
 * `DEMO` envelope carries `health.connected: false` and never claims a real
 * Feishu connection; the synthetic review queue mirrors the server's deterministic
 * seed (hash-only identities, fixed reason enum) so the single-approval workflow
 * is fully exercisable locally.
 */
import {
  type BusinessDataEnvelope,
  type BusinessDataHealthView,
} from '../business-data/business-data-client.js';
import { buildSha } from '../../build-info.js';
import type {
  OperationsAuditEvent,
  OperationsCustomer,
  OperationsDashboard,
  OperationsOrder,
  OperationsReviewCase,
  ReviewDecision,
  ReviewDecideOptions,
  ReviewQueueListFilter,
  ReviewQueueListResult,
} from '@busos/business-repository';

const DEMO_MODE = 'DEMO' as const;

const REVIEW_REASONS = [
  'LOW_CONFIDENCE_IDENTITY',
  'AMBIGUOUS_SOURCE_CHANNEL',
  'DUPLICATE_CANDIDATE',
  'MISSING_REQUIRED_FIELD',
  'OUT_OF_SCOPE_ROW',
  'NON_BUSINESS_RECORD',
  'UNPARSED_AVAILABILITY',
] as const;

const ENTITY_TYPES = ['customer', 'lead', 'project', 'resource', 'requirement', 'assignment', 'script', 'knowledge', 'availability'] as const;
const SOURCE_TABLES = [
  'Customers', 'Projects', 'Resources', 'Project Requirements', 'Project Assignments',
  'Communication Scripts', 'Knowledge', 'Resource Availability',
] as const;
const EDITABLE_FIELDS = ['display_name', 'region', 'source_channel', 'reason'] as const;

function makeLcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
function hashString(input: string): string {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Compact in-browser synthetic review store (deterministic, smaller than the
 * server's 562-case seed so the DEMO UI stays responsive). Single approval,
 * idempotency, readback and audit are honored. */
class DemoReviewStore {
  private readonly cases = new Map<string, OperationsReviewCase>();
  private eventCounter = 0;
  private eventSeq = 0;

  constructor(count = 30) {
    const rng = makeLcg(0x5eed);
    const base = Date.UTC(2026, 7, 20, 0, 0, 0);
    for (let i = 0; i < count; i++) {
      const entityType = ENTITY_TYPES[Math.floor(rng() * ENTITY_TYPES.length)];
      const reason = REVIEW_REASONS[Math.floor(rng() * REVIEW_REASONS.length)];
      const sourceTable = SOURCE_TABLES[Math.floor(rng() * SOURCE_TABLES.length)];
      const reviewId = `rv_${String(i + 1).padStart(4, '0')}`;
      const createdAt = new Date(base + i * 60000).toISOString();
      const entityHash = `h:${hashString(`${entityType}:${i}`)}`;
      this.cases.set(reviewId, {
        review_id: reviewId,
        entity_type: entityType,
        source_table: sourceTable,
        entity_hash: entityHash,
        reason,
        status: 'PENDING',
        created_at: createdAt,
        decided_at: null,
        decided_by: null,
        decision: null,
        note: null,
        edit_patch: null,
        idempotency_key: null,
        readback_status: 'NOT_RUN',
        audit: [this.auditEvent(reviewId, 'REVIEW_OPENED', null, createdAt, 'system', 'Review case opened during DEMO seed.')],
      });
    }
  }

  private auditEvent(reviewId: string, kind: OperationsAuditEvent['kind'], decision: ReviewDecision | null, at: string, actor: string, detail: string): OperationsAuditEvent {
    this.eventSeq += 1;
    return {
      event_id: `ae_${String(this.eventSeq).padStart(5, '0')}`,
      review_id: reviewId,
      kind,
      at,
      actor,
      decision,
      detail,
    };
  }

  list(filter: ReviewQueueListFilter = {}): ReviewQueueListResult {
    let items = Array.from(this.cases.values());
    if (filter.status) items = items.filter((c) => c.status === filter.status);
    if (filter.reason) items = items.filter((c) => c.reason === filter.reason);
    items = items.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const total = items.length;
    const pending = items.filter((c) => c.status === 'PENDING').length;
    const cursor = filter.cursor ?? 0;
    const limit = filter.limit ?? total;
    const slice = items.slice(cursor, cursor + limit);
    const data = slice.map((c) => ({
      review_id: c.review_id,
      entity_type: c.entity_type,
      source_table: c.source_table,
      reason: c.reason,
      status: c.status,
      created_at: c.created_at,
    }));
    const nextCursor = cursor + limit < total ? String(cursor + limit) : null;
    return { data, nextCursor, total, pending, resolved: total - pending };
  }

  get(reviewId: string): OperationsReviewCase | null {
    const found = this.cases.get(reviewId);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  decide(reviewId: string, decision: ReviewDecision, options: ReviewDecideOptions = {}): OperationsReviewCase {
    const existing = this.cases.get(reviewId);
    if (!existing) throw new Error(`Review ${reviewId} not found.`);
    if (existing.status !== 'PENDING') {
      if (options.idempotencyKey && existing.idempotency_key === options.idempotencyKey) {
        return JSON.parse(JSON.stringify(existing));
      }
      throw new Error(`Review ${reviewId} has already been decided.`);
    }
    const actor = options.actor ?? 'operator';
    const at = new Date(0).toISOString();
    if (decision === 'EDIT_AND_APPROVE') {
      const patch = options.editPatch ?? {};
      for (const key of Object.keys(patch)) {
        if (!(EDITABLE_FIELDS as readonly string[]).includes(key)) {
          throw new Error(`field ${key} is not editable`);
        }
      }
      existing.edit_patch = patch;
    }
    const status = decision === 'APPROVE' || decision === 'EDIT_AND_APPROVE'
      ? 'APPROVED'
      : decision === 'SKIP'
        ? 'SKIPPED'
        : 'KEEP_IN_REVIEW';
    existing.status = status;
    existing.decided_at = at;
    existing.decided_by = actor;
    existing.decision = decision;
    existing.note = options.note ?? null;
    existing.idempotency_key = options.idempotencyKey ?? null;
    existing.readback_status = 'VERIFIED';
    existing.audit.push(
      this.auditEvent(reviewId, 'REVIEW_DECIDED', decision, at, actor, `Decision: ${decision}`),
      this.auditEvent(reviewId, 'REVIEW_READBACK', decision, at, actor, 'Store readback verified (local authoritative).'),
    );
    if (decision === 'APPROVE' || decision === 'EDIT_AND_APPROVE') {
      existing.audit.push(this.auditEvent(reviewId, 'REVIEW_REGISTRY_UPDATED', decision, at, actor, 'Migration registry mark pending live gate (DEMO).'));
    }
    return JSON.parse(JSON.stringify(existing));
  }

  auditEvents(limit = 200): OperationsAuditEvent[] {
    const events: OperationsAuditEvent[] = [];
    for (const item of this.list({ limit: 1000 }).data) {
      const full = this.get(item.review_id);
      if (full) events.push(...full.audit);
    }
    events.sort((a, b) => b.at.localeCompare(a.at));
    return events.slice(0, Math.max(0, limit));
  }
}

function health(): BusinessDataHealthView {
  return {
    mode: DEMO_MODE,
    connected: false,
    configuredResourceCount: 0,
    lastSuccessfulReadAt: null,
    lastSuccessfulWriteAt: null,
    lastReadbackStatus: 'NOT_RUN',
    latencyBucket: 'FAST',
  };
}

function ready<T>(data: T): BusinessDataEnvelope<T> {
  return { mode: DEMO_MODE, buildSha, status: 'READY', data, health: health() };
}

const REGIONS = ['华东', '华北', '华南', '西南', '海外'] as const;
const CHANNELS = ['小红书', '抖音', '微信', '官网', '转介绍'] as const;

function seedCustomers(): OperationsCustomer[] {
  const out: OperationsCustomer[] = [];
  for (let i = 1; i <= 18; i++) {
    const region = REGIONS[i % REGIONS.length];
    const channel = CHANNELS[(i * 3) % CHANNELS.length];
    out.push({
      customer_id: `cust_${String(i).padStart(3, '0')}`,
      display_name: `客户 ${String(i).padStart(2, '0')}`,
      phone: i % 4 === 0 ? null : `138${String(10000000 + i * 137).slice(0, 8)}`,
      wechat: i % 3 === 0 ? null : `wechat_${i}`,
      region,
      source_channel: channel,
      status: i % 5 === 0 ? 'ARCHIVED' : 'ACTIVE',
      created_at: new Date(Date.UTC(2026, 6, 1 + i)).toISOString(),
      updated_at: new Date(Date.UTC(2026, 7, 10 + i)).toISOString(),
      migration_key: `legacy_customer_${i}`,
    });
  }
  return out;
}

const PROJECT_TYPES = ['品牌咨询', '电商拍摄', '内容制作', '私域运营'] as const;
const STATUSES = ['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'DELIVERED', 'CANCELLED'] as const;

function seedOrders(customers: OperationsCustomer[]): OperationsOrder[] {
  const out: OperationsOrder[] = [];
  let n = 0;
  for (let i = 0; i < customers.length && n < 24; i++) {
    const c = customers[i];
    const orderCount = 1 + (i % 2);
    for (let j = 0; j < orderCount; j++) {
      n++;
      const status = STATUSES[(n + i) % STATUSES.length];
      out.push({
        order_id: `ord_${String(n).padStart(3, '0')}`,
        customer_id: c.customer_id,
        customer_name: c.display_name,
        title: `${c.display_name} ${PROJECT_TYPES[(n + j) % PROJECT_TYPES.length]}项目`,
        project_type: PROJECT_TYPES[(n + j) % PROJECT_TYPES.length],
        status: status as OperationsOrder['status'],
        scheduled_date: status === 'DRAFT' ? null : new Date(Date.UTC(2026, 8, 1 + n)).toISOString().slice(0, 10),
        created_at: new Date(Date.UTC(2026, 6, 15 + n)).toISOString(),
        updated_at: new Date(Date.UTC(2026, 7, 20 + n)).toISOString(),
      });
    }
  }
  return out;
}

export function createDemoOperationsClient(): {
  client: import('./operations-client.js').OperationsClient;
  store: DemoReviewStore;
} {
  const customers = seedCustomers();
  const orders = seedOrders(customers);
  const store = new DemoReviewStore();
  const reviews = store.list({ limit: 1000 });

  function buildDashboard(): OperationsDashboard {
    const counts = {
      customers: customers.length,
      projects: orders.length,
      orders: orders.length,
      resources: 9,
      reviews_pending: reviews.pending,
      reviews_resolved: reviews.resolved,
    };
    const tally = (items: { status: string }[]) => {
      const r: Record<string, number> = {};
      for (const it of items) r[it.status] = (r[it.status] ?? 0) + 1;
      return r;
    };
    const reviewsByReason: Record<string, number> = {};
    for (const r of reviews.data) reviewsByReason[r.reason] = (reviewsByReason[r.reason] ?? 0) + 1;
    return {
      generated_at: new Date(0).toISOString(),
      synthetic_review_data: true,
      counts,
      project_status: tally(orders),
      order_status: tally(orders),
      resource_status: { ACTIVE: 7, INACTIVE: 2 },
      reviews_by_reason: reviewsByReason,
      recent_projects: orders.slice(0, 8).map((o) => ({
        project_id: o.order_id,
        title: o.title,
        project_type: o.project_type,
        status: o.status,
        scheduled_date: o.scheduled_date,
        customer_id: o.customer_id,
      })),
      recent_orders: orders.slice(0, 8),
      pending_reviews_sample: reviews.data.slice(0, 8),
    };
  }

  const client: import('./operations-client.js').OperationsClient = {
    async getOverview() {
      return ready(buildDashboard());
    },
    async listCustomers(query) {
      let data = customers.slice();
      if (query?.status) data = data.filter((c) => c.status === query.status);
      const limit = query?.limit ?? data.length;
      return ready(data.slice(0, limit));
    },
    async getCustomer(customerId) {
      const found = customers.find((c) => c.customer_id === customerId) ?? null;
      return ready(found);
    },
    async listOrders(query) {
      let data = orders.slice();
      if (query?.customerId) data = data.filter((o) => o.customer_id === query.customerId);
      if (query?.status) data = data.filter((o) => o.status === query.status);
      const limit = query?.limit ?? data.length;
      return ready(data.slice(0, limit));
    },
    async getOrder(orderId) {
      const found = orders.find((o) => o.order_id === orderId) ?? null;
      return ready(found);
    },
    async listReviewQueue(query) {
      return ready(store.list(query ?? {}));
    },
    async getReviewQueueItem(reviewId) {
      return ready(store.get(reviewId));
    },
    async decideReviewQueueItem(reviewId, decision, options) {
      return ready(store.decide(reviewId, decision, options));
    },
    async listAuditEvents(limit) {
      return ready(store.auditEvents(limit));
    },
  };

  return { client, store };
}
