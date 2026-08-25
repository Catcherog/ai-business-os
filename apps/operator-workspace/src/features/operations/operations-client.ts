/**
 * Operations Client — the browser-side CONNECTED transport for the Feishu V3
 * Business API (BUSOS-R2-FEISHU-V3-OS-PRODUCT-INTEGRATION-01).
 *
 * It talks ONLY to the canonical server endpoints (`/api/business-data/*`) and
 * accepts ONLY canonical `WorkspaceEnvelope + health` envelopes — the same
 * strict contract the existing `business-data-client.ts` enforces. No DEMO
 * fallback ever materializes here; a blocked/error envelope is surfaced as-is.
 *
 * Honesty boundary: this client never claims a LIVE write. `decideReviewQueueItem`
 * posts to the server's local review store (single-approval, idempotent); field
 * patching is intentionally NOT exposed to the browser (server-only, fails closed).
 */
import {
  type BusinessDataEnvelope,
  type BusinessDataHealthView,
  isBusinessDataEnvelope,
} from '../business-data/business-data-client.js';
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

export type { BusinessDataEnvelope, BusinessDataHealthView };

const CONNECTED_MODE = 'CONNECTED' as const;

export interface ReviewDecisionInput {
  decision: ReviewDecision;
  options?: ReviewDecideOptions;
}

export interface OperationsClient {
  getOverview(): Promise<BusinessDataEnvelope<OperationsDashboard>>;
  listCustomers(query?: { limit?: number; status?: string }): Promise<BusinessDataEnvelope<OperationsCustomer[]>>;
  getCustomer(customerId: string): Promise<BusinessDataEnvelope<OperationsCustomer | null>>;
  listOrders(query?: { limit?: number; customerId?: string; status?: string }): Promise<BusinessDataEnvelope<OperationsOrder[]>>;
  getOrder(orderId: string): Promise<BusinessDataEnvelope<OperationsOrder | null>>;
  listReviewQueue(query?: ReviewQueueListFilter): Promise<BusinessDataEnvelope<ReviewQueueListResult>>;
  getReviewQueueItem(reviewId: string): Promise<BusinessDataEnvelope<OperationsReviewCase | null>>;
  decideReviewQueueItem(
    reviewId: string,
    decision: ReviewDecision,
    options?: ReviewDecideOptions,
  ): Promise<BusinessDataEnvelope<OperationsReviewCase>>;
  listAuditEvents(limit?: number): Promise<BusinessDataEnvelope<OperationsAuditEvent[]>>;
}

export interface OperationsClientOptions {
  baseUrl?: string;
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
}

type Guard<T> = (value: unknown) => value is T;

/* ----------------------------- type guards ------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}
function isIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
function isCanonicalId(value: unknown): value is string {
  return isNonEmptyString(value) && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
}
function arrayOf<T>(value: unknown, guard: Guard<T>): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

function isOperationsCustomer(value: unknown): value is OperationsCustomer {
  if (!isRecord(value) || !isCanonicalId(value.customer_id) || !isNonEmptyString(value.display_name)) return false;
  return (
    isNullableString(value.phone) &&
    isNullableString(value.wechat) &&
    isNullableString(value.region) &&
    isNullableString(value.source_channel) &&
    (value.status === 'ACTIVE' || value.status === 'ARCHIVED') &&
    isIsoDateTime(value.created_at) &&
    isIsoDateTime(value.updated_at) &&
    typeof value.migration_key === 'string'
  );
}

function isOperationsOrder(value: unknown): value is OperationsOrder {
  if (!isRecord(value) || !isCanonicalId(value.order_id) || !isNonEmptyString(value.title)) return false;
  return (
    isCanonicalId(value.customer_id) &&
    isNullableString(value.customer_name) &&
    isNonEmptyString(value.project_type) &&
    typeof value.status === 'string' &&
    isNullableString(value.scheduled_date) &&
    isIsoDateTime(value.created_at) &&
    isIsoDateTime(value.updated_at)
  );
}

function isReviewSummary(value: unknown): value is ReviewQueueListResult['data'][number] {
  if (!isRecord(value)) return false;
  return (
    isCanonicalId(value.review_id) &&
    typeof value.entity_type === 'string' &&
    typeof value.source_table === 'string' &&
    typeof value.reason === 'string' &&
    typeof value.status === 'string' &&
    isIsoDateTime(value.created_at)
  );
}

function isReviewQueueListResult(value: unknown): value is ReviewQueueListResult {
  if (!isRecord(value) || !Array.isArray(value.data) || !value.data.every(isReviewSummary)) return false;
  return (
    (value.nextCursor === null || typeof value.nextCursor === 'string') &&
    typeof value.total === 'number' &&
    typeof value.pending === 'number' &&
    typeof value.resolved === 'number'
  );
}

function isAuditEvent(value: unknown): value is OperationsAuditEvent {
  if (!isRecord(value)) return false;
  return (
    typeof value.event_id === 'string' &&
    isCanonicalId(value.review_id) &&
    typeof value.kind === 'string' &&
    isIsoDateTime(value.at) &&
    typeof value.actor === 'string' &&
    isNullableString(value.decision) &&
    typeof value.detail === 'string'
  );
}

function isOperationsReviewCase(value: unknown): value is OperationsReviewCase {
  if (!isRecord(value) || !isCanonicalId(value.review_id)) return false;
  if (!isReviewSummary({
    review_id: value.review_id,
    entity_type: value.entity_type,
    source_table: value.source_table,
    reason: value.reason,
    status: value.status,
    created_at: value.created_at,
  })) return false;
  return (
    isNonEmptyString(value.entity_hash) &&
    isNullableString(value.decided_at) &&
    isNullableString(value.decided_by) &&
    isNullableString(value.decision) &&
    isNullableString(value.note) &&
    (value.edit_patch === null || isRecord(value.edit_patch)) &&
    isNullableString(value.readback_status) &&
    Array.isArray(value.audit) &&
    value.audit.every(isAuditEvent)
  );
}

function isOperationsDashboard(value: unknown): value is OperationsDashboard {
  if (!isRecord(value) || !isIsoDateTime(value.generated_at)) return false;
  const counts = value.counts;
  if (!isRecord(counts)) return false;
  const requiredCountKeys = ['customers', 'projects', 'orders', 'resources', 'reviews_pending', 'reviews_resolved'];
  if (!requiredCountKeys.every((k) => typeof (counts as Record<string, unknown>)[k] === 'number')) return false;
  return (
    typeof value.synthetic_review_data === 'boolean' &&
    isRecord(value.project_status) &&
    isRecord(value.order_status) &&
    isRecord(value.resource_status) &&
    isRecord(value.reviews_by_reason) &&
    arrayOf(value.recent_projects, (p): p is OperationsDashboard['recent_projects'][number] =>
      isRecord(p) && isCanonicalId(p.project_id)) &&
    arrayOf(value.recent_orders, isOperationsOrder) &&
    Array.isArray(value.pending_reviews_sample)
  );
}

/* ------------------------------- transport ------------------------------ */

function joinUrl(baseUrl: string, path: string): string {
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export function createOperationsClient(options: OperationsClientOptions = {}): OperationsClient {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const baseUrl = options.baseUrl ?? '';

  async function request<T>(path: string, guard: Guard<T>): Promise<BusinessDataEnvelope<T>> {
    try {
      const response = await fetchImpl(joinUrl(baseUrl, path), {
        method: 'GET',
        headers: { accept: 'application/json' },
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return failed('OPERATIONS_INVALID_ENVELOPE', 'Operations service returned an invalid response.');
      }
      if (!response.ok) {
        return failed('OPERATIONS_HTTP_ERROR', 'Operations service request failed.');
      }
      if (!isBusinessDataEnvelope(body, guard)) {
        return failed('OPERATIONS_INVALID_ENVELOPE', 'Operations service returned an invalid envelope.');
      }
      return body;
    } catch {
      return failed('OPERATIONS_TRANSPORT_ERROR', 'Operations service is unavailable.');
    }
  }

  async function decide(
    reviewId: string,
    decision: ReviewDecision,
    decisionOptions?: ReviewDecideOptions,
  ): Promise<BusinessDataEnvelope<OperationsReviewCase>> {
    try {
      const response = await fetchImpl(joinUrl(baseUrl, `/api/business-data/reviews/${encodeURIComponent(reviewId)}/decision`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decision,
          idempotencyKey: decisionOptions?.idempotencyKey ?? null,
          actor: decisionOptions?.actor,
          note: decisionOptions?.note ?? null,
          patch: decisionOptions?.editPatch ?? null,
        }),
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return failed('OPERATIONS_INVALID_ENVELOPE', 'Operations service returned an invalid response.');
      }
      if (!response.ok) {
        return failed('OPERATIONS_HTTP_ERROR', 'Operations service request failed.');
      }
      if (!isBusinessDataEnvelope(body, isOperationsReviewCase)) {
        return failed('OPERATIONS_INVALID_ENVELOPE', 'Operations service returned an invalid envelope.');
      }
      return body;
    } catch {
      return failed('OPERATIONS_TRANSPORT_ERROR', 'Operations service is unavailable.');
    }
  }

  function failed<T>(code: string, message: string): BusinessDataEnvelope<T> {
    return {
      mode: CONNECTED_MODE,
      buildSha: 'unknown',
      status: 'ERROR',
      error: { code, message },
      health: {
        mode: CONNECTED_MODE,
        connected: false,
        configuredResourceCount: 0,
        lastSuccessfulReadAt: null,
        lastSuccessfulWriteAt: null,
        lastReadbackStatus: 'NOT_RUN',
        latencyBucket: 'UNKNOWN',
        error: { code, message },
      },
    } as BusinessDataEnvelope<T>;
  }

  return {
    getOverview: () => request('/api/business-data/overview', isOperationsDashboard),
    listCustomers: (query) => request(
      `/api/business-data/customers${queryString({ limit: query?.limit, status: query?.status })}`,
      (v): v is OperationsCustomer[] => arrayOf(v, isOperationsCustomer),
    ),
    getCustomer: (customerId) => request(
      `/api/business-data/customers/${encodeURIComponent(customerId)}`,
      (v): v is OperationsCustomer | null => v === null || isOperationsCustomer(v),
    ),
    listOrders: (query) => request(
      `/api/business-data/orders${queryString({ limit: query?.limit, customerId: query?.customerId, status: query?.status })}`,
      (v): v is OperationsOrder[] => arrayOf(v, isOperationsOrder),
    ),
    getOrder: (orderId) => request(
      `/api/business-data/orders/${encodeURIComponent(orderId)}`,
      (v): v is OperationsOrder | null => v === null || isOperationsOrder(v),
    ),
    listReviewQueue: (query) => request(
      `/api/business-data/reviews${queryString({
        limit: query?.limit,
        cursor: query?.cursor,
        status: query?.status,
        reason: query?.reason,
      })}`,
      isReviewQueueListResult,
    ),
    getReviewQueueItem: (reviewId) => request(
      `/api/business-data/reviews/${encodeURIComponent(reviewId)}`,
      (v): v is OperationsReviewCase | null => v === null || isOperationsReviewCase(v),
    ),
    decideReviewQueueItem: (reviewId, decision, decisionOptions) => decide(reviewId, decision, decisionOptions),
    listAuditEvents: (limit) => request(
      `/api/business-data/audit${queryString({ limit })}`,
      (v): v is OperationsAuditEvent[] => arrayOf(v, isAuditEvent),
    ),
  };
}
