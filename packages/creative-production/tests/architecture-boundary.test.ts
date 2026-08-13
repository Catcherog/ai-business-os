import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * P5-G — Architecture boundary static check.
 *
 * The `packages/creative-production` application layer must NOT contain Feishu
 * or Lumen IMPLEMENTATION knowledge (D017/D018). Upper layers must not know:
 * table IDs, field names, Base token, tenant_access_token, /open-apis/,
 * FeishuRecord, raw record structures, the concrete adapter classes
 * (RealFeishuAdapter / RealLumenAdapter), Lumen HTTP paths (/api/auth), Lumen
 * response shapes (signedUrls), Lumen/Feishu env-var prefixes or secrets
 * (LUMEN_AUTH_PASSWORD, AUTH_PASSWORD, JWT_SECRET, PROVIDER_ENCRYPTION_KEY,
 * FEISHU_*, fetchImpl). The only Lumen surface allowed here is the `LumenPort`
 * interface; the only Feishu surface is `BusinessRepository`.
 */

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));

// Tokens that prove Feishu/Lumen implementation knowledge has leaked into the
// app layer. NOTE: `LUMEN_GENERATION_FAILED` reason strings are legitimate
// business outcomes and are deliberately NOT forbidden.
const FORBIDDEN_PATTERNS = [
  /open-apis/i,
  /tenant_access_token/i,
  /FEISHU_/i,
  /LUMEN_BASE_URL/i,
  /LUMEN_AUTH_PASSWORD/i,
  /AUTH_PASSWORD/i,
  /JWT_SECRET/i,
  /PROVIDER_ENCRYPTION_KEY/i,
  /RealFeishuAdapter/i,
  /RealLumenAdapter/i,
  /DEFAULT_FIELD_MAP/i,
  /FeishuRecord/i,
  /\/records/i,
  /baseAppToken/i,
  /fieldMap/i,
  /fetchImpl/i,
  /signedUrls/i,
  /\/api\/auth/i,
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

describe('P5-G — creative-production contains no Feishu/Lumen implementation knowledge', () => {
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
