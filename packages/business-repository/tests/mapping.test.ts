import { describe, it, expect } from 'vitest';
import type { Lead, Customer } from '@busos/contracts';
import {
  DEFAULT_FIELD_MAP,
  toFeishuLeadFields,
  fromFeishuLeadRecord,
  toFeishuCustomerFields,
  fromFeishuCustomerRecord,
} from '../src/mapping.js';

const lead: Lead = {
  lead_id: 'lead_0123456789abcdef',
  customer_id: null,
  source_session_id: 'sess_01',
  source_candidate_id: 'cand_01',
  service_type: '新中式写真',
  budget_min: 3500,
  budget_max: 4000,
  preferred_date_text: '下个月',
  status: 'NEW',
  created_at: '2026-08-11T16:00:00.000Z',
  updated_at: '2026-08-11T16:00:00.000Z',
};

const customer: Customer = {
  customer_id: 'customer_0123456789abcdef',
  display_name: '张三',
  phone: '13800138000',
  wechat: 'zhangsan123',
  status: 'ACTIVE',
  created_at: '2026-08-11T16:00:00.000Z',
  updated_at: '2026-08-11T16:00:00.000Z',
};

describe('canonical <-> Feishu mapping (Lead)', () => {
  it('maps canonical Lead to Feishu fields under configured field names', () => {
    const fields = toFeishuLeadFields(lead, DEFAULT_FIELD_MAP);
    // Feishu field names (not canonical names) are used as keys
    expect(fields[DEFAULT_FIELD_MAP.leadId]).toBe('lead_0123456789abcdef');
    expect(fields[DEFAULT_FIELD_MAP.leadServiceType]).toBe('新中式写真');
    expect(fields[DEFAULT_FIELD_MAP.leadBudgetMax]).toBe(4000);
    expect(fields[DEFAULT_FIELD_MAP.leadPreferredDate]).toBe('下个月');
    // anonymous customer -> link field omitted (no customer to link; an empty
    // link array is rejected by stores that model the link as a text field)
    expect(fields[DEFAULT_FIELD_MAP.leadCustomerLink]).toBeUndefined();
  });

  it('round-trips back to an equal canonical Lead', () => {
    const fields = toFeishuLeadFields(lead, DEFAULT_FIELD_MAP);
    const back = fromFeishuLeadRecord({ record_id: 'rec_x', fields }, DEFAULT_FIELD_MAP);
    expect(back).toEqual(lead);
  });

  it('maps a linked customer to a Feishu link field', () => {
    const linked: Lead = { ...lead, customer_id: 'customer_aaaabbbbccccdddd' };
    const fields = toFeishuLeadFields(linked, DEFAULT_FIELD_MAP);
    expect(fields[DEFAULT_FIELD_MAP.leadCustomerLink]).toEqual([
      { record_ids: ['customer_aaaabbbbccccdddd'] },
    ]);
  });
});

describe('canonical <-> Feishu mapping (Customer)', () => {
  it('maps canonical Customer to Feishu fields under configured field names', () => {
    const fields = toFeishuCustomerFields(customer, DEFAULT_FIELD_MAP);
    expect(fields[DEFAULT_FIELD_MAP.customerDisplayName]).toBe('张三');
    expect(fields[DEFAULT_FIELD_MAP.customerPhone]).toBe('13800138000');
    expect(fields[DEFAULT_FIELD_MAP.customerWechat]).toBe('zhangsan123');
  });

  it('round-trips back to an equal canonical Customer', () => {
    const fields = toFeishuCustomerFields(customer, DEFAULT_FIELD_MAP);
    const back = fromFeishuCustomerRecord({ record_id: 'rec_y', fields }, DEFAULT_FIELD_MAP);
    expect(back).toEqual(customer);
  });

  it('empty text -> null on readback (never fabricate)', () => {
    const fields = toFeishuCustomerFields({ ...customer, phone: '', wechat: '' }, DEFAULT_FIELD_MAP);
    const back = fromFeishuCustomerRecord({ record_id: 'rec_z', fields }, DEFAULT_FIELD_MAP);
    expect(back.phone).toBeNull();
    expect(back.wechat).toBeNull();
  });
});

describe('Feishu field-name isolation (gate 3)', () => {
  it('mapping uses Feishu field names, not canonical property names', () => {
    const fields = toFeishuLeadFields(lead, DEFAULT_FIELD_MAP);
    // canonical property names must NOT leak as Feishu field keys
    expect(fields).not.toHaveProperty('lead_id');
    expect(fields).not.toHaveProperty('service_type');
    expect(fields).not.toHaveProperty('budget_max');
  });
});
