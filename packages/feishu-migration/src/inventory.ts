import {
  loadFeishuMigrationConfig,
  type FeishuMigrationConfig,
} from './config.js';
import { FeishuClient } from './feishu-client.js';
import { readBaseSource, type BaseSourceInventory } from './base-reader.js';
import {
  readSpreadsheetSource,
  type SpreadsheetSourceInventory,
} from './sheet-reader.js';

export interface NamedSpreadsheetInventory extends SpreadsheetSourceInventory {
  key: string;
}

export interface SourceInventory {
  base: BaseSourceInventory;
  spreadsheets: NamedSpreadsheetInventory[];
}

export interface DiscoveryOptions {
  config?: FeishuMigrationConfig;
  client?: FeishuClient;
  rowWindowSize?: number;
}

export async function discoverSourceInventory(
  options: DiscoveryOptions = {},
): Promise<SourceInventory> {
  const config = options.config ?? loadFeishuMigrationConfig();
  const client =
    options.client ??
    new FeishuClient({ appId: config.appId, appSecret: config.appSecret });
  if (!config.sourceBaseToken) {
    throw new Error('Source inventory requires a resolved source Base token');
  }
  const base = await readBaseSource(client, config.sourceBaseToken);
  const spreadsheets: NamedSpreadsheetInventory[] = [];

  for (const source of config.sourceSheets) {
    const inventory = await readSpreadsheetSource(client, source.token, {
      rowWindowSize: options.rowWindowSize,
    });
    spreadsheets.push({ key: source.key, ...inventory });
  }

  return { base, spreadsheets };
}
