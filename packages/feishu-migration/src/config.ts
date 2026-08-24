export interface SourceSheetConfig {
  key: string;
  token: string;
}

export interface FeishuMigrationConfig {
  appId: string;
  appSecret: string;
  sourceBaseToken: string;
  targetBaseToken: string;
  sourceSheets: SourceSheetConfig[];
}

const SOURCE_SHEET_TOKEN = /^FEISHU_SOURCE_SHEET_(.+)_TOKEN$/;

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
  const sourceBaseToken = requireVariable(env, 'FEISHU_SOURCE_BASE_TOKEN');
  const targetBaseToken = requireVariable(env, 'FEISHU_TARGET_BASE_TOKEN');
  const sourceSheets = Object.entries(env)
    .flatMap(([name, rawValue]) => {
      const match = SOURCE_SHEET_TOKEN.exec(name);
      const token = rawValue?.trim();
      return match && token ? [{ key: match[1], token }] : [];
    })
    .sort((left, right) => left.key.localeCompare(right.key));

  if (sourceSheets.length !== 8) {
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
  };
}
