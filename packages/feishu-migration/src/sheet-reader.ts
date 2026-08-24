import type { FeishuClient, SheetMetadata } from './feishu-client.js';

export interface SpreadsheetSheetInventory {
  sheet: SheetMetadata;
  rows: unknown[][];
}

export interface SpreadsheetSourceInventory {
  sheets: SpreadsheetSheetInventory[];
}

export interface SheetReadOptions {
  rowWindowSize?: number;
}

function columnName(columnCount: number): string {
  let value = columnCount;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function normalizeEpoch(value: number): string | number {
  if (!Number.isFinite(value)) return value;
  if (value < 1_000_000_000) return value;
  const milliseconds = value >= 1_000_000_000_000 ? value : value * 1000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.valueOf()) ? value : date.toISOString();
}

function normalizeCell(value: unknown): unknown {
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return value.map(normalizeCell);
  if (!value || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  if (record.type === 'datetime' || record.type === 'date') {
    const rawEpoch = record.value ?? record.timestamp ?? record.epoch;
    if (typeof rawEpoch === 'number') return normalizeEpoch(rawEpoch);
  }
  const fileToken = record.file_token ?? record.fileToken;
  if (record.type === 'image' && typeof fileToken === 'string') {
    return { type: 'image', file_token: fileToken };
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [key, normalizeCell(entry)]),
  );
}

function normalizeRow(row: unknown[] | undefined): unknown[] {
  const normalized = (row ?? []).map(normalizeCell);
  while (
    normalized.length > 0 &&
    (normalized.at(-1) === null || normalized.at(-1) === undefined || normalized.at(-1) === '')
  ) {
    normalized.pop();
  }
  return normalized;
}

function isEmptyRow(row: unknown[]): boolean {
  return row.length === 0;
}

async function readSheet(
  client: FeishuClient,
  spreadsheetToken: string,
  sheet: SheetMetadata,
  rowWindowSize: number,
): Promise<SpreadsheetSheetInventory> {
  const rowCount = Math.max(0, sheet.grid_properties?.row_count ?? 0);
  const columnCount = Math.max(0, sheet.grid_properties?.column_count ?? 0);
  if (rowCount === 0 || columnCount === 0) return { sheet, rows: [] };

  const rows: unknown[][] = [];
  const lastColumn = columnName(columnCount);
  for (let startRow = 1; startRow <= rowCount; startRow += rowWindowSize) {
    const endRow = Math.min(rowCount, startRow + rowWindowSize - 1);
    const values = await client.readSheetRange(
      spreadsheetToken,
      `${sheet.sheet_id}!A${startRow}:${lastColumn}${endRow}`,
    );
    const expectedRows = endRow - startRow + 1;
    for (let offset = 0; offset < expectedRows; offset += 1) {
      rows.push(normalizeRow(values[offset]));
    }
  }

  while (rows.length > 0 && isEmptyRow(rows.at(-1)!)) rows.pop();
  return { sheet, rows };
}

export async function readSpreadsheetSource(
  client: FeishuClient,
  spreadsheetToken: string,
  options: SheetReadOptions = {},
): Promise<SpreadsheetSourceInventory> {
  const rowWindowSize = options.rowWindowSize ?? 500;
  if (!Number.isInteger(rowWindowSize) || rowWindowSize <= 0) {
    throw new Error('rowWindowSize must be a positive integer');
  }
  const sheets = await client.listSheets(spreadsheetToken);
  const inventory: SpreadsheetSheetInventory[] = [];
  for (const sheet of sheets) {
    inventory.push(await readSheet(client, spreadsheetToken, sheet, rowWindowSize));
  }
  return { sheets: inventory };
}
