import { describe, expect, it } from 'vitest';
import {
  assertTargetAllowlist,
  discoverDriveSourceInventory,
  DriveInventoryError,
} from '../src/drive-inventory.js';
import {
  FeishuAuthorizationError,
  type DriveFilesPage,
  type FeishuClient,
} from '../src/feishu-client.js';
import type { FeishuMigrationConfig } from '../src/config.js';

function config(overrides: Partial<FeishuMigrationConfig> = {}): FeishuMigrationConfig {
  return {
    appId: 'app-fixture',
    appSecret: 'rotated-secret-fixture',
    sourceDriveFolderToken: 'folder-source',
    targetBaseToken: 'base-target',
    sourceSheets: [],
    ...overrides,
  };
}

function clientFromPages(
  pages: Record<string, DriveFilesPage>,
): FeishuClient {
  return {
    listDriveFiles: async (folderToken: string, pageToken?: string) => {
      const key = `${folderToken}|${pageToken ?? ''}`;
      const page = pages[key];
      if (!page) throw new Error(`missing fixture page ${key}`);
      return page;
    },
  } as unknown as FeishuClient;
}

function baseAndEightWorkbookPages(): Record<string, DriveFilesPage> {
  return {
    'folder-source|': {
      files: [
        { token: 'folder-nested', type: 'folder', name: 'Nested Sources' },
        { token: 'base-legacy', type: 'bitable', name: 'Legacy Base' },
        ...Array.from({ length: 4 }, (_, index) => ({
          token: `sheet-${index + 1}`,
          type: 'sheet',
          name: `Workbook ${index + 1}`,
        })),
      ],
      has_more: true,
      next_page_token: 'root-next',
    },
    'folder-source|root-next': {
      files: [],
      has_more: false,
    },
    'folder-nested|': {
      files: Array.from({ length: 4 }, (_, index) => ({
        token: `sheet-${index + 5}`,
        type: index === 0 ? 'unknown' : 'sheet',
        name: `Workbook ${index + 5}`,
        url: index === 0 ? 'https://tenant.feishu.cn/sheets/sheet-5' : undefined,
      })),
      has_more: false,
    },
  };
}

describe('Drive-backed source inventory', () => {
  it('recursively discovers exactly one legacy Base and eight workbooks', async () => {
    const result = await discoverDriveSourceInventory({
      client: clientFromPages(baseAndEightWorkbookPages()),
      config: config(),
    });

    expect(result.legacyBase.name).toBe('Legacy Base');
    expect(result.sourceSheets).toHaveLength(8);
    expect(result.report.verdict).toBe('PASS');
    expect(result.report.legacy_base_candidates).toMatchObject({ count: 1 });
    expect(result.report.source_workbook_candidates).toMatchObject({ count: 8 });
    const reportText = JSON.stringify(result.report);
    expect(reportText).not.toContain('base-legacy');
    expect(reportText).not.toContain('sheet-1');
    expect(reportText).not.toContain('https://');
  });

  it('excludes the allowlisted target Base from legacy candidates using its canonical URL token', async () => {
    const pages = baseAndEightWorkbookPages();
    pages['folder-source|'].files.unshift({
      token: 'target-shortcut',
      type: 'shortcut',
      name: 'New Target Base',
      url: 'https://tenant.feishu.cn/base/base-target?table=tbl-target',
    });

    const result = await discoverDriveSourceInventory({
      client: clientFromPages(pages),
      config: config({ targetBaseToken: 'base-target' }),
    });

    expect(result.legacyBase.token).toBe('base-legacy');
    expect(result.report.legacy_base_candidates).toMatchObject({ count: 1 });
  });

  it('preserves eight explicit Sheet override keys after discovery', async () => {
    const sourceSheets = Array.from({ length: 8 }, (_, index) => ({
      key: `OVERRIDE_${index + 1}`,
      token: `sheet-${index + 1}`,
    }));

    const result = await discoverDriveSourceInventory({
      client: clientFromPages(baseAndEightWorkbookPages()),
      config: config({ sourceBaseToken: 'base-legacy', sourceSheets }),
    });

    expect(result.sourceSheets).toEqual(sourceSheets);
  });

  it('stops on zero or multiple legacy Base candidates', async () => {
    const zeroBase = baseAndEightWorkbookPages();
    zeroBase['folder-source|'].files = zeroBase['folder-source|'].files
      .filter((file) => file.type !== 'bitable');
    await expect(discoverDriveSourceInventory({
      client: clientFromPages(zeroBase),
      config: config(),
    })).rejects.toMatchObject({ code: 'SOURCE_BASE_CANDIDATE_COUNT' });

    const multipleBase = baseAndEightWorkbookPages();
    multipleBase['folder-source|'].files.push({
      token: 'base-legacy-2',
      type: 'unknown',
      name: 'Legacy Base Copy',
      url: 'https://tenant.feishu.cn/base/base-legacy-2',
    });
    await expect(discoverDriveSourceInventory({
      client: clientFromPages(multipleBase),
      config: config(),
    })).rejects.toMatchObject({ code: 'SOURCE_BASE_CANDIDATE_COUNT' });
  });

  it('stops on an unexpected workbook count', async () => {
    const pages = baseAndEightWorkbookPages();
    pages['folder-nested|'].files = pages['folder-nested|'].files.slice(0, 3);

    await expect(discoverDriveSourceInventory({
      client: clientFromPages(pages),
      config: config(),
    })).rejects.toMatchObject({ code: 'SOURCE_WORKBOOK_COUNT' });
  });

  it('stops after bounded retries when pagination omits its continuation token', async () => {
    let attempts = 0;
    const client = {
      listDriveFiles: async () => {
        attempts += 1;
        return {
          files: [],
          has_more: true,
        };
      },
    } as unknown as FeishuClient;

    await expect(discoverDriveSourceInventory({ client, config: config() }))
      .rejects.toMatchObject({ code: 'DRIVE_PAGINATION_BLOCKED' });
    expect(attempts).toBe(3);
  });

  it('maps permission denial to a safe authorization blocker', async () => {
    const client = {
      listDriveFiles: async () => {
        throw new FeishuAuthorizationError({ status: 403, code: 91403 });
      },
    } as unknown as FeishuClient;

    const error = await discoverDriveSourceInventory({ client, config: config() })
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(DriveInventoryError);
    expect(error).toMatchObject({
      code: 'AUTHORIZATION_BLOCKED',
      report: {
        required_scope: 'drive:drive.metadata:readonly',
        identity: 'bot-tenant-access-token',
      },
    });
    expect((error as Error).message).not.toContain('folder-source');
  });

  it('requires the configured target token to match the optional target URL', () => {
    expect(() => assertTargetAllowlist(config({
      targetBaseUrl: 'https://tenant.feishu.cn/base/other-target?table=tbl',
    }))).toThrow('TARGET_ALLOWLIST_MISMATCH');

    expect(() => assertTargetAllowlist(config({
      targetBaseUrl: 'https://tenant.feishu.cn/base/base-target?table=tbl',
    }))).not.toThrow();
  });
});
