// Faithful headless UI smoke for the Reviews surface (H1-02-I).
//
// Bundles the real UI module graph (ui.ts + api.ts) with esbuild (same aliases
// as build.mjs), then drives it through a minimal DOM shim:
//   Reviews list  ->  open a pending review  ->  inspect candidate/governance/
//   evidence  ->  Approve  ->  UI reflects terminal COMMITTED outcome.
// This exercises the exact code path the browser buttons invoke (the UI simply
// delegates to WorkspaceReviewService, which delegates to HumanReviewService).
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

// 1) Bundle the real UI driver (everything inlined; no @busos imports remain).
const outfile = join(tmpdir(), 'busos-review-smoke-driver.mjs');
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

// 3) Drive the flow.
const driver = await import('file://' + outfile);
let failed = false;
const fail = (m) => { console.error('REVIEW_SMOKE_FAIL:', m); failed = true; };

try {
  await driver.initWorkspace();
  driver.renderApp(driver.getService());

  // Reviews list
  driver.navigate('reviews');
  const row = find((e) => (e.className || '').includes('review-row') && textOf(e).includes('cand_rev_r1'));
  if (!row) { fail('Reviews list did not render a row for cand_rev_r1'); }
  else {
    await row.click(); // open review detail
  }

  // Review detail — action panel present
  const approveBtn = find((e) => (e.className || '').includes('btn-approve'));
  if (!approveBtn) { fail('Review detail did not render an Approve button'); }
  else {
    await approveBtn.click(); // perform APPROVE
  }

  // UI must now reflect the terminal COMMITTED outcome
  const content = globalThis.document.getElementById('content');
  const rendered = textOf(content);
  if (!/COMMITTED|已提交/.test(rendered)) {
    fail(`Outcome not reflected as COMMITTED. Snippet: ${rendered.slice(0, 200)}`);
  } else {
    console.log('REVIEW_SMOKE_OK — Reviews → detail → Approve → COMMITTED reflected in UI');
  }
} catch (e) {
  fail(e && e.stack ? e.stack : String(e));
}

process.exit(failed ? 1 : 0);
