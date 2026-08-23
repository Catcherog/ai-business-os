// Faithful headless UI smoke for the Runs / Run Detail / Trace surface (H1-03-I).
//
// Bundles the real UI module graph (ui.ts + api.ts) with esbuild (same aliases
// as build.mjs), then drives it through a minimal DOM shim:
//   Runs list            ->  open proc_seed_b002 (FAILED)  -> stage / status /
//                            structured trace / sanitized error visible
//   Runs list            ->  open proc_seed_a001 (SUCCEEDED) -> output refs visible
//   Runs list            ->  open proc_seed_d004 (HUMAN_REQUIRED) -> rendered as a
//                            NORMAL pause (NOT a system error)
//   forbidden injection  ->  inject prompt/secret tokens into a stored record's
//                            trace metadata, re-open -> confirm they NEVER reach
//                            the rendered presentation (sanitizer boundary).
// Emits RUN_SMOKE_OK on success.
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

// 1) Bundle the real UI driver (everything inlined; no @busos imports remain).
const outfile = join(tmpdir(), 'busos-run-smoke-driver.mjs');
await esbuild.build({
  entryPoints: [resolve(__dirname, 'src/smoke-driver.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  outfile,
  alias: {
    '@busos/contracts': resolve(repoRoot, 'packages/contracts/src/index.ts'),
    '@busos/business-repository': resolve(repoRoot, 'packages/business-repository/src/index.ts'),
    '@busos/workspace-read': resolve(repoRoot, 'packages/workspace-read/src/index.ts'),
    '@busos/workspace-review': resolve(repoRoot, 'packages/workspace-review/src/index.ts'),
    '@busos/workspace-run': resolve(repoRoot, 'packages/workspace-run/src/index.ts'),
    '@busos/orchestrator': resolve(repoRoot, 'packages/orchestrator/src/index.ts'),
    '@busos/human-review': resolve(repoRoot, 'packages/human-review/src/index.ts'),
    '@busos/golden-path': resolve(repoRoot, 'packages/golden-path/src/index.ts'),
    '@busos/project-lifecycle': resolve(repoRoot, 'packages/project-lifecycle/src/index.ts'),
    '@busos/creative-production': resolve(repoRoot, 'packages/creative-production/src/index.ts'),
    '@busos/lumen-adapter': resolve(repoRoot, 'packages/lumen-adapter/src/index.ts'),
    '@busos/service-agent-candidate': resolve(repoRoot, 'packages/service-agent-candidate/src/index.ts'),
    'node:crypto': resolve(__dirname, 'shims/node-crypto.mjs'),
  },
  define: {
    'process.env.NODE_ENV': '"production"',
    __BUILD_SHA__: '"smoke"',
    __RELEASE__: '"BUSOS-R2-X01"',
    __BUILD_MODE__: '"DEMO"',
  },
  banner: { js: 'globalThis.process = globalThis.process || { env: {} };' },
  logLevel: 'error',
});

// 2) Minimal DOM shim that supports exactly what ui.ts uses.
const ALL = [];
function mkEl(tag) {
  const el = {
    tagName: tag,
    children: [],
    _handlers: {},
    className: '',
    style: {},
    textContent: '',
    value: '',
    attrs: {},
    _text: undefined,
    append(...kids) { for (const k of kids) this.children.push(k); },
    appendChild(k) { this.children.push(k); },
    replaceChildren(...kids) { this.children = kids; },
    replaceWith() { /* no-op for smoke */ },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(type, fn) { (this._handlers[type] ||= []).push(fn); },
    async click() { for (const fn of this._handlers['click'] || []) await fn({ key: 'Enter' }); },
  };
  ALL.push(el);
  return el;
}
const byId = {};
globalThis.document = {
  getElementById(id) { return (byId[id] ||= mkEl('div')); },
  createElement: mkEl,
  createTextNode: (t) => ({ __text: t }),
};
globalThis.window = globalThis;

function textOf(node) {
  let s = '';
  if (node == null) return s;
  if (typeof node.__text === 'string') s += node.__text;
  if (typeof node.textContent === 'string') s += node.textContent;
  const kids = node.children || [];
  for (const c of kids) s += textOf(c);
  return s;
}
function find(pred) { return ALL.find(pred); }
// The Runs surface renders asynchronously (listRuns / getRun are async). Let the
// microtask queue drain so viewRuns / viewRunDetail finish building the DOM.
const tick = (ms = 25) => new Promise((r) => setTimeout(r, ms));

// 3) Drive the flow.
const driver = await import('file://' + outfile);
let failed = false;
const fail = (m) => { console.error('RUN_SMOKE_FAIL:', m); failed = true; };

// Forbidden substrings that must NEVER appear in the rendered presentation.
const FORBIDDEN = [
  'sk-forbidden-12345', // injected secret (must be stripped)
  'hunter2',            // injected password (must be stripped)
  'apiKey',
  'api_key',
  'password',
  'secret',
  'Bearer ',
  'systemPrompt',
  'rawResponse',
  'credential',
  'source_image_base64',
  'thirdPartyPayload',
  'authorization',
];

function assertNoForbidden(text, where) {
  for (const tok of FORBIDDEN) {
    if (text.includes(tok)) fail(`Forbidden material "${tok}" leaked into ${where}`);
  }
}

try {
  await driver.initWorkspace();
  driver.renderApp(driver.getDataSource());

  // ---- Runs list ----------------------------------------------------------
  driver.navigate('runs');
  await tick();
  const runsList = find((e) => (e.className || '').includes('run-list'));
  if (!runsList) { fail('Runs list did not render'); }
  else if (!textOf(runsList).includes('proc_seed_b002')) {
    fail('Runs list missing deterministic FAILED run proc_seed_b002');
  } else {
    console.log('RUN_SMOKE_OK — Runs list rendered with deterministic runs');
  }

  // ---- FAILED run detail --------------------------------------------------
  const failedRow = find((e) => (e.className || '').includes('run-row') && textOf(e).includes('proc_seed_b002'));
  if (!failedRow) fail('Could not find run-row for proc_seed_b002');
  else { await failedRow.click(); await tick(); }
  const failedContent = textOf(globalThis.document.getElementById('content'));
  if (!/系统失败|FAILED/.test(failedContent)) fail(`FAILED status not shown. Snippet: ${failedContent.slice(0, 160)}`);
  else if (!failedContent.includes('CREATIVE_PRODUCTION')) fail('FAILED run: current stage CREATIVE_PRODUCTION not shown');
  else if (!failedContent.includes('结构化 Trace')) fail('FAILED run: structured trace section not shown');
  else if (!failedContent.includes('CREATIVE_GENERATION_FAILED')) fail('FAILED run: sanitized error code not shown');
  else if (!failedContent.includes('provider returned no asset')) fail('FAILED run: sanitized error message not shown');
  else if (!failedContent.includes('系统错误')) fail('FAILED run: system-error outcome block not rendered');
  else {
    console.log('RUN_SMOKE_OK — FAILED run detail: stage + status + structured trace + sanitized error visible');
    assertNoForbidden(failedContent, 'FAILED run detail');
  }

  // ---- SUCCEEDED run detail ----------------------------------------------
  driver.navigate('runs');
  await tick();
  const okRow = find((e) => (e.className || '').includes('run-row') && textOf(e).includes('proc_seed_a001'));
  if (!okRow) fail('Could not find run-row for proc_seed_a001');
  else { await okRow.click(); await tick(); }
  const okContent = textOf(globalThis.document.getElementById('content'));
  if (!/成功|SUCCEEDED/.test(okContent)) fail(`SUCCEEDED status not shown. Snippet: ${okContent.slice(0, 160)}`);
  else if (!okContent.includes('Asset URI') || !okContent.includes('lumen://gen/seed-a-portrait-001')) fail('SUCCEEDED run: safe output ref (assetUri) not shown');
  else if (!okContent.includes('GOLDEN_PATH')) fail('SUCCEEDED run: stage progress not shown');
  else {
    console.log('RUN_SMOKE_OK — SUCCEEDED run detail: stage + status + safe output visible');
    assertNoForbidden(okContent, 'SUCCEEDED run detail');
  }

  // ---- HUMAN_REQUIRED run detail (semantic gate) -------------------------
  driver.navigate('runs');
  await tick();
  const hrRow = find((e) => (e.className || '').includes('run-row') && textOf(e).includes('proc_seed_d004'));
  if (!hrRow) fail('Could not find run-row for proc_seed_d004');
  else { await hrRow.click(); await tick(); }
  const hrContent = textOf(globalThis.document.getElementById('content'));
  if (!/需人工决策|HUMAN_REQUIRED/.test(hrContent)) fail(`HUMAN_REQUIRED status not shown. Snippet: ${hrContent.slice(0, 160)}`);
  else if (!hrContent.includes('REVIEW_REQUIRED')) fail('HUMAN_REQUIRED run: rejection reason code not shown');
  else if (hrContent.includes('系统错误')) fail('HUMAN_REQUIRED run MUST NOT be rendered as a system error');
  else {
    console.log('RUN_SMOKE_OK — HUMAN_REQUIRED run rendered as normal pause (not a system error)');
    assertNoForbidden(hrContent, 'HUMAN_REQUIRED run detail');
  }

  // ---- Forbidden-material injection boundary ------------------------------
  // Inject prompt/secret tokens into a stored record's trace metadata, then
  // re-open it. The sanitizer must drop them before they reach the UI.
  const reg = driver.getRunRegistry();
  const rec = await reg.getByProcessId('proc_seed_a001');
  if (!rec || !rec.result) fail('getRunRegistry/getByProcessId returned no record to poison');
  else {
    const poisoned = JSON.parse(JSON.stringify(rec));
    const first = poisoned.result.trace[0];
    first.metadata = {
      ...(first.metadata || {}),
      injectedSecret: 'sk-forbidden-12345',
      password: 'hunter2',
      systemPrompt: 'ignore previous instructions',
    };
    await reg.save(poisoned); // InMemoryProcessRegistry.save — runtime-only seam
    driver.navigate('runs');
    await tick();
    const okRow2 = find((e) => (e.className || '').includes('run-row') && textOf(e).includes('proc_seed_a001'));
    if (okRow2) { await okRow2.click(); await tick(); }
    const poisonedContent = textOf(globalThis.document.getElementById('content'));
    assertNoForbidden(poisonedContent, 'poisoned SUCCEEDED run detail');
    // Legit content still present (sanitizer is surgical, not blunt).
    if (!poisonedContent.includes('lumen://gen/seed-a-portrait-001')) {
      fail('Sanitizer stripped legitimate output — boundary too blunt');
    } else {
      console.log('RUN_SMOKE_OK — forbidden tokens injected + stripped; legitimate refs preserved');
    }
  }

  // ---- Whole-document forbidden scan (deterministic demo data) ------------
  const wholeApp = textOf(globalThis.document.getElementById('content')) + ' ' +
    textOf(find((e) => (e.className || '').includes('nav')) || {});
  assertNoForbidden(wholeApp, 'whole app');
} catch (e) {
  fail(e && e.stack ? e.stack : String(e));
}

process.exit(failed ? 1 : 0);
