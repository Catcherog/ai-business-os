import { describe, expect, it } from 'vitest';
import type {
  BusinessDataCustomerDetail,
  BusinessDataCustomerSummary,
  BusinessDataEnvelope,
} from './business-data-client.js';
import {
  businessDataCustomerDetailViewModel,
  businessDataCustomerListViewModel,
} from './business-data-view.js';

const health = {
  mode: 'CONNECTED' as const,
  connected: true,
  configuredResourceCount: 8,
  lastSuccessfulReadAt: '2026-08-24T01:02:03.000Z',
  lastSuccessfulWriteAt: null,
  lastReadbackStatus: 'VERIFIED' as const,
  latencyBucket: 'MEDIUM' as const,
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

function envelope<T>(status: BusinessDataEnvelope<T>['status'], data?: T): BusinessDataEnvelope<T> {
  return {
    mode: 'CONNECTED',
    buildSha: 'e4a9463',
    status,
    ...(data === undefined ? {} : { data }),
    ...(status === 'READY' ? {} : {
      error: { code: 'FEISHU_CONFIGURATION_MISSING', message: 'Connected Feishu configuration is unavailable.' },
    }),
    health,
  };
}

describe('business data view models', () => {
  it('presents canonical customer summaries and sanitized connection health', () => {
    const summaries: BusinessDataCustomerSummary[] = [
      { customer, leadCount: 1, projectCount: 1 },
    ];
    const model = businessDataCustomerListViewModel(envelope('READY', summaries));

    expect(model.connectionLabel).toBe('CONNECTED · READY');
    expect(model.connectionDetail).toContain('8 resources');
    expect(model.customers).toEqual([
      {
        id: 'customer_001',
        name: '客户一号',
        status: 'ACTIVE',
        leadCount: 1,
        projectCount: 1,
      },
    ]);
    expect(JSON.stringify(model)).not.toContain('record_id');
    expect(JSON.stringify(model)).not.toContain('fields');
  });

  it('keeps a blocked Connected state visible and does not fabricate customers', () => {
    const model = businessDataCustomerListViewModel(envelope('BLOCKED'));

    expect(model.connectionLabel).toBe('CONNECTED · BLOCKED');
    expect(model.customers).toEqual([]);
    expect(model.isInteractive).toBe(false);
    expect(model.errorMessage).toBe('Connected Feishu configuration is unavailable.');
  });

  it('shows nested canonical leads and projects without provider fields', () => {
    const detail: BusinessDataCustomerDetail = { customer, leads: [lead], projects: [project] };
    const model = businessDataCustomerDetailViewModel(envelope('READY', detail));

    expect(model.customer).toMatchObject({ id: 'customer_001', name: '客户一号', status: 'ACTIVE' });
    expect(model.leads).toEqual([
      expect.objectContaining({
        id: 'lead_001',
        serviceType: '品牌咨询',
        status: 'QUALIFIED',
        budget: '¥10,000–¥20,000',
        preferredDate: '下个月',
      }),
    ]);
    expect(model.projects).toEqual([
      expect.objectContaining({
        id: 'project_001',
        title: '品牌增长项目',
        status: 'IN_PROGRESS',
        scheduledDate: '2026-09-01',
      }),
    ]);
    expect(model.connectionLabel).toBe('CONNECTED · READY');
    expect(JSON.stringify(model)).not.toContain('app_token');
    expect(JSON.stringify(model)).not.toContain('access_token');
  });
});
