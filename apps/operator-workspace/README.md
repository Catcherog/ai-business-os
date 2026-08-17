# Operator Workspace (`@busos/operator-workspace`)

The AI Business OS Operator Workspace — a minimal, maintainable TypeScript web app
that productizes the R1 core (Golden Path → Project Lifecycle → Creative Production)
behind four navigation surfaces: **Overview / Projects / Reviews / Runs**, plus the
first real AI action — **Generate Visual Reference** (H1-04).

It ships in two explicit modes:

- **DEMO** — runs entirely in the browser against in-memory `FakeFeishuAdapter` +
  `FakeLumenAdapter`. No Feishu/Lumen credentials ever reach the client. Good for
  local review and CI.
- **CONNECTED** — a server-only boundary (`server/`) that builds the real
  `RealFeishuAdapter` / `RealLumenAdapter` from `FEISHU_*` / `LUMEN_*` env vars. The
  browser never loads this code; secrets stay server-side.

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
- `server/dist/*.js` — the node CONNECTED boundary + HTTP server

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

## Packages touched

- `@busos/orchestrator` — `runCreativeProjectAction` (narrow H1-04 entry; CREATIVE_PRODUCTION only)
- `@busos/creative-production` / `@busos/lumen-adapter` — reused unchanged
- `@busos/business-repository` / `@busos/workspace-read` / `@busos/workspace-run` — reused

## Security boundary

The browser bundle imports **only** the DEMO fakes. The `Real*` adapters + live
credentials live exclusively in `server/` and are never bundled for the browser. The
prompt, source image, and all secrets stay server-side and never enter the trace.
