import { describe, it, expect } from 'vitest';
import {
  RealFeishuAdapter,
  createFeishuAdapter,
  BusinessRepository,
} from '../src/index.js';
import { DEFAULT_FIELD_MAP } from '../src/mapping.js';

/**
 * BUSOS-P5-04 regression — `RealFeishuAdapter.updateTaskStatus` MUST NOT rewrite
 * the `Created At` (Feishu DateTime) field with an ISO string. Doing so produced
 * `DatetimeFieldConvFail` (Feishu code 1254064) on the live Task table and blocked
 * the P5-I Live closure at the final Task-DONE step.
 *
 * This guard asserts the REAL adapter's transport payload (not the Fake adapter):
 * the PUT body for a status update must carry ONLY the Status field, and must NOT
 * carry a `Created At` entry (least of all an ISO string). A stub capture proves
 * what the adapter actually puts on the wire.
 */

interface CapturedPut {
  tableId: string;
  recordId: string;
  fields: Record<string, unknown>;
}

function makeCaptureStub() {
  const stores: Record<string, Map<string, Record<string, unknown>>> = {};
  const puts: CapturedPut[] = [];
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
      puts.push({ tableId, recordId, fields: { ...body.fields } });
      return json({ code: 0, msg: 'ok', data: { record: { record_id: recordId, fields: store.get(recordId)! } } });
    }
    if (method === 'DELETE' && recordId) {
      store.delete(recordId);
      return json({ code: 0, msg: 'ok' });
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

  return { fetchFn, puts };
}

function makeRealAdapter(fetchFn: typeof fetch): RealFeishuAdapter {
  return createFeishuAdapter({
    appId: 'stub-app',
    appSecret: 'stub-secret',
    baseAppToken: 'appStubToken',
    leadTableId: 'tblLead',
    customerTableId: 'tblCustomer',
    taskTableId: 'tblTask',
    fieldMap: DEFAULT_FIELD_MAP,
    fetchImpl: fetchFn,
  }) as RealFeishuAdapter;
}

describe('BUSOS-P5-04 regression: updateTaskStatus transport payload', () => {
  it('sends only Status=DONE on the wire and no Created-At ISO rewrite; readback VERIFIED', async () => {
    const { fetchFn, puts } = makeCaptureStub();
    const adapter = makeRealAdapter(fetchFn);
    const repo = new BusinessRepository(adapter);

    // Seed a real (stubbed) Task so updateTaskStatus can resolve its record_id.
    const created = await repo.createTask({
      project_id: 'proj_reg_1',
      task_type: 'CREATIVE_GENERATION',
      title: 'regression task',
      status: 'TODO',
    });
    expect(created.commit.status).toBe('COMMITTED');
    const taskId = created.task.task_id;

    // The Task-DONE update under test.
    const out = await repo.updateTaskStatus(taskId, 'DONE');

    // Readback + contract must pass on the stubbed real adapter.
    expect(out.commit.write_status).toBe('SUCCESS');
    expect(out.commit.readback_status).toBe('VERIFIED');
    expect(out.commit.status).toBe('COMMITTED');
    expect(out.task.status).toBe('DONE');

    // Exactly one PUT targeted the Task table for this update.
    const taskPuts = puts.filter((p) => p.tableId === 'tblTask');
    expect(taskPuts.length).toBeGreaterThanOrEqual(1);
    const updatePut = taskPuts[taskPuts.length - 1];

    // Payload must carry Status=DONE...
    expect(updatePut.fields[DEFAULT_FIELD_MAP.taskStatus]).toBe('DONE');
    // ...and MUST NOT carry a Created At (DateTime) rewrite.
    expect(DEFAULT_FIELD_MAP.taskCreatedAt in updatePut.fields).toBe(false);
    // No other field is sent (minimal fix: only the status changes).
    expect(Object.keys(updatePut.fields).sort()).toEqual([DEFAULT_FIELD_MAP.taskStatus]);
  });
});
