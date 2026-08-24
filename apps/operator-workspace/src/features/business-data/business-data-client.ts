import type { Customer, Lead, Project } from '@busos/contracts';
import type {
  WorkspaceEnvelope,
} from '../../workspace-data-source.js';

const CONNECTED_MODE = 'CONNECTED' as const;
const DEFAULT_LIST_PATH = '/api/business-data/customers';

export type BusinessDataReadbackStatus = 'VERIFIED' | 'FAILED' | 'NOT_RUN';
export type BusinessDataLatencyBucket = 'UNKNOWN' | 'FAST' | 'MEDIUM' | 'SLOW';

/**
 * Runtime identity of a Business Data envelope. `DEMO` is the honest identity
 * of in-memory seeded data (OWNER-REVIEW-FIX-01); `CONNECTED` is the identity
 * of the real server/Feishu boundary. The real Connected transport still
 * REQUIRES `CONNECTED` envelopes and never accepts `DEMO` (see
 * `isBusinessDataEnvelope`).
 */
export type BusinessDataMode = 'DEMO' | 'CONNECTED';

/**
 * Browser-safe health information. Provider identifiers and credentials are
 * intentionally not part of this contract.
 */
export interface BusinessDataHealthView {
  mode: BusinessDataMode;
  connected: boolean;
  configuredResourceCount: number;
  lastSuccessfulReadAt: string | null;
  lastSuccessfulWriteAt: string | null;
  lastReadbackStatus: BusinessDataReadbackStatus;
  latencyBucket: BusinessDataLatencyBucket;
  error?: { code: string; message: string };
}

export type BusinessDataEnvelope<T> = WorkspaceEnvelope<T> & {
  health: BusinessDataHealthView;
};

export interface BusinessDataCustomerSummary {
  customer: Customer;
  leadCount: number;
  projectCount: number;
}

export interface BusinessDataCustomerDetail {
  customer: Customer;
  leads: Lead[];
  projects: Project[];
}

export interface BusinessDataClient {
  listCustomers(): Promise<BusinessDataEnvelope<BusinessDataCustomerSummary[]>>;
  getCustomer(customerId: string): Promise<BusinessDataEnvelope<BusinessDataCustomerDetail | null>>;
}

export interface BusinessDataClientOptions {
  baseUrl?: string;
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  listPath?: string;
  detailPath?: (customerId: string) => string;
}

type Guard<T> = (value: unknown) => value is T;

const FORBIDDEN_PROVIDER_KEYS = new Set([
  'access_token',
  'app_id',
  'app_secret',
  'app_token',
  'base_app_token',
  'fields',
  'password',
  'record_id',
  'table_id',
  'tenant_access_token',
  'token',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function containsForbiddenProviderKey(value: unknown, seen = new Set<object>()): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsForbiddenProviderKey(item, seen));
  }
  if (!isRecord(value)) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  return Object.entries(value).some(([key, item]) => (
    FORBIDDEN_PROVIDER_KEYS.has(key) || containsForbiddenProviderKey(item, seen)
  ));
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

function isCustomer(value: unknown): value is Customer {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'customer_id',
    'display_name',
    'phone',
    'wechat',
    'status',
    'created_at',
    'updated_at',
  ])) return false;
  return isCanonicalId(value.customer_id)
    && isNonEmptyString(value.display_name)
    && isNullableString(value.phone)
    && isNullableString(value.wechat)
    && (value.status === 'ACTIVE' || value.status === 'ARCHIVED')
    && isIsoDateTime(value.created_at)
    && isIsoDateTime(value.updated_at);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isLead(value: unknown): value is Lead {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'lead_id',
    'customer_id',
    'source_session_id',
    'source_candidate_id',
    'service_type',
    'budget_min',
    'budget_max',
    'preferred_date_text',
    'status',
    'created_at',
    'updated_at',
  ])) return false;
  return isCanonicalId(value.lead_id)
    && (value.customer_id === null || isCanonicalId(value.customer_id))
    && isCanonicalId(value.source_session_id)
    && isCanonicalId(value.source_candidate_id)
    && isNonEmptyString(value.service_type)
    && isNullableNumber(value.budget_min)
    && isNullableNumber(value.budget_max)
    && isNullableString(value.preferred_date_text)
    && (value.status === 'NEW'
      || value.status === 'QUALIFIED'
      || value.status === 'CONVERTED'
      || value.status === 'LOST')
    && isIsoDateTime(value.created_at)
    && isIsoDateTime(value.updated_at);
}

function isProject(value: unknown): value is Project {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'project_id',
    'customer_id',
    'lead_id',
    'project_type',
    'title',
    'status',
    'scheduled_date',
    'created_at',
    'updated_at',
  ])) return false;
  return isCanonicalId(value.project_id)
    && isCanonicalId(value.customer_id)
    && isCanonicalId(value.lead_id)
    && isNonEmptyString(value.project_type)
    && isNonEmptyString(value.title)
    && (value.status === 'DRAFT'
      || value.status === 'CONFIRMED'
      || value.status === 'IN_PROGRESS'
      || value.status === 'DELIVERED'
      || value.status === 'CANCELLED')
    && isNullableString(value.scheduled_date)
    && isIsoDateTime(value.created_at)
    && isIsoDateTime(value.updated_at);
}

function isCustomerSummary(value: unknown): value is BusinessDataCustomerSummary {
  if (!isRecord(value) || !hasOnlyKeys(value, ['customer', 'leadCount', 'projectCount'])) return false;
  return isCustomer(value.customer)
    && typeof value.leadCount === 'number'
    && Number.isInteger(value.leadCount)
    && value.leadCount >= 0
    && typeof value.projectCount === 'number'
    && Number.isInteger(value.projectCount)
    && value.projectCount >= 0;
}

function isCustomerDetail(value: unknown): value is BusinessDataCustomerDetail | null {
  if (value === null) return true;
  if (!isRecord(value) || !hasOnlyKeys(value, ['customer', 'leads', 'projects'])) return false;
  return isCustomer(value.customer)
    && Array.isArray(value.leads)
    && value.leads.every(isLead)
    && Array.isArray(value.projects)
    && value.projects.every(isProject);
}

function isHealth(value: unknown): value is BusinessDataHealthView {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'mode',
    'connected',
    'configuredResourceCount',
    'lastSuccessfulReadAt',
    'lastSuccessfulWriteAt',
    'lastReadbackStatus',
    'latencyBucket',
    'error',
  ])) return false;
  const error = value.error;
  return (value.mode === 'DEMO' || value.mode === CONNECTED_MODE)
    && typeof value.connected === 'boolean'
    && typeof value.configuredResourceCount === 'number'
    && Number.isInteger(value.configuredResourceCount)
    && value.configuredResourceCount >= 0
    && (value.lastSuccessfulReadAt === null || isIsoDateTime(value.lastSuccessfulReadAt))
    && (value.lastSuccessfulWriteAt === null || isIsoDateTime(value.lastSuccessfulWriteAt))
    && (value.lastReadbackStatus === 'VERIFIED'
      || value.lastReadbackStatus === 'FAILED'
      || value.lastReadbackStatus === 'NOT_RUN')
    && (value.latencyBucket === 'UNKNOWN'
      || value.latencyBucket === 'FAST'
      || value.latencyBucket === 'MEDIUM'
      || value.latencyBucket === 'SLOW')
    && (error === undefined
      || (isRecord(error)
        && hasOnlyKeys(error, ['code', 'message'])
        && isNonEmptyString(error.code)
        && isNonEmptyString(error.message)));
}

function isBusinessDataEnvelope<T>(value: unknown, guard: Guard<T>): value is BusinessDataEnvelope<T> {
  if (!isRecord(value)
    || containsForbiddenProviderKey(value)
    || !hasOnlyKeys(value, ['mode', 'buildSha', 'status', 'data', 'error', 'health'])) return false;
  if (value.mode !== CONNECTED_MODE
    || !isNonEmptyString(value.buildSha)
    || (value.status !== 'READY' && value.status !== 'BLOCKED' && value.status !== 'ERROR')
    || !isHealth(value.health)) return false;

  const error = value.error;
  const hasValidError = isRecord(error)
    && hasOnlyKeys(error, ['code', 'message'])
    && isNonEmptyString(error.code)
    && isNonEmptyString(error.message);

  if (value.status === 'READY') {
    return Object.prototype.hasOwnProperty.call(value, 'data')
      && guard(value.data)
      && error === undefined;
  }
  return !Object.prototype.hasOwnProperty.call(value, 'data') && hasValidError;
}

function joinUrl(baseUrl: string, path: string): string {
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function defaultHealth(error: { code: string; message: string }): BusinessDataHealthView {
  return {
    mode: CONNECTED_MODE,
    connected: false,
    configuredResourceCount: 0,
    lastSuccessfulReadAt: null,
    lastSuccessfulWriteAt: null,
    lastReadbackStatus: 'NOT_RUN',
    latencyBucket: 'UNKNOWN',
    error,
  };
}

function failed<T>(code: string, message: string): BusinessDataEnvelope<T> {
  return {
    mode: CONNECTED_MODE,
    buildSha: 'unknown',
    status: 'ERROR',
    error: { code, message },
    health: defaultHealth({ code, message }),
  };
}

export function createBusinessDataClient(options: BusinessDataClientOptions = {}): BusinessDataClient {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const baseUrl = options.baseUrl ?? '';
  const listPath = options.listPath ?? DEFAULT_LIST_PATH;
  const detailPath = options.detailPath
    ?? ((customerId: string) => `${DEFAULT_LIST_PATH}/${encodeURIComponent(customerId)}`);

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
        return failed('BUSINESS_DATA_INVALID_ENVELOPE', 'Business data service returned an invalid response.');
      }
      if (!response.ok) {
        return failed('BUSINESS_DATA_HTTP_ERROR', 'Business data service request failed.');
      }
      if (!isBusinessDataEnvelope(body, guard)) {
        return failed('BUSINESS_DATA_INVALID_ENVELOPE', 'Business data service returned an invalid envelope.');
      }
      return body;
    } catch {
      return failed('BUSINESS_DATA_TRANSPORT_ERROR', 'Business data service is unavailable.');
    }
  }

  return {
    listCustomers: () => request(listPath, (value): value is BusinessDataCustomerSummary[] => (
      Array.isArray(value) && value.every(isCustomerSummary)
    )),
    getCustomer: (customerId) => request(
      detailPath(customerId),
      (value): value is BusinessDataCustomerDetail | null => isCustomerDetail(value),
    ),
  };
}

export {
  isBusinessDataEnvelope,
  isCustomerDetail,
  isCustomerSummary,
};
