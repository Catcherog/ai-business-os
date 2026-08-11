import {
  CONTRACT_VERSIONS,
  assertCommitResultV1,
  type CommitResultV1,
  type Lead,
  type Customer,
} from '@busos/contracts';
import type { FeishuAdapter, FeishuWriteOutcome, CustomerIdentityQuery } from './types.js';
import { verifyLeadCriticalFields, verifyCustomerCriticalFields } from './verify.js';
import { generateRecordId, nowIso } from './util.js';

/**
 * In-memory Feishu adapter for development + unit tests (explicitly Fake,
 * §6). It proves repository domain logic, mapping contract, readback
 * verification logic and error handling WITHOUT any Feishu network/secret.
 *
 * It must NEVER be reported as real P1-03 E2E success — the real E2E requires
 * the `RealFeishuAdapter` against a live Base, which is BLOCKED here due to
 * missing credentials (see §19).
 */
export interface FakeFeishuAdapterOptions {
  /** When set, the lead readback returns these overrides -> readback FAILED. */
  corruptReadbackLead?: Partial<Lead>;
  /** When set, the customer readback returns these overrides -> readback FAILED. */
  corruptReadbackCustomer?: Partial<Customer>;
  now?: () => Date;
}

export class FakeFeishuAdapter implements FeishuAdapter {
  private readonly leads = new Map<string, Lead>();
  private readonly customers = new Map<string, Customer>();
  private readonly opts: FakeFeishuAdapterOptions;

  constructor(opts: FakeFeishuAdapterOptions = {}) {
    this.opts = opts;
  }

  private commit(domainObject: 'lead' | 'customer', domainId: string, recordId: string, verified: boolean): CommitResultV1 {
    const commit: CommitResultV1 = {
      version: CONTRACT_VERSIONS.COMMIT_RESULT_V1,
      status: verified ? 'COMMITTED' : 'FAILED',
      domain_object: domainObject,
      domain_id: domainId,
      storage: 'feishu', // storage kind is fixed; the fake stands in for Feishu
      external_record_id: recordId,
      write_status: 'SUCCESS',
      readback_status: verified ? 'VERIFIED' : 'FAILED',
      errors: verified ? [] : ['fake readback critical field mismatch'],
    };
    return assertCommitResultV1(commit);
  }

  async createLead(lead: Lead): Promise<FeishuWriteOutcome<Lead>> {
    this.leads.set(lead.lead_id, lead);
    const recordId = generateRecordId('rec_lead');
    const read = this.opts.corruptReadbackLead ? { ...lead, ...this.opts.corruptReadbackLead } : lead;
    const verified = verifyLeadCriticalFields(lead, read);
    return { domain: read, commit: this.commit('lead', lead.lead_id, recordId, verified) };
  }

  async getLead(leadId: string): Promise<Lead | null> {
    return this.leads.get(leadId) ?? null;
  }

  async createCustomer(customer: Customer): Promise<FeishuWriteOutcome<Customer>> {
    this.customers.set(customer.customer_id, customer);
    const recordId = generateRecordId('rec_cust');
    const read = this.opts.corruptReadbackCustomer ? { ...customer, ...this.opts.corruptReadbackCustomer } : customer;
    const verified = verifyCustomerCriticalFields(customer, read);
    return { domain: read, commit: this.commit('customer', customer.customer_id, recordId, verified) };
  }

  async getCustomer(customerId: string): Promise<Customer | null> {
    return this.customers.get(customerId) ?? null;
  }

  async findCustomerByIdentity(identity: CustomerIdentityQuery): Promise<Customer | null> {
    if (!identity.phone && !identity.wechat) return null;
    for (const c of this.customers.values()) {
      if (identity.phone && c.phone === identity.phone) return c;
      if (identity.wechat && c.wechat === identity.wechat) return c;
    }
    return null;
  }

  async linkLeadCustomer(leadId: string, customerId: string): Promise<Lead> {
    const lead = this.leads.get(leadId);
    if (!lead) throw new Error(`FakeFeishuAdapter: lead not found: ${leadId}`);
    const updated: Lead = {
      ...lead,
      customer_id: customerId,
      updated_at: nowIso(this.opts.now?.() ?? new Date()),
    };
    this.leads.set(leadId, updated);
    return updated;
  }
}

export function createFakeFeishuAdapter(opts: FakeFeishuAdapterOptions = {}): FeishuAdapter {
  return new FakeFeishuAdapter(opts);
}
