import { describe, it, expect } from 'vitest';
import { isBusinessCommitSuccess, ContractValidationError } from '@busos/contracts';
import { BusinessRepository } from '../src/business-repository.js';
import { createFakeFeishuAdapter } from '../src/feishu-adapter-fake.js';
import { fixedIdGenerator, FIXED_NOW, SAMPLE_LEAD_INPUT, SAMPLE_CUSTOMER_INPUT } from './fixtures.js';

function makeRepo() {
  const adapter = createFakeFeishuAdapter();
  const repo = new BusinessRepository(adapter, {
    now: () => FIXED_NOW,
    idGenerator: fixedIdGenerator,
  });
  return { adapter, repo };
}

describe('BusinessRepository — Lead', () => {
  it('createLead returns canonical Lead + VERIFIED commit', async () => {
    const { repo } = makeRepo();
    const { lead, commit } = await repo.createLead(SAMPLE_LEAD_INPUT);
    expect(lead.lead_id).toBe('lead_0123456789abcdef');
    expect(lead.service_type).toBe('新中式写真');
    expect(lead.budget_max).toBe(4000);
    expect(lead.customer_id).toBeNull();
    expect(commit.domain_object).toBe('lead');
    expect(commit.status).toBe('COMMITTED');
    expect(commit.write_status).toBe('SUCCESS');
    expect(commit.readback_status).toBe('VERIFIED');
    expect(commit.external_record_id).toMatch(/^rec_/);
    expect(isBusinessCommitSuccess(commit)).toBe(true);
  });

  it('getLead returns the created lead', async () => {
    const { repo } = makeRepo();
    const { lead } = await repo.createLead(SAMPLE_LEAD_INPUT);
    const fetched = await repo.getLead(lead.lead_id);
    expect(fetched).not.toBeNull();
    expect(fetched!.lead_id).toBe(lead.lead_id);
    expect(fetched!.service_type).toBe('新中式写真');
  });

  it('anonymous lead allowed (customer_id = null) and still COMMITTED', async () => {
    const { repo } = makeRepo();
    const { lead, commit } = await repo.createLead({ ...SAMPLE_LEAD_INPUT, customer_id: null });
    expect(lead.customer_id).toBeNull();
    expect(isBusinessCommitSuccess(commit)).toBe(true);
  });

  it('FAILS CLOSED on empty service_type (BL-005): never writes to Feishu', async () => {
    const { adapter, repo } = makeRepo();
    // spy: adapter.createLead must NOT be called
    let createCalled = false;
    const origCreate = adapter.createLead.bind(adapter);
    adapter.createLead = async (lead) => {
      createCalled = true;
      return origCreate(lead);
    };
    await expect(
      repo.createLead({ ...SAMPLE_LEAD_INPUT, service_type: '' }),
    ).rejects.toBeInstanceOf(ContractValidationError);
    expect(createCalled).toBe(false);
  });

  it('returns canonical object only (no raw Feishu record shape)', async () => {
    const { repo } = makeRepo();
    const { lead } = await repo.createLead(SAMPLE_LEAD_INPUT);
    // canonical Lead has exactly the domain fields; it must NOT carry a feishu record_id
    expect(lead).not.toHaveProperty('record_id');
    expect(lead).not.toHaveProperty('fields');
    expect(Object.keys(lead).sort()).toEqual(
      [
        'lead_id',
        'customer_id',
        'source_session_id',
        'source_candidate_id',
        'service_type',
        'budget_min',
        'budget_max',
        'preferred_date_text',
        'status',
        'created_at',
        'updated_at',
      ].sort(),
    );
  });
});

describe('BusinessRepository — Customer', () => {
  it('createCustomer returns canonical Customer + VERIFIED commit', async () => {
    const { repo } = makeRepo();
    const { customer, commit } = await repo.createCustomer(SAMPLE_CUSTOMER_INPUT);
    expect(customer.customer_id).toBe('customer_0123456789abcdef');
    expect(customer.display_name).toBe('张三');
    expect(customer.phone).toBe('13800138000');
    expect(customer.wechat).toBe('zhangsan123');
    expect(commit.domain_object).toBe('customer');
    expect(commit.readback_status).toBe('VERIFIED');
    expect(isBusinessCommitSuccess(commit)).toBe(true);
  });

  it('unknown phone/wechat stay null, not fabricated', async () => {
    const { repo } = makeRepo();
    const { customer } = await repo.createCustomer({ display_name: '李四' });
    expect(customer.phone).toBeNull();
    expect(customer.wechat).toBeNull();
  });

  it('getCustomer returns the created customer', async () => {
    const { repo } = makeRepo();
    const { customer } = await repo.createCustomer(SAMPLE_CUSTOMER_INPUT);
    const fetched = await repo.getCustomer(customer.customer_id);
    expect(fetched!.customer_id).toBe(customer.customer_id);
  });
});

describe('BusinessRepository — findCustomerByIdentity (exact match)', () => {
  it('finds by exact phone', async () => {
    const { repo } = makeRepo();
    const { customer } = await repo.createCustomer(SAMPLE_CUSTOMER_INPUT);
    const found = await repo.findCustomerByIdentity({ phone: '13800138000' });
    expect(found!.customer_id).toBe(customer.customer_id);
  });

  it('finds by exact wechat', async () => {
    const { repo } = makeRepo();
    const { customer } = await repo.createCustomer(SAMPLE_CUSTOMER_INPUT);
    const found = await repo.findCustomerByIdentity({ wechat: 'zhangsan123' });
    expect(found!.customer_id).toBe(customer.customer_id);
  });

  it('returns null for unknown identity', async () => {
    const { repo } = makeRepo();
    await repo.createCustomer(SAMPLE_CUSTOMER_INPUT);
    const found = await repo.findCustomerByIdentity({ phone: '00000000000' });
    expect(found).toBeNull();
  });

  it('returns null when no identity provided', async () => {
    const { repo } = makeRepo();
    expect(await repo.findCustomerByIdentity({})).toBeNull();
  });
});

describe('BusinessRepository — linkLeadCustomer', () => {
  it('links a lead to a customer and persists through getLead', async () => {
    const { repo } = makeRepo();
    const { lead } = await repo.createLead(SAMPLE_LEAD_INPUT);
    const { customer } = await repo.createCustomer(SAMPLE_CUSTOMER_INPUT);
    const updated = await repo.linkLeadCustomer(lead.lead_id, customer.customer_id);
    expect(updated.customer_id).toBe(customer.customer_id);
    const fetched = await repo.getLead(lead.lead_id);
    expect(fetched!.customer_id).toBe(customer.customer_id);
  });
});
