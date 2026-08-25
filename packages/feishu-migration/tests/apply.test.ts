import { describe, expect, it } from 'vitest';
import { applyMigration, type MigrationWriteClient } from '../src/apply.js';
import {
  createMigrationManifest,
  type MigrationManifest,
} from '../src/plan.js';
import type { BaseField, BaseRecord, BaseTable, RecordWriteInput } from '../src/feishu-client.js';
import type { SourceInventory } from '../src/inventory.js';

const FINGERPRINT = 'schema-fingerprint-v1';

class FakeMigrationClient implements MigrationWriteClient {
  tables: BaseTable[] = [
    { table_id: 'projects', name: 'Projects' },
    { table_id: 'registry', name: 'Migration Registry' },
  ];
  records = new Map<string, BaseRecord[]>();
  fields = new Map<string, BaseField[]>([
    ['projects', [
      { field_id: 'project-id', field_name: 'Project ID', type: 1 },
      { field_id: 'project-name', field_name: 'Project Name', type: 1 },
      { field_id: 'migration-key', field_name: 'Migration Key', type: 1 },
    ]],
    ['registry', [
      { field_id: 'migration-id', field_name: 'Migration ID', type: 1 },
      { field_id: 'run-id', field_name: 'Run ID', type: 1 },
      { field_id: 'source-type', field_name: 'Source Type', type: 3 },
      { field_id: 'source-token-hash', field_name: 'Source Token Hash', type: 1 },
      { field_id: 'source-table', field_name: 'Source Table', type: 1 },
      { field_id: 'source-record-id', field_name: 'Source Record ID', type: 1 },
      { field_id: 'source-business-key', field_name: 'Source Business Key', type: 1 },
      { field_id: 'source-payload-hash', field_name: 'Source Payload Hash', type: 1 },
      { field_id: 'target-table', field_name: 'Target Table', type: 1 },
      { field_id: 'target-record-id', field_name: 'Target Record ID', type: 1 },
      { field_id: 'decision', field_name: 'Decision', type: 3 },
      { field_id: 'confidence', field_name: 'Confidence', type: 3 },
      { field_id: 'duplicate-of', field_name: 'Duplicate Of', type: 1 },
      { field_id: 'conflict-json', field_name: 'Conflict JSON', type: 1 },
      { field_id: 'status', field_name: 'Status', type: 3 },
      { field_id: 'error-code', field_name: 'Error Code', type: 1 },
      { field_id: 'error-summary', field_name: 'Error Summary', type: 1 },
      { field_id: 'migrated-at', field_name: 'Migrated At', type: 5 },
    ]],
  ]);
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

  listAllFields(_token: string, tableId: string): Promise<BaseField[]> {
    return Promise.resolve(structuredClone(this.fields.get(tableId) ?? []));
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

  it('projects canonical fields onto live display field names before write and readback', async () => {
    const client = new FakeMigrationClient();
    const report = await applyMigration(client, manifestFor(1), {
      target_token: 'target-test-token',
      mode: 'canary',
    });

    expect(report.status).toBe('PASS');
    const businessRecord = client.records.get('projects')![0];
    expect(businessRecord.fields).toMatchObject({
      'Project ID': 'FZ1',
      'Project Name': 'Project 1',
      'Migration Key': 'project:FZ1',
    });
    expect(businessRecord.fields).not.toHaveProperty('project_code');
    expect(businessRecord.fields).not.toHaveProperty('project_name');
    expect(client.records.get('registry')![0].fields['Migrated At']).toEqual(expect.any(Number));
  });

  it('recovers a business record left behind when the registry write failed', async () => {
    const client = new FakeMigrationClient();
    client.records.set('projects', [{
      record_id: 'rec-partial-business',
      fields: {
        'Project ID': 'FZ1',
        'Project Name': 'Project 1',
        'Migration Key': 'project:FZ1',
      },
    }]);

    const report = await applyMigration(client, manifestFor(1), {
      target_token: 'target-test-token',
      mode: 'canary',
    });

    expect(report.status).toBe('PASS');
    expect(report.business_writes).toBe(0);
    expect(report.registry_writes).toBe(1);
    expect(client.records.get('projects')).toHaveLength(1);
  });

  it('covers REVIEW and SKIP in canary without issuing business writes', async () => {
    const reviewClient = new FakeMigrationClient();
    const review = structuredClone(manifestFor(1));
    review.plan.decisions[0] = {
      ...review.plan.decisions[0],
      decision: 'NEEDS_REVIEW',
      confidence: 'LOW',
      reason: 'Source Channel value did not exactly match an expected option',
    };
    const reviewReport = await applyMigration(reviewClient, review, {
      target_token: 'target-test-token',
      mode: 'canary',
    });
    expect(reviewReport.status).toBe('PASS');
    expect(reviewReport.canary_report?.selected_keys).toHaveLength(1);
    expect(reviewReport.results[0]).toMatchObject({
      status: 'NEEDS_REVIEW',
      reason: 'Source Channel value did not exactly match an expected option',
    });
    expect(reviewReport.business_writes).toBe(0);
    expect(reviewClient.calls).toEqual([]);

    const skipClient = new FakeMigrationClient();
    const skip = structuredClone(manifestFor(1));
    skip.plan.decisions[0] = {
      ...skip.plan.decisions[0],
      decision: 'SKIP',
      reason: 'target has the same canonical payload',
    };
    const skipReport = await applyMigration(skipClient, skip, {
      target_token: 'target-test-token',
      mode: 'canary',
    });
    expect(skipReport.status).toBe('PASS');
    expect(skipReport.results[0]).toMatchObject({ status: 'SKIP' });
    expect(skipReport.business_writes).toBe(0);
    expect(skipClient.calls).toEqual([]);
  });
});
