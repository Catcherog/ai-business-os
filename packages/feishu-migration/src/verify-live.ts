import type { BaseField, BaseRecord, BaseTable } from './feishu-client.js';
import { manifestDecisions, targetTableName, type MigrationManifest } from './plan.js';
import type { VerificationReport } from './types.js';
import type { MigrationWriteClient } from './apply.js';
import { projectRecordFields } from './record-fields.js';

export interface VerificationMismatch {
  migration_key: string;
  reason: string;
}

export interface LiveVerificationReport extends VerificationReport {
  status: 'PASS' | 'FAIL';
  target_counts: Record<string, number>;
  unique_migration_keys: boolean;
  payload_hashes_verified: boolean;
  required_fields_verified: boolean;
  dangling_canonical_ids: string[];
  sample_readbacks: string[];
  schema_fingerprint_verified: boolean;
}

export interface VerifyOptions {
  target_token: string;
  current_schema_fingerprint?: string;
  required_fields?: Record<string, string[]>;
  sample_limit?: number;
  migration_keys?: string[];
}

function fieldValue(fields: Record<string, unknown>, name: string): unknown {
  if (Object.prototype.hasOwnProperty.call(fields, name)) return fields[name];
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/gu, '');
  const entry = Object.entries(fields).find(
    ([key]) => key.toLowerCase().replace(/[^a-z0-9]/gu, '') === normalized,
  );
  return entry?.[1];
}

function registryId(record: BaseRecord): string | undefined {
  const value = fieldValue(record.fields ?? {}, 'Migration ID');
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function migrationKey(record: BaseRecord): string | undefined {
  const value = fieldValue(record.fields ?? {}, 'Migration Key');
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function matchesExpected(record: BaseRecord, expected: Record<string, unknown>): boolean {
  return Object.entries(expected).every(([field, value]) => {
    if (value === undefined) return true;
    return JSON.stringify(fieldValue(record.fields ?? {}, field)) === JSON.stringify(value);
  });
}

function addMismatch(
  mismatches: VerificationMismatch[],
  key: string,
  reason: string,
): void {
  mismatches.push({ migration_key: key, reason });
}

export async function verifyMigration(
  client: MigrationWriteClient,
  manifest: MigrationManifest,
  options: VerifyOptions,
): Promise<LiveVerificationReport> {
  const mismatches: VerificationMismatch[] = [];
  const currentFingerprint =
    options.current_schema_fingerprint ??
    (client.getSchemaFingerprint ? await client.getSchemaFingerprint(options.target_token) : undefined);
  const schemaFingerprintVerified = currentFingerprint === manifest.target_schema_fingerprint;
  if (!schemaFingerprintVerified) {
    addMismatch(mismatches, '__schema__', currentFingerprint ? 'schema fingerprint drifted' : 'schema fingerprint unavailable');
  }

  const tables = await client.listAllTables(options.target_token);
  const tableIds = new Map(tables.map((table) => [table.name, table.table_id]));
  const selectedKeys = options.migration_keys ? new Set(options.migration_keys) : undefined;
  const decisions = manifestDecisions(manifest).filter((decision) =>
    !selectedKeys || selectedKeys.has(decision.migration_key),
  );
  const expectedTables = new Set(decisions.filter((decision) => decision.decision !== 'NEEDS_REVIEW').map(targetTableName));
  expectedTables.add('Migration Registry');
  const fieldsByTable = new Map<string, BaseField[]>();
  if (client.listAllFields) {
    try {
      for (const tableName of [...expectedTables].sort()) {
        const tableId = tableIds.get(tableName);
        if (tableId) fieldsByTable.set(tableName, await client.listAllFields(options.target_token, tableId));
      }
    } catch {
      addMismatch(mismatches, '__schema__', 'target field schema read failed');
    }
  }
  const recordsByTable = new Map<string, BaseRecord[]>();
  for (const tableName of [...expectedTables].sort()) {
    const tableId = tableIds.get(tableName);
    if (!tableId) {
      addMismatch(mismatches, `__table__:${tableName}`, `target table ${tableName} is missing`);
      continue;
    }
    recordsByTable.set(tableName, await client.listAllRecords(options.target_token, tableId));
  }

  const registryRecords = recordsByTable.get('Migration Registry') ?? [];
  const registryById = new Map<string, BaseRecord>();
  for (const record of registryRecords) {
    const id = registryId(record);
    if (!id) continue;
    if (registryById.has(id)) addMismatch(mismatches, id, 'duplicate Migration Registry ID');
    registryById.set(id, record);
  }

  const targetCounts: Record<string, number> = {};
  const targetKeyOccurrences = new Map<string, number>();
  for (const [tableName, records] of recordsByTable.entries()) {
    if (tableName === 'Migration Registry') continue;
    targetCounts[tableName] = records.length;
    for (const record of records) {
      const key = migrationKey(record);
      if (key) targetKeyOccurrences.set(key, (targetKeyOccurrences.get(key) ?? 0) + 1);
    }
  }

  let payloadHashesVerified = true;
  let requiredFieldsVerified = true;
  const executable = decisions.filter((decision) => decision.decision === 'CREATE' || decision.decision === 'UPDATE');
  for (const decision of executable) {
    const registry = registryById.get(decision.migration_key);
    if (!registry) {
      payloadHashesVerified = false;
      addMismatch(mismatches, decision.migration_key, 'missing migration registry record');
      continue;
    }
    const expectedSourceHash = manifest.source_payload_hashes[decision.migration_key];
    if (fieldValue(registry.fields ?? {}, 'Source Payload Hash') !== expectedSourceHash) {
      payloadHashesVerified = false;
      addMismatch(mismatches, decision.migration_key, 'source payload hash differs from manifest');
    }
    const tableName = targetTableName(decision);
    const records = recordsByTable.get(tableName) ?? [];
    const matches = records.filter((record) => migrationKey(record) === decision.migration_key);
    if (matches.length !== 1) {
      addMismatch(mismatches, decision.migration_key, `expected one target record, found ${matches.length}`);
      continue;
    }
    const expected = projectRecordFields(
      tableName,
      decision.canonical_target && typeof decision.canonical_target === 'object'
        ? { ...(decision.canonical_target as Record<string, unknown>), 'Migration Key': decision.migration_key }
        : { 'Migration Key': decision.migration_key },
      fieldsByTable.get(tableName),
    ).fields;
    if (!matchesExpected(matches[0], expected)) {
      addMismatch(mismatches, decision.migration_key, 'target payload differs from manifest canonical payload');
    }
    const required = options.required_fields?.[tableName] ?? Object.keys(expected);
    for (const field of required) {
      const projectedRequired = projectRecordFields(
        tableName,
        { [field]: true },
        fieldsByTable.get(tableName),
      ).fields;
      const requiredField = Object.keys(projectedRequired)[0] ?? field;
      if (fieldValue(matches[0].fields ?? {}, requiredField) === undefined) {
        requiredFieldsVerified = false;
        addMismatch(mismatches, decision.migration_key, `required field ${field} is missing`);
      }
    }
  }

  const danglingCanonicalIds: string[] = [];
  for (const decision of executable) {
    const canonical = decision.canonical_target;
    if (!canonical || typeof canonical !== 'object') continue;
    for (const [field, value] of Object.entries(canonical as Record<string, unknown>)) {
      if (!/(?:^|_)(?:project_id|resource_key|customer_id)$/iu.test(field)) continue;
      if (typeof value !== 'string' || !value.trim()) continue;
      const known = [...targetKeyOccurrences.keys()].some((key) => key === value || key.endsWith(`:${value}`));
      if (!known) danglingCanonicalIds.push(`${decision.migration_key}:${field}:${value}`);
    }
  }
  for (const dangling of danglingCanonicalIds) {
    addMismatch(mismatches, dangling.split(':')[0], `dangling canonical reference ${dangling}`);
  }

  const sampleLimit = Math.max(0, options.sample_limit ?? 20);
  const sampleKeys = executable.map((decision) => decision.migration_key).sort().slice(0, sampleLimit);
  const sampleReadbacks: string[] = [];
  for (const key of sampleKeys) {
    const decision = executable.find((candidate) => candidate.migration_key === key)!;
    const records = recordsByTable.get(targetTableName(decision)) ?? [];
    if (records.some((record) => migrationKey(record) === key)) sampleReadbacks.push(key);
    else addMismatch(mismatches, key, 'deterministic sample readback missing');
  }

  let uniqueMigrationKeys = true;
  for (const [key, count] of targetKeyOccurrences.entries()) {
    if (count > 1) {
      uniqueMigrationKeys = false;
      addMismatch(mismatches, key, 'duplicate target Migration Key');
    }
  }
  return {
    verified_at: new Date().toISOString(),
    planned_count: decisions.length,
    applied_count: executable.filter((decision) => registryById.has(decision.migration_key)).length,
    mismatches,
    status: mismatches.length === 0 ? 'PASS' : 'FAIL',
    target_counts: targetCounts,
    unique_migration_keys: uniqueMigrationKeys,
    payload_hashes_verified: payloadHashesVerified,
    required_fields_verified: requiredFieldsVerified,
    dangling_canonical_ids: danglingCanonicalIds.sort(),
    sample_readbacks: sampleReadbacks,
    schema_fingerprint_verified: schemaFingerprintVerified,
  };
}

export const verifyLive = verifyMigration;
