import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadFeishuMigrationConfig } from '../src/config.js';
import { FeishuClient, type FeishuRequest } from '../src/feishu-client.js';
import { readBaseSource } from '../src/base-reader.js';
import { readSpreadsheetSource } from '../src/sheet-reader.js';
import { discoverSourceInventory } from '../src/inventory.js';
import { discoverSourceInventory as publicDiscoverSourceInventory } from '@busos/feishu-migration/inventory';

interface RecordedCall {
  method: string;
  url: URL;
}

function json(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if ('url' in input) return input.url;
  return input.toString();
}

function makePagedTransport() {
  const calls: RecordedCall[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(requestUrl(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ method, url });

    if (url.pathname.endsWith('/auth/v3/tenant_access_token/internal')) {
      return json({
        code: 0,
        msg: 'ok',
        tenant_access_token: 'memory-token',
        expire: 7200,
      });
    }

    if (url.pathname.endsWith('/apps/base-source/tables')) {
      return url.searchParams.get('page_token')
        ? json({
            code: 0,
            msg: 'ok',
            data: {
              items: [{ table_id: 'tbl-2', name: 'Archive' }],
              has_more: false,
            },
          })
        : json({
            code: 0,
            msg: 'ok',
            data: {
              items: [{ table_id: 'tbl-1', name: 'Projects' }],
              has_more: true,
              page_token: 'tables-next',
            },
          });
    }

    if (url.pathname.endsWith('/tables/tbl-1/fields')) {
      return url.searchParams.get('page_token')
        ? json({
            code: 0,
            msg: 'ok',
            data: {
              items: [{ field_id: 'fld-date', field_name: 'When', type: 5 }],
              has_more: false,
            },
          })
        : json({
            code: 0,
            msg: 'ok',
            data: {
              items: [{ field_id: 'fld-link', field_name: 'Link', type: 15 }],
              has_more: true,
              page_token: 'fields-next',
            },
          });
    }

    if (url.pathname.endsWith('/tables/tbl-1/records')) {
      return url.searchParams.get('page_token')
        ? json({
            code: 0,
            msg: 'ok',
            data: {
              items: [
                {
                  record_id: 'rec-2',
                  fields: { When: 1_704_067_200_000 },
                },
              ],
              has_more: false,
            },
          })
        : json({
            code: 0,
            msg: 'ok',
            data: {
              items: [
                {
                  record_id: 'rec-1',
                  fields: {
                    Link: { link: 'https://example.test/source', text: 'Source' },
                  },
                },
              ],
              has_more: true,
              page_token: 'records-next',
            },
          });
    }

    if (
      url.pathname.endsWith('/tables/tbl-2/fields') ||
      url.pathname.endsWith('/tables/tbl-2/records')
    ) {
      return json({
        code: 0,
        msg: 'ok',
        data: { items: [], has_more: false },
      });
    }

    if (url.pathname.endsWith('/spreadsheets/sheet-source/sheets/query')) {
      return url.searchParams.get('page_token')
        ? json({
            code: 0,
            msg: 'ok',
            data: {
              sheets: [
                {
                  sheet_id: 'sheet-2',
                  title: 'Empty',
                  grid_properties: { row_count: 0, column_count: 0 },
                },
              ],
              has_more: false,
            },
          })
        : json({
            code: 0,
            msg: 'ok',
            data: {
              sheets: [
                {
                  sheet_id: 'sheet-1',
                  title: 'Legacy Data',
                  grid_properties: { row_count: 4, column_count: 3 },
                },
              ],
              has_more: true,
              page_token: 'sheets-next',
            },
          });
    }

    const valuesPrefix = '/open-apis/sheets/v2/spreadsheets/sheet-source/values/';
    if (url.pathname.startsWith(valuesPrefix)) {
      const range = decodeURIComponent(url.pathname.slice(valuesPrefix.length));
      if (range === 'sheet-1!A1:C2') {
        return json({
          code: 0,
          msg: 'ok',
          data: {
            valueRange: {
              range,
              values: [
                [
                  'Header',
                  { type: 'image', fileToken: 'image-token-1' },
                  { type: 'datetime', value: 1_704_067_200_000 },
                ],
                [null, ''],
              ],
            },
          },
        });
      }
      if (range === 'sheet-1!A3:C4') {
        return json({
          code: 0,
          msg: 'ok',
          data: {
            valueRange: {
              range,
              values: [[null, 'tail']],
            },
          },
        });
      }
    }

    return json({ code: 404, msg: 'fixture route missing' }, 404);
  };

  return { calls, fetchImpl };
}

function makeClient(fetchImpl: typeof fetch, sleep?: FeishuRequest['sleep']) {
  return new FeishuClient({
    appId: 'test-app',
    appSecret: 'test-secret',
    baseUrl: 'https://feishu.test',
    fetchImpl,
    sleep,
    maxRetries: 2,
    baseBackoffMs: 10,
  });
}

describe('migration configuration', () => {
  it('loads exactly eight named source Sheet tokens without reading process.env', () => {
    const env: NodeJS.ProcessEnv = {
      FEISHU_APP_ID: 'app',
      FEISHU_APP_SECRET: 'secret',
      FEISHU_SOURCE_BASE_TOKEN: 'source-base',
      FEISHU_TARGET_BASE_TOKEN: 'target-base',
      FEISHU_SOURCE_SHEET_ALPHA_TOKEN: 'sheet-a',
      FEISHU_SOURCE_SHEET_BRAVO_TOKEN: 'sheet-b',
      FEISHU_SOURCE_SHEET_CHARLIE_TOKEN: 'sheet-c',
      FEISHU_SOURCE_SHEET_DELTA_TOKEN: 'sheet-d',
      FEISHU_SOURCE_SHEET_ECHO_TOKEN: 'sheet-e',
      FEISHU_SOURCE_SHEET_FOXTROT_TOKEN: 'sheet-f',
      FEISHU_SOURCE_SHEET_GOLF_TOKEN: 'sheet-g',
      FEISHU_SOURCE_SHEET_HOTEL_TOKEN: 'sheet-h',
    };

    const config = loadFeishuMigrationConfig(env);

    expect(config.sourceSheets).toHaveLength(8);
    expect(config.sourceSheets[0]).toEqual({ key: 'ALPHA', token: 'sheet-a' });
    expect(config.sourceSheets[7]).toEqual({ key: 'HOTEL', token: 'sheet-h' });
  });

  it('reports missing variable names without exposing configured values', () => {
    const load = () =>
      loadFeishuMigrationConfig({
        FEISHU_APP_ID: 'private-app-id',
        FEISHU_APP_SECRET: 'private-secret',
      });
    expect(load).toThrow(/FEISHU_SOURCE_BASE_TOKEN/);
    expect(load).not.toThrow(/private-secret/);
  });
});

describe('FeishuClient read-only transport', () => {
  it('is guarded as a Node-only module', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../src/feishu-client.ts', import.meta.url)),
      'utf8',
    );
    expect(source).toContain("from 'node:timers/promises'");
    expect(source).toContain("'window' in globalThis");
  });

  it('caches auth in memory and fully paginates every read collection', async () => {
    const fixture = makePagedTransport();
    const client = makeClient(fixture.fetchImpl);

    const tables = await client.listAllTables('base-source');
    const fields = await client.listAllFields('base-source', 'tbl-1');
    const records = await client.listAllRecords('base-source', 'tbl-1');
    const sheets = await client.listSheets('sheet-source');
    const values = await client.readSheetRange('sheet-source', 'sheet-1!A1:C2');

    expect(tables.map((item) => item.table_id)).toEqual(['tbl-1', 'tbl-2']);
    expect(fields.map((item) => item.field_id)).toEqual(['fld-link', 'fld-date']);
    expect(records.map((item) => item.record_id)).toEqual(['rec-1', 'rec-2']);
    expect(sheets.map((item) => item.sheet_id)).toEqual(['sheet-1', 'sheet-2']);
    expect(values).toHaveLength(2);
    expect(
      fixture.calls.filter((call) =>
        call.url.pathname.endsWith('/auth/v3/tenant_access_token/internal'),
      ),
    ).toHaveLength(1);

    const dataCalls = fixture.calls.filter(
      (call) => !call.url.pathname.includes('/auth/'),
    );
    expect(dataCalls.every((call) => call.method === 'GET')).toBe(true);
    expect(dataCalls.some((call) => /create|update|delete/i.test(call.url.pathname))).toBe(
      false,
    );
    expect(dataCalls.some((call) => ['PUT', 'PATCH', 'DELETE'].includes(call.method))).toBe(
      false,
    );
  });

  it('retries HTTP 429 and Feishu 1254291 with bounded exponential backoff', async () => {
    let tableAttempts = 0;
    const delays: number[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(requestUrl(input));
      if (url.pathname.includes('/auth/')) {
        return json({ code: 0, tenant_access_token: 'token', expire: 7200 });
      }
      tableAttempts += 1;
      if (tableAttempts === 1) return json({ code: 0 }, 429);
      if (tableAttempts === 2) return json({ code: 1254291, msg: 'rate limited' });
      return json({ code: 0, data: { items: [], has_more: false } });
    };
    const client = makeClient(fetchImpl, async (delay) => {
      delays.push(delay);
    });

    await expect(client.listAllTables('base-source')).resolves.toEqual([]);
    expect(tableAttempts).toBe(3);
    expect(delays).toEqual([10, 20]);
  });

  it('throws bounded credential errors without response messages or bodies', async () => {
    const fetchImpl: typeof fetch = async () =>
      json(
        {
          code: 99991663,
          msg: 'credential response body must stay private',
          tenant_access_token: 'must-not-leak',
        },
        401,
      );
    const client = makeClient(fetchImpl);

    const error = await client.listAllTables('base-source').catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/credential/i);
    expect((error as Error).message).not.toMatch(/response body|must-not-leak/);
  });
});

describe('source readers', () => {
  it('exports source discovery through the server-only package subpath', () => {
    expect(publicDiscoverSourceInventory).toBe(discoverSourceInventory);
  });

  it('normalizes Base hyperlinks and DateTime epochs after full pagination', async () => {
    const fixture = makePagedTransport();
    const source = await readBaseSource(makeClient(fixture.fetchImpl), 'base-source');
    const projects = source.tables[0];

    expect(source.tables.map((table) => table.table.table_id)).toEqual([
      'tbl-1',
      'tbl-2',
    ]);
    expect(projects.fields).toHaveLength(2);
    expect(projects.records[0].fields.Link).toEqual({
      type: 'hyperlink',
      text: 'Source',
      url: 'https://example.test/source',
    });
    expect(projects.records[1].fields.When).toBe('2024-01-01T00:00:00.000Z');
  });

  it('reads every physical column/window and preserves internal empty rows', async () => {
    const fixture = makePagedTransport();
    const source = await readSpreadsheetSource(
      makeClient(fixture.fetchImpl),
      'sheet-source',
      { rowWindowSize: 2 },
    );

    expect(source.sheets[0].rows).toEqual([
      [
        'Header',
        { type: 'image', file_token: 'image-token-1' },
        '2024-01-01T00:00:00.000Z',
      ],
      [],
      [null, 'tail'],
    ]);
    expect(source.sheets[1].rows).toEqual([]);

    const ranges = fixture.calls
      .filter((call) => call.url.pathname.includes('/values/'))
      .map((call) => decodeURIComponent(call.url.pathname.split('/values/')[1]));
    expect(ranges).toEqual(['sheet-1!A1:C2', 'sheet-1!A3:C4']);
  });

  it('preserves bare large numeric cells instead of guessing they are dates', async () => {
    const client = {
      listSheets: async () => [
        {
          sheet_id: 'sheet-ids',
          title: 'IDs',
          grid_properties: { row_count: 1, column_count: 1 },
        },
      ],
      readSheetRange: async () => [[1_704_067_200_000]],
    } as unknown as FeishuClient;

    const source = await readSpreadsheetSource(client, 'sheet-source');

    expect(source.sheets[0].rows).toEqual([[1_704_067_200_000]]);
  });

  it('discovers the Base and all eight configured Sheet sources', async () => {
    const sheetTokens: string[] = [];
    const client = {
      listAllTables: async () => [],
      listAllFields: async () => [],
      listAllRecords: async () => [],
      listSheets: async (token: string) => {
        sheetTokens.push(token);
        return [];
      },
      readSheetRange: async () => [],
    } as unknown as FeishuClient;
    const sourceSheets = Array.from({ length: 8 }, (_, index) => ({
      key: `SOURCE_${index + 1}`,
      token: `sheet-${index + 1}`,
    }));

    const inventory = await discoverSourceInventory({
      config: {
        appId: 'app',
        appSecret: 'secret',
        sourceBaseToken: 'source-base',
        targetBaseToken: 'target-base',
        sourceSheets,
      },
      client,
    });

    expect(inventory.base.tables).toEqual([]);
    expect(inventory.spreadsheets.map((sheet) => sheet.key)).toEqual(
      sourceSheets.map((sheet) => sheet.key),
    );
    expect(sheetTokens).toEqual(sourceSheets.map((sheet) => sheet.token));
  });
});
