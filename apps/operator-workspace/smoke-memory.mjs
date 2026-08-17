// Faithful headless UI smoke for the H2-01 Memory / 项目上下文 section.
//
// Bundles the real UI module graph (ui.ts + api.ts) with esbuild (same aliases
// as build.mjs, + @busos/memory), then drives it through a minimal DOM shim:
//   Projects list  ->  open 林晚晴's project  ->  the read-only Memory section
//   renders the seeded CUSTOMER PREFERENCE (canonical scenario, gate I + J).
// The browser bundle carries NO credentials and NO memory write path.
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

const outfile = join(tmpdir(), 'busos-memory-smoke-driver.mjs');
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
    '@busos/memory': resolve(repoRoot, 'packages/memory/src/index.ts'),
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

// Minimal DOM shim that supports exactly what ui.ts uses.
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

const driver = await import('file://' + outfile);
let failed = false;
const fail = (m) => { console.error('MEMORY_SMOKE_FAIL:', m); failed = true; };

try {
  await driver.initWorkspace();
  driver.renderApp(driver.getService());

  // Projects list — open 林晚晴's project detail.
  driver.navigate('projects');
  await new Promise((r) => setTimeout(r, 300)); // let the async list render
  const row = find(
    (e) => (e.className || '').includes('project-row') && textOf(e).includes('林晚晴 · 新中式写真'),
  );
  if (!row) {
    fail('Projects list did not render a row for 林晚晴 · 新中式写真');
  } else {
    await row.click(); // open project detail (async; renders Memory section)
    await new Promise((r) => setTimeout(r, 400));

    const content = globalThis.document.getElementById('content');
    const rendered = textOf(content);

    if (!rendered.includes('Memory')) {
      fail(`Memory section heading not rendered. Snippet: ${rendered.slice(0, 300)}`);
    } else if (!rendered.includes('新中式') || !rendered.includes('避免过度磨皮')) {
      fail(`Seeded CUSTOMER PREFERENCE not shown in Memory section. Snippet: ${rendered.slice(0, 400)}`);
    } else {
      console.log('MEMORY_SMOKE_OK — Project Detail renders seeded customer preference in read-only Memory section');
    }
  }

  // Programmatic read: resolve the demo customer id from the project workspace,
  // then confirm the canonical memory is ACTIVE and anchored to that customer.
  const memSvc = driver.getMemoryService();
  const projects = await driver.getService().listProjects();
  const proj = projects.find((p) => p.title.includes('林晚晴 · 新中式写真'));
  if (!proj) {
    fail('林晚晴 project not found via WorkspaceReadService');
  } else {
    const ws = await driver.getService().getProjectWorkspace(proj.project_id);
    const ctx = await memSvc.listForContext(proj.project_id, ws.customer?.customer_id);
    const pref = ctx.find((m) => m.memory_type === 'PREFERENCE' && m.content.includes('新中式'));
    if (!pref) {
      fail('No active CUSTOMER PREFERENCE memory found in project context');
    } else if (pref.status !== 'ACTIVE') {
      fail(`Seeded preference is not ACTIVE (status=${pref.status})`);
    } else {
      console.log('MEMORY_SMOKE_OK — MemoryService context exposes active seeded preference (provenance + lifecycle intact)');
    }
  }
} catch (e) {
  fail(e && e.stack ? e.stack : String(e));
}

process.exit(failed ? 1 : 0);
