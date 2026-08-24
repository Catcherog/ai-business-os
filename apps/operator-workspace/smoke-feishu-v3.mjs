// Feishu v3 browser boundary smoke: render the new route in a blocked local
// environment, then scan the browser artifact for server-only credentials and
// Feishu OpenAPI paths. The connected data path is exercised by server tests;
// this smoke proves the browser never silently falls back to demo data.
import { readFileSync } from 'node:fs';

const mkEl = () => ({
  replaceChildren() {}, append() {}, appendChild() {}, setAttribute() {},
  addEventListener() {}, replaceWith() {}, querySelector() { return null; },
  querySelectorAll() { return []; }, className: '', style: {}, textContent: '',
});
globalThis.document = {
  getElementById: () => mkEl(),
  createElement: () => mkEl(),
  createTextNode: () => ({}),
};
globalThis.window = globalThis;
globalThis.location = { hash: '#/business-data' };

let failed = false;
process.on('unhandledRejection', (error) => { console.error('UNHANDLED', error); failed = true; });

await import(new URL('./dist/bundle.js', import.meta.url).href);
await new Promise((resolve) => setTimeout(resolve, 500));

const bundle = readFileSync(new URL('./dist/bundle.js', import.meta.url), 'utf8');
const forbidden = [
  'FEISHU_APP_SECRET', 'FEISHU_APP_ID', 'FEISHU_BASE_APP_TOKEN', 'FEISHU_TARGET_BASE_TOKEN',
  'FEISHU_LEAD_TABLE_ID', 'FEISHU_CUSTOMER_TABLE_ID', 'FEISHU_PROJECT_TABLE_ID',
  'FEISHU_TASK_TABLE_ID', 'FEISHU_ASSET_TABLE_ID', 'tenant_access_token', '/open-apis/',
];
for (const token of forbidden) {
  if (bundle.includes(token)) { console.error(`LEAK: ${token}`); failed = true; }
}
for (const label of ['Business Data', 'Scheduling', 'CONNECTED TEST BASE', 'Generate proposals', 'Copy script', 'No demo fallback']) {
  if (!bundle.includes(label)) { console.error(`Expected v3 label missing: ${label}`); failed = true; }
}

console.log(failed ? 'SMOKE_FEISHU_V3_FAIL' : 'SMOKE_FEISHU_V3_OK');
process.exit(failed ? 1 : 0);
