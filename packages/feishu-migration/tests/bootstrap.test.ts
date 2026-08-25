import { describe, expect, it } from 'vitest';
import {
  bootstrapTargetSchema,
  type SchemaBootstrapClient,
} from '../src/bootstrap.js';
import {
  TARGET_SCHEMA,
  type SchemaTableDefinition,
} from '../src/target-schema.js';
import type {
  BaseField,
  BaseTable,
  CreateFieldInput,
  CreateTableInput,
} from '../src/feishu-client.js';

class FakeSchemaClient implements SchemaBootstrapClient {
  tables: Array<BaseTable & { fields: BaseField[] }>;
  calls: string[] = [];

  constructor(
    tables: Array<BaseTable & { fields: BaseField[] }> = [],
  ) {
    this.tables = structuredClone(tables);
  }

  async listAllTables(_appToken: string): Promise<BaseTable[]> {
    return this.tables.map(({ fields: _fields, ...table }) => ({ ...table }));
  }

  async listAllFields(_appToken: string, tableId: string): Promise<BaseField[]> {
    return structuredClone(this.findTable(tableId).fields);
  }

  async createTable(
    _appToken: string,
    input: CreateTableInput,
  ): Promise<BaseTable> {
    this.calls.push(`createTable:${input.name}`);
    const table = {
      table_id: `tbl-${this.tables.length + 1}`,
      name: input.name,
      fields: (input.fields ?? []).map((field, index) => ({
        field_id: `${input.name}-field-${index + 1}`,
        field_name: field.field_name,
        type: field.type,
        property: field.property,
        description: field.description,
      })),
    };
    this.tables.push(table);
    return { table_id: table.table_id, name: table.name };
  }

  async createField(
    _appToken: string,
    tableId: string,
    input: CreateFieldInput,
  ): Promise<BaseField> {
    this.calls.push(`createField:${tableId}:${input.field_name}`);
    const table = this.findTable(tableId);
    const field = {
      field_id: `${tableId}-field-${table.fields.length + 1}`,
      field_name: input.field_name,
      type: input.type,
      property: input.property,
      description: input.description,
    };
    table.fields.push(field);
    return field;
  }

  async updateField(
    _appToken: string,
    tableId: string,
    fieldId: string,
    input: CreateFieldInput,
  ): Promise<BaseField> {
    this.calls.push(`updateField:${tableId}:${fieldId}`);
    const table = this.findTable(tableId);
    const field = table.fields.find((candidate) => candidate.field_id === fieldId);
    if (!field) throw new Error(`missing fake field ${fieldId}`);
    Object.assign(field, {
      field_name: input.field_name,
      type: input.type,
      property: input.property,
      description: input.description,
    });
    return structuredClone(field);
  }

  private findTable(tableId: string): BaseTable & { fields: BaseField[] } {
    const table = this.tables.find((candidate) => candidate.table_id === tableId);
    if (!table) throw new Error(`missing fake table ${tableId}`);
    return table;
  }
}

function table(name: string, fields: BaseField[] = []): BaseTable & { fields: BaseField[] } {
  return { table_id: `existing-${name}`, name, fields };
}

function retainedTargetTables(): Array<BaseTable & { fields: BaseField[] }> {
  return [
    '数据表',
    'Customers',
    'Projects',
    'Business Events',
    'Tasks',
    'Evidence',
    'BUSOS Asset',
  ].map((name) => table(name));
}

function completeTargetTables(): Array<BaseTable & { fields: BaseField[] }> {
  return TARGET_SCHEMA.map((definition) =>
    table(
      definition.name,
      definition.fields.map((field, index) => ({
        field_id: `${definition.name}-${index}`,
        field_name: field.field_name,
        type: field.type,
        property: field.property,
      })),
    ),
  );
}

describe('target schema definition', () => {
  it('contains the planned canonical tables with a text primary field first', () => {
    const resources = TARGET_SCHEMA.find((definition) => definition.name === 'Resources');
    const registry = TARGET_SCHEMA.find(
      (definition) => definition.name === 'Migration Registry',
    );

    expect(TARGET_SCHEMA.map((definition) => definition.name)).toEqual(
      expect.arrayContaining([
        'Customers',
        'Projects',
        'Business Events',
        'Evidence',
        'Resources',
        'Resource Availability',
        'Project Requirements',
        'Project Assignments',
        'Publish Items',
        'Media Assets',
        'Content Research',
        'Communication Scripts',
        'Knowledge',
        'Migration Registry',
      ]),
    );
    expect(resources?.fields[0]).toMatchObject({
      field_name: 'Resource Key',
      type: 1,
      description: expect.any(String),
    });
    expect(registry?.fields[0]).toMatchObject({
      field_name: 'Migration ID',
      type: 1,
    });
  });
});

describe('bootstrapTargetSchema', () => {
  it('creates missing tables and is idempotent on the second run', async () => {
    const client = new FakeSchemaClient(retainedTargetTables());

    const first = await bootstrapTargetSchema(client, 'target-test-token');
    const callsAfterFirst = client.calls.length;
    const second = await bootstrapTargetSchema(client, 'target-test-token');

    expect(first.status).toBe('CREATED');
    expect(first.created_tables).toContain('Resources');
    expect(first.writes).toBeGreaterThan(0);
    expect(second.status).toBe('NOOP');
    expect(second.writes).toBe(0);
    expect(client.calls.length).toBe(callsAfterFirst);
  });

  it('reports an incompatible field and performs zero writes', async () => {
    const existing = retainedTargetTables();
    existing.find((candidate) => candidate.name === 'Customers')!.fields = [
      {
        field_id: 'customer-migration-key',
        field_name: 'Migration Key',
        type: 2,
      },
    ];
    const client = new FakeSchemaClient(existing);

    const result = await bootstrapTargetSchema(client, 'target-test-token');

    expect(result.status).toBe('SCHEMA_CONFLICT');
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        table: 'Customers',
        field: 'Migration Key',
      }),
    ]);
    expect(result.writes).toBe(0);
    expect(client.calls).toEqual([]);
  });

  it('fails closed when an existing select field has no static options', async () => {
    const existing = [
      ...retainedTargetTables(),
      ...TARGET_SCHEMA
        .filter((definition) => !definition.existing)
        .map((definition) =>
          table(
            definition.name,
            definition.fields.map((field, index) => ({
              field_id: `${definition.name}-${index}`,
              field_name: field.field_name,
              type: field.type,
              property: field.property,
            })),
          ),
        ),
    ];
    const resourceType = existing
      .find((candidate) => candidate.name === 'Resources')!
      .fields.find((field) => field.field_name === 'Resource Type')!;
    resourceType.property = undefined;
    const client = new FakeSchemaClient(existing);

    const result = await bootstrapTargetSchema(client, 'target-test-token');

    expect(result.status).toBe('SCHEMA_CONFLICT');
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        table: 'Resources',
        field: 'Resource Type',
        reason: 'FIELD_OPTIONS_MISMATCH',
      }),
    ]);
    expect(result.writes).toBe(0);
    expect(client.calls).toEqual([]);
  });

  it('keeps compatible fields and adds only missing fields', async () => {
    const resources = TARGET_SCHEMA.find(
      (definition: SchemaTableDefinition) => definition.name === 'Resources',
    );
    const primary = resources?.fields[0];
    const existing = [
      ...retainedTargetTables(),
      ...TARGET_SCHEMA
        .filter((definition) => !definition.existing && definition.name !== 'Resources')
        .map((definition) =>
          table(
            definition.name,
            definition.fields.map((field, index) => ({
              field_id: `${definition.name}-${index}`,
              field_name: field.field_name,
              type: field.type,
              property: field.property,
            })),
          ),
        ),
      table('Resources', [
        {
          field_id: 'resource-key',
          field_name: 'Resource Key',
          type: primary?.type ?? 1,
        },
      ]),
    ];
    const client = new FakeSchemaClient(existing);

    const result = await bootstrapTargetSchema(client, 'target-test-token');

    expect(result.status).toBe('UPDATED');
    expect(result.created_tables).toEqual([]);
    expect(result.added_fields.some((field) => field.field === 'Resource ID')).toBe(true);
    expect(client.calls.every((call) => !call.startsWith('createTable:'))).toBe(true);
  });

  it('treats Customers.Source Channel as a normalized semantic subset', async () => {
    const existing = completeTargetTables();
    const sourceChannel = existing
      .find((candidate) => candidate.name === 'Customers')!
      .fields.find((field) => field.field_name === 'Source Channel')!;
    sourceChannel.property = {
      options: [
        { id: 'opt-base', name: ' BASE ', color: 1 },
        { id: 'opt-sheet', name: 'SHEET', color: 2 },
        { id: 'opt-document', name: 'DOCUMENT', color: 3 },
        { id: 'opt-collator', name: 'COLLATOR', color: 4 },
        { id: 'opt-other', name: 'OTHER', color: 5 },
        { id: 'opt-extra', name: 'OWNER_EXTRA', color: 6 },
      ],
    };
    const client = new FakeSchemaClient(existing);

    const result = await bootstrapTargetSchema(client, 'target-test-token');

    expect(result.status).toBe('NOOP');
    expect(result.writes).toBe(0);
    expect(client.calls).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.option_diffs).toEqual([
      expect.objectContaining({
        table: 'Customers',
        field: 'Source Channel',
        expected_options: ['BASE', 'COLLATOR', 'DOCUMENT', 'OTHER', 'SHEET'],
        actual_options: ['BASE', 'COLLATOR', 'DOCUMENT', 'OTHER', 'OWNER_EXTRA', 'SHEET'],
        missing_options: [],
        extra_options: ['OWNER_EXTRA'],
        classification: 'SEMANTIC_SUBSET_PASS',
        action: 'NONE',
      }),
    ]);
  });

  it('emits a dry-run diff and only appends missing Source Channel options', async () => {
    const existing = completeTargetTables();
    const sourceChannel = existing
      .find((candidate) => candidate.name === 'Customers')!
      .fields.find((field) => field.field_name === 'Source Channel')!;
    sourceChannel.property = {
      options: [
        { id: 'opt-base', name: 'BASE', color: 1 },
        { id: 'opt-sheet', name: 'SHEET', color: 2 },
        { id: 'opt-document', name: 'DOCUMENT', color: 3 },
        { id: 'opt-collator', name: 'COLLATOR', color: 4 },
        { id: 'opt-extra', name: 'OWNER_EXTRA', color: 6 },
      ],
    };
    const client = new FakeSchemaClient(existing);

    const dryRun = await bootstrapTargetSchema(client, 'target-test-token', { dry_run: true });

    expect(dryRun.status).toBe('SCHEMA_PATCH_REQUIRED');
    expect(dryRun.writes).toBe(0);
    expect(client.calls).toEqual([]);
    expect(dryRun.option_diffs).toEqual([
      expect.objectContaining({
        table: 'Customers',
        field: 'Source Channel',
        missing_options: ['OTHER'],
        extra_options: ['OWNER_EXTRA'],
        classification: 'MISSING_EXPECTED_OPTIONS',
        action: 'ADD_MISSING_OPTIONS',
      }),
    ]);

    const result = await bootstrapTargetSchema(client, 'target-test-token');

    expect(result.status).toBe('UPDATED');
    expect(result.writes).toBe(1);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]).toMatch(/^updateField:/u);
    expect(result.option_diffs).toEqual([
      expect.objectContaining({
        missing_options: [],
        extra_options: ['OWNER_EXTRA'],
        classification: 'SEMANTIC_SUBSET_PASS',
      }),
    ]);
    const readbackSourceChannel = client.tables
      .find((candidate) => candidate.name === 'Customers')!
      .fields.find((field) => field.field_name === 'Source Channel')!;
    expect(
      (readbackSourceChannel.property as { options: Array<{ name: string }> }).options.map(
        (option) => option.name,
      ),
    ).toEqual(['BASE', 'SHEET', 'DOCUMENT', 'COLLATOR', 'OWNER_EXTRA', 'OTHER']);
  });
});
