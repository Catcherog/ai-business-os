import type {
  Lead,
  Customer,
  Project,
  Task,
  Asset,
  AssetType,
  AssetSource,
  CommitResultV1,
  LeadStatus,
  CustomerStatus,
  ProjectStatus,
  TaskStatus,
} from '@busos/contracts';

/**
 * A raw Feishu Base record as returned by the bitable API.
 *
 * This type lives BELOW the adapter boundary (D008/D017/D018): no upper layer
 * (BusinessRepository, GP-001, review UI) ever sees it as a business value.
 */
export interface FeishuRecord {
  record_id: string;
  fields: Record<string, unknown>;
}

/**
 * What a write method returns: the canonical domain object (after readback
 * verification) plus the contract-validated CommitResultV1.
 */
export type FeishuWriteOutcome<T> = {
  domain: T;
  commit: CommitResultV1;
};

export interface CustomerIdentityQuery {
  phone?: string | null;
  wechat?: string | null;
}

/**
 * The Feishu boundary as a port. BusinessRepository depends only on this
 * interface; the concrete implementation (real Feishu base or in-memory fake)
 * is injected. All Feishu-specific knowledge (tokens, table ids, field names,
 * HTTP) stays inside the implementation (D018).
 */
export interface FeishuAdapter {
  createLead(lead: Lead): Promise<FeishuWriteOutcome<Lead>>;
  getLead(leadId: string): Promise<Lead | null>;
  createCustomer(customer: Customer): Promise<FeishuWriteOutcome<Customer>>;
  getCustomer(customerId: string): Promise<Customer | null>;
  findCustomerByIdentity(identity: CustomerIdentityQuery): Promise<Customer | null>;
  linkLeadCustomer(leadId: string, customerId: string): Promise<Lead>;
  /**
   * Update a Lead's `status` and readback-verify the new status (D019).
   * Used by P4 conversion: `QUALIFIED/NEW -> CONVERTED`. Feishu readback
   * knowledge stays inside the adapter.
   */
  updateLeadStatus(leadId: string, status: LeadStatus): Promise<FeishuWriteOutcome<Lead>>;
  /** Create a Project record and readback-verify (D011/D019). */
  createProject(project: Project): Promise<FeishuWriteOutcome<Project>>;
  getProject(projectId: string): Promise<Project | null>;
  /** Create a Task record and readback-verify (P4 additive). */
  createTask(task: Task): Promise<FeishuWriteOutcome<Task>>;
  getTask(taskId: string): Promise<Task | null>;
  /**
   * Update a Task's `status` and readback-verify the new status (D019).
   * Used by P5 creative production: `TODO -> DONE`. Feishu readback
   * knowledge stays inside the adapter.
   */
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<FeishuWriteOutcome<Task>>;
  /**
   * Create an Asset record (P5 additive) and readback-verify (D008/D019).
   * `asset_type` is fixed to `IMAGE` and `source` to `LUMEN` in V1.
   */
  createAsset(asset: Asset): Promise<FeishuWriteOutcome<Asset>>;
  getAsset(assetId: string): Promise<Asset | null>;
  /**
   * Test-hygiene / P4-P5 compensation only: delete a single record by its
   * exact Feishu `record_id`. Used by the live E2E and by partial-failure
   * compensation to clean up generated records without touching existing
   * business data. Feishu-specific knowledge stays in the adapter.
   */
  deleteLead(recordId: string): Promise<boolean>;
  deleteCustomer(recordId: string): Promise<boolean>;
  deleteProject(recordId: string): Promise<boolean>;
  deleteTask(recordId: string): Promise<boolean>;
  deleteAsset(recordId: string): Promise<boolean>;
}

/* ----------------------------------------------------------------- input DTOs */

export interface LeadCreateInput {
  customer_id: string | null;
  source_session_id: string;
  source_candidate_id: string;
  service_type: string;
  budget_min?: number | null;
  budget_max?: number | null;
  preferred_date_text?: string | null;
  status?: LeadStatus;
}

export interface CustomerCreateInput {
  display_name: string;
  phone?: string | null;
  wechat?: string | null;
  status?: CustomerStatus;
}

export interface ProjectCreateInput {
  customer_id: string;
  lead_id: string;
  project_type: string;
  title: string;
  status?: ProjectStatus;
  scheduled_date?: string | null;
}

export interface TaskCreateInput {
  project_id: string;
  task_type: string;
  title: string;
  status?: TaskStatus;
  due_date?: string | null;
}

/** P5 (BUSOS-P5-01) Asset write DTO. Frozen V1: only IMAGE from LUMEN. */
export interface AssetCreateInput {
  project_id: string;
  task_id: string;
  asset_type: AssetType;
  source: AssetSource;
  asset_uri: string;
  /** `null` when the producing source does not advertise a MIME type. */
  mime_type?: string | null;
}
