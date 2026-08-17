// Headless smoke test for the browser bundle: stubs a minimal DOM and imports
// the built bundle to confirm it loads, seeds the fake workspace (exercising
// the node:crypto shim), and renders without throwing. It then statically
// scans the produced bundle for the Reviews/Runs surfaces and for any leaked
// Feishu/Lumen secrets / credentials / table ids (H1-02-H / H1-04-F boundary).
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
process.on('unhandledRejection', (e) => { console.error('UNHANDLED', e); failed = true; });

await import(new URL('./dist/bundle.js', import.meta.url).href);
await new Promise((r) => setTimeout(r, 800));

// ---- static bundle scan (H1-02-I load + H1-02-H / H1-04-F secret boundary) ----
let bundle = '';
try {
  bundle = readFileSync(new URL('./dist/bundle.js', import.meta.url), 'utf8');
} catch (e) {
  console.error('Cannot read bundle for scan:', e.message);
  failed = true;
}

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
if (bundle) {
  for (const token of forbidden) {
    if (bundle.includes(token)) {
      console.error(`LEAK: forbidden token found in bundle: ${token}`);
      failed = true;
    }
  }
  for (const label of ['Reviews', 'Runs', 'Generate Visual Reference', 'badge-demo', 'Related Runs', 'Operator Workspace', 'Memory', '项目上下文']) {
    if (!bundle.includes(label)) {
      console.error(`Expected UI label not found in bundle: ${label}`);
      failed = true;
    }
  }
}

console.log(failed ? 'SMOKE_FAIL' : 'SMOKE_OK');
process.exit(failed ? 1 : 0);
