import type { Lead, Customer, CommitResultV1 } from '@busos/contracts';
import {
  BusinessRepository,
  FakeFeishuAdapter,
  RealFeishuAdapter,
  createFeishuAdapter,
  createFeishuAdapterFromEnv,
  DEFAULT_FIELD_MAP,
} from '@busos/business-repository';
import type {
  LeadCreateInput,
  CustomerCreateInput,
  CustomerIdentityQuery,
} from '@busos/business-repository';
import {
  buildCandidateFromInput,
  govern,
  type GoldenPathRepository,
} from '@busos/golden-path';
import { buildLeadCandidate } from '@busos/service-agent-candidate';
import type { LeadCandidateV1, GovernanceResultV1 } from '@busos/contracts';

/* ----------------------------------------------------- counting repository */

/**
 * Pass-through wrapper around `BusinessRepository` that counts the three write
 * operations. This is how the tests prove "repository writes = 0" for the
 * interception / reject / invalid-edit cases (HR-A / HR-D / HR-E).
 */
export class CountingBusinessRepository implements GoldenPathRepository {
  writes = { lead: 0, customer: 0, link: 0 };

  constructor(private readonly repo: BusinessRepository) {}

  async createLead(input: LeadCreateInput): Promise<{ lead: Lead; commit: CommitResultV1 }> {
    this.writes.lead += 1;
    return this.repo.createLead(input);
  }
  async getLead(leadId: string): Promise<Lead | null> {
    return this.repo.getLead(leadId);
  }
  async createCustomer(
    input: CustomerCreateInput,
  ): Promise<{ customer: Customer; commit: CommitResultV1 }> {
    this.writes.customer += 1;
    return this.repo.createCustomer(input);
  }
  async getCustomer(customerId: string): Promise<Customer | null> {
    return this.repo.getCustomer(customerId);
  }
  async findCustomerByIdentity(identity: CustomerIdentityQuery): Promise<Customer | null> {
    return this.repo.findCustomerByIdentity(identity);
  }
  async linkLeadCustomer(leadId: string, customerId: string): Promise<Lead> {
    this.writes.link += 1;
    return this.repo.linkLeadCustomer(leadId, customerId);
  }
}

/* --------------------------------------------- reviewable candidate factory */

/**
 * Build a canonical REVIEW_REQUIRED candidate (task §12 Case 1).
 *
 * The governance rule added for BUSOS-P3-01: intent confidence < 0.6 softens
 * APPROVE -> REVIEW_REQUIRED (issue INTENT_CONFIDENCE_LOW). We feed a low
 * confidence so the same canonical business utterance
 * 「我想下个月拍一套新中式写真，预算大概4000。」 that APPROVES at confidence 1.0
 * becomes REVIEW_REQUIRED here — without touching production behaviour for the
 * P2 golden path.
 */
export function buildReviewableCandidate(opts: {
  intentConfidence?: number;
  message?: string;
  candidateId?: string;
  conversationId?: string;
  runId?: string;
} = {}): { candidate: LeadCandidateV1; governance: GovernanceResultV1 } {
  const candidate = buildLeadCandidate(
    {
      conversation_id: opts.conversationId ?? 'conv_review',
      run_id: opts.runId ?? 'run_review',
      message: opts.message ?? '我想下个月拍一套新中式写真，预算大概4000。',
      intent: 'I02',
      intent_confidence: opts.intentConfidence ?? 0.3,
    },
    { candidateId: opts.candidateId ?? 'cand_review' },
  );
  const governance = govern(candidate);
  return { candidate, governance };
}

/** Build a candidate whose governance is hard REJECT (empty service_type). */
export function buildRejectedCandidate(opts: {
  message?: string;
  candidateId?: string;
} = {}): { candidate: LeadCandidateV1; governance: GovernanceResultV1 } {
  const candidate = buildLeadCandidate(
    {
      conversation_id: 'conv_reject',
      run_id: 'run_reject',
      message: opts.message ?? '你好，请问你们几点关门？',
      intent: 'I01',
      intent_confidence: 1.0,
    },
    { candidateId: opts.candidateId ?? 'cand_reject' },
  );
  const governance = govern(candidate);
  return { candidate, governance };
}

/* --------------------------------------------- Feishu in-memory simulator */

/**
 * Minimal in-memory Feishu bitable simulator for exercising the REAL adapter
 * code path (RealFeishuAdapter: auth -> create -> readback -> map -> verify)
 * without any network or secret. Explicitly NOT a live Feishu E2E.
 */
export function newFeishuStub() {
  const stores: Record<string, Map<string, Record<string, unknown>>> = {};
  let counter = 0;
  const genId = () => `rec_${(++counter).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  const matchFilter = (fields: Record<string, unknown>, filter: any): boolean => {
    if (!filter) return true;
    const results = (filter.conditions as any[]).map((c) => {
      if (c.operator !== 'is') return false;
      const val = fields[c.field_name];
      const want = c.value[0];
      if (Array.isArray(val)) return val.some((v: any) => v?.record_ids?.[0] === want);
      return val === want;
    });
    return filter.conjunction === 'or' ? results.some(Boolean) : results.every(Boolean);
  };

  const json = (body: unknown, status = 200) =>
    ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

  const fetchFn: typeof fetch = async (input: any, init?: any) => {
    const url: string = typeof input === 'string' ? input : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(init.body) : undefined;

    if (url.includes('/auth/v3/tenant_access_token')) {
      return json({ code: 0, msg: 'ok', tenant_access_token: 'stub-token', expire: 7200 });
    }
    const m = url.match(/\/tables\/([^/]+)\/records(?:\/([^?]+))?/);
    if (!m) return json({ code: 1, msg: 'unknown path' }, 404);
    const tableId = m[1];
    const recordId = m[2] ?? null;
    if (!stores[tableId]) stores[tableId] = new Map();
    const store = stores[tableId];

    if (method === 'POST' && !recordId) {
      const rid = genId();
      store.set(rid, { ...body.fields });
      return json({ code: 0, msg: 'ok', data: { record: { record_id: rid, fields: body.fields } } });
    }
    if (method === 'GET' && recordId) {
      const fields = store.get(recordId);
      if (!fields) return json({ code: 1, msg: 'not found' }, 404);
      return json({ code: 0, msg: 'ok', data: { record: { record_id: recordId, fields } } });
    }
    if (method === 'PUT' && recordId) {
      store.set(recordId, { ...store.get(recordId), ...body.fields });
      return json({ code: 0, msg: 'ok', data: { record: { record_id: recordId, fields: store.get(recordId)! } } });
    }
    if (method === 'GET' && !recordId) {
      const q = url.split('?')[1] ?? '';
      const filter = new URLSearchParams(q).get('filter');
      const parsed = filter ? JSON.parse(filter) : null;
      const items = [...store.entries()]
        .filter(([, f]) => matchFilter(f, parsed))
        .map(([rid, f]) => ({ record_id: rid, fields: f }));
      return json({ code: 0, msg: 'ok', data: { items } });
    }
    if (method === 'DELETE' && recordId) {
      const deleted = store.delete(recordId);
      return json({ code: deleted ? 0 : 1, msg: deleted ? 'ok' : 'not found' });
    }
    return json({ code: 1, msg: 'unsupported' }, 400);
  };

  return { fetchFn };
}

export function makeRealAdapter(fetchFn: typeof fetch): RealFeishuAdapter {
  return createFeishuAdapter({
    appId: 'stub-app',
    appSecret: 'stub-secret',
    baseAppToken: 'appStubToken',
    leadTableId: 'tblLead',
    customerTableId: 'tblCustomer',
    fieldMap: DEFAULT_FIELD_MAP,
    fetchImpl: fetchFn,
  }) as RealFeishuAdapter;
}

/** Live adapter from FEISHU_* env; null when credentials are absent. */
export function createLiveAdapter() {
  return createFeishuAdapterFromEnv();
}

export { buildCandidateFromInput, govern };
