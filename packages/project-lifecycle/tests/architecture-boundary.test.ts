import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PL-F — Architecture boundary static check.
 *
 * The `packages/project-lifecycle` application layer must NOT contain Feishu
 * implementation knowledge (D017/D018). Upper layers must not know: table IDs,
 * field names, Base token, tenant_access_token, /open-apis/, FeishuRecord,
 * raw record structures, or the concrete adapter classes.
 */

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));

// Tokens that prove Feishu *implementation* knowledge has leaked into the app layer.
const FORBIDDEN_PATTERNS = [
  /open-apis/i,
  /tenant_access_token/i,
  /FEISHU_/i, // env var prefixes belong to the adapter/env bootstrap only
  /RealFeishuAdapter/i,
  /FakeFeishuAdapter/i,
  /DEFAULT_FIELD_MAP/i,
  /FeishuRecord/i,
  /\/records/i, // Feishu REST path
  /baseAppToken/i,
  /fieldMap/i,
  /fetchImpl/i,
];

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('PL-F — project-lifecycle contains no Feishu implementation knowledge', () => {
  const files = listTsFiles(SRC_DIR);
  it('has source files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`clean: ${file.replace(SRC_DIR, 'src')}`, () => {
      const content = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(pattern.test(content), `forbidden token ${pattern} in ${file}`).toBe(false);
      }
    });
  }
});
