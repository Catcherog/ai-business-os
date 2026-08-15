import {
  assertWith,
  LeadSchema,
  CustomerSchema,
  ProjectSchema,
  TaskSchema,
  AssetSchema,
  type Lead,
  type Customer,
  type Project,
  type Task,
  type Asset,
  type LeadStatus,
  type ProjectStatus,
  type TaskStatus,
  type CommitResultV1,
} from '@busos/contracts';
import type { FeishuAdapter, LeadCreateInput, CustomerCreateInput, ProjectCreateInput, TaskCreateInput, AssetCreateInput, CustomerIdentityQuery } from './types.js';
import { generateDomainId, nowIso } from './util.js';

/**
 * BusinessRepository — the domain persistence boundary (D017).
 *
 * Upper layers call ONLY this. It never imports Feishu SDKs or field names; it
 * depends on the `FeishuAdapter` port. Responsibilities kept here:
 *   - generate canonical ids + timestamps
 *   - validate the canonical object against @busos/contracts and FAIL CLOSED on
 *     violation (BL-005: a missing non-null service_type must not be guessed)
 *   - delegate write/readback to the adapter and return canonical + CommitResultV1
 */
export interface BusinessRepositoryOptions {
  now?: () => Date;
  idGenerator?: (prefix: string) => string;
}

export class BusinessRepository {
  private readonly adapter: FeishuAdapter;
  private readonly opts: BusinessRepositoryOptions;

  constructor(adapter: FeishuAdapter, opts: BusinessRepositoryOptions = {}) {
    this.adapter = adapter;
    this.opts = opts;
  }

  private now(): Date {
    return this.opts.now ? this.opts.now() : new Date();
  }

  private newId(prefix: string): string {
    return this.opts.idGenerator ? this.opts.idGenerator(prefix) : generateDomainId(prefix);
  }

  /* ------------------------------------------------------------------- Lead */

  async createLead(input: LeadCreateInput): Promise<{ lead: Lead; commit: CommitResultV1 }> {
    const lead: Lead = {
      lead_id: this.newId('lead'),
      customer_id: input.customer_id ?? null,
      source_session_id: input.source_session_id,
      source_candidate_id: input.source_candidate_id,
      service_type: input.service_type,
      budget_min: input.budget_min ?? null,
      budget_max: input.budget_max ?? null,
      preferred_date_text: input.preferred_date_text ?? null,
      status: input.status ?? 'NEW',
      created_at: nowIso(this.now()),
      updated_at: nowIso(this.now()),
    };
    // Fail closed: invalid canonical (e.g. empty service_type) never reaches Feishu.
    assertWith(LeadSchema, lead, 'Lead');
    const outcome = await this.adapter.createLead(lead);
    return { lead: outcome.domain, commit: outcome.commit };
  }

  async getLead(leadId: string): Promise<Lead | null> {
    return this.adapter.getLead(leadId);
  }

  /* --------------------------------------------------------------- Customer */

  async createCustomer(input: CustomerCreateInput): Promise<{ customer: Customer; commit: CommitResultV1 }> {
    const customer: Customer = {
      customer_id: this.newId('customer'),
      display_name: input.display_name,
      phone: input.phone ?? null,
      wechat: input.wechat ?? null,
      status: input.status ?? 'ACTIVE',
      created_at: nowIso(this.now()),
      updated_at: nowIso(this.now()),
    };
    assertWith(CustomerSchema, customer, 'Customer');
    const outcome = await this.adapter.createCustomer(customer);
    return { customer: outcome.domain, commit: outcome.commit };
  }

  async getCustomer(customerId: string): Promise<Customer | null> {
    return this.adapter.getCustomer(customerId);
  }

  async findCustomerByIdentity(identity: CustomerIdentityQuery): Promise<Customer | null> {
    if (!identity.phone && !identity.wechat) return null;
    return this.adapter.findCustomerByIdentity(identity);
  }

  /* -------------------------------------------------------- relationship */

  async linkLeadCustomer(leadId: string, customerId: string): Promise<Lead> {
    return this.adapter.linkLeadCustomer(leadId, customerId);
  }

  /* --------------------------------------------- P4: Lead status update */

  async updateLeadStatus(
    leadId: string,
    status: LeadStatus,
  ): Promise<{ lead: Lead; commit: CommitResultV1 }> {
    const outcome = await this.adapter.updateLeadStatus(leadId, status);
    return { lead: outcome.domain, commit: outcome.commit };
  }

  /* ------------------------------------------------------------ Project */

  async createProject(input: ProjectCreateInput): Promise<{ project: Project; commit: CommitResultV1 }> {
    const project: Project = {
      project_id: this.newId('proj'),
      customer_id: input.customer_id,
      lead_id: input.lead_id,
      project_type: input.project_type,
      title: input.title,
      status: input.status ?? 'DRAFT',
      scheduled_date: input.scheduled_date ?? null,
      created_at: nowIso(this.now()),
      updated_at: nowIso(this.now()),
    };
    // Fail closed: an invalid canonical (e.g. empty title) never reaches Feishu.
    assertWith(ProjectSchema, project, 'Project');
    const outcome = await this.adapter.createProject(project);
    return { project: outcome.domain, commit: outcome.commit };
  }

  async getProject(projectId: string): Promise<Project | null> {
    return this.adapter.getProject(projectId);
  }

  /* --------------------------------------------------------------- Task */

  async createTask(input: TaskCreateInput): Promise<{ task: Task; commit: CommitResultV1 }> {
    const task: Task = {
      task_id: this.newId('task'),
      project_id: input.project_id,
      task_type: input.task_type,
      title: input.title,
      status: input.status ?? 'TODO',
      due_date: input.due_date ?? null,
      created_at: nowIso(this.now()),
      updated_at: nowIso(this.now()),
    };
    assertWith(TaskSchema, task, 'Task');
    const outcome = await this.adapter.createTask(task);
    return { task: outcome.domain, commit: outcome.commit };
  }

  async getTask(taskId: string): Promise<Task | null> {
    return this.adapter.getTask(taskId);
  }

  /* --------------------------------------------- P5: Task status update */

  async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
  ): Promise<{ task: Task; commit: CommitResultV1 }> {
    const outcome = await this.adapter.updateTaskStatus(taskId, status);
    return { task: outcome.domain, commit: outcome.commit };
  }

  /* ------------------------------------------------------------ Asset */

  async createAsset(input: AssetCreateInput): Promise<{ asset: Asset; commit: CommitResultV1 }> {
    const now = nowIso(this.now());
    const asset: Asset = {
      asset_id: this.newId('asset'),
      project_id: input.project_id,
      task_id: input.task_id,
      asset_type: input.asset_type,
      source: input.source,
      asset_uri: input.asset_uri,
      mime_type: input.mime_type ?? null,
      created_at: now,
      updated_at: now,
    };
    // Fail closed: an invalid canonical (e.g. empty asset_uri) never reaches Feishu.
    assertWith(AssetSchema, asset, 'Asset');
    const outcome = await this.adapter.createAsset(asset);
    return { asset: outcome.domain, commit: outcome.commit };
  }

  async getAsset(assetId: string): Promise<Asset | null> {
    return this.adapter.getAsset(assetId);
  }

  /* ----------------------------------------------- H1-01 additive collection reads */

  /** List canonical Projects (most-recently-updated first). Read-only. */
  async listProjects(opts?: { limit?: number }): Promise<Project[]> {
    return this.adapter.listProjects(opts);
  }

  /** List canonical Tasks for a Project. Read-only. */
  async listTasksByProject(projectId: string): Promise<Task[]> {
    return this.adapter.listTasksByProject(projectId);
  }

  /** List canonical Assets for a Project. Read-only. */
  async listAssetsByProject(projectId: string): Promise<Asset[]> {
    return this.adapter.listAssetsByProject(projectId);
  }

  /* ------------------------------------------- test-hygiene / compensation */

  async deleteProject(recordId: string): Promise<boolean> {
    return this.adapter.deleteProject(recordId);
  }

  async deleteTask(recordId: string): Promise<boolean> {
    return this.adapter.deleteTask(recordId);
  }

  async deleteAsset(recordId: string): Promise<boolean> {
    return this.adapter.deleteAsset(recordId);
  }
}
