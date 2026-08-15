import { describe, it, expect } from 'vitest';
import {
  BusinessRepository,
  RealFeishuAdapter,
  createFeishuAdapter,
  DEFAULT_FIELD_MAP,
} from '@busos/business-repository';

import { WorkspaceReadService, seedFakeWorkspace } from '../src/index.js';

/**
 * In-memory simulator of the Feishu bitable API, used to exercise the REAL
 * adapter code path (RealFeishuAdapter) without live credentials — mirrors
 * packages/business-repository/tests/feishu-real.test.ts. This proves the
 * production read pipeline (Feishu search -> unwrap -> fromFeishu*Record ->
 * canonical) is correct end-to-end through WorkspaceReadService.
 */
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
    if (method === 'POST' && recordId === 'search') {
      const parsed = body?.filter ?? null;
      const items = [...store.entries()]
        .filter(([, f]) => matchFilter(f, parsed))
        .map(([rid, f]) => ({ record_id: rid, fields: f }));
      return json({ code: 0, msg: 'ok', data: { items } });
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

function makeRealAdapter(fetchFn: typeof fetch): RealFeishuAdapter {
  return createFeishuAdapter({
    appId: 'stub-app',
    appSecret: 'stub-secret',
    baseAppToken: 'appStubToken',
    leadTableId: 'tblLead',
    customerTableId: 'tblCustomer',
    projectTableId: 'tblProject',
    taskTableId: 'tblTask',
    assetTableId: 'tblAsset',
    fieldMap: DEFAULT_FIELD_MAP,
    fetchImpl: fetchFn,
  }) as RealFeishuAdapter;
}

/**
 * H1-01-H — Real-Adapter Simulator Regression.
 *
 * Writes the demo dataset through the production RealFeishuAdapter (into the
 * in-memory stub), then reads it back through WorkspaceReadService. If the
 * real adapter's collection-read mapping (listProjects / listTasksByProject /
 * listAssetsByProject) drifted from the canonical model, this fails. No live
 * credentials are required.
 */
describe('H1-01-H WorkspaceReadService over RealFeishuAdapter simulator', () => {
  it('aggregates a canonical project workspace through the production adapter', async () => {
    const adapter = makeRealAdapter(makeFeishuStub().fetchFn);
    const repo = new BusinessRepository(adapter);
    const seeded = await seedFakeWorkspace(repo);
    const svc = new WorkspaceReadService(repo);

    const projects = await svc.listProjects();
    expect(projects.length).toBeGreaterThanOrEqual(2);
    // Canonical mapping survived the round-trip (no Feishu field wrappers leak).
    expect(projects[0]).toHaveProperty('project_id');
    expect(projects[0]).not.toHaveProperty('record_id');

    const ws = await svc.getProjectWorkspace(seeded.projects[0].project_id);
    expect(ws).not.toBeNull();
    expect(ws!.customer).not.toBeNull();
    expect(ws!.customer!.customer_id).toBe(seeded.projects[0].customer_id);
    expect(ws!.tasks.length).toBeGreaterThan(0);
    expect(ws!.assets.length).toBeGreaterThanOrEqual(1);
    expect(ws!.assets[0].source).toBe('LUMEN');
    expect(ws!.assets[0].asset_type).toBe('IMAGE');
  });

  it('every project resolves its own customer/tasks/assets via the real adapter', async () => {
    const repo = new BusinessRepository(makeRealAdapter(makeFeishuStub().fetchFn));
    const seeded = await seedFakeWorkspace(repo);
    const svc = new WorkspaceReadService(repo);

    for (const p of seeded.projects) {
      const ws = await svc.getProjectWorkspace(p.project_id);
      expect(ws).not.toBeNull();
      expect(ws!.customer!.customer_id).toBe(p.customer_id);
      expect(ws!.tasks.every((t) => t.project_id === p.project_id)).toBe(true);
      expect(ws!.assets.every((a) => a.project_id === p.project_id)).toBe(true);
    }
  });
});
