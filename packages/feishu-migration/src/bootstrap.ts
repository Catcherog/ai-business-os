import { stableHash } from './hash.js';
import type {
  BaseField,
  BaseTable,
  CreateFieldInput,
  CreateTableInput,
} from './feishu-client.js';
import {
  TARGET_SCHEMA,
  toCreateFieldInput,
  type SchemaFieldDefinition,
  type SchemaTableDefinition,
} from './target-schema.js';

export interface SchemaBootstrapClient {
  listAllTables(appToken: string): Promise<BaseTable[]>;
  listAllFields(appToken: string, tableId: string): Promise<BaseField[]>;
  createTable(appToken: string, input: CreateTableInput): Promise<BaseTable>;
  createField(
    appToken: string,
    tableId: string,
    input: CreateFieldInput,
  ): Promise<BaseField>;
}

export type SchemaDiffStatus = 'NOOP' | 'CREATED' | 'UPDATED' | 'SCHEMA_CONFLICT';

export interface SchemaConflict {
  table: string;
  field?: string;
  reason: 'MISSING_EXISTING_TABLE' | 'DUPLICATE_TABLE' | 'FIELD_TYPE_MISMATCH' | 'FIELD_OPTIONS_MISMATCH';
  expected_type?: number;
  actual_type?: number;
  message: string;
}

export interface AddedSchemaField {
  table: string;
  field: string;
  type: number;
}

export interface SchemaDiffResult {
  status: SchemaDiffStatus;
  created_tables: string[];
  added_fields: AddedSchemaField[];
  conflicts: SchemaConflict[];
  writes: number;
  schema_fingerprint: string;
}

interface TableState {
  definition: SchemaTableDefinition;
  table?: BaseTable;
  fields: BaseField[];
}

interface PlannedField {
  table: TableState;
  field: SchemaFieldDefinition;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fieldOptions(field: BaseField): string[] | undefined {
  const property = field.property;
  if (!property || typeof property !== 'object') return undefined;
  const options = (property as Record<string, unknown>).options;
  if (!Array.isArray(options)) return undefined;
  const names = options.flatMap((option) => {
    if (typeof option === 'string') return [option];
    if (!option || typeof option !== 'object') return [];
    const name = (option as Record<string, unknown>).name;
    return typeof name === 'string' ? [name] : [];
  });
  return names.length > 0 ? names.sort(compareText) : undefined;
}

function sameOptions(expected: readonly string[], actual: readonly string[]): boolean {
  return [...expected].sort(compareText).join('\u0000') === [...actual].sort(compareText).join('\u0000');
}

function expectedField(definition: SchemaTableDefinition, fieldName: string): SchemaFieldDefinition | undefined {
  return definition.fields.find((field) => field.field_name === fieldName);
}

function schemaFingerprint(
  tables: Array<{ table: BaseTable; fields: BaseField[] }>,
): string {
  return stableHash(
    tables
      .map(({ table, fields }) => ({
        name: table.name,
        fields: fields
          .map((field) => {
            const options = fieldOptions(field);
            return {
              field_name: field.field_name,
              type: field.type,
              ...(options ? { options } : {}),
            };
          })
          .sort((left, right) => compareText(left.field_name, right.field_name)),
      }))
      .sort((left, right) => compareText(left.name, right.name)),
  );
}

function emptyResult(
  status: SchemaDiffStatus,
  conflicts: SchemaConflict[],
  fingerprint: string,
): SchemaDiffResult {
  return {
    status,
    created_tables: [],
    added_fields: [],
    conflicts,
    writes: 0,
    schema_fingerprint: fingerprint,
  };
}

async function readTableStates(
  client: SchemaBootstrapClient,
  targetToken: string,
): Promise<{ states: TableState[]; conflicts: SchemaConflict[]; fingerprint: string }> {
  const observedTables = await client.listAllTables(targetToken);
  const byName = new Map<string, BaseTable[]>();
  for (const table of observedTables) {
    const current = byName.get(table.name) ?? [];
    current.push(table);
    byName.set(table.name, current);
  }

  const states: TableState[] = [];
  const conflicts: SchemaConflict[] = [];
  for (const definition of TARGET_SCHEMA) {
    const matches = byName.get(definition.name) ?? [];
    if (matches.length > 1) {
      conflicts.push({
        table: definition.name,
        reason: 'DUPLICATE_TABLE',
        message: `Target contains multiple tables named ${definition.name}`,
      });
    }
    const table = matches[0];
    const fields = table
      ? await client.listAllFields(targetToken, table.table_id)
      : [];
    if (!table && definition.existing) {
      conflicts.push({
        table: definition.name,
        reason: 'MISSING_EXISTING_TABLE',
        message: `Required existing target table ${definition.name} was not found`,
      });
    }
    states.push({ definition, table, fields });
  }

  const fingerprint = schemaFingerprint(
    states
      .filter((state): state is TableState & { table: BaseTable } => Boolean(state.table))
      .map(({ table, fields }) => ({ table, fields })),
  );
  return { states, conflicts, fingerprint };
}

function validateFields(states: TableState[], conflicts: SchemaConflict[]): PlannedField[] {
  const plannedFields: PlannedField[] = [];
  for (const state of states) {
    if (!state.table) continue;
    const fieldsByName = new Map<string, BaseField[]>();
    for (const field of state.fields) {
      const current = fieldsByName.get(field.field_name) ?? [];
      current.push(field);
      fieldsByName.set(field.field_name, current);
    }
    for (const expected of state.definition.fields) {
      const matches = fieldsByName.get(expected.field_name) ?? [];
      if (matches.length > 1) {
        conflicts.push({
          table: state.definition.name,
          field: expected.field_name,
          reason: 'DUPLICATE_TABLE',
          message: `Target contains multiple fields named ${expected.field_name}`,
        });
        continue;
      }
      const actual = matches[0];
      if (!actual) {
        plannedFields.push({ table: state, field: expected });
        continue;
      }
      if (actual.type !== expected.type) {
        conflicts.push({
          table: state.definition.name,
          field: expected.field_name,
          reason: 'FIELD_TYPE_MISMATCH',
          expected_type: expected.type,
          actual_type: actual.type,
          message: `Existing field ${expected.field_name} has type ${actual.type}; expected ${expected.type}`,
        });
        continue;
      }
      if (expected.options) {
        const actualOptions = fieldOptions(actual);
        if (!actualOptions || !sameOptions(expected.options, actualOptions)) {
          conflicts.push({
            table: state.definition.name,
            field: expected.field_name,
            reason: 'FIELD_OPTIONS_MISMATCH',
            expected_type: expected.type,
            actual_type: actual.type,
            message: `Existing select options for ${expected.field_name} differ from the target contract`,
          });
        }
      }
    }
  }
  return plannedFields;
}

async function resolveCreatedTable(
  client: SchemaBootstrapClient,
  targetToken: string,
  definition: SchemaTableDefinition,
  created: BaseTable,
): Promise<BaseTable> {
  if (created.table_id) return created;
  const tables = await client.listAllTables(targetToken);
  const resolved = tables.find((table) => table.name === definition.name);
  if (!resolved) {
    throw new Error(`SCHEMA_READBACK_FAILED: created table ${definition.name} was not readable`);
  }
  return resolved;
}

export async function bootstrapTargetSchema(
  client: SchemaBootstrapClient,
  targetToken: string,
): Promise<SchemaDiffResult> {
  if (!targetToken.trim()) throw new Error('bootstrapTargetSchema requires targetToken');

  const before = await readTableStates(client, targetToken);
  const plannedFields = validateFields(before.states, before.conflicts);
  if (before.conflicts.length > 0) {
    return emptyResult('SCHEMA_CONFLICT', before.conflicts, before.fingerprint);
  }

  const missingTables = before.states.filter((state) => !state.table && !state.definition.existing);
  const createdTables: string[] = [];
  const addedFields: AddedSchemaField[] = [];
  let writes = 0;

  for (const state of missingTables) {
    const fields = state.definition.fields;
    const input: CreateTableInput = {
      name: state.definition.name,
      default_view_name: fields[0]?.field_name,
      description: state.definition.description,
      fields: fields.map(toCreateFieldInput),
    };
    const created = await client.createTable(targetToken, input);
    const table = await resolveCreatedTable(client, targetToken, state.definition, created);
    state.table = table;
    state.fields = await client.listAllFields(targetToken, table.table_id);
    createdTables.push(state.definition.name);
    writes += 1;
    for (const field of fields) {
      addedFields.push({
        table: state.definition.name,
        field: field.field_name,
        type: field.type,
      });
    }
  }

  const fieldsToAdd = [
    ...plannedFields,
    ...missingTables.flatMap((state) => {
      const existingNames = new Set(state.fields.map((field) => field.field_name));
      return state.definition.fields
        .filter((field) => !existingNames.has(field.field_name))
        .map((field) => ({ table: state, field }));
    }),
  ];
  const seen = new Set<string>();
  for (const planned of fieldsToAdd) {
    if (!planned.table.table) continue;
    const key = `${planned.table.definition.name}\u0000${planned.field.field_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await client.createField(
      targetToken,
      planned.table.table.table_id,
      toCreateFieldInput(planned.field),
    );
    addedFields.push({
      table: planned.table.definition.name,
      field: planned.field.field_name,
      type: planned.field.type,
    });
    writes += 1;
  }

  const after = await readTableStates(client, targetToken);
  if (after.conflicts.length > 0) {
    return {
      status: 'SCHEMA_CONFLICT',
      created_tables: createdTables,
      added_fields: addedFields,
      conflicts: after.conflicts,
      writes,
      schema_fingerprint: after.fingerprint,
    };
  }

  return {
    status:
      createdTables.length > 0 ? 'CREATED' : addedFields.length > 0 ? 'UPDATED' : 'NOOP',
    created_tables: createdTables,
    added_fields: addedFields,
    conflicts: [],
    writes,
    schema_fingerprint: after.fingerprint,
  };
}

export { TARGET_SCHEMA } from './target-schema.js';
