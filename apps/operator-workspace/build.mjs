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
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

const alias = {
  '@busos/contracts': resolve(repoRoot, 'packages/contracts/src/index.ts'),
  '@busos/business-repository': resolve(repoRoot, 'packages/business-repository/src/index.ts'),
  '@busos/workspace-read': resolve(repoRoot, 'packages/workspace-read/src/index.ts'),
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
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: 'globalThis.process = globalThis.process || { env: {} };' },
  logLevel: 'info',
});

console.log('operator-workspace build complete -> dist/bundle.js');
