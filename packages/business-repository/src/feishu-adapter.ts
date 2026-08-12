import {
  CONTRACT_VERSIONS,
  assertCommitResultV1,
  type CommitResultV1,
  type CommitStatus,
  type WriteStatus,
  type ReadbackStatus,
  type Lead,
  type Customer,
} from '@busos/contracts';
import type { FeishuAdapter, FeishuRecord, FeishuWriteOutcome, CustomerIdentityQuery } from './types.js';
import {
  DEFAULT_FIELD_MAP,
  type FeishuFieldMap,
  toFeishuLeadFields,
  fromFeishuLeadRecord,
  toFeishuCustomerFields,
  fromFeishuCustomerRecord,
} from './mapping.js';
import { verifyLeadCriticalFields, verifyCustomerCriticalFields } from './verify.js';

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

export class RealFeishuAdapter implements FeishuAdapter {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly baseAppToken: string;
  private readonly leadTableId: string;
  private readonly customerTableId: string;
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
    const path = `/open-apis/bitable/v1/apps/${this.baseAppToken}/tables/${tableId}/records?page_size=10&filter=${encodeURIComponent(JSON.stringify(filter))}`;
    const resp = await this.feishuCall('GET', path);
    if (resp.code !== 0) return [];
    const data = resp.data as { items?: FeishuRecord[] } | undefined;
    return data?.items ?? [];
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
    const path = `/open-apis/bitable/v1/apps/${this.baseAppToken}/tables/${this.customerTableId}/records?page_size=10&filter=${encodeURIComponent(JSON.stringify(filter))}`;
    const resp = await this.feishuCall('GET', path);
    if (resp.code !== 0) return null;
    const data = resp.data as { items?: FeishuRecord[] } | undefined;
    return data?.items && data.items.length > 0 ? data.items[0] : null;
  }

  private recordIdByCanonicalId(tableId: string, idField: string, canonicalId: string): Promise<string | null> {
    return this.findRecordsByField(tableId, idField, canonicalId).then((recs) =>
      recs.length > 0 ? recs[0].record_id : null,
    );
  }

  /* ------------------------------------------------------ write + readback core */

  private buildCommit(params: {
    domainObject: 'lead' | 'customer';
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
      // canonical customer id (text) + Feishu link field
      [this.fm.leadCustomerId]: customerId,
      [this.fm.leadCustomerLink]: [{ record_ids: [customerRecordId] }],
    });
    if (!ok) throw new Error(`linkLeadCustomer: failed to update lead link: ${leadId}`);

    const rec = await this.getRecord(this.leadTableId, leadRecordId);
    if (!rec) throw new Error(`linkLeadCustomer: readback failed for lead: ${leadId}`);
    return fromFeishuLeadRecord(rec, this.fm);
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
  if (!appId || !appSecret || !baseAppToken || !leadTableId || !customerTableId) {
    return null;
  }
  return new RealFeishuAdapter({ appId, appSecret, baseAppToken, leadTableId, customerTableId });
}
