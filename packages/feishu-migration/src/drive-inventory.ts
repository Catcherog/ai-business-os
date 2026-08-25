import {
  normalizeFeishuResourceToken,
  type FeishuMigrationConfig,
  type SourceSheetConfig,
} from './config.js';
import {
  FeishuAuthorizationError,
  type DriveFile,
  type FeishuClient,
} from './feishu-client.js';

export const EXPECTED_SOURCE_WORKBOOK_COUNT = 8;

export type DriveInventoryBlockerCode =
  | 'CONFIGURATION_BLOCKED'
  | 'AUTHORIZATION_BLOCKED'
  | 'DRIVE_PAGINATION_BLOCKED'
  | 'DRIVE_READ_BLOCKED'
  | 'SOURCE_BASE_CANDIDATE_COUNT'
  | 'SOURCE_WORKBOOK_COUNT'
  | 'SOURCE_OVERRIDE_MISMATCH'
  | 'TARGET_IDENTITY_BLOCKED'
  | 'TARGET_ALLOWLIST_MISMATCH';

export interface DriveCandidateSummary {
  name: string;
  type: string;
}

export interface DriveInventoryReport {
  verdict: 'PASS' | 'BLOCKED';
  source_mode: 'DRIVE_DISCOVERY' | 'EXPLICIT_OVERRIDE';
  resources_discovered: number;
  folders_discovered: number;
  expected_source_workbooks: number;
  legacy_base_candidates: {
    count: number;
    candidates: DriveCandidateSummary[];
  };
  source_workbook_candidates: {
    count: number;
    candidates: DriveCandidateSummary[];
  };
  resolved_source_workbooks?: number;
  required_scope?: string;
  identity?: string;
  blocker?: DriveInventoryBlockerCode;
}

export interface ResolvedFeishuMigrationConfig extends FeishuMigrationConfig {
  sourceBaseToken: string;
  sourceSheets: SourceSheetConfig[];
}

export interface DriveSourceInventory {
  config: ResolvedFeishuMigrationConfig;
  sourceResources: DriveFile[];
  legacyBase: DriveFile;
  sourceSheets: SourceSheetConfig[];
  report: DriveInventoryReport;
}

export interface DriveSourceInventoryOptions {
  client: FeishuClient;
  config: FeishuMigrationConfig;
  maxPaginationRetries?: number;
}

export class DriveInventoryError extends Error {
  readonly code: DriveInventoryBlockerCode;
  readonly report: DriveInventoryReport;

  constructor(code: DriveInventoryBlockerCode, report: DriveInventoryReport) {
    super(code);
    this.name = 'DriveInventoryError';
    this.code = code;
    this.report = report;
  }
}

function safeCandidateName(name: string): string {
  return name
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/https?:\/\/\S+/giu, '[REDACTED_URL]')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 120);
}

function candidateSummary(file: DriveFile): DriveCandidateSummary {
  return {
    name: safeCandidateName(file.name),
    type: file.type.trim().toLowerCase() || 'unknown',
  };
}

function normalizedResourceKind(file: DriveFile): 'folder' | 'base' | 'workbook' | 'other' {
  const type = file.type.trim().toLowerCase();
  if (type === 'folder') return 'folder';
  if (type === 'bitable' || type === 'base') return 'base';
  if (type === 'sheet' || type === 'spreadsheet') return 'workbook';

  const url = file.url?.trim();
  if (url) {
    try {
      const segments = new URL(url).pathname.split('/').filter(Boolean).map((segment) => segment.toLowerCase());
      if (segments.includes('base')) return 'base';
      if (segments.includes('sheets') || segments.includes('spreadsheet')) return 'workbook';
      if (segments.includes('folder')) return 'folder';
    } catch {
      return 'other';
    }
  }
  return 'other';
}

function emptyReport(): DriveInventoryReport {
  return {
    verdict: 'BLOCKED',
    source_mode: 'DRIVE_DISCOVERY',
    resources_discovered: 0,
    folders_discovered: 0,
    expected_source_workbooks: EXPECTED_SOURCE_WORKBOOK_COUNT,
    legacy_base_candidates: { count: 0, candidates: [] },
    source_workbook_candidates: { count: 0, candidates: [] },
  };
}

function reportFor(
  resources: DriveFile[],
  folders: number,
  baseCandidates: DriveFile[],
  workbookCandidates: DriveFile[],
): DriveInventoryReport {
  return {
    verdict: 'BLOCKED',
    source_mode: 'DRIVE_DISCOVERY',
    resources_discovered: resources.length,
    folders_discovered: folders,
    expected_source_workbooks: EXPECTED_SOURCE_WORKBOOK_COUNT,
    legacy_base_candidates: {
      count: baseCandidates.length,
      candidates: baseCandidates.map(candidateSummary),
    },
    source_workbook_candidates: {
      count: workbookCandidates.length,
      candidates: workbookCandidates.map(candidateSummary),
    },
  };
}

function sourceWorkbookKey(file: DriveFile, index: number): string {
  const name = file.name.toLowerCase();
  const aliases: Array<[RegExp, string]> = [
    [/客户|customer/u, 'CUSTOMERS'],
    [/项目|project/u, 'PROJECTS'],
    [/资源|模特|化妆|摄影|场地|resource/u, 'RESOURCES'],
    [/档期|可用|availability/u, 'AVAILABILITY'],
    [/内容|研究|小红书|笔记|content/u, 'CONTENT'],
    [/脚本|话术|沟通|script/u, 'SCRIPTS'],
    [/知识|SOP|knowledge/iu, 'KNOWLEDGE'],
    [/媒体|素材|资产|media/u, 'MEDIA'],
  ];
  return aliases.find(([pattern]) => pattern.test(name))?.[1]
    ?? `WORKBOOK_${String(index + 1).padStart(2, '0')}`;
}

function resolvedConfig(
  config: FeishuMigrationConfig,
  sourceBaseToken: string,
  sourceSheets: SourceSheetConfig[],
): ResolvedFeishuMigrationConfig {
  return {
    ...config,
    sourceBaseToken,
    sourceSheets,
  };
}

function blocker(
  code: DriveInventoryBlockerCode,
  report: DriveInventoryReport,
): DriveInventoryError {
  report.blocker = code;
  return new DriveInventoryError(code, report);
}

async function collectDriveResources(
  client: FeishuClient,
  rootFolderToken: string,
  maxPaginationRetries: number,
): Promise<{ resources: DriveFile[]; folders: number }> {
  const queue: Array<{ folderToken: string; pageToken?: string }> = [
    { folderToken: rootFolderToken },
  ];
  const visitedPages = new Set<string>();
  const seenResources = new Set<string>();
  const queuedFolders = new Set<string>([rootFolderToken]);
  const resources: DriveFile[] = [];
  let folders = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    let pageToken = current.pageToken;
    let missingContinuationAttempts = 0;

    while (true) {
      const pageKey = `${current.folderToken}|${pageToken ?? ''}`;
      if (visitedPages.has(pageKey)) {
        throw blocker('DRIVE_PAGINATION_BLOCKED', {
          ...emptyReport(),
          blocker: 'DRIVE_PAGINATION_BLOCKED',
        });
      }

      let page;
      try {
        page = await client.listDriveFiles(current.folderToken, pageToken);
      } catch (error) {
        if (error instanceof FeishuAuthorizationError) {
          const report = emptyReport();
          report.required_scope = error.missingScopes[0] ?? 'drive:drive.metadata:readonly';
          report.identity = error.identityKind;
          throw blocker('AUTHORIZATION_BLOCKED', report);
        }
        throw blocker('DRIVE_READ_BLOCKED', emptyReport());
      }

      if (page.has_more && !page.next_page_token) {
        missingContinuationAttempts += 1;
        if (missingContinuationAttempts >= maxPaginationRetries) {
          throw blocker('DRIVE_PAGINATION_BLOCKED', emptyReport());
        }
        continue;
      }

      visitedPages.add(pageKey);
      missingContinuationAttempts = 0;
      for (const file of page.files) {
        const resourceKey = `${file.type}:${file.token}`;
        if (seenResources.has(resourceKey)) continue;
        seenResources.add(resourceKey);
        resources.push(file);
        if (normalizedResourceKind(file) === 'folder') {
          folders += 1;
          if (!queuedFolders.has(file.token)) {
            queuedFolders.add(file.token);
            queue.push({ folderToken: file.token });
          }
        }
      }

      if (!page.has_more) break;
      pageToken = page.next_page_token;
    }
  }

  return { resources, folders };
}

export async function discoverDriveSourceInventory(
  options: DriveSourceInventoryOptions,
): Promise<DriveSourceInventory> {
  if (!options.config.sourceDriveFolderToken) {
    throw blocker('DRIVE_READ_BLOCKED', emptyReport());
  }

  const collected = await collectDriveResources(
    options.client,
    options.config.sourceDriveFolderToken,
    options.maxPaginationRetries ?? 3,
  );
  const baseCandidates = collected.resources.filter((file) => normalizedResourceKind(file) === 'base');
  const workbookCandidates = collected.resources.filter((file) => normalizedResourceKind(file) === 'workbook');
  const report = reportFor(collected.resources, collected.folders, baseCandidates, workbookCandidates);

  if (baseCandidates.length !== 1) {
    throw blocker('SOURCE_BASE_CANDIDATE_COUNT', report);
  }
  if (workbookCandidates.length !== EXPECTED_SOURCE_WORKBOOK_COUNT) {
    throw blocker('SOURCE_WORKBOOK_COUNT', report);
  }

  const legacyBase = baseCandidates[0];
  if (options.config.sourceBaseToken && options.config.sourceBaseToken !== legacyBase.token) {
    throw blocker('SOURCE_OVERRIDE_MISMATCH', report);
  }

  const sourceSheets = options.config.sourceSheets.length > 0
    ? options.config.sourceSheets
    : workbookCandidates.map((file, index) => ({
      key: sourceWorkbookKey(file, index),
      token: file.token,
    }));
  const workbookTokens = new Set(workbookCandidates.map((file) => file.token));
  const overrideTokens = new Set(sourceSheets.map((sheet) => sheet.token));
  if (
    sourceSheets.length !== EXPECTED_SOURCE_WORKBOOK_COUNT ||
    overrideTokens.size !== EXPECTED_SOURCE_WORKBOOK_COUNT ||
    [...overrideTokens].some((token) => !workbookTokens.has(token))
  ) {
    throw blocker('SOURCE_OVERRIDE_MISMATCH', report);
  }

  report.verdict = 'PASS';
  report.resolved_source_workbooks = sourceSheets.length;
  return {
    config: resolvedConfig(options.config, legacyBase.token, sourceSheets),
    sourceResources: collected.resources,
    legacyBase,
    sourceSheets,
    report,
  };
}

export function assertTargetAllowlist(config: FeishuMigrationConfig): void {
  if (!config.targetBaseToken) {
    throw new DriveInventoryError('TARGET_ALLOWLIST_MISMATCH', {
      ...emptyReport(),
      blocker: 'TARGET_ALLOWLIST_MISMATCH',
    });
  }
  if (!config.targetBaseUrl) return;
  try {
    const urlToken = normalizeFeishuResourceToken(
      config.targetBaseUrl,
      'base',
      'FEISHU_TARGET_BASE_URL',
    );
    if (urlToken !== config.targetBaseToken) {
      throw new Error('target mismatch');
    }
  } catch {
    throw new DriveInventoryError('TARGET_ALLOWLIST_MISMATCH', {
      ...emptyReport(),
      blocker: 'TARGET_ALLOWLIST_MISMATCH',
    });
  }
}

export function resolveExplicitSourceConfig(config: FeishuMigrationConfig): {
  config: ResolvedFeishuMigrationConfig;
  report: DriveInventoryReport;
} {
  const report: DriveInventoryReport = {
    verdict: 'PASS',
    source_mode: 'EXPLICIT_OVERRIDE',
    resources_discovered: 0,
    folders_discovered: 0,
    expected_source_workbooks: EXPECTED_SOURCE_WORKBOOK_COUNT,
    legacy_base_candidates: {
      count: config.sourceBaseToken ? 1 : 0,
      candidates: config.sourceBaseToken
        ? [{ name: '[EXPLICIT_SOURCE_BASE]', type: 'bitable' }]
        : [],
    },
    source_workbook_candidates: {
      count: config.sourceSheets.length,
      candidates: config.sourceSheets.map((sheet) => ({
        name: `[EXPLICIT_${safeCandidateName(sheet.key)}]`,
        type: 'sheet',
      })),
    },
    resolved_source_workbooks: config.sourceSheets.length,
  };
  if (!config.sourceBaseToken || config.sourceSheets.length !== EXPECTED_SOURCE_WORKBOOK_COUNT) {
    throw blocker('SOURCE_OVERRIDE_MISMATCH', {
      ...report,
      verdict: 'BLOCKED',
      blocker: 'SOURCE_OVERRIDE_MISMATCH',
    });
  }
  assertTargetAllowlist(config);
  return {
    config: resolvedConfig(config, config.sourceBaseToken, config.sourceSheets),
    report,
  };
}
