import {
  CONTRACT_VERSIONS,
  assertCommitResultV1,
  type CommitResultV1,
  type Lead,
  type Customer,
  type Project,
  type Task,
  type LeadStatus,
} from '@busos/contracts';
import type { FeishuAdapter, FeishuWriteOutcome, CustomerIdentityQuery } from './types.js';
import {
  verifyLeadCriticalFields,
  verifyCustomerCriticalFields,
  verifyProjectCriticalFields,
  verifyTaskCriticalFields,
} from './verify.js';
import { generateRecordId, nowIso } from './util.js';

/**
 * In-memory Feishu adapter for development + unit tests (explicitly Fake,
 * §6). It proves repository domain logic, mapping contract, readback
 * verification logic and error handling WITHOUT any Feishu network/secret.
 *
 * It must NEVER be reported as real P1-03 / P4 E2E success — the real E2E
 * requires the `RealFeishuAdapter` against a live Base, which is BLOCKED here
 * due to missing credentials (see §19).
 */
export interface FakeFeishuAdapterOptions {
  /** When set, the lead readback returns these overrides -> readback FAILED. */
  corruptReadbackLead?: Partial<Lead>;
  /** When set, the customer readback returns these overrides -> readback FAILED. */
  corruptReadbackCustomer?: Partial<Customer>;
  /** When set, the project readback returns these overrides -> readback FAILED. */
  corruptReadbackProject?: Partial<Project>;
  /** When set, the task readback returns these overrides -> readback FAILED. */
  corruptReadbackTask?: Partial<Task>;
  /** When set, updateLeadStatus reports a FAILED readback (CONVERTED not applied). */
  failLeadStatusUpdate?: boolean;
  now?: () => Date;
}

export class FakeFeishuAdapter implements FeishuAdapter {
  private readonly leads = new Map<string, Lead>();
  private readonly customers = new Map<string, Customer>();
  private readonly projects = new Map<string, Project>();
  private readonly tasks = new Map<string, Task>();
  /** Record id -> canonical id, so deletes can be issued by exact Feishu record id. */
  private readonly recordToCanonical = new Map<string, string>();
  private readonly opts: FakeFeishuAdapterOptions;

  constructor(opts: FakeFeishuAdapterOptions = {}) {
    this.opts = opts;
  }

  private commit(
    domainObject: 'lead' | 'customer' | 'project' | 'task',
    domainId: string,
    recordId: string,
    verified: boolean,
  ): CommitResultV1 {
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
    this.recordToCanonical.set(recordId, lead.lead_id);
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
    this.recordToCanonical.set(recordId, customer.customer_id);
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

  async updateLeadStatus(leadId: string, status: LeadStatus): Promise<FeishuWriteOutcome<Lead>> {
    const lead = this.leads.get(leadId);
    const recordId = generateRecordId('rec_lead');
    this.recordToCanonical.set(recordId, leadId);
    if (!lead) {
      const commit = this.commit('lead', leadId, recordId, false);
      commit.write_status = 'FAILED';
      commit.errors = ['fake updateLeadStatus: lead not found'];
      return { domain: { lead_id: leadId, status } as unknown as Lead, commit };
    }
    const appliedStatus = this.opts.failLeadStatusUpdate ? lead.status : status;
    const updated: Lead = { ...lead, status: appliedStatus };
    if (!this.opts.failLeadStatusUpdate) {
      updated.updated_at = nowIso(this.opts.now?.() ?? new Date());
      this.leads.set(leadId, updated);
    }
    const verified = !this.opts.failLeadStatusUpdate && updated.status === status;
    const commit = this.commit('lead', leadId, recordId, verified);
    if (this.opts.failLeadStatusUpdate) {
      commit.write_status = 'SUCCESS';
      commit.readback_status = 'FAILED';
      commit.errors = ['fake updateLeadStatus: injected failure'];
    }
    return { domain: updated, commit };
  }

  /* ---------------------------------------------------------- Project/Task */

  async createProject(project: Project): Promise<FeishuWriteOutcome<Project>> {
    this.projects.set(project.project_id, project);
    const recordId = generateRecordId('rec_proj');
    this.recordToCanonical.set(recordId, project.project_id);
    const read = this.opts.corruptReadbackProject ? { ...project, ...this.opts.corruptReadbackProject } : project;
    const verified = verifyProjectCriticalFields(project, read);
    return { domain: read, commit: this.commit('project', project.project_id, recordId, verified) };
  }

  async getProject(projectId: string): Promise<Project | null> {
    return this.projects.get(projectId) ?? null;
  }

  async createTask(task: Task): Promise<FeishuWriteOutcome<Task>> {
    this.tasks.set(task.task_id, task);
    const recordId = generateRecordId('rec_task');
    this.recordToCanonical.set(recordId, task.task_id);
    const read = this.opts.corruptReadbackTask ? { ...task, ...this.opts.corruptReadbackTask } : task;
    const verified = verifyTaskCriticalFields(task, read);
    return { domain: read, commit: this.commit('task', task.task_id, recordId, verified) };
  }

  async getTask(taskId: string): Promise<Task | null> {
    return this.tasks.get(taskId) ?? null;
  }

  /* --------------------------------------------------- test-hygiene deletion */

  async deleteLead(recordId: string): Promise<boolean> {
    const cid = this.recordToCanonical.get(recordId) ?? recordId;
    const existed = this.leads.has(cid);
    this.leads.delete(cid);
    this.recordToCanonical.delete(recordId);
    return existed;
  }

  async deleteCustomer(recordId: string): Promise<boolean> {
    const cid = this.recordToCanonical.get(recordId) ?? recordId;
    const existed = this.customers.has(cid);
    this.customers.delete(cid);
    this.recordToCanonical.delete(recordId);
    return existed;
  }

  async deleteProject(recordId: string): Promise<boolean> {
    const cid = this.recordToCanonical.get(recordId) ?? recordId;
    const existed = this.projects.has(cid);
    this.projects.delete(cid);
    this.recordToCanonical.delete(recordId);
    return existed;
  }

  async deleteTask(recordId: string): Promise<boolean> {
    const cid = this.recordToCanonical.get(recordId) ?? recordId;
    const existed = this.tasks.has(cid);
    this.tasks.delete(cid);
    this.recordToCanonical.delete(recordId);
    return existed;
  }

  /** Test-support: number of lead records currently held (Feishu write probe). */
  get leadCount(): number {
    return this.leads.size;
  }

  /** Test-support: number of customer records currently held. */
  get customerCount(): number {
    return this.customers.size;
  }
}

export function createFakeFeishuAdapter(opts: FakeFeishuAdapterOptions = {}): FeishuAdapter {
  return new FakeFeishuAdapter(opts);
}
