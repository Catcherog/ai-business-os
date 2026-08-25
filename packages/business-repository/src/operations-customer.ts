import type { Project } from '@busos/contracts';
import type { FeishuBaseRecord } from './feishu-adapter.js';
import {
  dateValue,
  enumValue,
  nullableEnumValue,
  OperationsMappingError,
  requiredDate,
  requiredText,
  safeMap,
  textValue,
} from './operations-mapping.js';

/**
 * Canonical Customer read shape for the Operations surface. Mirrors the
 * `Customer` contract (storage-agnostic) but carries the extra business fields
 * the new Base "Customers" table exposes (region, source channel). No Feishu
 * record id crosses this boundary.
 */
export interface OperationsCustomer {
  customer_id: string;
  display_name: string;
  phone: string | null;
  wechat: string | null;
  region: string | null;
  source_channel: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  created_at: string;
  updated_at: string;
  migration_key: string;
}

export function mapCustomerRecord(record: FeishuBaseRecord): OperationsCustomer {
  return safeMap('Customers', record, 'Customer ID', CustomerSchemaLocal, () => ({
    customer_id: requiredText(record.fields, 'Customer ID', 'customer_id', 'legacy_customer_id', '客户id', 'id'),
    display_name: requiredText(record.fields, 'Name', 'customer_name', '客户姓名', '姓名', '客户名称', 'name'),
    phone: textValue(record.fields, 'Phone', 'phone_number', '手机号', '联系电话', '电话', 'phone'),
    wechat: textValue(record.fields, 'WeChat', 'wechat_id', '微信号', '微信', 'wechat'),
    region: textValue(record.fields, 'Region', '地区', '区域', '城市', 'city', 'region'),
    source_channel: textValue(record.fields, 'Source Channel', 'source_channel'),
    status: nullableEnumValue(record.fields, 'Status', ['ACTIVE', 'ARCHIVED'], 'Status', 'status') ?? 'ACTIVE',
    created_at: requiredDate(record.fields, 'Created At', 'Created At', 'created_at', 'Legacy Created At'),
    updated_at: requiredDate(record.fields, 'Updated At', 'Updated At', 'updated_at', 'Legacy Updated At', 'Created At'),
    migration_key: requiredText(record.fields, 'Migration Key', 'Migration Key', 'migration_key'),
  }));
}

/** Lightweight zod-free structural check reused by `safeMap` (matching the contract). */
const CustomerSchemaLocal = {
  safeParse(value: unknown): { success: true; data: OperationsCustomer } | { success: false; error: { issues: Array<{ path: (string | number)[] }> } } {
    if (value && typeof value === 'object' && 'customer_id' in value && 'display_name' in value) {
      return { success: true, data: value as OperationsCustomer };
    }
    return { success: false, error: { issues: [{ path: ['customer_id'] }] } };
  },
};

/**
 * Order = a customer engagement derived from a Project deliverable record. The V3
 * Base has no separate "Orders" table; the Project is the engagement/order entity
 * in this business. `customer_name` is resolved by the repository join.
 */
export interface OperationsOrder {
  order_id: string;
  customer_id: string;
  customer_name: string | null;
  title: string;
  project_type: string;
  status: Project['status'];
  scheduled_date: string | null;
  created_at: string;
  updated_at: string;
}

export function mapOrderFromProject(project: Project, customerName: string | null): OperationsOrder {
  return {
    order_id: project.project_id,
    customer_id: project.customer_id,
    customer_name: customerName,
    title: project.title,
    project_type: project.project_type,
    status: project.status,
    scheduled_date: project.scheduled_date,
    created_at: project.created_at,
    updated_at: project.updated_at,
  };
}

export { OperationsMappingError };
