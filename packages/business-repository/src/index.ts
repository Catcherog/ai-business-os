/**
 * @busos/business-repository — canonical Lead/Customer persistence (P1-03).
 *
 * The public surface is the `BusinessRepository` (domain boundary) plus the
 * `FeishuAdapter` port and its two implementations (real + fake). Feishu
 * specifics (tokens/table ids/field names) live only inside the adapter impls.
 */

export { BusinessRepository } from './business-repository.js';
export type { BusinessRepositoryOptions } from './business-repository.js';

export type {
  FeishuAdapter,
  FeishuRecord,
  FeishuWriteOutcome,
  CustomerIdentityQuery,
  LeadCreateInput,
  CustomerCreateInput,
  ProjectCreateInput,
  TaskCreateInput,
  AssetCreateInput,
} from './types.js';

export {
  RealFeishuAdapter,
  createFeishuAdapter,
  createFeishuAdapterFromEnv,
} from './feishu-adapter.js';
export type { FeishuAdapterConfig } from './feishu-adapter.js';

export { FakeFeishuAdapter, createFakeFeishuAdapter } from './feishu-adapter-fake.js';
export type { FakeFeishuAdapterOptions } from './feishu-adapter-fake.js';

export {
  DEFAULT_FIELD_MAP,
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
export type { FeishuFieldMap } from './mapping.js';

export {
  verifyLeadCriticalFields,
  verifyCustomerCriticalFields,
  verifyProjectCriticalFields,
  verifyTaskCriticalFields,
  verifyAssetCriticalFields,
  LEAD_CRITICAL_FIELDS,
  CUSTOMER_CRITICAL_FIELDS,
  PROJECT_CRITICAL_FIELDS,
  TASK_CRITICAL_FIELDS,
  ASSET_CRITICAL_FIELDS,
} from './verify.js';

export { generateDomainId, nowIso, generateRecordId } from './util.js';
