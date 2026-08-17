# BUSOS-R2-H1-04 — First Real AI Action Vertical Slice (Generate Visual Reference)

**Status: ENGINEERING COMPLETE — LIVE GATE BLOCKED (BL-018)**
**Date: 2026-08-17**
**Baseline: `origin/main` = `91e614360d08c65c3fca4739f66b4ebaca3f549e`** (verified equal)
**Pushed: `af04cc97acf9fa4e211434bc75499c8ed82eb346` → `origin/main` (fast-forward from `91e61436`); remote HEAD verified = `af04cc9`**

This task delivers the **first real AI-assisted business action** — `Generate Visual
Reference` — behind the Operator Workspace Project Detail view. An existing Project
runs through the real **Creative Production → Lumen → Asset** path and the resulting
Run (status + trace) and the new Task/Asset surface in the same workspace the Runs
and Project Detail views already render.

Per requirement #7 the **live gate is honestly reported BLOCKED** — it was not
executed against real Feishu + real Lumen because `LUMEN_*` + `FEISHU_*` credentials
and CloudBase quota are not available (BL-018). The task STOPS after commit + push;
it does **not** auto-start H1-05 / H2 / H3 / H4.

---

## 1. What was built

### 1.1 Narrow orchestrator entry — `runCreativeProjectAction` (NEW, `@busos/orchestrator`)
`packages/orchestrator/src/run-creative-project-action.ts`

- Runs **only** `CREATIVE_PRODUCTION` via the existing `executeCreativeProduction`
  (bounded `Project → Task → Lumen → Asset → Task-DONE`, with readback VERIFIED).
- Does **NOT** call `runBusinessProcess`. Adds **no** second state machine and **no**
  generic Action framework (requirement #4).
- Reuses the P6 contract directly: `BusinessProcessStatus` / `BusinessProcessStage` /
  `ProcessRegistry` / `sanitizeTraceMetadata` / `sanitizeMessage` / `classifyFailure`.
- Maps: `CREATIVE_SUCCESS` → `SUCCEEDED` (`output: { projectId, taskId, assetId, assetUri }`);
  `BLOCKED` → `REJECTED` (business, never a fault); `FAILED` → classified system error
  (`CREATIVE_GENERATION_FAILED` / `RETRYABLE`).
- **Idempotency**: a supplied `idempotencyKey` replays the recorded outcome against the
  shared `ProcessRegistry` with **zero** re-execution — a double-click cannot create a
  second Task/Asset. A key without a registry fails closed (`INVALID_INPUT` / `TERMINAL`).
- **Trace never carries** the prompt, `source_image_base64`, or any secret (P6 allowlist
  only; `executeCreativeProduction` itself emits no trace).

Exported from `packages/orchestrator/src/index.ts`.

### 1.2 Browser DEMO action — `src/action.ts` (`apps/operator-workspace`)
- `runGenerateVisualReference(input, idempotencyKey)` runs the narrow entry against the
  **shared in-memory** fake `BusinessRepository` + `createFakeLumenAdapter()` + the SAME
  `InMemoryProcessRegistry` the Runs surface reads. So the new run + Task + Asset appear
  on Runs and the Project Detail view automatically.
- Fake/Demo data is labelled **DEMO** in the UI (badge + copy) and is never presented as
  LIVE (requirement #6).

### 1.3 Project Detail UI — `src/ui.ts` (`apps/operator-workspace`)
- New `Generate Visual Reference` panel on Project Detail: prompt textarea + single source
  image input (`accept="image/png,image/jpeg,image/webp"`, MIME-validated, ≤5 MB) +
  stable `idempotencyKey` (djb2 hash of `projectId|prompt|image-bytes`) + Generate button.
- Renders the result: status pill, DEMO badge, `processId`; on `SUCCEEDED` shows
  `assetId`/`assetUri` + "查看 Run →" / "刷新项目详情" navigation; on `REJECTED`/`FAILED`
  shows the sanitized reason/message (raw secrets never reach the UI).

### 1.4 Server-only CONNECTED boundary — `server/` (`apps/operator-workspace`)
- `server/workspace-action.ts` — `runConnectedGenerateVisualReference` builds
  `RealFeishuAdapter` / `RealLumenAdapter` from `FEISHU_*` / `LUMEN_*` env vars
  (`createFeishuAdapterFromEnv` / `createLumenAdapterFromEnv`). With no credentials it
  short-circuits to **BLOCKED** (honest, never a faked LIVE result).
- `server/action-driver.ts` — `runConnectedProbe(env)` drives the boundary with a
  synthetically-valid input but no credentials; used by the smoke.
- `server/server.ts` — minimal Node HTTP server hosting the static SPA + the only
  CONNECTED trigger `POST /api/actions/generate-visual-reference`.
- This module is **never** imported by the browser graph; secrets stay server-side
  (requirement #2).

### 1.5 Reproducible engineering entry (requirement #1)
- Root `package.json`: npm workspaces (`packages/*`, `apps/*`) + `verify`
  (`typecheck && test && build && smoke`). `ci` = `npm install && npm run verify`
  (committed lockfile pins the tree; `npm install` chosen over `npm ci` for resilience
  in this sandbox's restricted-network / shared-cache-EPERM conditions).
- `apps/operator-workspace` `package.json` / `tsconfig.json` (with `@busos/*` path
  aliases) / `build.mjs` (esbuild → `dist/bundle.js` browser + `server/dist/*.js` node).
- `.github/workflows/ci.yml` — minimal CI running `npm ci && npm run verify`.
- Single committable `package-lock.json` (generated; see §5).

---

## 2. Verification

| Gate | Result | Evidence |
|------|--------|----------|
| H1-04-A Authority / scope | PASS | `origin/main` = `91e61436` confirmed; no H1-05 work |
| H1-04-B Narrow entry | PASS | `creative-action.test.ts` **6/6** |
| H1-04-C DEMO browser action | PASS | `smoke-action.mjs` → `SMOKE_ACTION_OK` (SUCCEEDED + assetId/assetUri + real Task DONE + Asset + run recorded) |
| H1-04-D Idempotency | PASS | unit dedup + browser smoke (counts stay 1) |
| H1-04-E Trace sanitization | PASS | unit leak test (no prompt/base64/secret) |
| H1-04-F Browser secret boundary | PASS | `smoke-action.mjs` forbidden-token scan clean |
| H1-04-G CONNECTED boundary | PASS | `smoke-server.mjs` → `SMOKE_SERVER_OK` (BLOCKED, no creds) |
| H1-04-H Two modes / DEMO label | PASS | static review + UI badge |
| H1-04-I Build / type safety | PASS | app `tsc --noEmit` clean (src+server); both bundles build |
| H1-04-J Regression | PASS | orchestrator **43/43** (37 P6 + 6 H1-04); app smokes all OK |
| **H1-04 LIVE GATE** | **BLOCKED** | **BL-018** — no `LUMEN_*`/`FEISHU_*` + CloudBase quota |

### 2.1 Orchestrator unit tests (H1-04)
`packages/orchestrator/tests/creative-action.test.ts` (6 tests, all pass):
1. CREATIVE_PRODUCTION on existing project → SUCCEEDED + assetId/assetUri; exactly one
   Task (DONE) + one Asset written; trace has exactly one stage.
2. Empty prompt → REJECTED / `PROMPT_EMPTY`, zero writes.
3. Lumen failure → FAILED / `CREATIVE_GENERATION_FAILED` / `RETRYABLE`, no asset.
4. Duplicate `idempotencyKey` → replayed (`deduplicated: true`), no 2nd Task/Asset.
5. Key without registry → fails closed `INVALID_INPUT`.
6. Trace never emits prompt / source image / `Bearer`/`password`/`token`/`secret`/`api_key`/`lumen-stub://`.

### 2.2 Smoke (headless, DOM-shimmed)
- `smoke.mjs` → `SMOKE_OK` (base bundle load + no secret leak).
- `smoke-action.mjs` → `SMOKE_ACTION_OK`: mode DEMO, status SUCCEEDED, real Task/Asset
  written, run recorded in shared registry, idempotency replay, **no** `FEISHU_*`/
  `LUMEN_AUTH_PASSWORD`/`open-apis`/`app_token` in the browser bundle.
- `smoke-server.mjs` → `SMOKE_SERVER_OK`: CONNECTED boundary returns `BLOCKED` with no
  credentials.

---

## 3. Security boundary (requirement #2 / §4 / §19)
- The browser bundle imports ONLY `src/action.ts` (DEMO fakes). A static scan confirms
  it contains **none** of: `FEISHU_APP_SECRET`, `FEISHU_APP_ID`, `FEISHU_BASE_APP_TOKEN`,
  `FEISHU_*_TABLE_ID`, `LUMEN_AUTH_PASSWORD`, `LUMEN_BASE_URL`, `open-apis`, `app_token`.
- The `RealFeishuAdapter` / `RealLumenAdapter` + live credentials live **only** in
  `server/`, which the browser never loads. The prompt, `source_image_base64`, and all
  secrets stay server-side and never enter the trace or the browser.
- Single process / single operator. No RBAC, no multi-tenant, no Redis, no MQ.

---

## 4. Files changed (summary)
- `packages/orchestrator/src/run-creative-project-action.ts` (NEW)
- `packages/orchestrator/src/index.ts` (export `runCreativeProjectAction` + types)
- `packages/orchestrator/tests/creative-action.test.ts` (NEW, 6 tests)
- `apps/operator-workspace/src/action.ts` (NEW — DEMO action)
- `apps/operator-workspace/src/api.ts` (`getActionRepo` / `getActionRegistry` seam)
- `apps/operator-workspace/src/ui.ts` (`Generate Visual Reference` panel)
- `apps/operator-workspace/src/main.ts` (smoke-export seam), `smoke-driver.ts`, `styles.css`
- `apps/operator-workspace/server/*` (NEW — CONNECTED boundary + HTTP server)
- `apps/operator-workspace/build.mjs` (browser + server bundles), `tsconfig.json` (server)
- `apps/operator-workspace/smoke-action.mjs`, `smoke-server.mjs` (NEW)
- `apps/operator-workspace/index.html` (footer H1-02 → H1-04)
- Root `package.json`, `package-lock.json`, `.github/workflows/ci.yml` (NEW)
- `project-control/01-MASTER-PLAN.md`, `02-CURRENT-STATE.md`, `04-INTERFACES.md` (§11),
  `05-TEST-GATES.md` (H1-04 gates), `06-BACKLOG.md` (BL-018 H1-04 note) — updated.

---

## 5. Known limitations / deferred
- **LIVE GATE not executed** (BL-018): real Feishu Project write + real Lumen generation
  + real Asset write + readback VERIFIED + UI Run/Asset view. When `LUMEN_BASE_URL` +
  `LUMEN_AUTH_PASSWORD` + `FEISHU_*` + `FEISHU_ASSET_TABLE_ID` + CloudBase quota are
  available, run `runConnectedGenerateVisualReference` once (or POST the server endpoint)
  to claim the live gate. This is **not** substituted by the DEMO PASS.
- The single root `package-lock.json` (**59246 bytes**) **was generated and committed**.
  It was produced with an isolated npm cache (`--cache=/tmp/npm-lock-cache`) to bypass a
  shared `_cacache/index-v5` `EPERM` (antivirus/lock) that blocked the default cache in
  this sandbox. The reproducible entry is complete: root `package.json` workspaces +
  `verify` script + committed lockfile + `.github/workflows/ci.yml`. CI's `ci` script
  uses `npm install` (not `npm ci`) as a deliberate robustness choice in this restricted
  environment; the committed lockfile still pins the dependency tree, and `npm ci` would
  also resolve in a clean clone with network.

---

## 6. STOP
H1-04 engineering is complete and all engineering gates pass. The live gate is BLOCKED
(BL-018) and is reported honestly. Per the STOP rule, **H1-05 / H2 / H3 / H4 are NOT
started**. **DONE: committed `af04cc9`, pushed to `origin/main`, remote HEAD verified =
`af04cc9` (2026-08-17).** Await explicit owner authorization before any further H1/R2 work.
