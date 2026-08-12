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
import type { GoldenPathRepository } from '../src/types.js';
import { buildCandidateFromInput, govern } from '../src/index.js';
import type { GoldenPathDeps } from '../src/index.js';

/**
 * Test support kit for BUSOS-P2-GP-001.
 *
 * NOTE: the Feishu stub below is intentionally re-declared (not imported) from
 * packages/business-repository/tests/feishu-real.test.ts. Doing so avoids
 * modifying the P1-03 package (§3: do not touch P1). It is the same in-memory
 * Feishu bitable simulator, used only to exercise the REAL adapter code path.
 */

/* ---------------------------------------------------- counting repository */

/**
 * A pass-through wrapper around `BusinessRepository` that counts the three
 * write operations. This is how the tests prove "repository writes = 0" for the
 * governance-blocked and readback-failure cases.
 *
 * IMPORTANT: this does NOT extend `FakeFeishuAdapter` (§10 forbids extending the
 * fake adapter). It wraps the public `BusinessRepository` surface only.
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

/* --------------------------------------------------------- deps factories */

export function fakeDeps(adapter = new FakeFeishuAdapter()): {
  deps: GoldenPathDeps;
  counts: CountingBusinessRepository;
  adapter: FakeFeishuAdapter;
} {
  const repo = new BusinessRepository(adapter);
  const counts = new CountingBusinessRepository(repo);
  return {
    deps: { candidateBuilder: buildCandidateFromInput, governance: govern, businessRepository: counts },
    counts,
    adapter,
  };
}

/* --------------------------------------------- Feishu in-memory simulator */

function makeFeishuStub() {
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

export function newFeishuStub() {
  return makeFeishuStub();
}

export { createFeishuAdapterFromEnv };
