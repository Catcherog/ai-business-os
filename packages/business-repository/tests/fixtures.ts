import type { LeadCreateInput, CustomerCreateInput } from '../src/types.js';

export const FIXED_NOW = new Date('2026-08-11T16:00:00.000Z');
export const FIXED_LEAD_ID = 'lead_0123456789abcdef';
export const FIXED_CUSTOMER_ID = 'customer_0123456789abcdef';

export function fixedIdGenerator(prefix: string): string {
  if (prefix === 'lead') return FIXED_LEAD_ID;
  if (prefix === 'customer') return FIXED_CUSTOMER_ID;
  return `${prefix}_0123456789abcdef`;
}

export const SAMPLE_LEAD_INPUT: LeadCreateInput = {
  customer_id: null,
  source_session_id: 'sess_demo00000001',
  source_candidate_id: 'cand_demo00000001',
  service_type: '新中式写真',
  budget_min: 3500,
  budget_max: 4000,
  preferred_date_text: '下个月',
  status: 'NEW',
};

export const SAMPLE_CUSTOMER_INPUT: CustomerCreateInput = {
  display_name: '张三',
  phone: '13800138000',
  wechat: 'zhangsan123',
  status: 'ACTIVE',
};
