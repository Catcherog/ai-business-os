import type { BaseField } from './feishu-client.js';
import { normalizeFieldName } from './normalize/common.js';

interface FieldAliasMap {
  readonly [canonicalField: string]: readonly string[];
}

const TABLE_FIELD_ALIASES: Readonly<Record<string, FieldAliasMap>> = {
  Customers: {
    name: ['customer_name'],
    wechat: ['wechat_id'],
  },
  Projects: {
    project_code: ['project_id'],
    location: ['shoot_location'],
  },
  Resources: {
    resource_name: ['name'],
    xhs_profile_url: ['xiaohongshu_profile_url'],
  },
  'Content Research': {
    content_id: ['research_id'],
    url: ['source_url'],
  },
};

export interface ProjectedRecordFields {
  fields: Record<string, unknown>;
  unmapped_fields: string[];
  ambiguous_fields: string[];
  invalid_type_fields: string[];
}

function aliasesFor(tableName: string, fieldName: string): readonly string[] {
  return TABLE_FIELD_ALIASES[tableName]?.[fieldName] ?? [];
}

function targetFieldIndex(targetFields: readonly BaseField[]): {
  names: Map<string, BaseField>;
  ambiguous: Set<string>;
} {
  const names = new Map<string, BaseField>();
  const ambiguous = new Set<string>();
  for (const field of targetFields) {
    const normalized = normalizeFieldName(field.field_name);
    if (ambiguous.has(normalized)) continue;
    const existing = names.get(normalized);
    if (existing && existing.field_name !== field.field_name) {
      names.delete(normalized);
      ambiguous.add(normalized);
      continue;
    }
    names.set(normalized, field);
  }
  return { names, ambiguous };
}

function datetimeValue(value: unknown): { value: unknown; valid: boolean } {
  if (typeof value === 'number') return { value, valid: Number.isFinite(value) };
  if (typeof value !== 'string') return { value, valid: false };
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(text)) {
    const timestamp = Date.parse(`${text}T00:00:00.000Z`);
    return { value: timestamp, valid: Number.isFinite(timestamp) };
  }
  if (!/T.*(?:Z|[+-]\d{2}:?\d{2})$/u.test(text)) return { value, valid: false };
  const timestamp = Date.parse(text);
  return { value: timestamp, valid: Number.isFinite(timestamp) };
}

/**
 * Feishu record APIs address fields by their live display names. The migration
 * plan intentionally uses stable canonical snake_case names, so this projects
 * those names onto the read-back schema and drops source-only columns that are
 * not part of the target contract.
 */
export function projectRecordFields(
  tableName: string,
  input: Record<string, unknown>,
  targetFields?: readonly BaseField[],
): ProjectedRecordFields {
  if (!targetFields) {
    return {
      fields: { ...input },
      unmapped_fields: [],
      ambiguous_fields: [],
      invalid_type_fields: [],
    };
  }

  const index = targetFieldIndex(targetFields);
  const projected: Record<string, { score: number; value: unknown; source: string }> = {};
  const unmapped = new Set<string>();
  const ambiguous = new Set<string>();
  const invalidType = new Set<string>();
  for (const [source, value] of Object.entries(input)) {
    if (value === undefined) continue;
    const candidates = [source, ...aliasesFor(tableName, source)];
    let targetName: string | undefined;
    let score = Number.POSITIVE_INFINITY;
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const normalized = normalizeFieldName(candidates[candidateIndex]);
      if (index.ambiguous.has(normalized)) {
        ambiguous.add(source);
        continue;
      }
      const liveField = index.names.get(normalized);
      if (liveField) {
        targetName = liveField.field_name;
        score = candidateIndex;
        break;
      }
    }
    if (!targetName) {
      if (!ambiguous.has(source)) unmapped.add(source);
      continue;
    }
    const liveField = index.names.get(normalizeFieldName(targetName));
    let projectedValue: unknown = value;
    if (liveField?.type === 5) {
      const converted = datetimeValue(value);
      projectedValue = converted.value;
      if (!converted.valid) invalidType.add(source);
    }
    const previous = projected[targetName];
    if (!previous || score < previous.score) {
      projected[targetName] = { score, value: projectedValue, source };
    } else if (score === previous.score && previous.source !== source) {
      ambiguous.add(`${previous.source}|${source}`);
    }
  }

  return {
    fields: Object.fromEntries(Object.entries(projected).map(([name, entry]) => [name, entry.value])),
    unmapped_fields: [...unmapped].sort(),
    ambiguous_fields: [...ambiguous].sort(),
    invalid_type_fields: [...invalidType].sort(),
  };
}
