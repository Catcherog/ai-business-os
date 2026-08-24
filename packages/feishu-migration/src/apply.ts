import type { BaseRecord, BaseTable, RecordWriteInput } from './feishu-client.js';
import {
  manifestDecisions,
  targetTableName,
  type MigrationManifest,
} from './plan.js';
import type { MigrationDecision } from './types.js';

export interface MigrationWriteClient {
  listAllTables(appToken: string): Promise<BaseTable[]>;
  listAllRecords(appToken: string, tableId: string): Promise<BaseRecord[]>;
  createRecord(
    appToken: string,
    tableId: string,
    input: RecordWriteInput,
  ): Promise<BaseRecord>;
  updateRecord(
    appToken: string,
    tableId: string,
    recordId: string,
    input: RecordWriteInput,
  ): Promise<BaseRecord>;
  getSchemaFingerprint?(appToken: string): Promise<string>;
}

export interface CanaryReport {
  run_id: string;
  status: 'PASS' | 'FAIL';
  selected_keys: string[];
  field_mismatches: ApplyFieldMismatch[];
  untracked_writes: number;
  schema_conflicts: string[];
  results: ApplyRecordResult[];
}

export interface ApplyFieldMismatch {
  migration_key: string;
  field: string;
  reason: string;
}

export interface ApplyRecordResult {
  migration_key: string;
  target_table: string;
  status: 'APPLIED' | 'SKIP' | 'NEEDS_REVIEW' | 'FAILED';
  target_record_id?: string;
  reason: string;
}

export interface ApplyReport {
  run_id: string;
  mode: 'canary' | 'full';
  status: 'PASS' | 'BLOCKED' | 'FAILED';
  results: ApplyRecordResult[];
  field_mismatches: ApplyFieldMismatch[];
  untracked_writes: number;
  schema_conflicts: string[];
  business_writes: number;
  registry_writes: number;
  canary_report?: CanaryReport;
}

export interface ApplyOptions {
  target_token: string;
  mode: 'canary' | 'full';
  current_schema_fingerprint?: string;
  canary_report?: CanaryReport;
}

function fieldValue(fields: Record<string, unknown>, name: string): unknown {
  if (Object.prototype.hasOwnProperty.call(fields, name)) return fields[name];
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/gu, '');
  const entry = Object.entries(fields).find(
    ([key]) => key.toLowerCase().replace(/[^a-z0-9]/gu, '') === normalized,
  );
  return entry?.[1];
}

function migrationKeyFromRecord(record: BaseRecord): string | undefined {
  const value = fieldValue(record.fields ?? {}, 'Migration Key') ??
    fieldValue(record.fields ?? {}, 'migration_key');
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function registryIdFromRecord(record: BaseRecord): string | undefined {
  const value = fieldValue(record.fields ?? {}, 'Migration ID') ??
    fieldValue(record.fields ?? {}, 'migration_id');
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function expectedFields(decision: MigrationDecision<unknown>): Record<string, unknown> {
  const canonical =
    decision.canonical_target && typeof decision.canonical_target === 'object'
      ? { ...(decision.canonical_target as Record<string, unknown>) }
      : {};
  if (!fieldValue(canonical, 'Migration Key')) canonical['Migration Key'] = decision.migration_key;
  return canonical;
}

function compareReadback(
  decision: MigrationDecision<unknown>,
  record: BaseRecord,
): ApplyFieldMismatch[] {
  const expected = expectedFields(decision);
  const mismatches: ApplyFieldMismatch[] = [];
  for (const [field, value] of Object.entries(expected)) {
    if (value === undefined) continue;
    const actual = fieldValue(record.fields ?? {}, field);
    if (JSON.stringify(actual) !== JSON.stringify(value)) {
      mismatches.push({
        migration_key: decision.migration_key,
        field,
        reason: `readback value differs from planned payload`,
      });
    }
  }
  return mismatches;
}

function registryFields(
  manifest: MigrationManifest,
  decision: MigrationDecision<unknown>,
  targetTable: string,
  targetRecordId: string | undefined,
  status: string,
): Record<string, unknown> {
  const sourceType = decision.source.source_type.toLowerCase();
  const sourceTypeValue = sourceType.includes('target')
    ? 'TARGET_BASE'
    : sourceType.includes('base')
      ? 'LEGACY_BASE'
      : sourceType.includes('sheet') || sourceType.includes('spreadsheet')
        ? 'SHEET'
        : sourceType.includes('document')
          ? 'DOCUMENT'
          : 'OTHER';
  return {
    'Migration ID': decision.migration_key,
    'Run ID': manifest.run_id,
    'Source Type': sourceTypeValue,
    'Source Table': decision.source.source_type,
    'Source Record ID': decision.source.source_id,
    'Source Business Key': decision.migration_key,
    'Source Payload Hash': manifest.source_payload_hashes[decision.migration_key],
    'Target Table': targetTable,
    'Target Record ID': targetRecordId ?? '',
    Decision: decision.decision,
    Confidence: decision.confidence ?? 'LOW',
    Status: status,
    'Conflict JSON': decision.conflicts ? JSON.stringify(decision.conflicts) : '',
    'Migrated At': new Date().toISOString(),
  };
}

function byMigrationId(records: BaseRecord[]): Map<string, BaseRecord> {
  const result = new Map<string, BaseRecord>();
  for (const record of records) {
    const id = registryIdFromRecord(record);
    if (id) result.set(id, record);
  }
  return result;
}

function executable(decision: MigrationDecision<unknown>): boolean {
  return decision.decision === 'CREATE' || decision.decision === 'UPDATE';
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function selectCanaryDecisions(
  manifest: MigrationManifest,
): MigrationDecision<unknown>[] {
  const groups = new Map<string, MigrationDecision<unknown>[]>();
  for (const decision of manifestDecisions(manifest)) {
    if (!executable(decision) || decision.confidence !== 'HIGH') continue;
    const key = targetTableName(decision);
    const current = groups.get(key) ?? [];
    current.push(decision);
    groups.set(key, current);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .flatMap(([, decisions]) => decisions.sort((left, right) =>
      left.migration_key < right.migration_key ? -1 : left.migration_key > right.migration_key ? 1 : 0,
    ).slice(0, 5));
}

function blockedReport(
  manifest: MigrationManifest,
  mode: 'canary' | 'full',
  reason: string,
): ApplyReport {
  return {
    run_id: manifest.run_id,
    mode,
    status: 'BLOCKED',
    results: [],
    field_mismatches: [],
    untracked_writes: 0,
    schema_conflicts: [reason],
    business_writes: 0,
    registry_writes: 0,
  };
}

export async function applyMigration(
  client: MigrationWriteClient,
  manifest: MigrationManifest,
  options: ApplyOptions,
): Promise<ApplyReport> {
  if (!options.target_token.trim()) return blockedReport(manifest, options.mode, 'TARGET_TOKEN_REQUIRED');
  const canary = options.canary_report;
  if (
    options.mode === 'full' &&
    (!canary ||
      canary.status !== 'PASS' ||
      canary.run_id !== manifest.run_id ||
      canary.field_mismatches.length > 0 ||
      canary.untracked_writes > 0 ||
      canary.schema_conflicts.length > 0)
  ) {
    return blockedReport(manifest, options.mode, 'CLEAN_CANARY_REQUIRED');
  }

  const currentFingerprint =
    options.current_schema_fingerprint ??
    (client.getSchemaFingerprint ? await client.getSchemaFingerprint(options.target_token) : undefined);
  if (!currentFingerprint) {
    return blockedReport(manifest, options.mode, 'SCHEMA_FINGERPRINT_REQUIRED');
  }
  if (currentFingerprint !== manifest.target_schema_fingerprint) {
    return blockedReport(manifest, options.mode, 'SCHEMA_FINGERPRINT_DRIFT');
  }

  const decisions = options.mode === 'canary'
    ? selectCanaryDecisions(manifest)
    : manifestDecisions(manifest).filter(executable);
  const tables = await client.listAllTables(options.target_token);
  const tableIds = new Map(tables.map((table) => [table.name, table.table_id]));
  const targetTables = new Set(decisions.map(targetTableName));
  targetTables.add('Migration Registry');
  const schemaConflicts = [...targetTables]
    .filter((name) => !tableIds.has(name))
    .map((name) => `Missing target table ${name}`)
    .sort();
  if (schemaConflicts.length > 0) {
    return {
      ...blockedReport(manifest, options.mode, schemaConflicts[0]),
      schema_conflicts: schemaConflicts,
    };
  }

  const registryTableId = tableIds.get('Migration Registry')!;
  const registryRecords = await client.listAllRecords(options.target_token, registryTableId);
  const registry = byMigrationId(registryRecords);
  const duplicateRegistryIds = registryRecords
    .map(registryIdFromRecord)
    .filter((id): id is string => Boolean(id))
    .filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateRegistryIds.length > 0) {
    return blockedReport(manifest, options.mode, 'DUPLICATE_MIGRATION_REGISTRY_ID');
  }

  const results: ApplyRecordResult[] = [];
  const field_mismatches: ApplyFieldMismatch[] = [];
  let untracked_writes = 0;
  let business_writes = 0;
  let registry_writes = 0;

  const sortedDecisions = [...decisions].sort((left, right) => {
    const tableDifference = compareText(targetTableName(left), targetTableName(right));
    return tableDifference || compareText(left.migration_key, right.migration_key);
  });
  for (const decision of sortedDecisions) {
    const targetTable = targetTableName(decision);
    const targetTableId = tableIds.get(targetTable)!;
    const payloadHash = manifest.source_payload_hashes[decision.migration_key];
    const existingRegistry = registry.get(decision.migration_key);
    if (existingRegistry) {
      const existingHash = fieldValue(existingRegistry.fields ?? {}, 'Source Payload Hash');
      if (existingHash === payloadHash) {
        results.push({
          migration_key: decision.migration_key,
          target_table: targetTable,
          status: 'SKIP',
          reason: 'registry source payload hash is unchanged',
        });
      } else {
        results.push({
          migration_key: decision.migration_key,
          target_table: targetTable,
          status: 'NEEDS_REVIEW',
          reason: 'registry source payload hash changed',
        });
      }
      continue;
    }

    const input: RecordWriteInput = { fields: expectedFields(decision) };
    let written: BaseRecord;
    try {
      if (decision.decision === 'UPDATE') {
        const currentRecords = await client.listAllRecords(options.target_token, targetTableId);
        const matches = currentRecords.filter(
          (record) => migrationKeyFromRecord(record) === decision.migration_key,
        );
        if (matches.length !== 1) {
          results.push({
            migration_key: decision.migration_key,
            target_table: targetTable,
            status: 'NEEDS_REVIEW',
            reason: `UPDATE expected exactly one target record, found ${matches.length}`,
          });
          continue;
        }
        written = await client.updateRecord(
          options.target_token,
          targetTableId,
          matches[0].record_id,
          input,
        );
      } else {
        written = await client.createRecord(options.target_token, targetTableId, input);
      }
      business_writes += 1;
    } catch (error) {
      results.push({
        migration_key: decision.migration_key,
        target_table: targetTable,
        status: 'FAILED',
        reason: error instanceof Error ? error.message : 'business write failed',
      });
      continue;
    }

    const mismatches = compareReadback(decision, written);
    field_mismatches.push(...mismatches);
    if (mismatches.length > 0) {
      untracked_writes += 1;
      results.push({
        migration_key: decision.migration_key,
        target_table: targetTable,
        status: 'FAILED',
        target_record_id: written.record_id,
        reason: 'business record readback mismatch',
      });
      continue;
    }

    const registryInput: RecordWriteInput = {
      fields: registryFields(manifest, decision, targetTable, written.record_id, 'APPLIED'),
    };
    try {
      const registryRecord = await client.createRecord(
        options.target_token,
        registryTableId,
        registryInput,
      );
      registry_writes += 1;
      registry.set(decision.migration_key, registryRecord);
    } catch {
      const readback = await client.listAllRecords(options.target_token, targetTableId);
      const matches = readback.filter(
        (record) => migrationKeyFromRecord(record) === decision.migration_key,
      );
      if (matches.length !== 1) {
        untracked_writes += 1;
        results.push({
          migration_key: decision.migration_key,
          target_table: targetTable,
          status: 'FAILED',
          target_record_id: written.record_id,
          reason: 'registry write failed and business readback was not uniquely found',
        });
        continue;
      }
      try {
        const registryRecord = await client.createRecord(
          options.target_token,
          registryTableId,
          registryInput,
        );
        registry_writes += 1;
        registry.set(decision.migration_key, registryRecord);
      } catch {
        untracked_writes += 1;
        results.push({
          migration_key: decision.migration_key,
          target_table: targetTable,
          status: 'FAILED',
          target_record_id: matches[0].record_id,
          reason: 'registry retry failed after business readback',
        });
        continue;
      }
    }
    results.push({
      migration_key: decision.migration_key,
      target_table: targetTable,
      status: 'APPLIED',
      target_record_id: written.record_id,
      reason: 'business record and migration registry record written',
    });
  }

  const status =
    field_mismatches.length === 0 &&
    untracked_writes === 0 &&
    !results.some((result) => result.status === 'FAILED')
      ? 'PASS'
      : 'FAILED';
  const report: ApplyReport = {
    run_id: manifest.run_id,
    mode: options.mode,
    status,
    results,
    field_mismatches,
    untracked_writes,
    schema_conflicts: [],
    business_writes,
    registry_writes,
  };
  if (options.mode === 'canary') {
    report.canary_report = {
      run_id: manifest.run_id,
      status: status === 'PASS' ? 'PASS' : 'FAIL',
      selected_keys: decisions.map((decision) => decision.migration_key),
      field_mismatches,
      untracked_writes,
      schema_conflicts: [],
      results,
    };
  }
  return report;
}

export const apply = applyMigration;
