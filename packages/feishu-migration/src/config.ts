export interface SourceSheetConfig {
  key: string;
  token: string;
}

export interface FeishuMigrationConfig {
  appId: string;
  appSecret: string;
  sourceDriveFolderToken?: string;
  sourceBaseToken?: string;
  targetBaseToken: string;
  sourceSheets: SourceSheetConfig[];
  targetBaseUrl?: string;
}

const SOURCE_SHEET_TOKEN = /^FEISHU_SOURCE_SHEET_(.+)_TOKEN$/;

export type FeishuResourceKind = 'drive-folder' | 'base';

function resourcePathToken(value: string, kind: FeishuResourceKind): string | undefined {
  try {
    const url = new URL(value);
    const segments = url.pathname.split('/').filter(Boolean);
    const marker = kind === 'drive-folder' ? ['drive', 'folder'] : ['base'];
    const markerIndex = segments.findIndex((segment, index) =>
      marker.every((expected, offset) => segments[index + offset]?.toLowerCase() === expected),
    );
    const tokenIndex = markerIndex + marker.length;
    return markerIndex >= 0 ? segments[tokenIndex] : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeFeishuResourceToken(
  rawValue: string,
  kind: FeishuResourceKind,
  fieldName: string,
): string {
  const value = rawValue.trim();
  if (!value) throw new Error(`Missing required environment variable: ${fieldName}`);
  if (!/^https?:\/\//iu.test(value)) return value;
  const token = resourcePathToken(value, kind);
  if (!token) throw new Error(`Invalid ${fieldName} resource URL`);
  return token;
}

function requireVariable(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadFeishuMigrationConfig(
  env: NodeJS.ProcessEnv = process.env,
): FeishuMigrationConfig {
  const appId = requireVariable(env, 'FEISHU_APP_ID');
  const appSecret = requireVariable(env, 'FEISHU_APP_SECRET');
  const rawSourceDriveFolderToken = env.FEISHU_SOURCE_DRIVE_FOLDER_TOKEN?.trim();
  const rawSourceBaseToken = env.FEISHU_SOURCE_BASE_TOKEN?.trim();
  const sourceDriveFolderToken = rawSourceDriveFolderToken
    ? normalizeFeishuResourceToken(
      rawSourceDriveFolderToken,
      'drive-folder',
      'FEISHU_SOURCE_DRIVE_FOLDER_TOKEN',
    )
    : undefined;
  const sourceBaseToken = rawSourceBaseToken
    ? normalizeFeishuResourceToken(rawSourceBaseToken, 'base', 'FEISHU_SOURCE_BASE_TOKEN')
    : undefined;
  const targetBaseToken = normalizeFeishuResourceToken(
    requireVariable(env, 'FEISHU_TARGET_BASE_TOKEN'),
    'base',
    'FEISHU_TARGET_BASE_TOKEN',
  );
  const targetBaseUrl = env.FEISHU_TARGET_BASE_URL?.trim() || undefined;
  const targetUrlToken = targetBaseUrl
    ? normalizeFeishuResourceToken(targetBaseUrl, 'base', 'FEISHU_TARGET_BASE_URL')
    : undefined;
  if (targetUrlToken && targetUrlToken !== targetBaseToken) {
    throw new Error('FEISHU_TARGET_BASE_URL does not match FEISHU_TARGET_BASE_TOKEN');
  }

  const sourceSheets = Object.entries(env)
    .flatMap(([name, rawValue]) => {
      const match = SOURCE_SHEET_TOKEN.exec(name);
      const token = rawValue?.trim();
      return match && token ? [{ key: match[1], token }] : [];
    })
    .sort((left, right) => left.key.localeCompare(right.key));

  if (sourceSheets.length > 0 && sourceSheets.length !== 8) {
    throw new Error(
      `Expected exactly eight FEISHU_SOURCE_SHEET_*_TOKEN variables; found ${sourceSheets.length}`,
    );
  }

  if (!sourceDriveFolderToken && !sourceBaseToken) {
    throw new Error(
      'Missing required source configuration: FEISHU_SOURCE_DRIVE_FOLDER_TOKEN or FEISHU_SOURCE_BASE_TOKEN',
    );
  }
  if (!sourceDriveFolderToken && sourceSheets.length !== 8) {
    throw new Error(
      `Expected exactly eight FEISHU_SOURCE_SHEET_*_TOKEN variables; found ${sourceSheets.length}`,
    );
  }

  return {
    appId,
    appSecret,
    sourceBaseToken,
    targetBaseToken,
    sourceSheets,
    sourceDriveFolderToken,
    targetBaseUrl,
  };
}
