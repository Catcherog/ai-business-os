import { describe, expect, it } from 'vitest';
import {
  parseFeishuMigrationConfigDocument,
  type FeishuConfigDocumentResult,
} from '../src/config-document.js';

const SOURCE_BASE_URL = 'https://tenant.feishu.cn/base/app_source_synthetic?table=tbl_source&view=vew_source';
const TARGET_BASE_URL = 'https://tenant.feishu.cn/base/app_target_synthetic?table=tbl_target&view=vew_target';

const SHEET_KEYS = [
  'CUSTOMERS',
  'PROJECTS',
  'RESOURCES',
  'AVAILABILITY',
  'CONTENT',
  'SCRIPTS',
  'KNOWLEDGE',
  'MEDIA',
] as const;

function keyValueDocument(): string {
  return [
    '应用 ID',
    'cli_synthetic_app_id',
    '应用密钥',
    'synthetic_app_secret',
    `旧 Base: ${SOURCE_BASE_URL}`,
    `新 Base: ${TARGET_BASE_URL}`,
    ...SHEET_KEYS.map((key) => `Source Sheet ${key} Token: sht_${key.toLowerCase()}_synthetic`),
  ].join('\n');
}

function diagnosticsOf(result: FeishuConfigDocumentResult): string {
  return JSON.stringify(result.diagnostics);
}

describe('authorized Feishu config document parser', () => {
  it('normalizes Chinese labels, next-line values and URL-embedded Base tokens', () => {
    const result = parseFeishuMigrationConfigDocument(keyValueDocument());

    expect(result.config).toMatchObject({
      appId: 'cli_synthetic_app_id',
      appSecret: 'synthetic_app_secret',
      sourceBaseToken: 'app_source_synthetic',
      targetBaseToken: 'app_target_synthetic',
    });
    expect(result.config.sourceSheets).toHaveLength(8);
    expect(result.config.sourceSheets.map((sheet) => sheet.key)).toEqual([...SHEET_KEYS].sort());
    expect(result.diagnostics.fields.FEISHU_APP_SECRET).toMatchObject({
      status: 'PRESENT',
      fingerprint: expect.stringMatching(/^[a-f0-9]{8}$/u),
    });
    expect(diagnosticsOf(result)).not.toContain('synthetic_app_secret');
    expect(diagnosticsOf(result)).not.toContain(SOURCE_BASE_URL);
  });

  it('normalizes Markdown table labels without exposing values in diagnostics', () => {
    const rows = [
      ['Field', 'Value'],
      ['APP_ID', 'cli_markdown_synthetic'],
      ['APP_SECRET', 'markdown_secret_synthetic'],
      ['Source Base', SOURCE_BASE_URL],
      ['Target Base', TARGET_BASE_URL],
      ...SHEET_KEYS.map((key) => [`FEISHU_SOURCE_SHEET_${key}_TOKEN`, `sht_${key.toLowerCase()}_markdown`]),
    ];
    const document = rows.map(([left, right]) => `| ${left} | ${right} |`).join('\n');

    const result = parseFeishuMigrationConfigDocument(document);

    expect(result.config.appId).toBe('cli_markdown_synthetic');
    expect(result.config.targetBaseToken).toBe('app_target_synthetic');
    expect(result.diagnostics.formats).toContain('MARKDOWN_TABLE');
    expect(diagnosticsOf(result)).not.toContain('markdown_secret_synthetic');
  });

  it('fails closed on conflicting candidates without including either value', () => {
    const document = `${keyValueDocument()}\nAPP_ID=cli_other_synthetic`;

    expect(() => parseFeishuMigrationConfigDocument(document)).toThrow('CONFIG_CONFLICT: FEISHU_APP_ID');
    expect(() => parseFeishuMigrationConfigDocument(document)).not.toThrow('cli_synthetic_app_id');
  });

  it('reports missing required fields by name only', () => {
    expect(() => parseFeishuMigrationConfigDocument('APP_ID=cli_only_synthetic'))
      .toThrow('CONFIG_MISSING: FEISHU_APP_SECRET, FEISHU_SOURCE_BASE_TOKEN, FEISHU_TARGET_BASE_TOKEN, FEISHU_SOURCE_SHEET_*_TOKEN');
  });

  it('blocks identical source and target Base tokens', () => {
    const document = keyValueDocument().replace(TARGET_BASE_URL, SOURCE_BASE_URL);

    expect(() => parseFeishuMigrationConfigDocument(document))
      .toThrow('CONFIG_CONFLICT: SOURCE_TARGET_BASE_EQUAL');
  });
});
