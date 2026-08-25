import { describe, expect, it } from 'vitest';
import type { OperationsCustomer, OperationsOrder, OperationsReviewCase, Project, Resource } from '@busos/business-repository';
import { FakeOperationsAdapter, OperationsRepository, createReviewQueueStore } from '@busos/business-repository';
import { createBusinessDataApi } from '../server/business-data.js';

const customer: OperationsCustomer = {
  customer_id: 'customer-1',
  display_name: '秋水摄影',
  phone: '13800000000',
  wechat: null,
  region: '上海',
  source_channel: '小红书',
  status: 'ACTIVE',
  created_at: '2026-08-20T00:00:00.000Z',
  updated_at: '2026-08-20T00:00:00.000Z',
  migration_key: 'customer:1',
};

const project: Project = {
  project_id: 'project-1',
  customer_id: 'customer-1',
  lead_id: 'lead-1',
  project_type: 'portrait',
  title: '秋季新中式拍摄',
  status: 'CONFIRMED',
  scheduled_date: null,
  created_at: '2026-08-20T00:00:00.000Z',
  updated_at: '2026-08-20T00:00:00.000Z',
};

const resource: Resource = {
  resource_key: 'resource-model-1',
  resource_id: null,
  resource_type: 'MODEL',
  name: 'Alice',
  xiaohongshu_name: null,
  xiaohongshu_profile_url: null,
  wechat: null,
  phone: null,
  city: '上海',
  address: null,
  styles: '新中式',
  size_raw: null,
  quote_raw: null,
  quote_min: null,
  quote_max: null,
  priority: 10,
  cooperation_status: 'ACTIVE',
  rating: null,
  availability_raw: null,
  work_url: null,
  source_aliases_json: null,
  migration_key: 'resource:model:1',
  legacy_updated_at: null,
};

function connectedApi() {
  return createBusinessDataApi({
    repository: new OperationsRepository(new FakeOperationsAdapter({
      customers: [customer],
      projects: [project],
      resources: [resource],
    })),
    reviewQueue: createReviewQueueStore({ synthetic: true }),
  });
}

describe('connected operations business-data surface', () => {
  it('overview aggregates customers/orders and flags synthetic review data', async () => {
    const result = await connectedApi().getOverview();
    expect(result.body).toMatchObject({ mode: 'CONNECTED', source: 'FEISHU_NEW_BASE' });
    if (result.body.mode !== 'CONNECTED') throw new Error('expected CONNECTED');
    const dashboard = result.body.data;
    expect(dashboard.counts.customers).toBeGreaterThanOrEqual(1);
    expect(dashboard.synthetic_review_data).toBe(true);
    expect(dashboard.pending_reviews_sample.length).toBeGreaterThan(0);
  });

  it('lists customers and reads a single customer by canonical id', async () => {
    const list = await connectedApi().listCustomers({ limit: 10 });
    expect(list.body).toMatchObject({ mode: 'CONNECTED', source: 'FEISHU_NEW_BASE', data: [customer] });
    const one = await connectedApi().getCustomer('customer-1');
    if (one.body.mode !== 'CONNECTED') throw new Error('expected CONNECTED');
    expect(one.body.data?.customer_id).toBe('customer-1');
    const bad = await connectedApi().getCustomer('recFeishuId');
    expect(bad.statusCode).toBe(400);
  });

  it('derives orders from projects', async () => {
    const orders = await connectedApi().listOrders({ limit: 10 });
    if (orders.body.mode !== 'CONNECTED') throw new Error('expected CONNECTED');
    const data = orders.body.data as OperationsOrder[];
    expect(data.length).toBeGreaterThanOrEqual(1);
    expect(data[0].customer_id).toBe('customer-1');
    const one = await connectedApi().getOrder(data[0].order_id);
    if (one.body.mode !== 'CONNECTED') throw new Error('expected CONNECTED');
    expect(one.body.data?.order_id).toBe(data[0].order_id);
  });

  it('serves a synthetic review queue and supports single approval + idempotency', async () => {
    const api = connectedApi();
    const queue = await api.listReviewQueue({ limit: 1 });
    if (queue.body.mode !== 'CONNECTED') throw new Error('expected CONNECTED');
    const first = queue.body.data.data[0] as OperationsReviewCase;
    expect(first).toBeTruthy();

    const item = await api.getReviewQueueItem(first.review_id);
    if (item.body.mode !== 'CONNECTED') throw new Error('expected CONNECTED');
    expect(item.body.data?.review_id).toBe(first.review_id);

    const decided = await api.decideReviewQueueItem(first.review_id, 'APPROVE', {
      idempotencyKey: 'test-key-1',
      actor: 'tester',
      note: 'ok',
    });
    if (decided.body.mode !== 'CONNECTED') throw new Error('expected CONNECTED');
    expect(decided.body.data.status).toBe('APPROVED');

    const replay = await api.decideReviewQueueItem(first.review_id, 'APPROVE', {
      idempotencyKey: 'test-key-1',
      actor: 'tester',
    });
    expect(replay.statusCode).toBe(200);

    const differentKey = await api.decideReviewQueueItem(first.review_id, 'APPROVE', {
      idempotencyKey: 'test-key-2',
      actor: 'tester',
    });
    expect(differentKey.statusCode).toBe(422);
    if (differentKey.body.mode !== 'CONNECTED') throw new Error('expected CONNECTED');
    expect(differentKey.body.error.code).toBe('REVIEW_ALREADY_DECIDED');

    const audit = await api.listAuditEvents(50);
    if (audit.body.mode !== 'CONNECTED') throw new Error('expected CONNECTED');
    expect(audit.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('patchBusinessFields fails closed (no live write adapter this batch)', async () => {
    const withRepo = await connectedApi().patchBusinessFields({
      entityType: 'customer',
      entityId: 'customer-1',
      patch: { display_name: 'x' },
      idempotencyKey: 'patch-1',
    });
    expect(withRepo.statusCode).toBe(422);
    if (withRepo.body.mode !== 'CONNECTED') throw new Error('expected CONNECTED');
    expect(withRepo.body.data.status).toBe('NOT_AUTHORIZED');

    const withoutRepo = await createBusinessDataApi({ env: {} }).patchBusinessFields({
      entityType: 'review',
      entityId: 'review-1',
      patch: { display_name: 'x' },
    });
    expect(withoutRepo.body).toMatchObject({ mode: 'BLOCKED' });
  });
});
