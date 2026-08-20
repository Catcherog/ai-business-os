// Build the Operator Workspace frontend into a single static bundle.
//
// No separate frontend/backend deployment (H1-01): the browser bundle talks
// only to the in-memory FakeFeishuAdapter through WorkspaceReadService, so no
// Feishu credentials are ever shipped to the client. The production
// RealFeishuAdapter path is exercised only by the server-side simulator tests.
//
// `node:crypto` is aliased to a tiny browser shim because business-repository's
// id generator (util.ts) uses randomBytes; in the demo only the fake adapter is
// used, so a hex-capable randomBytes is sufficient.
import * as esbuild from 'esbuild';
import { execSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

// ---- Build identity (BUSOS-R2-X01) -----------------------------------------
// The preview must answer "which Git commit am I looking at?" without shipping
// any secret. Source order: Vercel build env (deployment metadata) → real local
// Git HEAD → safe fallback. Never a hard-coded SHA.
function computeBuildSha() {
  const fromEnv = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').trim();
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    const git = execSync('git rev-parse --short HEAD', {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (git) return git.slice(0, 7);
  } catch {
    // fall through to the safe fallback below
  }
  return 'unknown';
}
const BUILD_SHA = computeBuildSha();
const RELEASE = 'BUSOS-R2-X01';
const BUILD_MODE = 'DEMO';
const buildDefine = {
  'process.env.NODE_ENV': '"production"',
  __BUILD_SHA__: JSON.stringify(BUILD_SHA),
  __RELEASE__: JSON.stringify(RELEASE),
  __BUILD_MODE__: JSON.stringify(BUILD_MODE),
};

const alias = {
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
};

await esbuild.build({
  entryPoints: [resolve(__dirname, 'src/main.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  outfile: resolve(__dirname, 'dist/bundle.js'),
  alias,
  define: buildDefine,
  charset: 'utf8',
  banner: { js: 'globalThis.process = globalThis.process || { env: {} };' },
  logLevel: 'info',
});

// ---- X01: self-contained static deploy root ---------------------------------
// Vercel serves `dist/` directly. Emit dist/index.html (asset refs rewritten to
// the bundled siblings) + dist/styles.css so the directory is a complete static
// site with no absolute / localhost / node_modules dependency.
const htmlSource = readFileSync(resolve(__dirname, 'index.html'), 'utf8');
const htmlDeploy = htmlSource
  .replace('href="./src/styles.css"', 'href="./styles.css"')
  .replace('src="./dist/bundle.js"', 'src="./bundle.js"');
writeFileSync(resolve(__dirname, 'dist/index.html'), htmlDeploy, 'utf8');
copyFileSync(resolve(__dirname, 'src/styles.css'), resolve(__dirname, 'dist/styles.css'));

console.log(`operator-workspace build complete -> dist/bundle.js (${BUILD_MODE} · build ${BUILD_SHA} · ${RELEASE})`);

// ---- Server-only CONNECTED boundary (node platform, real crypto) ----
// The browser bundle must NEVER include server/ — it lives only here, with the
// real Feishu/Lumen adapters and credentials. Node keeps `node:crypto` native,
// so we drop the browser shim alias for this build.
const serverAlias = { ...alias };
delete serverAlias['node:crypto'];
await esbuild.build({
  entryPoints: [
    resolve(__dirname, 'server/action-driver.ts'),
    resolve(__dirname, 'server/server.ts'),
  ],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outdir: resolve(__dirname, 'server/dist'),
  alias: serverAlias,
  banner: { js: 'globalThis.process = globalThis.process || { env: {} };' },
  logLevel: 'info',
});
console.log('operator-workspace server build complete -> server/dist');
