import { describe, expect, it } from 'vitest';
import { applyMigration, type MigrationWriteClient } from '../src/apply.js';
import { createMigrationManifest } from '../src/plan.js';
import { verifyMigration } from '../src/verify-live.js';
import type { BaseRecord, BaseTable, RecordWriteInput } from '../src/feishu-client.js';
import type { SourceInventory } from '../src/inventory.js';

const FINGERPRINT = 'schema-fingerprint-v1';

class VerifyClient implements MigrationWriteClient {
  tables: BaseTable[] = [
    { table_id: 'projects', name: 'Projects' },
    { table_id: 'registry', name: 'Migration Registry' },
  ];
  records = new Map<string, BaseRecord[]>([
    ['projects', []],
    ['registry', []],
  ]);
  private nextId = 1;

  getSchemaFingerprint(): Promise<string> {
    return Promise.resolve(FINGERPRINT);
  }

  listAllTables(_token: string): Promise<BaseTable[]> {
    return Promise.resolve(this.tables);
  }

  listAllRecords(_token: string, tableId: string): Promise<BaseRecord[]> {
    return Promise.resolve(this.records.get(tableId) ?? []);
  }

  createRecord(_token: string, tableId: string, input: RecordWriteInput): Promise<BaseRecord> {
    const record = { record_id: `rec-${this.nextId++}`, fields: structuredClone(input.fields) };
    this.records.get(tableId)!.push(record);
    return Promise.resolve(record);
  }

  updateRecord(
    _token: string,
    tableId: string,
    recordId: string,
    input: RecordWriteInput,
  ): Promise<BaseRecord> {
    const record = this.records.get(tableId)!.find((candidate) => candidate.record_id === recordId);
    if (!record) return Promise.reject(new Error('record not found'));
    record.fields = structuredClone(input.fields);
    return Promise.resolve(record);
  }
}

function manifestFor(count = 1): ReturnType<typeof createMigrationManifest> {
  const inventory: SourceInventory = {
    base: { tables: [] },
    spreadsheets: [
      {
        key: 'SOURCE',
        sheets: [
          {
            sheet: { sheet_id: 'sheet-1', title: 'Projects' },
            rows: Array.from({ length: count }, (_, index) => ({
                entity_type: 'project',
                project_code: `FZ${index + 1}`,
                project_name: `Project ${index + 1}`,
              })) as unknown as unknown[][],
          },
        ],
      },
    ],
  };
  return createMigrationManifest(inventory, { records: [] }, {
    run_id: 'run-verify-test',
    target_schema_fingerprint: FINGERPRINT,
  });
}

describe('verifyMigration', () => {
  it('verifies coverage, hashes, required fields and deterministic sample readback', async () => {
    const client = new VerifyClient();
    const manifest = manifestFor();
    const applied = await applyMigration(client, manifest, {
      target_token: 'target-test-token',
      mode: 'canary',
    });
    expect(applied.status).toBe('PASS');

    const report = await verifyMigration(client, manifest, {
      target_token: 'target-test-token',
      current_schema_fingerprint: FINGERPRINT,
    });

    expect(report.status).toBe('PASS');
    expect(report.mismatches).toEqual([]);
    expect(report.target_counts.Projects).toBe(1);
    expect(report.unique_migration_keys).toBe(true);
    expect(report.payload_hashes_verified).toBe(true);
    expect(report.sample_readbacks).toHaveLength(1);
  });

  it('fails on duplicate migration keys and schema fingerprint drift', async () => {
    const client = new VerifyClient();
    const manifest = manifestFor();
    await applyMigration(client, manifest, {
      target_token: 'target-test-token',
      mode: 'canary',
    });
    const duplicate = structuredClone(client.records.get('projects')![0]);
    duplicate.record_id = 'duplicate-record';
    client.records.get('projects')!.push(duplicate);

    const duplicateReport = await verifyMigration(client, manifest, {
      target_token: 'target-test-token',
      current_schema_fingerprint: FINGERPRINT,
    });
    expect(duplicateReport.status).toBe('FAIL');
    expect(duplicateReport.unique_migration_keys).toBe(false);
    expect(duplicateReport.mismatches.some((item) => /duplicate/u.test(item.reason))).toBe(true);

    const driftReport = await verifyMigration(client, manifest, {
      target_token: 'target-test-token',
      current_schema_fingerprint: 'different-schema',
    });
    expect(driftReport.status).toBe('FAIL');
    expect(driftReport.schema_fingerprint_verified).toBe(false);
  });

  it('can verify only the migration keys selected by a canary report', async () => {
    const client = new VerifyClient();
    const manifest = manifestFor(2);
    const applied = await applyMigration(client, manifest, {
      target_token: 'target-test-token',
      mode: 'canary',
    });
    expect(applied.status).toBe('PASS');

    const firstKey = manifest.plan.decisions[0].migration_key;
    const report = await verifyMigration(client, manifest, {
      target_token: 'target-test-token',
      current_schema_fingerprint: FINGERPRINT,
      migration_keys: [firstKey],
    });

    expect(report.status).toBe('PASS');
    expect(report.planned_count).toBe(1);
    expect(report.sample_readbacks).toEqual([firstKey]);
  });
});
