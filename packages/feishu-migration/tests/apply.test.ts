import { describe, expect, it } from 'vitest';
import { applyMigration, type MigrationWriteClient } from '../src/apply.js';
import {
  createMigrationManifest,
  type MigrationManifest,
} from '../src/plan.js';
import type { BaseRecord, BaseTable, RecordWriteInput } from '../src/feishu-client.js';
import type { SourceInventory } from '../src/inventory.js';

const FINGERPRINT = 'schema-fingerprint-v1';

class FakeMigrationClient implements MigrationWriteClient {
  tables: BaseTable[] = [
    { table_id: 'projects', name: 'Projects' },
    { table_id: 'registry', name: 'Migration Registry' },
  ];
  records = new Map<string, BaseRecord[]>();
  calls: string[] = [];
  failRegistryWrites = 0;
  private nextId = 1;

  constructor() {
    this.records.set('projects', []);
    this.records.set('registry', []);
  }

  getSchemaFingerprint(): Promise<string> {
    return Promise.resolve(FINGERPRINT);
  }

  listAllTables(_token: string): Promise<BaseTable[]> {
    return Promise.resolve(this.tables.map((table) => ({ ...table })));
  }

  listAllRecords(_token: string, tableId: string): Promise<BaseRecord[]> {
    return Promise.resolve(structuredClone(this.records.get(tableId) ?? []));
  }

  createRecord(_token: string, tableId: string, input: RecordWriteInput): Promise<BaseRecord> {
    const table = this.tables.find((candidate) => candidate.table_id === tableId)?.name;
    this.calls.push(`create:${table}`);
    if (table === 'Migration Registry' && this.failRegistryWrites > 0) {
      this.failRegistryWrites -= 1;
      return Promise.reject(new Error('registry temporarily unavailable'));
    }
    const record = { record_id: `rec-${this.nextId++}`, fields: structuredClone(input.fields) };
    const records = this.records.get(tableId) ?? [];
    records.push(record);
    this.records.set(tableId, records);
    return Promise.resolve(structuredClone(record));
  }

  updateRecord(
    _token: string,
    tableId: string,
    recordId: string,
    input: RecordWriteInput,
  ): Promise<BaseRecord> {
    this.calls.push(`update:${tableId}`);
    const records = this.records.get(tableId) ?? [];
    const record = records.find((candidate) => candidate.record_id === recordId);
    if (!record) return Promise.reject(new Error('record not found'));
    record.fields = structuredClone(input.fields);
    return Promise.resolve(structuredClone(record));
  }
}

function inventoryOf(count: number): SourceInventory {
  return {
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
}

function manifestFor(count: number): MigrationManifest {
  return createMigrationManifest(inventoryOf(count), { records: [] }, {
    run_id: 'run-apply-test',
    target_schema_fingerprint: FINGERPRINT,
  });
}

describe('migration manifest', () => {
  it('contains complete actions, counts and payload hashes before any write', () => {
    const manifest = manifestFor(2);

    expect(manifest.source_count).toBe(2);
    expect(manifest.target_before_counts.records).toBe(0);
    expect(manifest.expected.creates).toHaveLength(2);
    expect(Object.keys(manifest.payload_hashes)).toHaveLength(2);
    expect(manifest.target_schema_fingerprint).toBe(FINGERPRINT);
    expect(manifest.manifest_hash).toMatch(/^[a-f0-9]{64}$/u);
  });
});

describe('applyMigration', () => {
  it('selects at most five high-confidence records per target table for canary', async () => {
    const client = new FakeMigrationClient();
    const manifest = manifestFor(7);

    const report = await applyMigration(client, manifest, {
      target_token: 'target-test-token',
      mode: 'canary',
    });

    expect(report.status).toBe('PASS');
    expect(report.canary_report?.selected_keys).toHaveLength(5);
    expect(report.business_writes).toBe(5);
    expect(report.registry_writes).toBe(5);
  });

  it('blocks full apply without a clean canary or when schema drifts', async () => {
    const client = new FakeMigrationClient();
    const manifest = manifestFor(1);

    const noCanary = await applyMigration(client, manifest, {
      target_token: 'target-test-token',
      mode: 'full',
    });
    expect(noCanary.status).toBe('BLOCKED');
    expect(noCanary.schema_conflicts).toContain('CLEAN_CANARY_REQUIRED');

    const drifted = await applyMigration(client, manifest, {
      target_token: 'target-test-token',
      mode: 'canary',
      current_schema_fingerprint: 'different-schema',
    });
    expect(drifted.status).toBe('BLOCKED');
    expect(drifted.schema_conflicts).toContain('SCHEMA_FINGERPRINT_DRIFT');
  });

  it('uses registry hashes for SKIP and NEEDS_REVIEW decisions', async () => {
    const client = new FakeMigrationClient();
    const first = manifestFor(1);
    const firstApply = await applyMigration(client, first, {
      target_token: 'target-test-token',
      mode: 'canary',
    });
    expect(firstApply.status).toBe('PASS');

    const same = await applyMigration(client, first, {
      target_token: 'target-test-token',
      mode: 'canary',
    });
    expect(same.results[0].status).toBe('SKIP');
    expect(same.business_writes).toBe(0);

    const changed = structuredClone(first);
    const decision = changed.plan.decisions[0];
    changed.source_payload_hashes[decision.migration_key] = 'changed-source-hash';
    const changedResult = await applyMigration(client, changed, {
      target_token: 'target-test-token',
      mode: 'canary',
    });
    expect(changedResult.results[0].status).toBe('NEEDS_REVIEW');
    expect(changedResult.business_writes).toBe(0);
  });

  it('recovers a registry write after reading back the business record', async () => {
    const client = new FakeMigrationClient();
    client.failRegistryWrites = 1;
    const report = await applyMigration(client, manifestFor(1), {
      target_token: 'target-test-token',
      mode: 'canary',
    });

    expect(report.status).toBe('PASS');
    expect(report.untracked_writes).toBe(0);
    expect(report.business_writes).toBe(1);
    expect(report.registry_writes).toBe(1);
    expect(client.calls.filter((call) => call === 'create:Projects')).toHaveLength(1);
  });
});
