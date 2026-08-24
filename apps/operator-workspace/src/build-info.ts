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

// esbuild `define` injects the identifiers above at bundle time. Under plain
// vitest (no define) they are undefined identifiers, so guard with `typeof` and
// fall back to a stable test-friendly identity instead of a ReferenceError —
// bundle output is unchanged because `define` still replaces the identifier.
export const buildSha: string = typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'unknown';
export const release: string = typeof __RELEASE__ !== 'undefined' ? __RELEASE__ : 'unknown';
export const buildMode: string = typeof __BUILD_MODE__ !== 'undefined' ? __BUILD_MODE__ : 'unknown';
