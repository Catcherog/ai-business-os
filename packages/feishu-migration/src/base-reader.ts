import type {
  BaseField,
  BaseRecord,
  BaseTable,
  FeishuClient,
} from './feishu-client.js';

export interface BaseTableInventory {
  table: BaseTable;
  fields: BaseField[];
  records: BaseRecord[];
}

export interface BaseSourceInventory {
  tables: BaseTableInventory[];
}

function toIsoDatetime(value: unknown): unknown {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  const milliseconds = value >= 1_000_000_000_000 ? value : value * 1000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.valueOf()) ? value : date.toISOString();
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (!value || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  if (typeof record.link === 'string') {
    return {
      type: 'hyperlink',
      text: typeof record.text === 'string' ? record.text : record.link,
      url: record.link,
    };
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [key, normalizeValue(entry)]),
  );
}

function normalizeRecord(record: BaseRecord, fields: BaseField[]): BaseRecord {
  const dateFields = new Set(
    fields
      .filter((field) => field.type === 5)
      .map((field) => field.field_name),
  );
  return {
    ...record,
    fields: Object.fromEntries(
      Object.entries(record.fields ?? {}).map(([name, value]) => [
        name,
        dateFields.has(name) ? toIsoDatetime(value) : normalizeValue(value),
      ]),
    ),
  };
}

export async function readBaseSource(
  client: FeishuClient,
  appToken: string,
): Promise<BaseSourceInventory> {
  const tables = await client.listAllTables(appToken);
  const inventory: BaseTableInventory[] = [];

  for (const table of tables) {
    const [fields, records] = await Promise.all([
      client.listAllFields(appToken, table.table_id),
      client.listAllRecords(appToken, table.table_id),
    ]);
    inventory.push({
      table,
      fields,
      records: records.map((record) => normalizeRecord(record, fields)),
    });
  }

  return { tables: inventory };
}
