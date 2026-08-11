import { describe, it, expect } from 'vitest';
import { isBusinessCommitSuccess } from '@busos/contracts';
import { BusinessRepository } from '../src/business-repository.js';
import { createFakeFeishuAdapter } from '../src/feishu-adapter-fake.js';
import { verifyLeadCriticalFields, verifyCustomerCriticalFields } from '../src/verify.js';
import { fixedIdGenerator, FIXED_NOW, SAMPLE_LEAD_INPUT, SAMPLE_CUSTOMER_INPUT } from './fixtures.js';

const writtenLead = {
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
} as const;

describe('readback verification logic (D019)', () => {
  it('matching critical fields -> VERIFIED', () => {
    expect(verifyLeadCriticalFields(writtenLead, writtenLead)).toBe(true);
  });

  it('mismatch in service_type -> FAILED', () => {
    const read = { ...writtenLead, service_type: '婚纱照' };
    expect(verifyLeadCriticalFields(writtenLead, read)).toBe(false);
  });

  it('mismatch in budget -> FAILED', () => {
    const read = { ...writtenLead, budget_max: 9999 };
    expect(verifyLeadCriticalFields(writtenLead, read)).toBe(false);
  });

  it('mismatch in customer link -> FAILED', () => {
    const read = { ...writtenLead, customer_id: 'customer_other0000' };
    expect(verifyLeadCriticalFields(writtenLead, read)).toBe(false);
  });

  it('customer identity mismatch -> FAILED', () => {
    const written = {
      customer_id: 'customer_0123456789abcdef',
      display_name: '张三',
      phone: '13800138000',
      wechat: 'zhangsan123',
      status: 'ACTIVE',
      created_at: '2026-08-11T16:00:00.000Z',
      updated_at: '2026-08-11T16:00:00.000Z',
    } as const;
    expect(verifyCustomerCriticalFields(written, { ...written, phone: '13900139000' })).toBe(false);
  });
});

describe('readback through FakeFeishuAdapter', () => {
  it('normal write -> readback VERIFIED -> business commit success', async () => {
    const repo = new BusinessRepository(createFakeFeishuAdapter(), {
      now: () => FIXED_NOW,
      idGenerator: fixedIdGenerator,
    });
    const { commit } = await repo.createLead(SAMPLE_LEAD_INPUT);
    expect(commit.readback_status).toBe('VERIFIED');
    expect(isBusinessCommitSuccess(commit)).toBe(true);
  });

  it('corrupted readback -> readback FAILED -> business commit NOT success', async () => {
    const repo = new BusinessRepository(
      createFakeFeishuAdapter({ corruptReadbackLead: { service_type: '被篡改' } }),
      { now: () => FIXED_NOW, idGenerator: fixedIdGenerator },
    );
    const { lead, commit } = await repo.createLead(SAMPLE_LEAD_INPUT);
    // domain returned is the readback (corrupted) value
    expect(lead.service_type).toBe('被篡改');
    expect(commit.readback_status).toBe('FAILED');
    expect(commit.status).toBe('FAILED');
    expect(isBusinessCommitSuccess(commit)).toBe(false);
  });

  it('customer corrupted readback -> FAILED', async () => {
    const repo = new BusinessRepository(
      createFakeFeishuAdapter({ corruptReadbackCustomer: { display_name: '冒名' } }),
      { now: () => FIXED_NOW, idGenerator: fixedIdGenerator },
    );
    const { commit } = await repo.createCustomer(SAMPLE_CUSTOMER_INPUT);
    expect(commit.readback_status).toBe('FAILED');
    expect(isBusinessCommitSuccess(commit)).toBe(false);
  });
});
