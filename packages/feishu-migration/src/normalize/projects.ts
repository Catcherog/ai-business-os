import type { SourceRecord } from '../types.js';
import {
  asNonEmptyText,
  canonicalFields,
  deterministicTextHash,
  type NormalizedEntity,
  valueAt,
} from './common.js';

const PROJECT_ALIASES = {
  project_id: ['legacy_project_id', 'legacy_id', '项目id', '项目_id'],
  project_code: ['project_no', '项目编号', '编号', 'code'],
  project_name: ['title', 'name', '项目名称', '名称'],
  customer_id: ['客户id', '客户_id'],
  shoot_date: ['shoot_at', '拍摄日期', '拍摄时间', 'date'],
  location: ['地点', '拍摄地点', '城市', 'city'],
} as const;

export function normalizeProjectCode(value: unknown): string | undefined {
  const text = asNonEmptyText(value);
  if (!text) return undefined;
  const formatted = text.replace(/\s+/gu, '').toUpperCase();
  const match = /^(?<prefix>[A-Z]+)[-_]?0*(?<number>\d+)$/u.exec(formatted);
  if (!match?.groups) return text;
  return `${match.groups.prefix}${match.groups.number}`;
}

export function normalizeProject(record: SourceRecord): NormalizedEntity {
  const fields = canonicalFields(record.fields, PROJECT_ALIASES);
  const projectId = asNonEmptyText(valueAt(fields, ['project_id']));
  const code = normalizeProjectCode(valueAt(fields, ['project_code']));
  const name = asNonEmptyText(valueAt(fields, ['project_name']));
  const shootDate = asNonEmptyText(valueAt(fields, ['shoot_date']));
  const location = asNonEmptyText(valueAt(fields, ['location']));
  const fallback =
    name && shootDate && location
      ? `title_date_location:${deterministicTextHash(
          name.toLowerCase(),
          shootDate,
          location.toLowerCase(),
        )}`
      : undefined;
  const keyValue = projectId ?? code ?? fallback;
  const confidence = projectId || code ? 'HIGH' : 'LOW';
  return {
    entity_type: 'project',
    key: keyValue ? `project:${keyValue}` : null,
    canonical_target: { ...fields, ...(code ? { project_code: code } : {}) },
    confidence,
    reason: confidence === 'HIGH' ? 'exact project identity' : 'project has no exact identity key',
  };
}
