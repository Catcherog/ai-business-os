# Operator Workspace (`@busos/operator-workspace`)

The AI Business OS Operator Workspace — a minimal, maintainable TypeScript web app
that productizes the R1 core (Golden Path → Project Lifecycle → Creative Production)
behind the navigation surfaces **Overview / Projects / Reviews / Runs / Business
Data / Scheduling / Evaluation**, plus the first real AI action — **Generate
Visual Reference** (H1-04).

It ships in two explicit modes:

- **DEMO** — runs entirely in the browser against in-memory `FakeFeishuAdapter` +
  `FakeLumenAdapter`. No Feishu/Lumen credentials ever reach the client. Good for
  local review and CI.
- **CONNECTED** — a server-only boundary (`server/`) that builds the real
  `RealFeishuAdapter` / `RealLumenAdapter` from `FEISHU_*` / `LUMEN_*` env vars. The
  browser never loads this code; secrets stay server-side.

The Feishu v3 Business Data and Scheduling surfaces are explicitly connected
surfaces: they read canonical operations data through server routes, label the
source `CONNECTED TEST BASE` when configured, and render `BLOCKED` without
configuration. They never fall back to in-memory demo data. Scheduling
proposals are read-only decision support; local confirmation changes only UI
state, and outreach drafts can be copied but never sent.

## Prerequisites

- Node 22 (managed runtime recommended)
- npm 10+

## Install

From the repo root (npm workspaces):

```bash
npm ci          # or: npm install   (reproducible from package-lock.json)
```

This installs the root dev tooling (`typescript`, `esbuild`, `vitest`,
`@types/node`) and links the `@busos/*` workspace packages.

## Build

```bash
npm run build --workspace=@busos/operator-workspace
# or from this directory:
npm run build     # node build.mjs
```

`build.mjs` (esbuild) emits:

- `dist/bundle.js` — the browser SPA (DEMO mode; contains **no** secrets)
- `dist/index.html` + `dist/styles.css` — self-contained static deploy root (asset
  refs rewritten to the bundled siblings; BUSOS-R2-X01)
- `server/dist/*.js` — the node CONNECTED boundary + HTTP server

Every build bakes a **build identity** (BUSOS-R2-X01): `Build SHA` (from
`VERCEL_GIT_COMMIT_SHA` when building on Vercel, else `git rev-parse --short
HEAD`, else a safe `unknown` fallback) and the `DEMO` mode badge. The sidebar
footer renders `DEMO · Build <sha> · BUSOS-R2-X01`. No environment variable
value or secret is ever included in the bundle.

## Public preview / deployment (BUSOS-R2-X01)

A root `vercel.json` makes the workspace deployable as a static site:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "apps/operator-workspace/dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

The SPA is fully in-memory (no URL routing), so any path falls back to
`index.html` (no 404 on direct load / refresh). One-command deploy (after
`vercel login` / `vercel link`):

```bash
vercel --prod
```

This deploys a **DEMO** preview: browser-internal `FakeFeishuAdapter` +
`FakeLumenAdapter` + in-memory registry. The CONNECTED server boundary and any
real credential stay out of the static site.

## Run

### DEMO (browser, in-memory fakes)

Serve `dist/` over any static file server, e.g.:

```bash
npx serve .        # then open the printed URL (index.html loads dist/bundle.js)
```

Open a Project from the **Projects** list → **Project Detail** → **Generate Visual
Reference**: enter a prompt and a single source image (`png`/`jpeg`/`webp`, ≤5 MB) →
**Generate**. The result appears as a new Run (Runs surface) and a new Task + Asset
on the Project Detail. Mode is labelled **DEMO**.

### CONNECTED (server-only, real Feishu + Lumen)

```bash
LUMEN_BASE_URL=... LUMEN_AUTH_PASSWORD=... \
FEISHU_APP_ID=... FEISHU_APP_SECRET=... FEISHU_BASE_APP_TOKEN=... \
FEISHU_PROJECT_TABLE_ID=... FEISHU_TASK_TABLE_ID=... FEISHU_ASSET_TABLE_ID=... \
node server/dist/server.js
```

The server hosts the static SPA and exposes the only CONNECTED trigger:

```bash
curl -X POST http://localhost:4173/api/actions/generate-visual-reference \
  -H 'content-type: application/json' \
  -d '{"projectId":"<existing>","prompt":"...","sourceImageBase64":"...","sourceImageMimeType":"image/png"}'
```

Without credentials the boundary returns `{ "mode": "BLOCKED", "reason": "..." }` —
it never substitutes a faked LIVE result.

For the v3 operations surface, configure the target Base server-side with
`FEISHU_TARGET_BASE_TOKEN` and the target table mappings. Do not place these
values in browser environment variables, source files, reports, or logs.

## Test / verify

From the repo root:

```bash
npm run verify                 # typecheck && test && build && smoke (all workspaces)
```

Or just this app:

```bash
npm run typecheck              # tsc --noEmit (src + server)
npm run smoke                  # node smoke.mjs && node smoke-action.mjs && node smoke-server.mjs
```

Smoke suites (headless, DOM-shimmed):

- `smoke.mjs` — bundle loads, renders, **no** `FEISHU_*`/`LUMEN_*`/`open-apis`/`app_token`
  leak; Reviews/Runs/GVR labels present.
- `smoke-action.mjs` — drives the REAL in-browser `runGenerateVisualReference` (DEMO):
  asserts `SUCCEEDED` + `assetId`/`assetUri` + a real Task/Asset written + the run
  recorded in the shared registry + idempotency replay + no secret leak.
- `smoke-server.mjs` — drives the CONNECTED boundary probe; asserts `BLOCKED` with no
  credentials.
- `smoke-feishu-v3.mjs` — loads the v3 browser bundle in a DOM shim, asserts the
  connected-surface labels, and rejects target/source tokens, access-token names,
  or Feishu OpenAPI paths in the browser artifact.
- `smoke-preview.mjs` (X01) — asserts the built static preview carries a real build
  SHA (X01-A/B), no secret in the bundle (X01-C), and that `dist/` is a complete
  self-contained static site (X01-D).

## Packages touched

- `@busos/orchestrator` — `runCreativeProjectAction` (narrow H1-04 entry; CREATIVE_PRODUCTION only)
- `@busos/creative-production` / `@busos/lumen-adapter` — reused unchanged
- `@busos/business-repository` / `@busos/workspace-read` / `@busos/workspace-run` — reused

## Security boundary

The browser bundle imports **only** the DEMO fakes. The `Real*` adapters + live
credentials live exclusively in `server/` and are never bundled for the browser. The
prompt, source image, and all secrets stay server-side and never enter the trace.
