import {
  AvailabilitySlotSchema,
  CommunicationScriptSchema,
  KnowledgeItemSchema,
  ProjectAssignmentSchema,
  ProjectRequirementSchema,
  ResourceSchema,
  type AvailabilitySlot,
  type CommunicationScript,
  type KnowledgeItem,
  type ProjectAssignment,
  type ProjectRequirement,
  type Resource,
} from '@busos/contracts';
import type { FeishuBaseRecord } from './feishu-adapter.js';
import { OperationsAdapterError } from './operations-types.js';

/** Raised when a target Base row cannot become a strict canonical value. */
export class OperationsMappingError extends OperationsAdapterError {
  readonly field?: string;

  constructor(table: string, businessKey: string, field?: string) {
    super(
      `Invalid ${table} record (business_key=${businessKey}${field ? `; field=${field}` : ''})`,
      { table, businessKey },
    );
    this.name = 'OperationsMappingError';
    this.field = field;
  }
}

function unwrap(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    if (value.length === 1) return unwrap(value[0]);
    return value.map((item) => unwrap(item));
  }
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if ('text' in object) return unwrap(object.text);
    if ('value' in object) return unwrap(object.value);
    if ('name' in object && Object.keys(object).length <= 3) return unwrap(object.name);
    if ('record_ids' in object && Array.isArray(object.record_ids)) {
      return object.record_ids.length > 0 ? object.record_ids[0] : undefined;
    }
  }
  return value;
}

function value(fields: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(fields, name)) return unwrap(fields[name]);
  }
  return undefined;
}

function textValue(fields: Record<string, unknown>, ...names: string[]): string | null {
  const raw = value(fields, ...names);
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'string') return raw.trim() || null;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return null;
}

function requiredText(fields: Record<string, unknown>, label: string, ...names: string[]): string {
  const text = textValue(fields, ...names);
  if (!text) throw new MappingFieldError(label);
  return text;
}

function numberValue(fields: Record<string, unknown>, label: string, ...names: string[]): number | null {
  const raw = value(fields, ...names);
  if (raw === undefined || raw === null || raw === '') return null;
  const number = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(number)) throw new MappingFieldError(label);
  return number;
}

function requiredNumber(fields: Record<string, unknown>, label: string, ...names: string[]): number {
  const number = numberValue(fields, label, ...names);
  if (number === null) throw new MappingFieldError(label);
  return number;
}

function dateValue(fields: Record<string, unknown>, label: string, ...names: string[]): string | null {
  const raw = value(fields, ...names);
  if (raw === undefined || raw === null || raw === '') return null;
  const date = typeof raw === 'number' ? new Date(raw) : new Date(String(raw));
  if (!Number.isFinite(date.getTime())) throw new MappingFieldError(label);
  return date.toISOString();
}

function enumValue<T extends string>(
  fields: Record<string, unknown>,
  label: string,
  allowed: readonly T[],
  ...names: string[]
): T {
  const raw = textValue(fields, ...names);
  const normalized = raw?.toUpperCase();
  if (!normalized || !allowed.includes(normalized as T)) throw new MappingFieldError(label);
  return normalized as T;
}

function nullableEnumValue<T extends string>(
  fields: Record<string, unknown>,
  label: string,
  allowed: readonly T[],
  ...names: string[]
): T | null {
  const raw = textValue(fields, ...names);
  if (!raw) return null;
  const normalized = raw.toUpperCase();
  if (!allowed.includes(normalized as T)) throw new MappingFieldError(label);
  return normalized as T;
}

class MappingFieldError extends Error {
  constructor(readonly field: string) {
    super(`invalid field: ${field}`);
    this.name = 'MappingFieldError';
  }
}

function businessKey(record: FeishuBaseRecord, idField: string): string {
  return (
    textValue(record.fields, 'Migration Key', 'migration_key') ??
    textValue(record.fields, idField, idField.replaceAll(' ', '_').toLowerCase()) ??
    record.record_id ??
    'unknown'
  );
}

function safeMap<T>(
  table: string,
  record: FeishuBaseRecord,
  idField: string,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ path: (string | number)[] }> } } },
  build: () => unknown,
): T {
  const key = businessKey(record, idField);
  try {
    const parsed = schema.safeParse(build());
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      throw new OperationsMappingError(table, key, typeof field === 'string' ? field : undefined);
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof OperationsMappingError) throw error;
    if (error instanceof MappingFieldError) throw new OperationsMappingError(table, key, error.field);
    throw new OperationsMappingError(table, key);
  }
}

export function mapResourceRecord(record: FeishuBaseRecord): Resource {
  return safeMap('Resources', record, 'Resource Key', ResourceSchema, () => ({
    resource_key: requiredText(record.fields, 'Resource Key', 'Resource Key', 'resource_key'),
    resource_id: textValue(record.fields, 'Resource ID', 'resource_id'),
    resource_type: enumValue(record.fields, 'Resource Type', ['MODEL', 'MAKEUP', 'PHOTOGRAPHER', 'STUDIO', 'COSTUME', 'RETOUCH', 'PROP', 'OTHER'], 'Resource Type', 'resource_type'),
    name: requiredText(record.fields, 'Name', 'Name', 'name'),
    xiaohongshu_name: textValue(record.fields, 'Xiaohongshu Name', 'xiaohongshu_name'),
    xiaohongshu_profile_url: textValue(record.fields, 'Xiaohongshu Profile URL', 'xiaohongshu_profile_url'),
    wechat: textValue(record.fields, 'WeChat', 'Wechat', 'wechat'),
    phone: textValue(record.fields, 'Phone', 'phone'),
    city: textValue(record.fields, 'City', 'city'),
    address: textValue(record.fields, 'Address', 'address'),
    styles: textValue(record.fields, 'Styles', 'styles'),
    size_raw: textValue(record.fields, 'Size Raw', 'size_raw'),
    quote_raw: textValue(record.fields, 'Quote Raw', 'quote_raw'),
    quote_min: numberValue(record.fields, 'Quote Min', 'Quote Min', 'quote_min'),
    quote_max: numberValue(record.fields, 'Quote Max', 'Quote Max', 'quote_max'),
    priority: numberValue(record.fields, 'Priority', 'Priority', 'priority'),
    cooperation_status: enumValue(record.fields, 'Cooperation Status', ['ACTIVE', 'INACTIVE', 'PENDING', 'UNKNOWN'], 'Cooperation Status', 'cooperation_status'),
    rating: numberValue(record.fields, 'Rating', 'Rating', 'rating'),
    availability_raw: textValue(record.fields, 'Availability Raw', 'availability_raw'),
    work_url: textValue(record.fields, 'Work URL', 'work_url'),
    source_aliases_json: textValue(record.fields, 'Source Aliases JSON', 'source_aliases_json'),
    migration_key: requiredText(record.fields, 'Migration Key', 'Migration Key', 'migration_key'),
    legacy_updated_at: dateValue(record.fields, 'Legacy Updated At', 'Legacy Updated At', 'legacy_updated_at'),
  }));
}

export function mapAvailabilityRecord(record: FeishuBaseRecord): AvailabilitySlot {
  return safeMap('Resource Availability', record, 'Availability ID', AvailabilitySlotSchema, () => ({
    availability_id: requiredText(record.fields, 'Availability ID', 'Availability ID', 'availability_id'),
    resource_key: requiredText(record.fields, 'Resource Key', 'Resource Key', 'resource_key'),
    resource_type: enumValue(record.fields, 'Resource Type', ['MODEL', 'MAKEUP', 'PHOTOGRAPHER', 'STUDIO', 'COSTUME', 'RETOUCH', 'PROP', 'OTHER'], 'Resource Type', 'resource_type'),
    start_at: dateValue(record.fields, 'Start At', 'Start At', 'start_at'),
    end_at: dateValue(record.fields, 'End At', 'End At', 'end_at'),
    status: enumValue(record.fields, 'Status', ['AVAILABLE', 'UNAVAILABLE', 'HOLD', 'EXPIRED', 'UNKNOWN'], 'Status', 'status'),
    granularity: enumValue(record.fields, 'Granularity', ['DATE', 'DATETIME', 'RANGE'], 'Granularity', 'granularity'),
    raw_text: requiredText(record.fields, 'Raw Text', 'Raw Text', 'raw_text'),
    parse_status: enumValue(record.fields, 'Parse Status', ['PARSED', 'UNPARSED'], 'Parse Status', 'parse_status'),
    confidence: enumValue(record.fields, 'Confidence', ['HIGH', 'MEDIUM', 'LOW'], 'Confidence', 'confidence'),
    source_updated_at: dateValue(record.fields, 'Source Updated At', 'Source Updated At', 'source_updated_at'),
    expires_at: dateValue(record.fields, 'Expires At', 'Expires At', 'expires_at'),
    migration_key: requiredText(record.fields, 'Migration Key', 'Migration Key', 'migration_key'),
  }));
}

export function mapProjectRequirementRecord(record: FeishuBaseRecord): ProjectRequirement {
  return safeMap('Project Requirements', record, 'Requirement ID', ProjectRequirementSchema, () => ({
    requirement_id: requiredText(record.fields, 'Requirement ID', 'Requirement ID', 'requirement_id'),
    project_id: requiredText(record.fields, 'Project ID', 'Project ID', 'project_id'),
    role_type: enumValue(record.fields, 'Role Type', ['MODEL', 'MAKEUP', 'PHOTOGRAPHER', 'STUDIO', 'COSTUME', 'RETOUCH', 'PROP', 'OTHER'], 'Role Type', 'role_type'),
    required_count: requiredNumber(record.fields, 'Required Count', 'Required Count', 'required_count'),
    date_window_start: dateValue(record.fields, 'Date Window Start', 'Date Window Start', 'date_window_start'),
    date_window_end: dateValue(record.fields, 'Date Window End', 'Date Window End', 'date_window_end'),
    duration_hours: numberValue(record.fields, 'Duration Hours', 'Duration Hours', 'duration_hours'),
    location: textValue(record.fields, 'Location', 'location'),
    style_tags: textValue(record.fields, 'Style Tags', 'style_tags'),
    size_constraint: textValue(record.fields, 'Size Constraint', 'size_constraint'),
    budget_max: numberValue(record.fields, 'Budget Max', 'Budget Max', 'budget_max'),
    required: enumValue(record.fields, 'Required', ['YES', 'NO', 'UNKNOWN'], 'Required', 'required'),
    source_plan_url: textValue(record.fields, 'Source Plan URL', 'source_plan_url'),
    source_excerpt: textValue(record.fields, 'Source Excerpt', 'source_excerpt'),
    parse_status: enumValue(record.fields, 'Parse Status', ['PARSED', 'UNPARSED'], 'Parse Status', 'parse_status'),
    confidence: enumValue(record.fields, 'Confidence', ['HIGH', 'MEDIUM', 'LOW'], 'Confidence', 'confidence'),
    migration_key: requiredText(record.fields, 'Migration Key', 'Migration Key', 'migration_key'),
  }));
}

export function mapProjectAssignmentRecord(record: FeishuBaseRecord): ProjectAssignment {
  return safeMap('Project Assignments', record, 'Assignment ID', ProjectAssignmentSchema, () => ({
    assignment_id: requiredText(record.fields, 'Assignment ID', 'Assignment ID', 'assignment_id'),
    project_id: requiredText(record.fields, 'Project ID', 'Project ID', 'project_id'),
    resource_key: requiredText(record.fields, 'Resource Key', 'Resource Key', 'resource_key'),
    role: enumValue(record.fields, 'Role', ['MODEL', 'MAKEUP', 'PHOTOGRAPHER', 'STUDIO', 'COSTUME', 'RETOUCH', 'PROP', 'OTHER'], 'Role', 'role'),
    proposed_start: dateValue(record.fields, 'Proposed Start', 'Proposed Start', 'proposed_start'),
    proposed_end: dateValue(record.fields, 'Proposed End', 'Proposed End', 'proposed_end'),
    status: enumValue(record.fields, 'Status', ['PROPOSED', 'CONFIRMED', 'CONFLICT', 'CANCELLED'], 'Status', 'status'),
    conflict_reason: textValue(record.fields, 'Conflict Reason', 'conflict_reason'),
    confirmed_at: dateValue(record.fields, 'Confirmed At', 'Confirmed At', 'confirmed_at'),
    source: textValue(record.fields, 'Source', 'source'),
    migration_key: requiredText(record.fields, 'Migration Key', 'Migration Key', 'migration_key'),
  }));
}

export function mapCommunicationScriptRecord(record: FeishuBaseRecord): CommunicationScript {
  return safeMap('Communication Scripts', record, 'Script ID', CommunicationScriptSchema, () => ({
    script_id: requiredText(record.fields, 'Script ID', 'Script ID', 'script_id'),
    scene: requiredText(record.fields, 'Scene', 'Scene', 'scene'),
    audience: requiredText(record.fields, 'Audience', 'Audience', 'audience'),
    goal: requiredText(record.fields, 'Goal', 'Goal', 'goal'),
    body: requiredText(record.fields, 'Body', 'Body', 'body'),
    notes: textValue(record.fields, 'Notes', 'notes'),
    effect: textValue(record.fields, 'Effect', 'effect'),
    resource_type: nullableEnumValue(record.fields, 'Resource Type', ['MODEL', 'MAKEUP', 'PHOTOGRAPHER', 'STUDIO', 'COSTUME', 'RETOUCH', 'PROP', 'OTHER'], 'Resource Type', 'resource_type'),
    customer_stage: enumValue(record.fields, 'Customer Stage', ['LEAD', 'QUALIFIED', 'BOOKED', 'COMPLETED', 'FOLLOW_UP', 'OTHER'], 'Customer Stage', 'customer_stage'),
    version_at: dateValue(record.fields, 'Version At', 'Version At', 'version_at'),
    status: enumValue(record.fields, 'Status', ['DRAFT', 'ACTIVE', 'ARCHIVED'], 'Status', 'status'),
    source_aliases_json: textValue(record.fields, 'Source Aliases JSON', 'source_aliases_json'),
    migration_key: requiredText(record.fields, 'Migration Key', 'Migration Key', 'migration_key'),
  }));
}

export function mapKnowledgeRecord(record: FeishuBaseRecord): KnowledgeItem {
  return safeMap('Knowledge', record, 'Knowledge ID', KnowledgeItemSchema, () => ({
    knowledge_id: requiredText(record.fields, 'Knowledge ID', 'Knowledge ID', 'knowledge_id'),
    knowledge_type: enumValue(record.fields, 'Knowledge Type', ['KNOWLEDGE_INDEX', 'SYSTEM_RULE', 'SOP_IMPROVEMENT', 'OTHER'], 'Knowledge Type', 'knowledge_type'),
    title: requiredText(record.fields, 'Title', 'Title', 'title'),
    detail: textValue(record.fields, 'Detail', 'detail'),
    keywords: textValue(record.fields, 'Keywords', 'keywords'),
    scenario: textValue(record.fields, 'Scenario', 'scenario'),
    source_url: textValue(record.fields, 'Source URL', 'source_url'),
    owner_raw: textValue(record.fields, 'Owner Raw', 'owner_raw'),
    workflow_status: enumValue(record.fields, 'Workflow Status', ['DRAFT', 'ACTIVE', 'REVIEW', 'ARCHIVED'], 'Workflow Status', 'workflow_status'),
    due_at: dateValue(record.fields, 'Due At', 'Due At', 'due_at'),
    version_at: dateValue(record.fields, 'Version At', 'Version At', 'version_at'),
    migration_key: requiredText(record.fields, 'Migration Key', 'Migration Key', 'migration_key'),
  }));
}
