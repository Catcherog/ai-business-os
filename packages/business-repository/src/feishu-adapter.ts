import {
  CONTRACT_VERSIONS,
  assertCommitResultV1,
  type CommitResultV1,
  type CommitStatus,
  type WriteStatus,
  type ReadbackStatus,
  type Lead,
  type Customer,
  type Project,
  type Task,
  type Asset,
  type LeadStatus,
  type TaskStatus,
} from '@busos/contracts';
import type { FeishuAdapter, FeishuRecord, FeishuWriteOutcome, CustomerIdentityQuery } from './types.js';
import {
  DEFAULT_FIELD_MAP,
  type FeishuFieldMap,
  toFeishuLeadFields,
  fromFeishuLeadRecord,
  toFeishuCustomerFields,
  fromFeishuCustomerRecord,
  toFeishuProjectFields,
  fromFeishuProjectRecord,
  toFeishuTaskFields,
  fromFeishuTaskRecord,
  toFeishuAssetFields,
  fromFeishuAssetRecord,
} from './mapping.js';
import { verifyLeadCriticalFields, verifyCustomerCriticalFields, verifyProjectCriticalFields, verifyTaskCriticalFields, verifyAssetCriticalFields } from './verify.js';

/**
 * Real Feishu Base adapter (P1-03).
 *
 * Reuses the previously validated Feishu integration pattern from
 * `lark/src/scripts/temp/crud-probe.mjs` and
 * `collator-clean-clone/src/data-cleaning/agent/execution/bitable-writer.js`:
 *   - tenant_access_token via POST /open-apis/auth/v3/tenant_access_token/internal
 *   - bitable CRUD via /open-apis/bitable/v1/apps/{appToken}/tables/{tableId}/records
 *
 * Only this module knows tokens / table ids / field names (D018). Credentials
 * are read from the environment (never hardcoded). The `fetchImpl` option lets
 * tests exercise the real adapter pipeline with a stubbed transport.
 */

export interface FeishuAdapterConfig {
  appId: string;
  appSecret: string;
  baseAppToken: string;
  leadTableId: string;
  customerTableId: string;
  /** P4 (BUSOS-P4-01) Project table id. Optional at construction so the P1-03
   *  surface keeps working; Project/Task methods throw if unset. Required for
   *  the live P4 gate via `createFeishuAdapterFromEnv`. */
  projectTableId?: string;
  /** P4 (BUSOS-P4-01) Task table id. Optional at construction (see above). */
  taskTableId?: string;
  /** P5 (BUSOS-P5-01) Asset table id. Optional at construction; Asset methods
   *  throw if unset. Required for the live P5 gate via `createFeishuAdapterFromEnv`. */
  assetTableId?: string;
  fieldMap?: Partial<FeishuFieldMap>;
  baseUrl?: string;
  /** Injectable transport (defaults to global fetch). Used for tests. */
  fetchImpl?: typeof fetch;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

interface FeishuApiResponse {
  code: number;
  msg: string;
  data?: unknown;
}

const DEFAULT_BASE_URL = 'https://open.feishu.cn';

/**
 * The live `/records/search` endpoint wraps text (and other) field values as
 * `[{ text, type }]` arrays, unlike the `GET`/list endpoints which return plain
 * values. Unwrap them so the canonical mapping (which expects plain values)
 * works regardless of which lookup path produced the record. (BUSOS-P4-01
 * live-closure fix: list `?filter=` returns InvalidFilter on the live Base, so
 * lookups go through /search.)
 */
function unwrapFeishuValue(v: unknown): unknown {
  if (Array.isArray(v) && v.length > 0) {
    const first = v[0] as Record<string, unknown> | null;
    if (first && typeof first === 'object' && 'text' in first) return first.text;
    return first;
  }
  if (v && typeof v === 'object' && 'text' in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>).text;
  }
  return v;
}

function unwrapFeishuFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = unwrapFeishuValue(v);
  return out;
}

export class RealFeishuAdapter implements FeishuAdapter {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly baseAppToken: string;
  private readonly leadTableId: string;
  private readonly customerTableId: string;
  private readonly projectTableId: string | undefined;
  private readonly taskTableId: string | undefined;
  private readonly assetTableId: string | undefined;
  private readonly fm: FeishuFieldMap;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private tokenCache: TokenCache | null = null;

  constructor(config: FeishuAdapterConfig) {
    if (!config.appId) throw new Error('FeishuAdapter requires appId');
    if (!config.appSecret) throw new Error('FeishuAdapter requires appSecret');
    if (!config.baseAppToken) throw new Error('FeishuAdapter requires baseAppToken');
    if (!config.leadTableId) throw new Error('FeishuAdapter requires leadTableId');
    if (!config.customerTableId) throw new Error('FeishuAdapter requires customerTableId');
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.baseAppToken = config.baseAppToken;
    this.leadTableId = config.leadTableId;
    this.customerTableId = config.customerTableId;
    this.projectTableId = config.projectTableId;
    this.taskTableId = config.taskTableId;
    this.assetTableId = config.assetTableId;
    this.fm = { ...DEFAULT_FIELD_MAP, ...(config.fieldMap ?? {}) };
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetchFn = config.fetchImpl ?? globalThis.fetch;
  }

  /* ----------------------------------------------------------- auth + transport */

  private async getTenantAccessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 30_000) {
      return this.tokenCache.token;
    }
    const url = `${this.baseUrl}/open-apis/auth/v3/tenant_access_token/internal`;
    const resp = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
    });
    const json = (await resp.json()) as FeishuApiResponse & { tenant_access_token?: string };
    if (json.code !== 0 || !json.tenant_access_token) {
      throw new Error(`Feishu auth failed: code=${json.code} msg=${json.msg}`);
    }
    // Feishu tokens last ~2h; cache with margin.
    this.tokenCache = {
      token: json.tenant_access_token,
      expiresAt: Date.now() + 2 * 60 * 60 * 1000,
    };
    return json.tenant_access_token;
  }

  private async feishuCall(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<FeishuApiResponse> {
    const token = await this.getTenantAccessToken();
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    };
    const opts: RequestInit = { method, headers };
    if (body !== undefined && body !== null) opts.body = JSON.stringify(body);
    const resp = await this.fetchFn(url, opts);
    return (await resp.json()) as FeishuApiResponse;
  }

  /* -------------------------------------------------------------- low-level IO */

  private async createRecord(tableId: string, fields: Record<string, unknown>): Promise<string | null> {
    const path = `/open-apis/bitable/v1/apps/${this.baseAppToken}/tables/${tableId}/records`;
    const resp = await this.feishuCall('POST', path, { fields });
    if (resp.code !== 0) return null;
    const data = resp.data as { record?: { record_id?: string } } | undefined;
    return data?.record?.record_id ?? null;
  }

  private async getRecord(tableId: string, recordId: string): Promise<FeishuRecord | null> {
    const path = `/open-apis/bitable/v1/apps/${this.baseAppToken}/tables/${tableId}/records/${recordId}`;
    const resp = await this.feishuCall('GET', path);
    if (resp.code !== 0) return null;
    const data = resp.data as { record?: FeishuRecord } | undefined;
    return data?.record ?? null;
  }

  private async updateRecord(
    tableId: string,
    recordId: string,
    fields: Record<string, unknown>,
  ): Promise<boolean> {
    const path = `/open-apis/bitable/v1/apps/${this.baseAppToken}/tables/${tableId}/records/${recordId}`;
    const resp = await this.feishuCall('PUT', path, { fields });
    return resp.code === 0;
  }

  private async findRecordsByField(
    tableId: string,
    fieldName: string,
    value: string,
  ): Promise<FeishuRecord[]> {
    const filter = {
      conjunction: 'and',
      conditions: [{ field_name: fieldName, operator: 'is', value: [value] }],
    };
    // Use the /records/search endpoint: the list endpoint's `?filter=` query
    // param returns InvalidFilter (1254018) on the live Base, while /search
    // accepts the same filter body and works. (BUSOS-P4-01 live-closure fix.)
    const path = `/open-apis/bitable/v1/apps/${this.baseAppToken}/tables/${tableId}/records/search`;
    const resp = await this.feishuCall('POST', path, { filter });
    if (resp.code !== 0) return [];
    const data = resp.data as { items?: FeishuRecord[] } | undefined;
    return (data?.items ?? []).map((rec) => ({
      record_id: rec.record_id,
      fields: unwrapFeishuFields(rec.fields ?? {}),
    }));
  }

  private async findCustomerByExactIdentity(identity: CustomerIdentityQuery): Promise<FeishuRecord | null> {
    const conditions: unknown[] = [];
    if (identity.phone) {
      conditions.push({ field_name: this.fm.customerPhone, operator: 'is', value: [identity.phone] });
    }
    if (identity.wechat) {
      conditions.push({ field_name: this.fm.customerWechat, operator: 'is', value: [identity.wechat] });
    }
    if (conditions.length === 0) return null;
    const filter = { conjunction: 'or', conditions };
    // /records/search (see findRecordsByField): the list `?filter=` query fails
    // with InvalidFilter on the live Base. (BUSOS-P4-01 live-closure fix.)
    const path = `/open-apis/bitable/v1/apps/${this.baseAppToken}/tables/${this.customerTableId}/records/search`;
    const resp = await this.feishuCall('POST', path, { filter });
    if (resp.code !== 0) return null;
    const data = resp.data as { items?: FeishuRecord[] } | undefined;
    const rec = data?.items && data.items.length > 0 ? data.items[0] : null;
    return rec ? { record_id: rec.record_id, fields: unwrapFeishuFields(rec.fields ?? {}) } : null;
  }

  private recordIdByCanonicalId(tableId: string, idField: string, canonicalId: string): Promise<string | null> {
    return this.findRecordsByField(tableId, idField, canonicalId).then((recs) =>
      recs.length > 0 ? recs[0].record_id : null,
    );
  }

  /* ------------------------------------------------------ write + readback core */

  private buildCommit(params: {
    domainObject: 'lead' | 'customer' | 'project' | 'task' | 'asset';
    domainId: string;
    externalRecordId: string | null;
    writeStatus: WriteStatus;
    readbackStatus: ReadbackStatus;
    errors: string[];
  }): CommitResultV1 {
    const status: CommitStatus =
      params.writeStatus === 'SUCCESS' && params.readbackStatus === 'VERIFIED'
        ? 'COMMITTED'
        : 'FAILED';
    const commit: CommitResultV1 = {
      version: CONTRACT_VERSIONS.COMMIT_RESULT_V1,
      status,
      domain_object: params.domainObject,
      domain_id: params.domainId,
      storage: 'feishu',
      external_record_id: params.externalRecordId,
      write_status: params.writeStatus,
      readback_status: params.readbackStatus,
      errors: params.errors,
    };
    // Enforce contract validation on the way out (§10: must use CommitResultV1 validation).
    return assertCommitResultV1(commit);
  }

  /* ------------------------------------------------------------- FeishuAdapter */

  async createLead(lead: Lead): Promise<FeishuWriteOutcome<Lead>> {
    const fields = toFeishuLeadFields(lead, this.fm);
    const errors: string[] = [];
    let externalRecordId: string | null = null;
    let writeStatus: WriteStatus = 'FAILED';
    let readbackStatus: ReadbackStatus = 'NOT_RUN';
    let read: Lead | null = null;

    try {
      const recordId = await this.createRecord(this.leadTableId, fields);
      if (recordId) {
        externalRecordId = recordId;
        writeStatus = 'SUCCESS';
      } else {
        errors.push('feishu create lead returned no record');
      }
    } catch (e) {
      errors.push(`feishu write failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (writeStatus === 'SUCCESS' && externalRecordId) {
      try {
        const rec = await this.getRecord(this.leadTableId, externalRecordId);
        if (rec) {
          read = fromFeishuLeadRecord(rec, this.fm);
          const ok = verifyLeadCriticalFields(lead, read);
          readbackStatus = ok ? 'VERIFIED' : 'FAILED';
          if (!ok) errors.push('lead readback critical field mismatch');
        } else {
          readbackStatus = 'FAILED';
          errors.push('lead readback record not found');
        }
      } catch (e) {
        readbackStatus = 'FAILED';
        errors.push(`feishu readback failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const commit = this.buildCommit({
      domainObject: 'lead',
      domainId: lead.lead_id,
      externalRecordId,
      writeStatus,
      readbackStatus,
      errors,
    });
    return { domain: read ?? lead, commit };
  }

  async getLead(leadId: string): Promise<Lead | null> {
    const recs = await this.findRecordsByField(this.leadTableId, this.fm.leadId, leadId);
    if (recs.length === 0) return null;
    return fromFeishuLeadRecord(recs[0], this.fm);
  }

  async createCustomer(customer: Customer): Promise<FeishuWriteOutcome<Customer>> {
    const fields = toFeishuCustomerFields(customer, this.fm);
    const errors: string[] = [];
    let externalRecordId: string | null = null;
    let writeStatus: WriteStatus = 'FAILED';
    let readbackStatus: ReadbackStatus = 'NOT_RUN';
    let read: Customer | null = null;

    try {
      const recordId = await this.createRecord(this.customerTableId, fields);
      if (recordId) {
        externalRecordId = recordId;
        writeStatus = 'SUCCESS';
      } else {
        errors.push('feishu create customer returned no record');
      }
    } catch (e) {
      errors.push(`feishu write failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (writeStatus === 'SUCCESS' && externalRecordId) {
      try {
        const rec = await this.getRecord(this.customerTableId, externalRecordId);
        if (rec) {
          read = fromFeishuCustomerRecord(rec, this.fm);
          const ok = verifyCustomerCriticalFields(customer, read);
          readbackStatus = ok ? 'VERIFIED' : 'FAILED';
          if (!ok) errors.push('customer readback critical field mismatch');
        } else {
          readbackStatus = 'FAILED';
          errors.push('customer readback record not found');
        }
      } catch (e) {
        readbackStatus = 'FAILED';
        errors.push(`feishu readback failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const commit = this.buildCommit({
      domainObject: 'customer',
      domainId: customer.customer_id,
      externalRecordId,
      writeStatus,
      readbackStatus,
      errors,
    });
    return { domain: read ?? customer, commit };
  }

  async getCustomer(customerId: string): Promise<Customer | null> {
    const recs = await this.findRecordsByField(this.customerTableId, this.fm.customerId, customerId);
    if (recs.length === 0) return null;
    return fromFeishuCustomerRecord(recs[0], this.fm);
  }

  async findCustomerByIdentity(identity: CustomerIdentityQuery): Promise<Customer | null> {
    if (!identity.phone && !identity.wechat) return null;
    const rec = await this.findCustomerByExactIdentity(identity);
    if (!rec) return null;
    return fromFeishuCustomerRecord(rec, this.fm);
  }

  async linkLeadCustomer(leadId: string, customerId: string): Promise<Lead> {
    const leadRecordId = await this.recordIdByCanonicalId(this.leadTableId, this.fm.leadId, leadId);
    if (!leadRecordId) throw new Error(`linkLeadCustomer: lead not found in Feishu: ${leadId}`);
    const customerRecordId = await this.recordIdByCanonicalId(
      this.customerTableId,
      this.fm.customerId,
      customerId,
    );
    if (!customerRecordId) throw new Error(`linkLeadCustomer: customer not found in Feishu: ${customerId}`);

    const ok = await this.updateRecord(this.leadTableId, leadRecordId, {
      // canonical customer id (text) + customer-association text field
      [this.fm.leadCustomerId]: customerId,
      [this.fm.leadCustomerLink]: customerId,
    });
    if (!ok) throw new Error(`linkLeadCustomer: failed to update lead link: ${leadId}`);

    const rec = await this.getRecord(this.leadTableId, leadRecordId);
    if (!rec) throw new Error(`linkLeadCustomer: readback failed for lead: ${leadId}`);
    return fromFeishuLeadRecord(rec, this.fm);
  }

  /* ----------------------------------------------- P4: Lead status update */

  async updateLeadStatus(leadId: string, status: LeadStatus): Promise<FeishuWriteOutcome<Lead>> {
    const leadRecordId = await this.recordIdByCanonicalId(this.leadTableId, this.fm.leadId, leadId);
    const errors: string[] = [];
    let externalRecordId: string | null = null;
    let writeStatus: WriteStatus = 'FAILED';
    let readbackStatus: ReadbackStatus = 'NOT_RUN';
    let read: Lead | null = null;

    if (!leadRecordId) {
      errors.push(`updateLeadStatus: lead not found in Feishu: ${leadId}`);
    } else {
      const ok = await this.updateRecord(this.leadTableId, leadRecordId, {
        [this.fm.leadStatus]: status,
        [this.fm.leadCreatedAt]: new Date().toISOString(),
      });
      if (!ok) {
        errors.push('feishu update lead status failed');
      } else {
        externalRecordId = leadRecordId;
        writeStatus = 'SUCCESS';
        try {
          const rec = await this.getRecord(this.leadTableId, leadRecordId);
          if (rec) {
            read = fromFeishuLeadRecord(rec, this.fm);
            const okStatus = read.status === status;
            readbackStatus = okStatus ? 'VERIFIED' : 'FAILED';
            if (!okStatus) errors.push(`lead status readback mismatch: expected ${status}, got ${read.status}`);
          } else {
            readbackStatus = 'FAILED';
            errors.push('lead status readback record not found');
          }
        } catch (e) {
          readbackStatus = 'FAILED';
          errors.push(`feishu readback failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    const commit = this.buildCommit({
      domainObject: 'lead',
      domainId: leadId,
      externalRecordId,
      writeStatus,
      readbackStatus,
      errors,
    });
    // When the readback failed, surface a minimal lead so the caller can reason
    // about the failure; the FAILED commit is the source of truth.
    return { domain: read ?? ({ lead_id: leadId, status } as unknown as Lead), commit };
  }

  /* ---------------------------------------------- P4: Project / Task writes */

  private requireProjectTable(): string {
    if (!this.projectTableId) throw new Error('FeishuAdapter requires projectTableId for Project operations');
    return this.projectTableId;
  }

  private requireTaskTable(): string {
    if (!this.taskTableId) throw new Error('FeishuAdapter requires taskTableId for Task operations');
    return this.taskTableId;
  }

  private requireAssetTable(): string {
    if (!this.assetTableId) throw new Error('FeishuAdapter requires assetTableId for Asset operations');
    return this.assetTableId;
  }

  async createProject(project: Project): Promise<FeishuWriteOutcome<Project>> {
    const tableId = this.requireProjectTable();
    const fields = toFeishuProjectFields(project, this.fm);
    const errors: string[] = [];
    let externalRecordId: string | null = null;
    let writeStatus: WriteStatus = 'FAILED';
    let readbackStatus: ReadbackStatus = 'NOT_RUN';
    let read: Project | null = null;

    try {
      const recordId = await this.createRecord(tableId, fields);
      if (recordId) {
        externalRecordId = recordId;
        writeStatus = 'SUCCESS';
      } else {
        errors.push('feishu create project returned no record');
      }
    } catch (e) {
      errors.push(`feishu write failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (writeStatus === 'SUCCESS' && externalRecordId) {
      try {
        const rec = await this.getRecord(tableId, externalRecordId);
        if (rec) {
          read = fromFeishuProjectRecord(rec, this.fm);
          const ok = verifyProjectCriticalFields(project, read);
          readbackStatus = ok ? 'VERIFIED' : 'FAILED';
          if (!ok) errors.push('project readback critical field mismatch');
        } else {
          readbackStatus = 'FAILED';
          errors.push('project readback record not found');
        }
      } catch (e) {
        readbackStatus = 'FAILED';
        errors.push(`feishu readback failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const commit = this.buildCommit({
      domainObject: 'project',
      domainId: project.project_id,
      externalRecordId,
      writeStatus,
      readbackStatus,
      errors,
    });
    return { domain: read ?? project, commit };
  }

  async getProject(projectId: string): Promise<Project | null> {
    const tableId = this.requireProjectTable();
    const recs = await this.findRecordsByField(tableId, this.fm.projectId, projectId);
    if (recs.length === 0) return null;
    return fromFeishuProjectRecord(recs[0], this.fm);
  }

  async createTask(task: Task): Promise<FeishuWriteOutcome<Task>> {
    const tableId = this.requireTaskTable();
    const fields = toFeishuTaskFields(task, this.fm);
    const errors: string[] = [];
    let externalRecordId: string | null = null;
    let writeStatus: WriteStatus = 'FAILED';
    let readbackStatus: ReadbackStatus = 'NOT_RUN';
    let read: Task | null = null;

    try {
      const recordId = await this.createRecord(tableId, fields);
      if (recordId) {
        externalRecordId = recordId;
        writeStatus = 'SUCCESS';
      } else {
        errors.push('feishu create task returned no record');
      }
    } catch (e) {
      errors.push(`feishu write failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (writeStatus === 'SUCCESS' && externalRecordId) {
      try {
        const rec = await this.getRecord(tableId, externalRecordId);
        if (rec) {
          read = fromFeishuTaskRecord(rec, this.fm);
          const ok = verifyTaskCriticalFields(task, read);
          readbackStatus = ok ? 'VERIFIED' : 'FAILED';
          if (!ok) errors.push('task readback critical field mismatch');
        } else {
          readbackStatus = 'FAILED';
          errors.push('task readback record not found');
        }
      } catch (e) {
        readbackStatus = 'FAILED';
        errors.push(`feishu readback failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const commit = this.buildCommit({
      domainObject: 'task',
      domainId: task.task_id,
      externalRecordId,
      writeStatus,
      readbackStatus,
      errors,
    });
    return { domain: read ?? task, commit };
  }

  async getTask(taskId: string): Promise<Task | null> {
    const tableId = this.requireTaskTable();
    const recs = await this.findRecordsByField(tableId, this.fm.taskId, taskId);
    if (recs.length === 0) return null;
    return fromFeishuTaskRecord(recs[0], this.fm);
  }

  /* ---------------------------------------------- P5: Task status update */

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<FeishuWriteOutcome<Task>> {
    const taskRecordId = await this.recordIdByCanonicalId(this.taskTableId!, this.fm.taskId, taskId);
    const errors: string[] = [];
    let externalRecordId: string | null = null;
    let writeStatus: WriteStatus = 'FAILED';
    let readbackStatus: ReadbackStatus = 'NOT_RUN';
    let read: Task | null = null;

    if (!taskRecordId) {
      errors.push(`updateTaskStatus: task not found in Feishu: ${taskId}`);
    } else {
      const ok = await this.updateRecord(this.taskTableId!, taskRecordId, {
        [this.fm.taskStatus]: status,
      });
      if (!ok) {
        errors.push('feishu update task status failed');
      } else {
        externalRecordId = taskRecordId;
        writeStatus = 'SUCCESS';
        try {
          const rec = await this.getRecord(this.taskTableId!, taskRecordId);
          if (rec) {
            read = fromFeishuTaskRecord(rec, this.fm);
            const okStatus = read.status === status;
            readbackStatus = okStatus ? 'VERIFIED' : 'FAILED';
            if (!okStatus) errors.push(`task status readback mismatch: expected ${status}, got ${read.status}`);
          } else {
            readbackStatus = 'FAILED';
            errors.push('task status readback record not found');
          }
        } catch (e) {
          readbackStatus = 'FAILED';
          errors.push(`feishu readback failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    const commit = this.buildCommit({
      domainObject: 'task',
      domainId: taskId,
      externalRecordId,
      writeStatus,
      readbackStatus,
      errors,
    });
    return { domain: read ?? ({ task_id: taskId, status } as unknown as Task), commit };
  }

  /* ----------------------------------------------- P5: Asset writes */

  async createAsset(asset: Asset): Promise<FeishuWriteOutcome<Asset>> {
    const tableId = this.requireAssetTable();
    const fields = toFeishuAssetFields(asset, this.fm);
    const errors: string[] = [];
    let externalRecordId: string | null = null;
    let writeStatus: WriteStatus = 'FAILED';
    let readbackStatus: ReadbackStatus = 'NOT_RUN';
    let read: Asset | null = null;

    try {
      const recordId = await this.createRecord(tableId, fields);
      if (recordId) {
        externalRecordId = recordId;
        writeStatus = 'SUCCESS';
      } else {
        errors.push('feishu create asset returned no record');
      }
    } catch (e) {
      errors.push(`feishu write failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (writeStatus === 'SUCCESS' && externalRecordId) {
      try {
        const rec = await this.getRecord(tableId, externalRecordId);
        if (rec) {
          read = fromFeishuAssetRecord(rec, this.fm);
          const ok = verifyAssetCriticalFields(asset, read);
          readbackStatus = ok ? 'VERIFIED' : 'FAILED';
          if (!ok) errors.push('asset readback critical field mismatch');
        } else {
          readbackStatus = 'FAILED';
          errors.push('asset readback record not found');
        }
      } catch (e) {
        readbackStatus = 'FAILED';
        errors.push(`feishu readback failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const commit = this.buildCommit({
      domainObject: 'asset',
      domainId: asset.asset_id,
      externalRecordId,
      writeStatus,
      readbackStatus,
      errors,
    });
    return { domain: read ?? asset, commit };
  }

  async getAsset(assetId: string): Promise<Asset | null> {
    const tableId = this.requireAssetTable();
    const recs = await this.findRecordsByField(tableId, this.fm.assetId, assetId);
    if (recs.length === 0) return null;
    return fromFeishuAssetRecord(recs[0], this.fm);
  }

  /* ----------------------------------------------- H1-01 additive collection reads */

  /**
   * List every record in a table via `/records/search` with an empty filter
   * (matches all). Reuses the same search endpoint and unwrap logic as the
   * field-scoped lookups, so the live Base (which rejects the list `?filter=`
   * query) behaves consistently. Pagination is left to the caller's `limit`; a
   * single page is sufficient for the H1-01 workspace surface.
   */
  private async listRecords(tableId: string): Promise<FeishuRecord[]> {
    const path = `/open-apis/bitable/v1/apps/${this.baseAppToken}/tables/${tableId}/records/search`;
    const resp = await this.feishuCall('POST', path, {
      filter: { conjunction: 'and', conditions: [] },
    });
    if (resp.code !== 0) return [];
    const data = resp.data as { items?: FeishuRecord[] } | undefined;
    return (data?.items ?? []).map((rec) => ({
      record_id: rec.record_id,
      fields: unwrapFeishuFields(rec.fields ?? {}),
    }));
  }

  async listProjects(opts?: { limit?: number }): Promise<Project[]> {
    const tableId = this.requireProjectTable();
    const projects = (await this.listRecords(tableId)).map((r) => fromFeishuProjectRecord(r, this.fm));
    projects.sort((a, b) =>
      a.updated_at === b.updated_at ? 0 : a.updated_at > b.updated_at ? -1 : 1,
    );
    const limit = opts?.limit;
    return typeof limit === 'number' && limit >= 0 ? projects.slice(0, limit) : projects;
  }

  async listTasksByProject(projectId: string): Promise<Task[]> {
    const tableId = this.requireTaskTable();
    const tasks = (await this.findRecordsByField(tableId, this.fm.taskProjectId, projectId)).map(
      (r) => fromFeishuTaskRecord(r, this.fm),
    );
    tasks.sort((a, b) => (a.created_at === b.created_at ? 0 : a.created_at < b.created_at ? -1 : 1));
    return tasks;
  }

  async listAssetsByProject(projectId: string): Promise<Asset[]> {
    const tableId = this.requireAssetTable();
    const assets = (await this.findRecordsByField(tableId, this.fm.assetProjectId, projectId)).map(
      (r) => fromFeishuAssetRecord(r, this.fm),
    );
    assets.sort((a, b) =>
      a.updated_at === b.updated_at ? 0 : a.updated_at > b.updated_at ? -1 : 1,
    );
    return assets;
  }

  /* --------------------------------------------------- test-hygiene deletion */

  private async deleteRecord(tableId: string, recordId: string): Promise<boolean> {
    const path = `/open-apis/bitable/v1/apps/${this.baseAppToken}/tables/${tableId}/records/${recordId}`;
    try {
      const resp = await this.feishuCall('DELETE', path);
      return resp.code === 0;
    } catch {
      return false;
    }
  }

  async deleteLead(recordId: string): Promise<boolean> {
    return this.deleteRecord(this.leadTableId, recordId);
  }

  async deleteCustomer(recordId: string): Promise<boolean> {
    return this.deleteRecord(this.customerTableId, recordId);
  }

  async deleteProject(recordId: string): Promise<boolean> {
    if (!this.projectTableId) return false;
    return this.deleteRecord(this.projectTableId, recordId);
  }

  async deleteTask(recordId: string): Promise<boolean> {
    if (!this.taskTableId) return false;
    return this.deleteRecord(this.taskTableId, recordId);
  }

  async deleteAsset(recordId: string): Promise<boolean> {
    if (!this.assetTableId) return false;
    return this.deleteRecord(this.assetTableId, recordId);
  }
}

export function createFeishuAdapter(config: FeishuAdapterConfig): FeishuAdapter {
  return new RealFeishuAdapter(config);
}

/**
 * Build a real adapter from environment variables (never hardcode secrets).
 * Returns null when the required credentials are absent so callers can mark the
 * real E2E BLOCKED instead of faking success (§6 / §19).
 */
export function createFeishuAdapterFromEnv(env: NodeJS.ProcessEnv = process.env): FeishuAdapter | null {
  const appId = env.FEISHU_APP_ID;
  const appSecret = env.FEISHU_APP_SECRET;
  const baseAppToken = env.FEISHU_BASE_APP_TOKEN;
  const leadTableId = env.FEISHU_LEAD_TABLE_ID;
  const customerTableId = env.FEISHU_CUSTOMER_TABLE_ID;
  const projectTableId = env.FEISHU_PROJECT_TABLE_ID;
  const taskTableId = env.FEISHU_TASK_TABLE_ID;
  const assetTableId = env.FEISHU_ASSET_TABLE_ID;
  if (
    !appId ||
    !appSecret ||
    !baseAppToken ||
    !leadTableId ||
    !customerTableId ||
    !projectTableId ||
    !taskTableId ||
    !assetTableId
  ) {
    return null;
  }
  return new RealFeishuAdapter({
    appId,
    appSecret,
    baseAppToken,
    leadTableId,
    customerTableId,
    projectTableId,
    taskTableId,
    assetTableId,
  });
}
