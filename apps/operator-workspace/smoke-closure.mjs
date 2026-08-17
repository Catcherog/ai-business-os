// H1-05 — Real Usage Closure smoke. Bundles the real UI module graph
// (ui.ts + api.ts + overview-model.ts) with esbuild (same aliases as build.mjs)
// and drives it through the minimal DOM shim used by smoke-run.mjs to prove the
// closed-loop operator journey:
//   Overview   -> real KPIs / project status / pending reviews / recent activity
//   Project    -> Related Runs (empty -> populated after a real GVR action)
//   GVR action -> SUCCEEDED -> Project Tasks/Assets + Related Runs refresh in place
//   Run        -> back-link to the originating Project (Run -> Project return)
//   Idempotency -> duplicate key produces no 2nd Task/Asset
//   Honesty    -> bundle carries no Feishu/Lumen secrets; new labels present
// Emits H1_05_CLOSURE_OK on success.
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

const outfile = join(tmpdir(), 'busos-closure-smoke-driver.mjs');
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
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: 'globalThis.process = globalThis.process || { env: {} };' },
  logLevel: 'error',
});

// Minimal DOM shim (mirrors smoke-run.mjs).
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
    append(...kids) { for (const k of kids) this.children.push(k); },
    appendChild(k) { this.children.push(k); },
    replaceChildren(...kids) { this.children = kids; },
    replaceWith() {},
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
  for (const c of node.children || []) s += textOf(c);
  return s;
}
function find(pred) { return ALL.find(pred); }
const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));

const driver = await import('file://' + outfile);
let failed = false;
const fail = (m) => { console.error('H1_05_CLOSURE_FAIL:', m); failed = true; };

// Real credential boundary (aligned with smoke.mjs / H1-02-H / H1-04-F): the
// bundle must never ship actual Feishu / Lumen secrets or table ids. NOTE: bare
// words like `password` / `secret` intentionally EXCLUDED — they only appear
// inside the trace sanitizer's redaction regex (the security control itself),
// not as leaked material.
const FORBIDDEN = [
  'FEISHU_APP_SECRET', 'FEISHU_APP_ID', 'FEISHU_BASE_APP_TOKEN',
  'FEISHU_LEAD_TABLE_ID', 'FEISHU_CUSTOMER_TABLE_ID', 'FEISHU_PROJECT_TABLE_ID',
  'FEISHU_TASK_TABLE_ID', 'FEISHU_ASSET_TABLE_ID',
  'LUMEN_AUTH_PASSWORD', 'LUMEN_BASE_URL', 'open-apis', 'app_token',
];

try {
  await driver.initWorkspace();
  driver.renderApp(driver.getService());

  // ---- Overview: real aggregation (Journey A) ----------------------------
  driver.navigate('overview');
  await tick();
  const ov = textOf(globalThis.document.getElementById('content'));
  if (!ov.includes('Operator Workspace')) fail('Overview header missing');
  else if (!ov.includes('项目状态')) fail('Overview: project status section missing');
  else if (!ov.includes('最近活动')) fail('Overview: recent activity missing');
  else if (!ov.includes('演示数据') && !ov.includes('in-memory')) fail('Overview must honestly label demo data');
  else console.log('H1_05_CLOSURE_OK — Overview renders real aggregation (projects / status / activity)');

  // ---- Overview KPI counts match the read surfaces -----------------------
  const read = driver.getService();
  const review = driver.getReviewService();
  const run = driver.getRunService();
  const projects = await read.listProjects();
  const pending = (await review.listReviews()).filter((r) => r.state === 'PENDING_REVIEW').length;
  const runs = await run.listRuns();
  if (!ov.includes(String(projects.length))) fail(`Overview KPI project count ${projects.length} not shown`);
  else if (pending > 0 && !ov.includes('待审阅')) fail('Overview: pending-reviews section missing though reviews pending');
  else console.log(`H1_05_CLOSURE_OK — Overview KPIs consistent (projects=${projects.length}, pendingReviews=${pending}, runs=${runs.length})`);

  // ---- Project -> Related Runs (empty), then GVR closed loop -------------
  const repo = driver.getActionRepo();
  const { project } = await repo.createProject({
    customer_id: 'cust_closure',
    lead_id: 'lead_closure',
    project_type: 'portrait_shoot',
    title: 'H1-05 Closure Project',
  });
  const pid = project.project_id;

  driver.navigate('project-detail', pid);
  await tick();
  const projBefore = textOf(globalThis.document.getElementById('content'));
  if (!projBefore.includes('Related Runs（本项目关联运行）')) fail('Project Detail: Related Runs section missing');
  else if (!projBefore.includes('（该 Project 暂无关联 Run')) fail('Project Detail: Related Runs should be empty before any action');
  else console.log('H1_05_CLOSURE_OK — Project Detail shows Related Runs (empty before action)');

  // Run the real in-browser GVR action (DEMO = Fake adapters).
  const key = `closure-gvr-${pid}`;
  const res = await driver.runGenerateVisualReference(
    { projectId: pid, prompt: 'blue background hero', sourceImageBase64: 'aGVsbG8=', sourceImageMimeType: 'image/png' },
    key,
  );
  if (res.result.status !== 'SUCCEEDED') fail(`GVR should SUCCEED, got ${res.result.status}`);
  // Closure (Journey B / Case 1 — "return to Project with synced state"): the
  // action wrote a ProcessExecutionRecord (output.projectId = pid) to the SHARED
  // registry. Re-render the Project detail so populateRelatedRuns re-reads it and
  // the new Run + Asset become visible. (The live UI's gvrPanel onSuccess ->
  // reloadDynamic refreshes in place via the same populateRelatedRuns path;
  // here we assert the derived synced state is correct after returning.)
  driver.navigate('project-detail', pid);
  await tick(120);

  const projAfter = textOf(globalThis.document.getElementById('content'));
  if (!projAfter.includes('Related Runs（本项目关联运行 · 1）')) {
    fail(`After GVR, Related Runs should show 1 run. Snippet: ${projAfter.slice(0, 200)}`);
  } else if (!projAfter.includes('lumen-stub://')) {
    fail('After GVR, the new Asset (lumen-stub uri) should be visible in Project Assets');
  } else {
    console.log('H1_05_CLOSURE_OK — GVR success reflected in Project (Asset + Related Runs = 1) on return (Journey B / Case1)');
  }

  // ---- Run -> Project return path (Journey D / F) ------------------------
  driver.navigate('runs');
  await tick();
  const okRow = find((e) => (e.className || '').includes('run-row') && textOf(e).includes(res.result.processId));
  if (!okRow) fail('Could not find the new run row on Runs list');
  else {
    await okRow.click();
    await tick();
    const runDetail = textOf(globalThis.document.getElementById('content'));
    if (!runDetail.includes('返回项目')) fail('Run Detail must offer a back-link to the originating Project');
    else if (!runDetail.includes('需人工决策') && !runDetail.includes('成功') && !runDetail.includes('SUCCEEDED')) {
      fail('Run Detail status not rendered');
    } else console.log('H1_05_CLOSURE_OK — Run -> Project return path present');
  }

  // ---- Idempotency: duplicate key -> no 2nd Task/Asset -------------------
  const res2 = await driver.runGenerateVisualReference(
    { projectId: pid, prompt: 'blue background hero', sourceImageBase64: 'aGVsbG8=', sourceImageMimeType: 'image/png' },
    key,
  );
  if (!res2.result.deduplicated) fail('duplicate GVR key should be deduplicated');
  if ((await repo.listTasksByProject(pid)).length !== 1) fail('replay must not create a 2nd task');
  if ((await repo.listAssetsByProject(pid)).length !== 1) fail('replay must not create a 2nd asset');
  console.log('H1_05_CLOSURE_OK — GVR idempotency preserved (no duplicate Task/Asset)');

  // ---- Secret / label boundary on the produced bundle --------------------
  let bundle = '';
  try { bundle = readFileSync(resolve(__dirname, 'dist/bundle.js'), 'utf8'); } catch (e) { fail(`cannot read bundle: ${e.message}`); }
  for (const tok of FORBIDDEN) if (bundle.includes(tok)) fail(`forbidden token leaked: ${tok}`);
  for (const s of ['Related Runs', 'Operator Workspace', '返回项目', 'Generate Visual Reference']) {
    if (!bundle.includes(s)) fail(`expected UI label missing from bundle: ${s}`);
  }
  console.log('H1_05_CLOSURE_OK — bundle clean of secrets; closure labels present');
} catch (e) {
  fail(e && e.stack ? e.stack : String(e));
}

console.log(failed ? 'H1_05_CLOSURE_FAIL' : 'H1_05_CLOSURE_OK');
process.exit(failed ? 1 : 0);
