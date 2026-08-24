import { describe, expect, it, vi } from 'vitest';
import { businessDataCustomerListViewModel } from '../src/features/business-data/business-data-view.js';
import { createDemoBusinessDataClient } from '../src/demo/business-data-demo.js';

/**
 * OWNER-REVIEW-FIX-01 — Business Data DEMO runtime identity.
 *
 * Seeded in-memory data must be honestly `DEMO / READY` with
 * `health.connected === false` and no fabricated provider state; the UI view
 * must render `DEMO · READY` and never `CONNECTED · READY`.
 *
 * The workspace seam (`../src/api.js`) is mocked so this identity suite stays
 * decoupled from the full in-memory workspace bootstrap (which other suites
 * exercise directly); the DEMO channel's identity contract is what is under
 * test here.
 */
vi.mock('../src/api.js', () => ({
  getSeedData: () => ({
    customers: [
      {
        customer_id: 'customer_001',
        display_name: '林晚晴',
        phone: '13900000001',
        wechat: 'linwanqing',
        status: 'ACTIVE',
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-24T00:00:00.000Z',
      },
      {
        customer_id: 'customer_002',
        display_name: '陈思远',
        phone: '13900000002',
        wechat: 'chensiyuan',
        status: 'ACTIVE',
        created_at: '2026-08-02T00:00:00.000Z',
        updated_at: '2026-08-24T00:00:00.000Z',
      },
    ],
    leads: [],
    projects: [],
  }),
}));

describe('Business Data DEMO identity (OWNER-REVIEW-FIX-01)', () => {
  it('A. demo client exposes DEMO / READY with connected=false and no fabricated provider state', async () => {
    const client = createDemoBusinessDataClient();
    const list = await client.listCustomers();

    expect(list.mode).toBe('DEMO');
    expect(list.status).toBe('READY');
    expect(list.health.mode).toBe('DEMO');
    expect(list.health.connected).toBe(false);
    expect(list.health.configuredResourceCount).toBe(0);
    expect(list.health.lastSuccessfulReadAt).toBeNull();
    expect(list.health.lastSuccessfulWriteAt).toBeNull();
    expect(list.health.lastReadbackStatus).toBe('NOT_RUN');
    expect(list.data).toBeDefined();
  });

  it('A2. envelope.mode === health.mode invariant holds (list / detail / not-found)', async () => {
    const client = createDemoBusinessDataClient();

    const list = await client.listCustomers();
    expect(list.mode).toBe(list.health.mode);
    const first = list.data?.[0];
    expect(first).toBeDefined();

    const detail = await client.getCustomer(first!.customer.customer_id);
    expect(detail.mode).toBe('DEMO');
    expect(detail.status).toBe('READY');
    expect(detail.mode).toBe(detail.health.mode);

    const missing = await client.getCustomer('customer_not_found_xyz');
    expect(missing.mode).toBe('DEMO');
    expect(missing.status).toBe('BLOCKED');
    expect(missing.mode).toBe(missing.health.mode);
  });

  it('B. demo view model renders DEMO · READY and never CONNECTED · READY', async () => {
    const client = createDemoBusinessDataClient();
    const list = await client.listCustomers();
    const model = businessDataCustomerListViewModel(list);

    expect(model.connectionLabel).toBe('DEMO · READY');
    expect(model.connectionLabel).not.toContain('CONNECTED');
    expect(model.health.mode).toBe('DEMO');
    expect(model.isInteractive).toBe(true);
  });
});
