import { setTimeout as nodeSleep } from 'node:timers/promises';

if (typeof globalThis !== 'undefined' && 'window' in globalThis) {
  throw new Error('FeishuClient is server-only');
}

export interface BaseTable {
  table_id: string;
  name: string;
  [key: string]: unknown;
}

export interface BaseField {
  field_id: string;
  field_name: string;
  type: number;
  [key: string]: unknown;
}

export interface CreateFieldInput {
  field_name: string;
  type: number;
  property?: Record<string, unknown>;
  description?: string;
}

export interface CreateTableInput {
  name: string;
  default_view_name?: string;
  fields?: CreateFieldInput[];
  description?: string;
}

export interface RecordWriteInput {
  fields: Record<string, unknown>;
}

export interface BaseRecord {
  record_id: string;
  fields: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SheetMetadata {
  sheet_id: string;
  title: string;
  grid_properties?: {
    row_count?: number;
    column_count?: number;
  };
  [key: string]: unknown;
}

export interface DriveFile {
  token: string;
  type: string;
  name: string;
  url?: string;
  parent_token?: string;
  [key: string]: unknown;
}

export interface DriveFilesPage {
  files: DriveFile[];
  has_more: boolean;
  next_page_token?: string;
}

export class FeishuAuthorizationError extends Error {
  readonly status: number;
  readonly code: number | string;
  readonly missingScopes: string[];
  readonly identityKind: 'bot-tenant-access-token';

  constructor(options: {
    status: number;
    code: number | string;
    missingScopes?: string[];
  }) {
    super(`Feishu Drive authorization blocked (status=${options.status}, code=${options.code})`);
    this.name = 'FeishuAuthorizationError';
    this.status = options.status;
    this.code = options.code;
    this.missingScopes = options.missingScopes?.length
      ? [...options.missingScopes]
      : ['drive:drive.metadata:readonly'];
    this.identityKind = 'bot-tenant-access-token';
  }
}

export interface FeishuRequest {
  appId: string;
  appSecret: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  maxRetries?: number;
  baseBackoffMs?: number;
}

interface FeishuResponse {
  code?: number;
  data?: Record<string, unknown>;
  tenant_access_token?: string;
  expire?: number;
  error?: {
    missing_scopes?: unknown;
  };
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

interface PageData<T> {
  items?: T[];
  sheets?: T[];
  has_more?: boolean;
  page_token?: string;
}

const DEFAULT_BASE_URL = 'https://open.feishu.cn';
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_MS = 200;
const PAGE_SIZE = 500;
const DRIVE_PAGE_SIZE = 200;
const RETRY_CODE = 1_254_291;

export class FeishuClient {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private tokenCache: TokenCache | null = null;

  constructor(options: FeishuRequest) {
    if (!options.appId || !options.appSecret) {
      throw new Error('FeishuClient requires server-side credentials');
    }
    this.appId = options.appId;
    this.appSecret = options.appSecret;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetchFn = options.fetchImpl ?? globalThis.fetch;
    this.sleep = options.sleep ?? ((milliseconds) => nodeSleep(milliseconds));
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseBackoffMs = options.baseBackoffMs ?? DEFAULT_BACKOFF_MS;
  }

  async listAllTables(appToken: string): Promise<BaseTable[]> {
    return this.listAll<BaseTable>(
      `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables`,
      'items',
    );
  }

  async listAllFields(appToken: string, tableId: string): Promise<BaseField[]> {
    return this.listAll<BaseField>(
      `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields`,
      'items',
    );
  }

  async listAllRecords(appToken: string, tableId: string): Promise<BaseRecord[]> {
    return this.listAll<BaseRecord>(
      `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records`,
      'items',
    );
  }

  async createRecord(
    appToken: string,
    tableId: string,
    input: RecordWriteInput,
  ): Promise<BaseRecord> {
    const response = await this.request(
      `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await this.getTenantAccessToken()}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(input),
      },
    );
    const record = response.data?.record ?? response.data;
    if (!record || typeof record !== 'object') {
      throw new Error(`Feishu record creation returned no record (table=${tableId})`);
    }
    return record as BaseRecord;
  }

  async updateRecord(
    appToken: string,
    tableId: string,
    recordId: string,
    input: RecordWriteInput,
  ): Promise<BaseRecord> {
    const response = await this.request(
      `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${await this.getTenantAccessToken()}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(input),
      },
    );
    const record = response.data?.record ?? response.data;
    if (!record || typeof record !== 'object') {
      throw new Error(
        `Feishu record update returned no record (table=${tableId}, record=${recordId})`,
      );
    }
    return record as BaseRecord;
  }

  async createTable(appToken: string, input: CreateTableInput): Promise<BaseTable> {
    const response = await this.request(
      `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await this.getTenantAccessToken()}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          table: {
            name: input.name,
            default_view_name: input.default_view_name,
            fields: input.fields,
            description: input.description,
          },
        }),
      },
    );
    const table = response.data?.table ?? response.data;
    if (!table || typeof table !== 'object') {
      throw new Error(`Feishu table creation returned no table (name=${input.name})`);
    }
    return table as BaseTable;
  }

  async createField(
    appToken: string,
    tableId: string,
    input: CreateFieldInput,
  ): Promise<BaseField> {
    const response = await this.request(
      `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await this.getTenantAccessToken()}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(input),
      },
    );
    const field = response.data?.field ?? response.data;
    if (!field || typeof field !== 'object') {
      throw new Error(
        `Feishu field creation returned no field (table=${tableId}, field=${input.field_name})`,
      );
    }
    return field as BaseField;
  }

  async listSheets(spreadsheetToken: string): Promise<SheetMetadata[]> {
    return this.listAll<SheetMetadata>(
      `/open-apis/sheets/v3/spreadsheets/${encodeURIComponent(spreadsheetToken)}/sheets/query`,
      'sheets',
    );
  }

  async listDriveFiles(folderToken: string, pageToken?: string): Promise<DriveFilesPage> {
    const query = new URLSearchParams({
      folder_token: folderToken,
      page_size: String(DRIVE_PAGE_SIZE),
    });
    if (pageToken) query.set('page_token', pageToken);
    const response = await this.read(`/open-apis/drive/v1/files?${query.toString()}`);
    const data = response.data ?? {};
    if (!Array.isArray(data.files)) {
      throw new Error('Feishu Drive response missing files collection');
    }
    const files = data.files.filter((file): file is DriveFile => (
      Boolean(file) && typeof file === 'object' &&
      typeof (file as Record<string, unknown>).token === 'string' &&
      typeof (file as Record<string, unknown>).type === 'string' &&
      typeof (file as Record<string, unknown>).name === 'string'
    ));
    return {
      files,
      has_more: data.has_more === true,
      next_page_token: typeof data.next_page_token === 'string'
        ? data.next_page_token
        : undefined,
    };
  }

  async readSheetRange(
    spreadsheetToken: string,
    range: string,
  ): Promise<unknown[][]> {
    const response = await this.read(
      `/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(spreadsheetToken)}/values/${encodeURIComponent(range)}`,
    );
    const data = response.data ?? {};
    const valueRange = (data.valueRange ?? data.value_range) as
      | { values?: unknown[][] }
      | undefined;
    return valueRange?.values ?? [];
  }

  private async listAll<T>(
    path: string,
    collection: 'items' | 'sheets',
  ): Promise<T[]> {
    const result: T[] = [];
    let pageToken: string | undefined;

    do {
      const query = new URLSearchParams({ page_size: String(PAGE_SIZE) });
      if (pageToken) query.set('page_token', pageToken);
      const response = await this.read(`${path}?${query.toString()}`);
      const page = (response.data ?? {}) as PageData<T>;
      result.push(...(page[collection] ?? []));
      if (page.has_more && !page.page_token) {
        throw new Error('Feishu pagination response omitted page_token');
      }
      pageToken = page.has_more ? page.page_token : undefined;
    } while (pageToken);

    return result;
  }

  private async getTenantAccessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.token;
    }

    const response = await this.request(
      '/open-apis/auth/v3/tenant_access_token/internal',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
      },
      true,
    );
    if (!response.tenant_access_token) {
      throw new Error(`Feishu credential request failed (code=${response.code ?? 'unknown'})`);
    }

    const lifetimeMs = Math.max(0, (response.expire ?? 7200) * 1000 - 30_000);
    this.tokenCache = {
      token: response.tenant_access_token,
      expiresAt: Date.now() + lifetimeMs,
    };
    return this.tokenCache.token;
  }

  private async read(path: string): Promise<FeishuResponse> {
    const token = await this.getTenantAccessToken();
    return this.request(path, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  private async request(
    path: string,
    init: RequestInit,
    credentialRequest = false,
  ): Promise<FeishuResponse> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const response = await this.fetchFn(`${this.baseUrl}${path}`, init);
      let payload: FeishuResponse = {};
      try {
        payload = (await response.json()) as FeishuResponse;
      } catch {
        payload = {};
      }

      const retryable = response.status === 429 || payload.code === RETRY_CODE;
      if (retryable && attempt < this.maxRetries) {
        await this.sleep(this.baseBackoffMs * 2 ** attempt);
        continue;
      }

      const credentialFailure =
        credentialRequest || response.status === 401 || response.status === 403;
      if (!response.ok || payload.code !== 0) {
        const driveAuthorizationFailure =
          !credentialRequest &&
          path.startsWith('/open-apis/drive/') &&
          (response.status === 401 || response.status === 403 || payload.code === 91403);
        if (driveAuthorizationFailure) {
          const missingScopes = Array.isArray(payload.error?.missing_scopes)
            ? payload.error.missing_scopes.filter((scope): scope is string => typeof scope === 'string')
            : undefined;
          throw new FeishuAuthorizationError({
            status: response.status,
            code: payload.code ?? 'unknown',
            missingScopes,
          });
        }
        const prefix = credentialFailure ? 'Feishu credential request failed' : 'Feishu read failed';
        throw new Error(
          `${prefix} (status=${response.status}, code=${payload.code ?? 'unknown'})`,
        );
      }
      return payload;
    }

    throw new Error('Feishu retry limit exhausted');
  }
}
