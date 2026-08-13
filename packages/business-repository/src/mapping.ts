import type { Lead, Customer, Project, Task, LeadStatus, CustomerStatus, ProjectStatus, TaskStatus } from '@busos/contracts';
import type { FeishuRecord } from './types.js';

/**
 * Canonical <-> Feishu Base field mapping.
 *
 * This module is the ONLY place that knows Feishu field names (D018). The
 * field names below default to the Chinese conventions already validated in the
 * existing Collator Base (see `lark/src/scripts/temp/customer-fields.json`:
 * 客户姓名 / 联系方式 / 拍摄类型 / 预算区间 / 来源渠道 / 咨询时间). The map is
 * fully configurable so it can target a real Base without code changes.
 *
 * Feishu specifics handled here:
 * - link fields arrive as `[{ record_ids: ["recxxx"] }]` -> canonical id string
 * - empty text -> `null` (never fabricate a value, §9)
 * - numbers stay numbers; dates are stored as ISO strings
 */
export interface FeishuFieldMap {
  /* Customer */
  customerId: string;
  customerDisplayName: string;
  customerPhone: string;
  customerWechat: string;
  customerStatus: string;
  customerCreatedAt: string;
  /* Lead */
  leadId: string;
  leadCustomerId: string;
  leadCustomerLink: string;
  leadSourceSession: string;
  leadSourceCandidate: string;
  leadServiceType: string;
  leadBudgetMin: string;
  leadBudgetMax: string;
  leadPreferredDate: string;
  leadStatus: string;
  leadCreatedAt: string;
  /* Project (P4 additive) */
  projectId: string;
  projectCustomerId: string;
  projectLeadId: string;
  projectType: string;
  projectTitle: string;
  projectStatus: string;
  projectScheduledDate: string;
  projectCreatedAt: string;
  /* Task (P4 additive) */
  taskId: string;
  taskProjectId: string;
  taskType: string;
  taskTitle: string;
  taskStatus: string;
  taskDueDate: string;
  taskCreatedAt: string;
}

export const DEFAULT_FIELD_MAP: FeishuFieldMap = {
  customerId: 'Customer ID',
  customerDisplayName: '客户姓名',
  customerPhone: '联系方式',
  customerWechat: '微信',
  customerStatus: '状态',
  customerCreatedAt: '咨询时间',
  leadId: 'Lead ID',
  leadCustomerId: 'Customer ID',
  leadCustomerLink: '客户关联',
  leadSourceSession: '来源会话',
  leadSourceCandidate: '来源候选',
  leadServiceType: '拍摄类型',
  leadBudgetMin: '预算下限',
  leadBudgetMax: '预算上限',
  leadPreferredDate: '期望日期',
  leadStatus: '状态',
  leadCreatedAt: '创建时间',
  projectId: 'Project ID',
  projectCustomerId: 'Customer ID',
  projectLeadId: 'Lead ID',
  projectType: 'Project Type',
  projectTitle: 'Title',
  projectStatus: 'Status',
  projectScheduledDate: 'Scheduled Date',
  projectCreatedAt: 'Created At',
  taskId: 'Task ID',
  taskProjectId: 'Project ID',
  taskType: 'Task Type',
  taskTitle: 'Title',
  taskStatus: 'Status',
  taskDueDate: 'Due Date',
  taskCreatedAt: 'Created At',
};

/* ------------------------------------------------------------- coercion utils */

function asString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  return String(v);
}

function asStringOrNull(v: unknown): string | null {
  const s = asString(v).trim();
  return s.length > 0 ? s : null;
}

function asNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Feishu link field -> first linked canonical record id (or null). */
function asLinkIdOrNull(v: unknown): string | null {
  if (Array.isArray(v) && v.length > 0) {
    const first = v[0] as { record_ids?: unknown };
    if (first && Array.isArray(first.record_ids) && first.record_ids.length > 0) {
      return asString(first.record_ids[0]);
    }
  }
  return null;
}

function linkValue(id: string | null): { record_ids: string[] }[] {
  return id ? [{ record_ids: [id] }] : [];
}

/* -------------------------------------------------------------- Lead mapping */

export function toFeishuLeadFields(lead: Lead, fm: FeishuFieldMap): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    [fm.leadId]: lead.lead_id,
    [fm.leadCustomerId]: lead.customer_id ?? '',
    [fm.leadSourceSession]: lead.source_session_id,
    [fm.leadSourceCandidate]: lead.source_candidate_id,
    [fm.leadServiceType]: lead.service_type,
    [fm.leadStatus]: lead.status,
    [fm.leadCreatedAt]: lead.created_at,
  };
  // Only emit the link field when a customer is actually linked. An empty link
  // array has no business meaning and, on stores that model the link as a text
  // field, would be rejected (TextFieldConvFail). (P2 live-closure fix.)
  if (lead.customer_id != null) {
    fields[fm.leadCustomerLink] = linkValue(lead.customer_id);
  }
  // Omit nullable numeric/text fields when null so they round-trip as `null`
  // (Feishu number fields otherwise default to 0, breaking the readback check).
  if (lead.budget_min != null) fields[fm.leadBudgetMin] = lead.budget_min;
  if (lead.budget_max != null) fields[fm.leadBudgetMax] = lead.budget_max;
  if (lead.preferred_date_text != null) fields[fm.leadPreferredDate] = lead.preferred_date_text;
  return fields;
}

export function fromFeishuLeadRecord(rec: FeishuRecord, fm: FeishuFieldMap): Lead {
  const f = rec.fields;
  const status = asString(f[fm.leadStatus]) as LeadStatus;
  const createdAt = asString(f[fm.leadCreatedAt]) || new Date().toISOString();
  return {
    lead_id: asString(f[fm.leadId]),
    customer_id: asStringOrNull(f[fm.leadCustomerId]),
    source_session_id: asString(f[fm.leadSourceSession]),
    source_candidate_id: asString(f[fm.leadSourceCandidate]),
    service_type: asString(f[fm.leadServiceType]),
    budget_min: asNumberOrNull(f[fm.leadBudgetMin]),
    budget_max: asNumberOrNull(f[fm.leadBudgetMax]),
    preferred_date_text: asStringOrNull(f[fm.leadPreferredDate]),
    status: (status || 'NEW') as LeadStatus,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

/* ----------------------------------------------------------- Customer mapping */

export function toFeishuCustomerFields(customer: Customer, fm: FeishuFieldMap): Record<string, unknown> {
  return {
    [fm.customerId]: customer.customer_id,
    [fm.customerDisplayName]: customer.display_name,
    [fm.customerPhone]: customer.phone ?? '',
    [fm.customerWechat]: customer.wechat ?? '',
    [fm.customerStatus]: customer.status,
    [fm.customerCreatedAt]: customer.created_at,
  };
}

export function fromFeishuCustomerRecord(rec: FeishuRecord, fm: FeishuFieldMap): Customer {
  const f = rec.fields;
  const status = asString(f[fm.customerStatus]) as CustomerStatus;
  const createdAt = asString(f[fm.customerCreatedAt]) || new Date().toISOString();
  return {
    customer_id: asString(f[fm.customerId]),
    display_name: asString(f[fm.customerDisplayName]),
    phone: asStringOrNull(f[fm.customerPhone]),
    wechat: asStringOrNull(f[fm.customerWechat]),
    status: (status || 'ACTIVE') as CustomerStatus,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

/* ----------------------------------------------------------- Project mapping */

export function toFeishuProjectFields(project: Project, fm: FeishuFieldMap): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    [fm.projectId]: project.project_id,
    [fm.projectCustomerId]: project.customer_id,
    [fm.projectLeadId]: project.lead_id,
    [fm.projectType]: project.project_type,
    [fm.projectTitle]: project.title,
    [fm.projectStatus]: project.status,
    [fm.projectCreatedAt]: project.created_at,
  };
  // scheduled_date is a nullable string; omit when null so it round-trips as null.
  if (project.scheduled_date != null) fields[fm.projectScheduledDate] = project.scheduled_date;
  return fields;
}

export function fromFeishuProjectRecord(rec: FeishuRecord, fm: FeishuFieldMap): Project {
  const f = rec.fields;
  const status = asString(f[fm.projectStatus]) as ProjectStatus;
  const createdAt = asString(f[fm.projectCreatedAt]) || new Date().toISOString();
  return {
    project_id: asString(f[fm.projectId]),
    customer_id: asString(f[fm.projectCustomerId]),
    lead_id: asString(f[fm.projectLeadId]),
    project_type: asString(f[fm.projectType]),
    title: asString(f[fm.projectTitle]),
    status: (status || 'DRAFT') as ProjectStatus,
    scheduled_date: asStringOrNull(f[fm.projectScheduledDate]),
    created_at: createdAt,
    updated_at: createdAt,
  };
}

/* ------------------------------------------------------------- Task mapping */

export function toFeishuTaskFields(task: Task, fm: FeishuFieldMap): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    [fm.taskId]: task.task_id,
    [fm.taskProjectId]: task.project_id,
    [fm.taskType]: task.task_type,
    [fm.taskTitle]: task.title,
    [fm.taskStatus]: task.status,
    [fm.taskCreatedAt]: task.created_at,
  };
  if (task.due_date != null) fields[fm.taskDueDate] = task.due_date;
  return fields;
}

export function fromFeishuTaskRecord(rec: FeishuRecord, fm: FeishuFieldMap): Task {
  const f = rec.fields;
  const status = asString(f[fm.taskStatus]) as TaskStatus;
  const createdAt = asString(f[fm.taskCreatedAt]) || new Date().toISOString();
  return {
    task_id: asString(f[fm.taskId]),
    project_id: asString(f[fm.taskProjectId]),
    task_type: asString(f[fm.taskType]),
    title: asString(f[fm.taskTitle]),
    status: (status || 'TODO') as TaskStatus,
    due_date: asStringOrNull(f[fm.taskDueDate]),
    created_at: createdAt,
    updated_at: createdAt,
  };
}
