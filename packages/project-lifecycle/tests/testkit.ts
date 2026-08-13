import type { Lead, Customer, Project, Task, CommitResultV1 } from '@busos/contracts';
import {
  BusinessRepository,
  FakeFeishuAdapter,
  RealFeishuAdapter,
  createFeishuAdapter,
  createFeishuAdapterFromEnv,
  DEFAULT_FIELD_MAP,
} from '@busos/business-repository';
import type {
  ProjectCreateInput,
  TaskCreateInput,
} from '@busos/business-repository';
import type { ProjectLifecycleRepository } from '../src/types.js';
import type { ProjectLifecycleDeps } from '../src/index.js';

/**
 * Test support kit for BUSOS-P4-01.
 *
 * The Feishu stub below is intentionally re-declared (not imported) from
 * packages/business-repository/tests, to avoid modifying the P1-03 package.
 * It is the same generic in-memory Feishu bitable simulator, extended to cover
 * the Project and Task tables used by this slice.
 */

/* ---------------------------------------------------- counting repository */

/**
 * Pass-through wrapper around `BusinessRepository` that counts the lifecycle
 * write operations. This is how the tests prove "writes = 0" and exact counts.
 * It does NOT extend `FakeFeishuAdapter` (per §10); it wraps the public
 * `BusinessRepository` surface only.
 */
export class CountingBusinessRepository implements ProjectLifecycleRepository {
  writes = { project: 0, task: 0, leadUpdate: 0 };

  constructor(private readonly repo: BusinessRepository) {}

  async getLead(leadId: string): Promise<Lead | null> {
    return this.repo.getLead(leadId);
  }
  async getCustomer(customerId: string): Promise<Customer | null> {
    return this.repo.getCustomer(customerId);
  }
  async updateLeadStatus(leadId: string, status: 'NEW' | 'QUALIFIED' | 'CONVERTED' | 'LOST') {
    this.writes.leadUpdate += 1;
    return this.repo.updateLeadStatus(leadId, status);
  }
  async createProject(input: ProjectCreateInput): Promise<{ project: Project; commit: CommitResultV1 }> {
    this.writes.project += 1;
    return this.repo.createProject(input);
  }
  async getProject(projectId: string): Promise<Project | null> {
    return this.repo.getProject(projectId);
  }
  async createTask(input: TaskCreateInput): Promise<{ task: Task; commit: CommitResultV1 }> {
    this.writes.task += 1;
    return this.repo.createTask(input);
  }
  async getTask(taskId: string): Promise<Task | null> {
    return this.repo.getTask(taskId);
  }
  async deleteProject(recordId: string): Promise<boolean> {
    return this.repo.deleteProject(recordId);
  }
  async deleteTask(recordId: string): Promise<boolean> {
    return this.repo.deleteTask(recordId);
  }
}

/* --------------------------------------------------------- deps factories */

export function fakeDeps(adapter = new FakeFeishuAdapter()) {
  const repo = new BusinessRepository(adapter);
  const counts = new CountingBusinessRepository(repo);
  return { deps: { businessRepository: counts } as ProjectLifecycleDeps, counts, adapter, repo };
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
    if (method === 'DELETE' && recordId) {
      const existed = store.delete(recordId);
      return json({ code: 0, msg: 'ok', data: { record: null }, existed });
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
    projectTableId: 'tblProject',
    taskTableId: 'tblTask',
    fieldMap: DEFAULT_FIELD_MAP,
    fetchImpl: fetchFn,
  }) as RealFeishuAdapter;
}

export function newFeishuStub() {
  return makeFeishuStub();
}

export { createFeishuAdapterFromEnv };
