import { describe, expect, it } from 'vitest';
import {
  createBusinessDataClient,
  type BusinessDataCustomerDetail,
  type BusinessDataCustomerSummary,
  type BusinessDataEnvelope,
} from './business-data-client.js';

const health = {
  mode: 'CONNECTED' as const,
  connected: true,
  configuredResourceCount: 8,
  lastSuccessfulReadAt: '2026-08-24T01:02:03.000Z',
  lastSuccessfulWriteAt: null,
  lastReadbackStatus: 'NOT_RUN' as const,
  latencyBucket: 'FAST' as const,
};

const customer = {
  customer_id: 'customer_001',
  display_name: '客户一号',
  phone: '13800000000',
  wechat: 'customer_one',
  status: 'ACTIVE' as const,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-24T00:00:00.000Z',
};

const lead = {
  lead_id: 'lead_001',
  customer_id: 'customer_001',
  source_session_id: 'session_001',
  source_candidate_id: 'candidate_001',
  service_type: '品牌咨询',
  budget_min: 10000,
  budget_max: 20000,
  preferred_date_text: '下个月',
  status: 'QUALIFIED' as const,
  created_at: '2026-08-02T00:00:00.000Z',
  updated_at: '2026-08-23T00:00:00.000Z',
};

const project = {
  project_id: 'project_001',
  customer_id: 'customer_001',
  lead_id: 'lead_001',
  project_type: '咨询',
  title: '品牌增长项目',
  status: 'IN_PROGRESS' as const,
  scheduled_date: '2026-09-01',
  created_at: '2026-08-10T00:00:00.000Z',
  updated_at: '2026-08-20T00:00:00.000Z',
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function ready<T>(data: T): BusinessDataEnvelope<T> {
  return {
    mode: 'CONNECTED',
    buildSha: 'e4a9463',
    status: 'READY',
    data,
    health,
  };
}

describe('business data client', () => {
  it('reads canonical customer summaries through the coordinator-owned endpoint', async () => {
    const calls: Array<{ url: string; method: string | undefined }> = [];
    const summaries: BusinessDataCustomerSummary[] = [
      { customer, leadCount: 1, projectCount: 1 },
    ];
    const client = createBusinessDataClient({
      baseUrl: 'https://operator.example/',
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), method: init?.method });
        return response(ready(summaries));
      },
    });

    await expect(client.listCustomers()).resolves.toMatchObject({
      mode: 'CONNECTED',
      status: 'READY',
      data: summaries,
      health,
    });
    expect(calls).toEqual([
      { url: 'https://operator.example/api/business-data/customers', method: 'GET' },
    ]);
  });

  it('reads a canonical customer detail with nested leads and project links', async () => {
    const detail: BusinessDataCustomerDetail = { customer, leads: [lead], projects: [project] };
    const client = createBusinessDataClient({
      fetchImpl: async (input) => {
        expect(String(input)).toBe('/api/business-data/customers/customer_001');
        return response(ready(detail));
      },
    });

    await expect(client.getCustomer('customer_001')).resolves.toMatchObject({
      status: 'READY',
      data: { customer, leads: [lead], projects: [project] },
    });
  });

  it('fails closed for raw provider-shaped records without a DEMO fallback', async () => {
    const client = createBusinessDataClient({
      fetchImpl: async () => response({
        ...ready([{ record_id: 'rec_001', fields: { customer } }]),
      }),
    });

    const result = await client.listCustomers();
    expect(result).toMatchObject({
      mode: 'CONNECTED',
      status: 'ERROR',
      error: { code: 'BUSINESS_DATA_INVALID_ENVELOPE' },
    });
    expect(result).not.toHaveProperty('data');
  });

  it('keeps HTTP and transport failures explicit and connected', async () => {
    const httpClient = createBusinessDataClient({
      fetchImpl: async () => response({ mode: 'DEMO', buildSha: 'demo', status: 'READY', data: [] }, 503),
    });
    const transportClient = createBusinessDataClient({
      fetchImpl: async () => { throw new Error('network unavailable'); },
    });

    await expect(httpClient.listCustomers()).resolves.toMatchObject({
      mode: 'CONNECTED',
      status: 'ERROR',
      error: { code: 'BUSINESS_DATA_HTTP_ERROR' },
    });
    await expect(transportClient.listCustomers()).resolves.toMatchObject({
      mode: 'CONNECTED',
      status: 'ERROR',
      error: { code: 'BUSINESS_DATA_TRANSPORT_ERROR' },
    });
  });
});
