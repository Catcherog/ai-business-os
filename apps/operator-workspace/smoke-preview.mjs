// BUSOS-R2-X01 regression — run AFTER `node build.mjs` (requires dist/).
//
// Gates covered:
//   X01-A  Build identity — the compiled bundle carries a real build SHA + DEMO
//          label, and dist/index.html renders the identity placeholder.
//   X01-B  No hard-coded stale SHA — the baked SHA equals build-time metadata
//          (VERCEL_GIT_COMMIT_SHA if present, else `git rev-parse --short HEAD`),
//          i.e. it is dynamic, never a hand-written constant.
//   X01-C  Secret leakage — bundle contains no FEISHU_/LUMEN_ secret values,
//          tokens, or provider references (same allowlist as smoke.mjs).
//   X01-D  Static deploy readiness — dist/index.html + dist/styles.css +
//          dist/bundle.js form a self-contained static site (relative refs,
//          no absolute / localhost / node_modules path).
//   X01-E  (externally gated) — stable public URL availability is verified by
//          the deployment step / Owner; this smoke only proves deployability.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let failed = false;
const appDir = fileURLToPath(new URL('.', import.meta.url));

function check(label, ok, detail = '') {
  if (!ok) {
    console.error(`X01 FAIL — ${label}${detail ? `: ${detail}` : ''}`);
    failed = true;
  } else {
    console.log(`X01 PASS — ${label}`);
  }
}

const bundlePath = resolve(appDir, 'dist/bundle.js');
const htmlPath = resolve(appDir, 'dist/index.html');
const cssPath = resolve(appDir, 'dist/styles.css');

check('X01-D dist/bundle.js exists', existsSync(bundlePath));
check('X01-D dist/index.html exists', existsSync(htmlPath));
check('X01-D dist/styles.css exists', existsSync(cssPath));

const bundle = existsSync(bundlePath) ? readFileSync(bundlePath, 'utf8') : '';
const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : '';

// ---- X01-B: expected build-time SHA (same source order as build.mjs) ----
let expected = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').trim();
if (!expected) {
  try {
    expected = execSync('git rev-parse --short HEAD', {
      cwd: appDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    expected = '';
  }
}
expected = expected.slice(0, 7);
check('X01-B build-time SHA source available', expected.length > 0, 'no VERCEL_GIT_COMMIT_SHA and no git HEAD');

// ---- X01-A / X01-B: baked identity in the bundle ----
if (expected) {
  check('X01-B bundle SHA matches build-time metadata', bundle.includes(expected), `expected ${expected}`);
  // The define identifiers must be fully replaced at build time — a leftover
  // identifier would throw ReferenceError in the browser.
  check('X01-B no unreplaced build-identity identifiers', !bundle.includes('__BUILD_SHA__') && !bundle.includes('__RELEASE__') && !bundle.includes('__BUILD_MODE__'));
}
check('X01-A DEMO label present in bundle', bundle.includes('DEMO'));
check('X01-A release identity present in bundle', bundle.includes('BUSOS-R2-X01'));
check('X01-A build-meta placeholder present in deploy html', html.includes('id="build-meta"'));
check('X01-A DEMO badge present in deploy html', html.includes('badge-demo') && html.includes('DEMO'));

// ---- X01-D: static deploy root is self-contained ----
check('X01-D deploy html references ./bundle.js', html.includes('src="./bundle.js"'));
check('X01-D deploy html references ./styles.css', html.includes('href="./styles.css"'));
check('X01-D no ./src/ refs leak into deploy html', !html.includes('./src/styles.css'));
check('X01-D no ./dist/ refs leak into deploy html', !html.includes('./dist/bundle.js'));
check('X01-D no absolute path in deploy html', !html.includes('file:///') && !html.includes('C:\\'));
check('X01-D no localhost in deploy html', !html.includes('localhost'));
check('X01-D no node_modules ref in deploy html', !html.includes('node_modules'));

// ---- X01-C: secret scan on the browser bundle (parity with smoke.mjs) ----
const forbidden = [
  'FEISHU_APP_SECRET',
  'FEISHU_APP_ID',
  'FEISHU_BASE_APP_TOKEN',
  'FEISHU_LEAD_TABLE_ID',
  'FEISHU_CUSTOMER_TABLE_ID',
  'FEISHU_PROJECT_TABLE_ID',
  'FEISHU_TASK_TABLE_ID',
  'FEISHU_ASSET_TABLE_ID',
  'LUMEN_AUTH_PASSWORD',
  'LUMEN_BASE_URL',
  'open-apis',
  'app_token',
];
let leakCount = 0;
for (const token of forbidden) {
  if (bundle.includes(token)) {
    console.error(`X01-C LEAK — forbidden token in bundle: ${token}`);
    leakCount += 1;
  }
}
check('X01-C no secret / credential / provider token in bundle', leakCount === 0, `${leakCount} token(s) found`);
check('X01-C no .env content in bundle', !bundle.includes('process.env.VERCEL_GIT_COMMIT_SHA') && !bundle.includes('VERCEL_TOKEN'));

console.log(failed ? 'PREVIEW_SMOKE_FAIL' : 'PREVIEW_SMOKE_OK');
process.exit(failed ? 1 : 0);
