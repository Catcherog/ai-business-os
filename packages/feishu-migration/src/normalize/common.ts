import type { SourceRecord } from '../types.js';
import { stableHash } from '../hash.js';

export type EntityType = 'customer' | 'project' | 'resource' | 'content';

export interface NormalizedEntity {
  entity_type: EntityType;
  key: string | null;
  canonical_target: Record<string, unknown>;
  confidence: 'HIGH' | 'LOW';
  reason: string;
}

export function asNonEmptyText(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).trim().replace(/\s+/gu, ' ');
  return text === '' ? undefined : text;
}

export function normalizeFieldName(name: string): string {
  return name
    .trim()
    .replace(/[\s-]+/gu, '_')
    .replace(/[()（）]/gu, '')
    .toLowerCase();
}

export function valueAt(
  fields: Record<string, unknown>,
  aliases: readonly string[],
): unknown {
  const entries = Object.entries(fields);
  for (const alias of aliases) {
    const normalizedAlias = normalizeFieldName(alias);
    const match = entries.find(
      ([name, value]) =>
        normalizeFieldName(name) === normalizedAlias &&
        value !== null &&
        value !== undefined &&
        !(typeof value === 'string' && value.trim() === ''),
    );
    if (match) return match[1];
  }
  return undefined;
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === 'string') return value.trim().replace(/\s+/gu, ' ');
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [normalizeFieldName(key), normalizeValue(entry)]),
  );
}

export function canonicalFields(
  fields: Record<string, unknown>,
  aliases: Readonly<Record<string, readonly string[]>> = {},
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const aliasNames = new Set(
    Object.entries(aliases).flatMap(([canonicalName, names]) => [
      normalizeFieldName(canonicalName),
      ...names.map(normalizeFieldName),
    ]),
  );
  for (const [canonicalName, names] of Object.entries(aliases)) {
    const value = valueAt(fields, [canonicalName, ...names]);
    if (value !== undefined && value !== null && value !== '') {
      result[canonicalName] = normalizeValue(value);
    }
  }

  for (const [name, value] of Object.entries(fields)) {
    const canonicalName = normalizeFieldName(name);
    if (
      value !== undefined &&
      value !== null &&
      value !== '' &&
      !aliasNames.has(canonicalName) &&
      ![
        'entity_type',
        'entitytype',
        'source_type',
        'sourcetype',
        'source_id',
        'sourceid',
        'priority',
        'source_priority',
        'sourcepriority',
        'target_record_id',
        'targetrecordid',
        'migration_key',
        'migrationkey',
        '__target_migration_key',
      ].includes(canonicalName) &&
      !Object.prototype.hasOwnProperty.call(result, canonicalName)
    ) {
      result[canonicalName] = normalizeValue(value);
    }
  }
  return result;
}

export function sourcePriority(source: SourceRecord): number {
  const explicit = source.fields.source_priority;
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return explicit;
  const type = source.source_type.toLowerCase();
  if (type.includes('target')) return 400;
  if (type.includes('legacy') || type.includes('base')) return 300;
  if (type.includes('sheet') || type.includes('spreadsheet')) return 200;
  if (
    type.includes('document') ||
    type.includes('content') ||
    type.includes('xiaohongshu')
  ) {
    return 100;
  }
  return 150;
}

export function inferEntityType(record: SourceRecord): EntityType | null {
  const explicit = asNonEmptyText(
    record.fields.entity_type ?? record.fields.entityType ?? record.fields.entity,
  )?.toLowerCase();
  if (explicit) {
    if (explicit.startsWith('cust')) return 'customer';
    if (explicit.startsWith('proj')) return 'project';
    if (explicit.startsWith('res')) return 'resource';
    if (explicit.startsWith('cont') || explicit.includes('xiaohongshu')) return 'content';
  }
  const sourceType = record.source_type.toLowerCase();
  if (sourceType.includes('customer') || sourceType.includes('client')) {
    return 'customer';
  }
  if (sourceType.includes('project')) return 'project';
  if (sourceType.includes('resource') || sourceType.includes('availability')) {
    return 'resource';
  }
  if (sourceType.includes('content') || sourceType.includes('research')) {
    return 'content';
  }
  const names = Object.keys(record.fields).map(normalizeFieldName);
  if (names.some((name) => /customer|client|phone|wechat|客户|手机号/u.test(name))) {
    return 'customer';
  }
  if (names.some((name) => /project|项目|project_code|项目编号/u.test(name))) {
    return 'project';
  }
  if (names.some((name) => /resource|availability|档期|资源/u.test(name))) {
    return 'resource';
  }
  if (
    names.some((name) => /content|xiaohongshu|小红书|url|链接|笔记/u.test(name))
  ) {
    return 'content';
  }
  return null;
}

export function deterministicTextHash(...parts: string[]): string {
  return stableHash(parts.join('|'));
}

export function sourceRecord(
  sourceType: string,
  sourceId: string,
  fields: Record<string, unknown>,
): SourceRecord {
  return { source_type: sourceType, source_id: sourceId, fields };
}
