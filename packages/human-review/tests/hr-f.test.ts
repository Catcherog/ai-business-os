import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * HR-F — Architecture boundary.
 *
 * Human Review / application / presentation code must contain NO direct
 * dependency on Feishu specifics:
 *   - Feishu table IDs
 *   - Feishu field mappings / names
 *   - credentials
 *   - raw Feishu record structures
 *   - direct Feishu API calls
 *
 * This test statically greps the package's own source (src + scripts) for
 * tokens that would betray such a dependency. (The test/ and testkit files are
 * exempt: they legitimately drive the REAL adapter for E2E coverage.)
 */
const FORBIDDEN: readonly string[] = [
  // credentials / env
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
  'FEISHU_BASE_APP_TOKEN',
  'FEISHU_LEAD_TABLE_ID',
  'FEISHU_CUSTOMER_TABLE_ID',
  // raw API / auth
  'tenant_access_token',
  'open-apis',
  'open.feishu.cn',
  'feishu.com',
  'feishu.cn',
  // mapping / internal Feishu types
  'DEFAULT_FIELD_MAP',
  'FeishuFieldMap',
  'FeishuRecord',
  'record_ids',
  'fromFeishuLeadRecord',
  'toFeishuLeadFields',
  'fromFeishuCustomerRecord',
  'toFeishuCustomerFields',
  'RealFeishuAdapter',
  // concrete Feishu Base field names (the DEFAULT_FIELD_MAP values)
  '拍摄类型',
  '预算上限',
  '预算下限',
  '期望日期',
  '客户姓名',
  '联系方式',
  '微信',
  '咨询时间',
  '来源会话',
  '来源候选',
  '客户关联',
  'Lead ID',
  'Customer ID',
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (full.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

const SRC = join(__dirname, '..', 'src');
const SCRIPTS = join(__dirname, '..', 'scripts');

describe('HR-F — Architecture boundary', () => {
  const files = [...walk(SRC), ...(existsSyncDir(SCRIPTS) ? walk(SCRIPTS) : [])];

  it('package source files exist to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const token of FORBIDDEN) {
    it(`no direct Feishu dependency: ${token}`, () => {
      const violations: string[] = [];
      for (const file of files) {
        const content = readFileSync(file, 'utf8');
        if (content.includes(token)) violations.push(file);
      }
      expect(violations, `token "${token}" found in: ${violations.join(', ')}`).toEqual([]);
    });
  }

  it('depends only on the canonical boundaries (contracts / golden-path / business-repository)', () => {
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      // Reject any import from a feishu-internal module or a sibling non-boundary.
      expect(
        content.includes("from '@busos/feishu") ||
          content.includes("require('@busos/feishu") ||
          content.includes("from './feishu-adapter") ||
          content.includes("from '../business-repository/src/feishu"),
        `unexpected Feishu/internal import in ${file}`,
      ).toBe(false);
    }
  });
});

function existsSyncDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
