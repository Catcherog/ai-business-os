// Build identity (BUSOS-R2-X01).
//
// These identifiers are injected at BUILD TIME by `build.mjs` via esbuild
// `define` — never hard-coded in source. Source order for the SHA:
//   1. `VERCEL_GIT_COMMIT_SHA` (Vercel deployment metadata, full SHA → short)
//   2. `git rev-parse --short HEAD` at build time (local / CI builds)
//   3. `'unknown'` safe fallback (metadata unavailable)
// No environment variable VALUE or secret is ever exposed — only a short,
// non-sensitive commit identifier plus the release/mode labels.

declare const __BUILD_SHA__: string;
declare const __RELEASE__: string;
declare const __BUILD_MODE__: string;

export const buildSha: string = __BUILD_SHA__;
export const release: string = __RELEASE__;
export const buildMode: string = __BUILD_MODE__;
