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
  updateField(
    appToken: string,
    tableId: string,
    fieldId: string,
    input: CreateFieldInput,
  ): Promise<BaseField>;
}

export type SchemaDiffStatus =
  | 'NOOP'
  | 'CREATED'
  | 'UPDATED'
  | 'SCHEMA_PATCH_REQUIRED'
  | 'SCHEMA_CONFLICT';

export type SchemaOptionClassification =
  | 'SEMANTIC_SUBSET_PASS'
  | 'MISSING_EXPECTED_OPTIONS'
  | 'STRICT_EXACT_MISMATCH'
  | 'AMBIGUOUS_NORMALIZED_NAME'
  | 'OPTIONS_UNREADABLE';

export interface SchemaOptionDiff {
  table: string;
  field: string;
  expected_options: string[];
  actual_options: string[];
  missing_options: string[];
  extra_options: string[];
  classification: SchemaOptionClassification;
  action: 'NONE' | 'ADD_MISSING_OPTIONS' | 'BLOCK';
}

export interface SchemaConflict {
  table: string;
  field?: string;
  reason:
    | 'MISSING_EXISTING_TABLE'
    | 'DUPLICATE_TABLE'
    | 'FIELD_TYPE_MISMATCH'
    | 'FIELD_OPTIONS_MISMATCH'
    | 'FIELD_OPTIONS_AMBIGUOUS';
  expected_type?: number;
  actual_type?: number;
  message: string;
  option_diff?: SchemaOptionDiff;
}

export interface AddedSchemaField {
  table: string;
  field: string;
  type: number;
}

export interface AddedSchemaOptions {
  table: string;
  field: string;
  options: string[];
}

export interface SchemaDiffResult {
  status: SchemaDiffStatus;
  created_tables: string[];
  added_fields: AddedSchemaField[];
  added_options: AddedSchemaOptions[];
  option_diffs: SchemaOptionDiff[];
  conflicts: SchemaConflict[];
  writes: number;
  schema_fingerprint: string;
}

export interface BootstrapTargetSchemaOptions {
  dry_run?: boolean;
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

interface PlannedOptionPatch {
  table: TableState;
  field: BaseField;
  expected: SchemaFieldDefinition;
  missing_options: string[];
}

interface FieldValidation {
  plannedFields: PlannedField[];
  optionPatches: PlannedOptionPatch[];
  optionDiffs: SchemaOptionDiff[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

interface OptionInspection {
  names: string[];
  rawOptions: unknown[];
  unreadable: boolean;
  duplicateNormalizedNames: string[];
}

function normalizeOptionName(value: string): string {
  return value.normalize('NFKC').trim();
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function inspectOptions(field: BaseField): OptionInspection {
  const property = field.property;
  if (!property || typeof property !== 'object') {
    return { names: [], rawOptions: [], unreadable: true, duplicateNormalizedNames: [] };
  }
  const options = (property as Record<string, unknown>).options;
  if (!Array.isArray(options)) {
    return { names: [], rawOptions: [], unreadable: true, duplicateNormalizedNames: [] };
  }
  const names: string[] = [];
  let unreadable = false;
  for (const option of options) {
    const name = typeof option === 'string'
      ? option
      : option && typeof option === 'object'
        ? (option as Record<string, unknown>).name
        : undefined;
    if (typeof name !== 'string') {
      unreadable = true;
      continue;
    }
    names.push(name);
    if (normalizeOptionName(name) === '') unreadable = true;
  }
  const normalizedNames = names.map(normalizeOptionName);
  const duplicateNormalizedNames = sortedUnique(
    normalizedNames.filter((name, index, all) => all.indexOf(name) !== index),
  );
  return {
    names,
    rawOptions: [...options],
    unreadable,
    duplicateNormalizedNames,
  };
}

function fieldOptions(field: BaseField): string[] | undefined {
  const inspection = inspectOptions(field);
  if (inspection.unreadable || inspection.duplicateNormalizedNames.length > 0) return undefined;
  return inspection.names.length > 0 ? inspection.names.sort(compareText) : undefined;
}

function sameOptions(expected: readonly string[], actual: readonly string[]): boolean {
  return [...expected].sort(compareText).join('\u0000') === [...actual].sort(compareText).join('\u0000');
}

function isSourceChannelField(
  table: SchemaTableDefinition,
  field: SchemaFieldDefinition,
): boolean {
  return table.name === 'Customers' && field.field_name === 'Source Channel';
}

function sourceChannelOptions(field: BaseField): OptionInspection {
  return inspectOptions(field);
}

function optionDiff(
  table: string,
  field: string,
  expectedOptions: readonly string[],
  actualOptions: readonly string[],
  classification: SchemaOptionClassification,
  action: SchemaOptionDiff['action'],
): SchemaOptionDiff {
  const expected = sortedUnique(expectedOptions.map(normalizeOptionName));
  const actual = actualOptions.map(normalizeOptionName).sort(compareText);
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    table,
    field,
    expected_options: expected,
    actual_options: actual,
    missing_options: expected.filter((name) => !actualSet.has(name)),
    extra_options: [...actualSet].filter((name) => !expectedSet.has(name)).sort(compareText),
    classification,
    action,
  };
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
            const options = field.field_name === 'Source Channel' && table.name === 'Customers'
              ? sourceChannelOptions(field).names.map(normalizeOptionName).sort(compareText)
              : fieldOptions(field);
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
  optionDiffs: SchemaOptionDiff[] = [],
): SchemaDiffResult {
  return {
    status,
    created_tables: [],
    added_fields: [],
    added_options: [],
    option_diffs: optionDiffs,
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

function validateFields(states: TableState[], conflicts: SchemaConflict[]): FieldValidation {
  const plannedFields: PlannedField[] = [];
  const optionPatches: PlannedOptionPatch[] = [];
  const optionDiffs: SchemaOptionDiff[] = [];
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
        if (isSourceChannelField(state.definition, expected)) {
          const inspection = sourceChannelOptions(actual);
          const diff = optionDiff(
            state.definition.name,
            expected.field_name,
            expected.options,
            inspection.names,
            inspection.unreadable
              ? 'OPTIONS_UNREADABLE'
              : inspection.duplicateNormalizedNames.length > 0
                ? 'AMBIGUOUS_NORMALIZED_NAME'
                : 'SEMANTIC_SUBSET_PASS',
            inspection.unreadable || inspection.duplicateNormalizedNames.length > 0
              ? 'BLOCK'
              : 'NONE',
          );
          if (inspection.unreadable) {
            conflicts.push({
              table: state.definition.name,
              field: expected.field_name,
              reason: 'FIELD_OPTIONS_MISMATCH',
              expected_type: expected.type,
              actual_type: actual.type,
              message: `Existing select options for ${expected.field_name} could not be read`,
              option_diff: diff,
            });
          } else if (inspection.duplicateNormalizedNames.length > 0) {
            conflicts.push({
              table: state.definition.name,
              field: expected.field_name,
              reason: 'FIELD_OPTIONS_AMBIGUOUS',
              expected_type: expected.type,
              actual_type: actual.type,
              message: `Existing select options for ${expected.field_name} contain duplicate normalized names`,
              option_diff: diff,
            });
          } else {
            const expectedNames = sortedUnique(expected.options.map(normalizeOptionName));
            const actualNames = inspection.names.map(normalizeOptionName);
            const actualSet = new Set(actualNames);
            const missingOptions = expectedNames.filter((name) => !actualSet.has(name));
            if (missingOptions.length > 0) {
              optionPatches.push({
                table: state,
                field: actual,
                expected,
                missing_options: missingOptions,
              });
              optionDiffs.push({
                ...diff,
                classification: 'MISSING_EXPECTED_OPTIONS',
                action: 'ADD_MISSING_OPTIONS',
              });
            } else {
              optionDiffs.push(diff);
            }
          }
        } else {
          const actualOptions = fieldOptions(actual);
          if (!actualOptions || !sameOptions(expected.options, actualOptions)) {
            const strictDiff = optionDiff(
              state.definition.name,
              expected.field_name,
              expected.options,
              actualOptions ?? inspectOptions(actual).names,
              'STRICT_EXACT_MISMATCH',
              'BLOCK',
            );
            optionDiffs.push(strictDiff);
            conflicts.push({
              table: state.definition.name,
              field: expected.field_name,
              reason: 'FIELD_OPTIONS_MISMATCH',
              expected_type: expected.type,
              actual_type: actual.type,
              message: `Existing select options for ${expected.field_name} differ from the target contract`,
              option_diff: strictDiff,
            });
          }
        }
      }
    }
  }
  return { plannedFields, optionPatches, optionDiffs };
}

function optionPatchConflicts(
  patches: PlannedOptionPatch[],
): SchemaConflict[] {
  return patches.map((patch) => {
    const diff = optionDiff(
      patch.table.definition.name,
      patch.expected.field_name,
      patch.expected.options ?? [],
      inspectOptions(patch.field).names,
      'MISSING_EXPECTED_OPTIONS',
      'ADD_MISSING_OPTIONS',
    );
    return {
      table: patch.table.definition.name,
      field: patch.expected.field_name,
      reason: 'FIELD_OPTIONS_MISMATCH',
      expected_type: patch.expected.type,
      actual_type: patch.field.type,
      message: `Schema option patch readback is still missing expected options for ${patch.expected.field_name}`,
      option_diff: diff,
    };
  });
}

function optionPatchInput(
  field: BaseField,
  missingOptions: readonly string[],
): CreateFieldInput {
  const property = field.property && typeof field.property === 'object'
    ? field.property as Record<string, unknown>
    : {};
  const existingOptions = Array.isArray(property.options) ? [...property.options] : [];
  return {
    field_name: field.field_name,
    type: field.type,
    property: {
      ...property,
      options: [
        ...existingOptions,
        ...missingOptions.map((name) => ({ name })),
      ],
    },
    ...(typeof field.description === 'string' ? { description: field.description } : {}),
  };
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
  options: BootstrapTargetSchemaOptions = {},
): Promise<SchemaDiffResult> {
  if (!targetToken.trim()) throw new Error('bootstrapTargetSchema requires targetToken');

  const before = await readTableStates(client, targetToken);
  const validation = validateFields(before.states, before.conflicts);
  if (before.conflicts.length > 0) {
    return emptyResult(
      'SCHEMA_CONFLICT',
      before.conflicts,
      before.fingerprint,
      validation.optionDiffs,
    );
  }

  const missingTables = before.states.filter((state) => !state.table && !state.definition.existing);
  if (
    options.dry_run &&
    (missingTables.length > 0 || validation.plannedFields.length > 0 || validation.optionPatches.length > 0)
  ) {
    return {
      status: 'SCHEMA_PATCH_REQUIRED',
      created_tables: [],
      added_fields: [],
      added_options: [],
      option_diffs: validation.optionDiffs,
      conflicts: [],
      writes: 0,
      schema_fingerprint: before.fingerprint,
    };
  }

  const createdTables: string[] = [];
  const addedFields: AddedSchemaField[] = [];
  const addedOptions: AddedSchemaOptions[] = [];
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
    ...validation.plannedFields,
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

  for (const patch of validation.optionPatches) {
    if (!patch.table.table) continue;
    await client.updateField(
      targetToken,
      patch.table.table.table_id,
      patch.field.field_id,
      optionPatchInput(patch.field, patch.missing_options),
    );
    addedOptions.push({
      table: patch.table.definition.name,
      field: patch.expected.field_name,
      options: [...patch.missing_options],
    });
    writes += 1;
  }

  const after = await readTableStates(client, targetToken);
  const afterValidation = validateFields(after.states, after.conflicts);
  const readbackConflicts = [
    ...after.conflicts,
    ...optionPatchConflicts(afterValidation.optionPatches),
  ];
  if (readbackConflicts.length > 0) {
    return {
      status: 'SCHEMA_CONFLICT',
      created_tables: createdTables,
      added_fields: addedFields,
      added_options: addedOptions,
      option_diffs: afterValidation.optionDiffs,
      conflicts: readbackConflicts,
      writes,
      schema_fingerprint: after.fingerprint,
    };
  }

  return {
    status:
      createdTables.length > 0 || addedFields.length > 0 || addedOptions.length > 0
        ? createdTables.length > 0
          ? 'CREATED'
          : 'UPDATED'
        : 'NOOP',
    created_tables: createdTables,
    added_fields: addedFields,
    added_options: addedOptions,
    option_diffs: afterValidation.optionDiffs,
    conflicts: [],
    writes,
    schema_fingerprint: after.fingerprint,
  };
}

export async function getTargetSchemaFingerprint(
  client: SchemaBootstrapClient,
  targetToken: string,
): Promise<string> {
  const result = await readTableStates(client, targetToken);
  const validation = validateFields(result.states, result.conflicts);
  if (result.conflicts.length > 0 || validation.optionPatches.length > 0) {
    const conflicts = [
      ...result.conflicts,
      ...optionPatchConflicts(validation.optionPatches),
    ];
    throw new Error(
      `SCHEMA_CONFLICT: ${conflicts.map((conflict) => conflict.message).join('; ')}`,
    );
  }
  return result.fingerprint;
}

export { TARGET_SCHEMA } from './target-schema.js';
