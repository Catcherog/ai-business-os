// H1-04 browser smoke — drives the REAL in-browser "Generate Visual Reference"
// action (DEMO mode) through the same module graph the SPA uses, under a minimal
// DOM shim. Proves:
//   - the action runs CREATIVE_PRODUCTION against an EXISTING project and
//     surfaces assetId / assetUri via the stable contract;
//   - a real Task + Asset are written and visible on the project;
//   - the run is recorded in the SHARED registry (so it shows on Runs);
//   - the bundle carries NO Feishu/Lumen secrets;
//   - the GVR UI strings are actually bundled.
import { readFileSync } from 'node:fs';

const mkEl = () => ({
  replaceChildren() {}, append() {}, appendChild() {}, setAttribute() {},
  addEventListener() {}, replaceWith() {}, className: '', style: {}, textContent: '',
});
globalThis.document = {
  getElementById: () => mkEl(),
  createElement: () => mkEl(),
  createTextNode: () => ({}),
};
globalThis.window = globalThis;

let failed = false;
const fail = (m) => { console.error('FAIL:', m); failed = true; };

const ws = await import(new URL('./dist/bundle.js', import.meta.url).href);

async function waitInit() {
  for (let i = 0; i < 200; i++) {
    try { ws.getActionRepo(); ws.getActionRegistry(); return; } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('workspace init timed out');
}
await waitInit();

const repo = ws.getActionRepo();
const registry = ws.getActionRegistry();

// 1) an EXISTING project (H1-04 acts on an existing Project, never recreates one)
const { project } = await repo.createProject({
  customer_id: 'cust_smoke',
  lead_id: 'lead_smoke',
  project_type: 'portrait_shoot',
  title: 'H1-04 Smoke Project',
});
const projectId = project.project_id;

// 2) run the real browser action (DEMO mode = Fake adapters, same code path as UI)
const key = `smoke-gvr-${projectId}`;
const res = await ws.runGenerateVisualReference(
  {
    projectId,
    prompt: 'make a blue background for the hero shot',
    sourceImageBase64: 'aGVsbG8td29ybGQtZmFrZS1wbmc=',
    sourceImageMimeType: 'image/png',
  },
  key,
);

// 3) assertions on the result contract
if (res.mode !== 'DEMO') fail(`mode should be DEMO, got ${res.mode}`);
if (res.result.status !== 'SUCCEEDED') fail(`status should be SUCCEEDED, got ${res.result.status}`);
if (!res.result.output?.assetId) fail('output.assetId missing');
if (!/^lumen-stub:\/\//.test(res.result.output?.assetUri ?? '')) fail('output.assetUri missing/invalid');
if (res.result.completedStages?.length !== 1 || res.result.completedStages[0] !== 'CREATIVE_PRODUCTION') {
  fail(`completedStages should be [CREATIVE_PRODUCTION], got ${JSON.stringify(res.result.completedStages)}`);
}

// 4) real Task + Asset written and visible on the project
const tasks = await repo.listTasksByProject(projectId);
const assets = await repo.listAssetsByProject(projectId);
if (tasks.length !== 1) fail(`expected 1 task, got ${tasks.length}`);
if (assets.length !== 1) fail(`expected 1 asset, got ${assets.length}`);
if (tasks[0]?.status !== 'DONE') fail(`task status should be DONE, got ${tasks[0]?.status}`);

// 5) run recorded in the SHARED registry (shows on Runs surface)
const rec = await registry.getByIdempotencyKey(key);
if (!rec) fail('run not recorded under idempotency key');
else if (rec.status !== 'SUCCEEDED') fail(`recorded run status ${rec.status}`);
else if (rec.processId !== res.result.processId) fail('recorded processId mismatch');

// 6) duplicate-key replay produces no second Task/Asset (idempotency guard)
const res2 = await ws.runGenerateVisualReference(
  {
    projectId,
    prompt: 'make a blue background for the hero shot',
    sourceImageBase64: 'aGVsbG8td29ybGQtZmFrZS1wbmc=',
    sourceImageMimeType: 'image/png',
  },
  key,
);
if (!res2.result.deduplicated) fail('duplicate key should be replayed (deduplicated:true)');
if ((await repo.listTasksByProject(projectId)).length !== 1) fail('replay must not create a 2nd task');
if ((await repo.listAssetsByProject(projectId)).length !== 1) fail('replay must not create a 2nd asset');

// 7) bundle secret boundary + GVR UI presence (static scan)
let bundle = '';
try { bundle = readFileSync('dist/bundle.js', 'utf8'); }
catch (e) { fail(`cannot read bundle: ${e.message}`); }

for (const token of [
  'FEISHU_APP_SECRET', 'FEISHU_APP_ID', 'FEISHU_BASE_APP_TOKEN',
  'FEISHU_LEAD_TABLE_ID', 'FEISHU_CUSTOMER_TABLE_ID', 'FEISHU_PROJECT_TABLE_ID',
  'FEISHU_TASK_TABLE_ID', 'FEISHU_ASSET_TABLE_ID', 'LUMEN_AUTH_PASSWORD',
  'LUMEN_BASE_URL', 'open-apis', 'app_token',
]) {
  if (bundle.includes(token)) fail(`forbidden token leaked into browser bundle: ${token}`);
}
for (const s of ['Generate Visual Reference', 'badge-demo', 'DEMO 模式']) {
  if (!bundle.includes(s)) fail(`GVR UI string missing from bundle: ${s}`);
}

if (!failed) {
  console.log('SMOKE_ACTION_OK', JSON.stringify({
    mode: res.mode,
    status: res.result.status,
    processId: res.result.processId,
    assetId: res.result.output.assetId,
    assetUri: res.result.output.assetUri,
    taskStatus: tasks[0]?.status,
  }));
}
console.log(failed ? 'SMOKE_ACTION_FAIL' : 'SMOKE_ACTION_OK');
process.exit(failed ? 1 : 0);
