import { stableHash } from './hash.js';
import type {
  MigrationBatch,
  MigrationConflict,
  MigrationDecision,
  MigrationPlan,
  SourceRecord,
  TargetSnapshot,
} from './types.js';
import type { SourceInventory } from './inventory.js';
import {
  inferEntityType,
  sourcePriority,
  type NormalizedEntity,
} from './normalize/common.js';
import { normalizeCustomer } from './normalize/customers.js';
import { normalizeContent } from './normalize/content.js';
import { normalizeProject, normalizeProjectCode } from './normalize/projects.js';
import { normalizeResource } from './normalize/resources.js';

export { canonicalizeXiaohongshuUrl } from './normalize/content.js';
export { normalizeProjectCode } from './normalize/projects.js';

export interface NormalizedMigrationRecord
  extends MigrationDecision<Record<string, unknown>> {
  entity_type: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  conflicts: MigrationConflict[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedRecord(record: SourceRecord): NormalizedEntity {
  let normalized: NormalizedEntity;
  switch (inferEntityType(record)) {
    case 'customer':
      normalized = normalizeCustomer(record);
      break;
    case 'project':
      normalized = normalizeProject(record);
      break;
    case 'resource':
      normalized = normalizeResource(record);
      break;
    case 'content':
      normalized = normalizeContent(record);
      break;
    default:
      normalized = {
        entity_type: 'content',
        key: null,
        canonical_target: {},
        confidence: 'LOW',
        reason: 'record type could not be inferred',
      };
      break;
  }
  const targetKey = record.fields.__target_migration_key;
  if (typeof targetKey === 'string' && targetKey.trim() !== '') {
    return { ...normalized, key: targetKey };
  }
  return normalized;
}

function valueHash(value: unknown): string {
  return value === undefined ? 'undefined:' : `value:${stableHash(value)}`;
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}

function manifestConflictValue(value: unknown): unknown {
  return value === undefined ? null : value;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return valueHash(left) === valueHash(right);
}

function sortRecords(records: SourceRecord[]): SourceRecord[] {
  return [...records].sort((left, right) => {
    const priorityDifference = sourcePriority(right) - sourcePriority(left);
    if (priorityDifference !== 0) return priorityDifference;
    const sourceTypeDifference = compareText(left.source_type, right.source_type);
    if (sourceTypeDifference !== 0) return sourceTypeDifference;
    return compareText(left.source_id, right.source_id);
  });
}

function conflictsFor(
  candidates: Array<{ source: SourceRecord; normalized: NormalizedEntity }>,
  chosen: NormalizedEntity,
): MigrationConflict[] {
  const fields = new Set(
    candidates.flatMap(({ normalized }) => Object.keys(normalized.canonical_target)),
  );
  const conflicts: MigrationConflict[] = [];
  for (const field of [...fields].sort(compareText)) {
    const values = candidates
      .map(({ source, normalized }) => ({
        source,
        value: normalized.canonical_target[field],
      }));
    const unique = new Map<string, { value: unknown; source_ids: string[] }>();
    for (const item of values) {
      const hash = valueHash(item.value);
      const current = unique.get(hash);
      if (current) current.source_ids.push(item.source.source_id);
      else unique.set(hash, { value: item.value, source_ids: [item.source.source_id] });
    }
    if (unique.size <= 1) continue;
    const chosenHash = valueHash(chosen.canonical_target[field]);
    const chosenEntry = unique.get(chosenHash);
    if (!chosenEntry) continue;
    const alternatives = [...unique.entries()]
      .filter(([hash]) => hash !== chosenHash)
      .map(([, entry]) => entry.value)
      .sort((left, right) => compareText(valueHash(left), valueHash(right)));
    const orderedValues = [...unique.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([, entry]) => entry.value);
    conflicts.push({
      field,
      values: orderedValues.map(displayValue),
      chosenSource: chosenEntry.source_ids[0],
      chosen: manifestConflictValue(chosenEntry.value),
      alternatives: alternatives.map(manifestConflictValue),
      source_ids: values.map(({ source }) => source.source_id),
    });
  }
  return conflicts;
}

function decisionForGroup(
  key: string,
  sources: SourceRecord[],
): NormalizedMigrationRecord {
  const sortedSources = sortRecords(sources);
  const candidates = sortedSources.map((source) => ({
    source,
    normalized: normalizedRecord(source),
  }));
  const chosen = candidates[0].normalized;
  const conflicts = conflictsFor(candidates, chosen);
  const highestPriority = sourcePriority(sortedSources[0]);
  const tiedHighest = sortedSources.filter((source) => sourcePriority(source) === highestPriority);
  const lowConfidence = candidates.some(({ normalized }) => normalized.confidence === 'LOW');
  const ambiguous = lowConfidence || (conflicts.length > 0 && tiedHighest.length > 1);
  const decision: NormalizedMigrationRecord['decision'] = ambiguous ? 'NEEDS_REVIEW' : 'CREATE';
  return {
    source: sortedSources[0],
    decision,
    canonical_target: chosen.canonical_target,
    migration_key: key,
    reason: ambiguous
      ? lowConfidence
        ? 'identity or normalization confidence is low'
        : 'same-priority sources contain conflicting values'
      : 'new high-confidence canonical record',
    confidence: ambiguous ? 'LOW' : 'HIGH',
    conflicts,
    entity_type: chosen.entity_type,
  };
}

export function deduplicateRecords(records: SourceRecord[]): NormalizedMigrationRecord[] {
  const groups = new Map<string, SourceRecord[]>();
  for (const record of records) {
    const normalized = normalizedRecord(record);
    const key = normalized.key ?? `${normalized.entity_type}:review:${record.source_id}`;
    const current = groups.get(key) ?? [];
    current.push(record);
    groups.set(key, current);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([key, group]) => decisionForGroup(key, group));
}

function flattenInventory(inventory: SourceInventory): SourceRecord[] {
  const records: SourceRecord[] = [];
  for (const table of inventory.base.tables) {
    for (const record of table.records) {
      records.push({
        source_type: `base:${table.table.name}`,
        source_id: record.record_id,
        fields: record.fields,
      });
    }
  }
  for (const spreadsheet of inventory.spreadsheets) {
    for (const sheet of spreadsheet.sheets) {
      const rows = sheet.rows;
      const header = rows[0];
      const headers = Array.isArray(header) && header.every((value) => typeof value === 'string')
        ? header.map((value) => value.trim())
        : undefined;
      const dataRows = headers ? rows.slice(1) : rows;
      dataRows.forEach((row, index) => {
        const fields = Array.isArray(row)
          ? Object.fromEntries(row.map((value, column) => [headers?.[column] ?? `column_${column + 1}`, value]))
          : row && typeof row === 'object'
            ? row as Record<string, unknown>
            : {};
        if (
          Object.keys(fields).length === 0 ||
          Object.values(fields).every(
            (value) => value === null || value === undefined || value === '',
          )
        ) {
          return;
        }
        records.push({
          source_type: `spreadsheet:${spreadsheet.key}:${sheet.sheet.title}`,
          source_id: `${spreadsheet.key}:${sheet.sheet.sheet_id}:${index + (headers ? 2 : 1)}`,
          fields,
        });
      });
    }
  }
  return records;
}

function snapshotRecords(snapshot: TargetSnapshot | undefined): SourceRecord[] {
  if (!snapshot) return [];
  const records: SourceRecord[] = [];
  const append = (entityType: string, values: unknown) => {
    if (!Array.isArray(values)) return;
    for (const value of values) {
      if (!value || typeof value !== 'object') continue;
      const candidate = value as Record<string, unknown>;
      if (typeof candidate.source_id === 'string' && candidate.fields && typeof candidate.fields === 'object') {
        const sourceFields = candidate.fields as Record<string, unknown>;
        const migrationKey =
          typeof sourceFields.migration_key === 'string'
            ? sourceFields.migration_key
            : undefined;
        records.push({
          ...(candidate as unknown as SourceRecord),
          fields: {
            ...sourceFields,
            ...(migrationKey ? { __target_migration_key: migrationKey } : {}),
          },
        });
      } else {
        const migrationKey =
          typeof candidate.migration_key === 'string' ? candidate.migration_key : undefined;
        records.push({
          source_type: `target:${entityType}`,
          source_id:
            typeof candidate.target_record_id === 'string'
              ? candidate.target_record_id
              : migrationKey ?? `${entityType}:${records.length + 1}`,
          fields: {
            ...candidate,
            ...(migrationKey ? { __target_migration_key: migrationKey } : {}),
          },
        });
      }
    }
  };
  append('record', snapshot.records);
  append('customer', snapshot.customers);
  append('project', snapshot.projects);
  append('resource', snapshot.resources);
  append('content', snapshot.content);
  return records;
}

function applyTargetState(
  decisions: NormalizedMigrationRecord[],
  target: SourceRecord[],
): MigrationDecision<unknown>[] {
  const targetByKey = new Map<string, NormalizedMigrationRecord>();
  for (const record of deduplicateRecords(target)) {
    targetByKey.set(record.migration_key, record);
  }
  return decisions.map((decision) => {
    if (decision.decision === 'NEEDS_REVIEW') return decision;
    const existing = targetByKey.get(decision.migration_key);
    if (!existing) return decision;
    if (valuesEqual(existing.canonical_target, decision.canonical_target)) {
      return { ...decision, decision: 'SKIP', reason: 'target has the same canonical payload' };
    }
    return {
      ...decision,
      decision: 'NEEDS_REVIEW',
      confidence: 'LOW',
      reason: 'target payload differs; overwrite requires review',
    };
  });
}

export function buildMigrationPlan(
  inventory: SourceInventory,
  targetSnapshot: TargetSnapshot = {},
): MigrationPlan {
  const sourceRecords = flattenInventory(inventory);
  const normalized = deduplicateRecords(sourceRecords);
  const decisions = applyTargetState(normalized, snapshotRecords(targetSnapshot));
  const executableDecisions = decisions.filter(
    (decision) => decision.decision === 'CREATE' || decision.decision === 'UPDATE',
  );
  const reviewDecisions = decisions.filter((decision) => decision.decision === 'NEEDS_REVIEW');
  const batches = new Map<string, MigrationDecision<unknown>[]>();
  for (const decision of executableDecisions) {
    const entityType = decision.entity_type ?? 'unknown';
    const current = batches.get(entityType) ?? [];
    current.push(decision);
    batches.set(entityType, current);
  }
  const executable_batches: MigrationBatch[] = [...batches.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .flatMap(([entity_type, batchDecisions]) => {
      const chunks: MigrationBatch[] = [];
      for (let offset = 0; offset < batchDecisions.length; offset += 100) {
        chunks.push({
          entity_type,
          decisions: batchDecisions.slice(offset, offset + 100),
        });
      }
      return chunks;
    });
  const manifest = decisions.map(({ source, ...decision }) => decision);
  return {
    generated_at: new Date().toISOString(),
    source_count: sourceRecords.length,
    decisions,
    executable_decisions: executableDecisions,
    review_decisions: reviewDecisions,
    executable_batches,
    manifest_hash: stableHash(manifest),
  };
}
