// BUSOS-R2-BATCH1-PRODUCT-INTEGRATION-CORR-01 — real Router/Navigation-driven
// browser product-integration smoke (Journeys A–E) + server registration seam.
//
// Unlike smoke-preview.mjs (static bundle grep), this smoke drives the REAL
// Operator Workspace module graph (dist/bundle.js) through its actual hash
// router / navigation / view functions under a minimal DOM shim, then verifies
// the CONNECTED server boundary serves the same product surface routes.
//
// Journeys:
//   A  Navigation discovery — all seven nav surfaces exist and render
//      (Overview / Projects / Reviews / Runs / Service Agent / Business Data /
//      Evaluation), driven through the real router (hashchange) AND a real nav
//      button click.
//   B  Service Agent — type a consultation, submit, assert answer / intent /
//      risk / route / evidence / handoff / run link (KB path + handoff path).
//   C  Business Data — customer list -> customer detail -> Leads / Projects.
//   D  Evaluation — Golden Set recompute rendered (42 / 28 / 14) AND the
//      server report API returns the same canonical summary.
//   E  Legacy regression — Overview / Projects / Project detail / Reviews /
//      Runs still render (GVR / Memory deep journeys are covered by
//      smoke-action.mjs / smoke-memory.mjs in the same chain).
//
// Secret boundary: the browser bundle must carry no FEISHU_/LUMEN_ secrets
// (same allowlist as smoke.mjs / smoke-preview.mjs).
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Minimal DOM shim — the surface the Operator Workspace views actually use
// (createElement / createTextNode / className / append / replaceChildren /
// addEventListener / value / innerHTML / querySelector / location.hash).
// ---------------------------------------------------------------------------
class TextNode {
  constructor(value) {
    this.nodeType = 3;
    this.data = String(value);
    this.textContent = String(value);
  }
  text() { return this.data; }
}
class ShimEl {
  constructor(tag) {
    this.nodeType = 1;
    this.tagName = String(tag).toUpperCase();
    this.tag = String(tag).toLowerCase();
    this.children = [];
    this.attributes = {};
    this.className = '';
    this.style = {};
    this.textContent = '';
    this._innerHTML = '';
    this.value = '';
    this.type = '';
    this.disabled = false;
    this.dataset = {};
    this.listeners = {};
    this._replaced = null;
  }
  append(...nodes) { for (const n of nodes) if (n != null) this.children.push(n); return this; }
  appendChild(n) { this.children.push(n); return n; }
  prepend(...nodes) { for (const n of nodes) if (n != null) this.children.unshift(n); }
  replaceChildren(...nodes) { this.children = nodes.filter((n) => n != null); return this; }
  replaceWith(node) { this._replaced = node; }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'class') this.className = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  dispatch(type, ev = {}) { for (const fn of this.listeners[type] ?? []) fn(ev); }
  set innerHTML(v) { this._innerHTML = String(v); }
  get innerHTML() { return this._innerHTML; }
  querySelector(sel) {
    const m = sel.match(/^([a-zA-Z0-9_-]+)?(?:\.([a-zA-Z0-9_-]+))?(?:\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\])?$/);
    const match = (el) => {
      if (m?.[1] && el.tag !== m[1]) return false;
      if (m?.[2] && !el.className.split(/\s+/).includes(m[2])) return false;
      if (m?.[3] && el.getAttribute(m[3]) !== (m[4] ?? '')) return false;
      return true;
    };
    const walk = (el) => {
      for (const c of el.children ?? []) {
        if (!Array.isArray(c.children)) continue; // text nodes have no children
        if (match(c)) return c;
        const r = walk(c);
        if (r) return r;
      }
      return null;
    };
    return walk(this);
  }
  /** Deep first element of `tag` whose aggregated text contains `needle`. */
  findByText(tag, needle) {
    const walk = (el) => {
      for (const c of el.children ?? []) {
        if (!Array.isArray(c.children)) continue; // text nodes have no children
        if (c.tag === tag && c.text().includes(needle)) return c;
        const r = walk(c);
        if (r) return r;
      }
      return null;
    };
    return walk(this);
  }
  /** Aggregated text: direct textContent + innerHTML markup + children. */
  text() {
    let out = (this.textContent ?? '') + (this._innerHTML ?? '');
    for (const c of this.children) out += c.text ? c.text() : '';
    return out;
  }
}

const hosts = {};
function host(id) { return hosts[id] ??= new ShimEl('div'); }
globalThis.document = {
  getElementById: (id) => host(id),
  createElement: (tag) => new ShimEl(tag),
  createTextNode: (value) => new TextNode(value),
};
const location = { hash: '#/overview', _listeners: {} };
globalThis.location = location;
globalThis.window = globalThis;
window.addEventListener = (type, fn) => { (location._listeners[type] ??= []).push(fn); };
window.removeEventListener = (type, fn) => {
  const l = location._listeners[type];
  if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }
};

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
let failed = false;
const fail = (m) => { console.error('PI FAIL —', m); failed = true; };
const pass = (m) => { console.log('PI PASS —', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(pred, label, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { if (pred()) return true; } catch { /* not rendered yet */ }
    await sleep(25);
  }
  fail(`${label} (timeout)`);
  return false;
}

const content = () => host('content');
const navHost = () => host('nav')._replaced ?? host('nav');

/** Drive the REAL router: set the hash and dispatch hashchange (what a browser does). */
async function go(hash, expect, label) {
  location.hash = hash;
  for (const fn of location._listeners['hashchange'] ?? []) fn();
  const ok = await waitFor(() => content().text().includes(expect), label);
  if (ok) pass(`${label} → rendered "${expect}"`);
  return ok;
}

// ---------------------------------------------------------------------------
// Boot the real SPA module graph (dist/bundle.js) under the shim.
// ---------------------------------------------------------------------------
const ws = await import(new URL('./dist/bundle.js', import.meta.url).href);
await waitFor(() => {
  ws.getActionRegistry();
  return content().text().length > 0;
}, 'workspace init + first render');

// ---- Journey A — Navigation discovery --------------------------------------
const NAV_EXPECT = [
  ['#/overview', 'Operator Workspace', 'Overview'],
  ['#/projects', 'Projects', 'Projects'],
  ['#/reviews', 'Reviews', 'Reviews'],
  ['#/runs', 'Runs', 'Runs'],
  ['#/service-agent', 'Service Agent', 'Service Agent'],
  ['#/business-data', 'Customers', 'Business Data'],
  ['#/evaluation', 'Evaluation', 'Evaluation'],
];
const navText = navHost().text();
for (const [, , label] of NAV_EXPECT) {
  if (navText.includes(label)) pass(`nav label present: ${label}`);
  else fail(`nav label missing: ${label}`);
}
for (const [hash, expect, label] of NAV_EXPECT) await go(hash, expect, label);

// Real nav button click (not just hash driving) — click "Evaluation" in the nav.
{
  const navBtn = navHost().findByText('button', 'Evaluation');
  if (!navBtn) { fail('nav Evaluation button not found'); }
  else {
    navBtn.dispatch('click');
    await waitFor(() => content().text().includes('Golden Set'), 'nav click → Evaluation');
    pass('nav button click → Evaluation renders (real navigation wiring)');
  }
}

// ---- Journey B — Service Agent (KB path then handoff path) ------------------
await go('#/service-agent', 'Service Agent', 'Journey B — Service Agent');
{
  const input = content().querySelector('.sa-input');
  const goBtn = content().querySelector('.btn-primary');
  if (!input || !goBtn) { fail('Service Agent console input/button not rendered'); }
  else {
    // KB path — structured answer + evidence + canonical run link.
    input.value = '如何预约拍摄？';
    goBtn.dispatch('click');
    const kbOk = await waitFor(() => {
      const t = content().text();
      return t.includes('回答：') && t.includes('I05') && t.includes('R1') && t.includes('KB_PATH') && t.includes('无需转人工') && t.includes('0.87') && t.includes('#/runs/');
    }, 'Service Agent KB consultation result');
    if (kbOk) pass('Service Agent KB journey: answer / intent I05 / risk R1 / route KB_PATH / evidence 0.87 / run link visible');

    // Handoff path — R3 / HUMAN_PATH / 转人工 visible when applicable.
    input.value = '我想退款';
    goBtn.dispatch('click');
    const hfOk = await waitFor(() => {
      const t = content().text();
      return t.includes('I03') && t.includes('R3') && t.includes('HUMAN_PATH') && t.includes('转人工') && t.includes('HUMAN_REQUIRED');
    }, 'Service Agent handoff consultation result');
    if (hfOk) pass('Service Agent handoff journey: intent I03 / risk R3 / route HUMAN_PATH / handoff visible');

    // The governance-review action button renders in the conversation markup.
    const markup = content().text();
    if (markup.includes('data-action="governance-review"')) pass('Service Agent governance review button rendered');
    else fail('Service Agent governance review button missing from markup');
  }
}

// ---- Journey C — Business Data (list -> detail -> Leads / Projects) ---------
await go('#/business-data', 'Customers', 'Journey C — Business Data');
{
  const listOk = await waitFor(() => {
    const t = content().text();
    return t.includes('林晚晴') && t.includes('陈思远');
  }, 'Business Data customer list');
  if (listOk) pass('Business Data list: seeded customers 林晚晴 / 陈思远 rendered (DEMO projection)');

  // OWNER-REVIEW-FIX-01 — runtime identity closure. The seeded DEMO surface
  // must show DEMO · READY and must NOT claim CONNECTED · READY.
  const idOk = await waitFor(() => content().text().includes('DEMO · READY'), 'Business Data DEMO identity');
  if (idOk) {
    pass('Browser Business Data identity: DEMO · READY (honest seeded demo, connected=false)');
    if (content().text().includes('CONNECTED · READY')) {
      fail('Browser Business Data must NOT show CONNECTED · READY for seeded demo data');
    } else {
      pass('Browser Business Data identity: CONNECTED · READY absent in DEMO UI');
    }
  } else {
    fail('Browser Business Data identity: DEMO · READY not rendered');
  }

  const custBtn = content().findByText('button', '林晚晴');
  if (!custBtn) { fail('Business Data customer row button not found'); }
  else {
    custBtn.dispatch('click'); // real onSelectCustomer -> navigate('business-data-detail', id)
    const detailOk = await waitFor(() => {
      const t = content().text();
      return t.includes('Leads') && t.includes('Projects') && t.includes('林晚晴');
    }, 'Business Data customer detail');
    if (detailOk && location.hash.includes('/business-data/')) {
      pass(`Business Data detail: Leads / Projects rendered, router hash=${location.hash}`);
    } else {
      fail(`Business Data detail missing or hash wrong: ${location.hash}`);
    }
  }
}

// ---- Journey D — Evaluation (browser recompute + server report API) ---------
await go('#/evaluation', 'Evaluation', 'Journey D — Evaluation');
{
  const uiOk = await waitFor(() => {
    const t = content().text();
    return t.includes('28 PASS') && t.includes('14 NOT_EVALUABLE') && t.includes('42');
  }, 'Evaluation Golden Set recompute rendered');
  if (uiOk) pass('Evaluation UI: canonical Golden Set recompute rendered (42 total / 28 PASS / 14 NOT_EVALUABLE)');
}

// ---- Server registration seam (§10) — the CONNECTED boundary serves the same
// surface routes; the report data comes from the real seam / report API. ------
process.env.PORT = '4195';
await import(new URL('./server/dist/server.js', import.meta.url).href);
{
  let serverUp = false;
  const t0 = Date.now();
  while (!serverUp && Date.now() - t0 < 12000) {
    try {
      const r = await fetch('http://localhost:4195/api/evaluation/report');
      serverUp = r.ok || r.status === 422;
    } catch { /* not listening yet */ }
    if (!serverUp) await sleep(100);
  }
  if (!serverUp) fail('CONNECTED server did not start listening');
  else pass('CONNECTED server listening (built bundle)');
}
{
  const ev = await (await fetch('http://localhost:4195/api/evaluation/report')).json();
  const s = ev.report?.summary;
  if (ev.status === 'SUCCESS' && s && s.total === 42 && s.pass === 28 && s.fail === 0 && s.error === 0 && s.not_evaluable === 14) {
    pass(`Evaluation server seam: /api/evaluation/report SUCCESS (${s.pass} PASS / ${s.not_evaluable} NOT_EVALUABLE / ${s.total} total) — matches rendered UI`);
  } else {
    fail(`Evaluation server seam mismatch: ${JSON.stringify(ev).slice(0, 200)}`);
  }

  const bd = await (await fetch('http://localhost:4195/api/business-data/customers')).json();
  if (bd.mode === 'CONNECTED' && bd.status === 'BLOCKED' && bd.error?.code === 'BUSINESS_DATA_NOT_CONFIGURED') {
    pass('Business Data server seam: CONNECTED/BLOCKED (honest boundary, no fake DEMO)');
  } else {
    fail(`Business Data server seam mismatch: ${JSON.stringify(bd).slice(0, 200)}`);
  }

  const saRes = await fetch('http://localhost:4195/api/service-agent/conversations');
  const saBody = await saRes.text();
  if (saRes.status === 200 && saBody.includes('READY')) {
    pass('Service Agent server seam: /api/service-agent/conversations registered (READY envelope, fail-closed stub)');
  } else {
    fail(`Service Agent server seam mismatch: ${saRes.status} ${saBody.slice(0, 120)}`);
  }

  const root = await fetch('http://localhost:4195/');
  const rootText = await root.text();
  if (root.status === 200 && rootText.includes('id="nav"')) {
    pass('Server static SPA host: GET / serves the app shell (200)');
  } else {
    fail(`Server static SPA host mismatch: ${root.status}`);
  }
}

// ---- Journey E — Legacy regression (render-only; GVR/Memory deep journeys are
// covered by smoke-action.mjs / smoke-memory.mjs in the same smoke chain) -----
{
  await go('#/overview', 'Operator Workspace', 'Legacy — Overview');
  await go('#/projects', 'Projects', 'Legacy — Projects');
  // Project detail via a real row click (rows are div.project-row with a click listener).
  const projRow = content().querySelector('div.project-row');
  if (projRow) {
    projRow.dispatch('click');
    // Wait for the PROJECT DETAIL content (not just the hash) to finish
    // rendering, so the next navigation cannot race an in-flight render.
    const pdOk = await waitFor(
      () => location.hash.includes('/projects/') && content().text().includes('Project ID'),
      'Legacy — Project detail',
    );
    if (pdOk) pass(`Legacy — Project detail navigated: ${location.hash}`);
    else fail('Legacy — Project detail did not navigate');
  } else {
    fail('Legacy — no project row found to open detail');
  }
  await go('#/reviews', 'Reviews', 'Legacy — Reviews');
  await go('#/runs', 'Runs', 'Legacy — Runs');
}

// ---- Build identity (§14) — the rendered sidebar shows a REAL short SHA -----
{
  const meta = host('build-meta');
  const identity = meta.textContent || '';
  const realSha = /^Build [0-9a-f]{7,}/.test(identity);
  if (realSha) pass(`Build identity rendered: ${identity}`);
  else fail(`Build identity not rendered: "${identity}"`);
}

// ---- Secret boundary on the browser bundle ----------------------------------
{
  let bundle = '';
  try { bundle = readFileSync(new URL('./dist/bundle.js', import.meta.url), 'utf8'); }
  catch (e) { fail(`cannot read bundle: ${e.message}`); }
  const forbidden = [
    'FEISHU_APP_SECRET', 'FEISHU_APP_ID', 'FEISHU_BASE_APP_TOKEN',
    'FEISHU_LEAD_TABLE_ID', 'FEISHU_CUSTOMER_TABLE_ID', 'FEISHU_PROJECT_TABLE_ID',
    'FEISHU_TASK_TABLE_ID', 'FEISHU_ASSET_TABLE_ID', 'LUMEN_AUTH_PASSWORD',
    'LUMEN_BASE_URL', 'open-apis', 'app_token',
  ];
  const leaks = forbidden.filter((t) => bundle.includes(t));
  if (leaks.length === 0) pass('browser bundle carries no FEISHU_/LUMEN_ secret tokens');
  else fail(`browser bundle leaked: ${leaks.join(', ')}`);
}

console.log(failed ? 'SMOKE_PRODUCT_INTEGRATION_FAIL' : 'SMOKE_PRODUCT_INTEGRATION_OK');
process.exit(failed ? 1 : 0);
