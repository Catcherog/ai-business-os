# BUSOS-R2-BATCH2C-LUMEN-RUNNINGHUB-DEMO-01 — Completion Report

## Task

Converge image editing into a single in-OS product surface **Lumen** — an image
workbench / image capability layer (NOT a single-prompt image API call, and NOT
a jump-to-RunningHub webpage), backed by the **RunningHub** workflow engine as
its workflow backend, for product demo + interview storytelling.

## A. Authority

- **Repository:** `Catcherog/ai-business-os`
- **Base SHA (authority gate):** `729108d8059e3e143194a05f43e510af3587d385`
- **Re-confirmed via `git ls-remote origin refs/heads/main`** at task start AND
  immediately before commit/push: `main = 729108d…` (UNCHANGED).
  **AUTHORITY = PASS.**
- **Branch:** `codex/busos-r2-batch2c-lumen-runninghub-demo-01` (created from the
  base SHA; never developed on `main`; never push / merge / force / rebase `main`).
- **Commits:** implementation `240f5ad`; report (this file) follows.

## B. Product Result

**ENGINEERING + DEMO PRODUCT: PASS.**

- `apps/operator-workspace/src/ui.ts` — `viewLumen()` renders the full workbench:
  (1) capability selection cards, (2) image input (file upload + data-URL paste),
  (3) capability-specific params, (4) run button, (5) status feedback,
  (6) result preview (thumbnail + url + runId / workflowId / duration),
  (7) lightweight in-memory history (`lumenHistory`, cap 8).
- **Capabilities (≥4 required; shipped 5):** `PRODUCT_SHOT` (AI 产品图),
  `BACKGROUND_SWAP` (AI 换背景), `LOCAL_RETOUCH` (AI 局部修图),
  `STYLE_VARIATION` (AI 风格变体) + optional `OUTPAINT` (AI 扩图).
- **Capability-template model:** the user picks a capability template first; the
  form + params adapt to it. NOT a pure prompt-caller.
- **NOT a pure external link:** the OS initiates the run, receives the result,
  and renders it in-page. The LIVE path POSTs to the server CONNECTED boundary
  (`/api/lumen/run`); the DEMO path runs an in-browser Fake adapter. Both render
  result + status + history inside the workbench.
- Router nav entry `lumen` added (`router.ts` + `ui.ts`); `DEMO` tag shown.

## C. RunningHub Integration

- `packages/lumen-adapter/src/runninghub-lumen-adapter.ts` —
  `RunningHubLumenAdapter implements LumenWorkflowPort` implements the **real,
  verified** RunningHub contract:
  - Upload: `POST {base}/task/openapi/upload` (multipart, `fileName`).
  - Create: `POST {base}/task/openapi/create` (JSON; `apiKey` in body +
    `Authorization: Bearer <apiKey>` header).
  - Poll: `POST {base}/task/openapi/outputs` (JSON loop, **bounded by
    `timeoutMs` deadline** — no infinite wait).
  - Status codes normalized: `0`=SUCCESS→`SUCCEEDED`, `804`=running, `813`=queued,
    `805`=failed→`FAILED` (reason surfaced, `apiKey` never in message).
- **Secret boundary (§19):** `RUNNINGHUB_API_KEY` is server-only.
  `apps/operator-workspace/server/lumen-action.ts` (node platform, never bundled
  to the browser) reads it via `createRunningHubAdapterFromEnv(process.env)` and
  exposes `POST /api/lumen/run`. The browser `src/lumen-action.ts` only sends
  `{workflowType, sourceImage, prompt, params}` and receives the result — it
  **NEVER sees the key**.
- **Frontend-only capability registry**
  (`packages/lumen-adapter/src/lumen-capabilities.ts`): `LUMEN_CAPABILITIES`
  describes WHAT the user can do; **ZERO RunningHub detail** (node ids, workflow
  ids, auth) reaches the browser. The server maps the chosen capability → its
  RunningHub workflow from owner configuration.
- **Honest gating:** `createRunningHubAdapterFromEnv` returns `null` when
  `RUNNINGHUB_API_KEY` is absent → server responds `BLOCKED`; the browser maps
  `BLOCKED`→`FAILED` with `errorCode LIVE_BLOCKED`. Never faked success.
- `RunningHubLumenAdapter` constructor throws without an apiKey (fail-closed).

## D. Real Proofs

**REAL WORKFLOW PROOF = BLOCKED (owner-gated), NOT faked.**

- No `.env.local` / `RUNNINGHUB_API_KEY` present in the workspace → the CONNECTED
  path cannot execute a real RunningHub invocation here.
- Correctness of the contract is proven by
  `packages/lumen-adapter/tests/runninghub-adapter.test.ts` (12 tests) with a
  mocked `fetch`: upload / create / outputs codes; success parse; `apiKey` absent
  from error messages; task-create failure; poll `805` failure; bounded-poll
  exhaustion; unconfigured capability; constructor guard; env gating (null vs
  instance); capability-layer ≥4 types; Fake adapter happy / injected-failure.
- The DEMO path uses `FakeRunningHubAdapter` (explicitly Fake, in-memory, returns
  `lumen-demo://runninghub/<id>/out.png`, **never masquerades as real**) — proves
  invocation wiring + UI end-to-end with no secret.
- **Owner action to reach REAL WORKFLOW PROOF PASS:** provide `RUNNINGHUB_API_KEY`
  + `RUNNINGHUB_CONFIG_JSON` (LumenWorkflowType→RunningHubWorkflowConfig) in
  `.env.local`, then run a real `/api/lumen/run` (server) invocation. Until then
  the LIVE gate is honestly BLOCKED.

## E. UI Result

- `npm test --workspace=@busos/operator-workspace` → **36 tests pass** (17 UI +
  19 API), EXIT=0.
- `tests-workspace-ui/lumen-view.test.ts` drives the REAL `ui.ts` through the
  headless DOM shim and asserts: surface renders (`Lumen · AI 图像工作台`);
  ≥4 capability cards with Chinese labels; selecting `AI 产品图` shows its prompt
  field; DEMO run via data URL yields `SUCCEEDED` + `lumen-demo://runninghub/` +
  `DEMO · 模拟 RunningHub` badge; history records
  `{type:PRODUCT_SHOT, status:SUCCEEDED, mode:DEMO}`; and **no forbidden secret
  token** (`apiKey` / `api_key` / `RUNNINGHUB_API_KEY` / `Bearer ` / `password` /
  `secret` / `authorization`) leaks into the rendered presentation.
- `npm run typecheck` (both packages) → clean.
- `npm run build` (operator-workspace) → browser `dist/bundle.js` + server
  `server/dist/server.js` build clean (build metadata reads base SHA `729108d`).
- `npm run smoke` (operator-workspace) → all `SMOKE_OK` / `MEMORY_SMOKE_OK` /
  `PREVIEW_SMOKE_OK`, **no regression** in other surfaces (the shared `ui.ts` /
  `router.ts` / `smoke-driver.ts` edits are verified safe).

## F. Test Matrix

| Suite | Command | Result |
|---|---|---|
| lumen-adapter unit | `npm test --workspace=@busos/lumen-adapter` | 21 passed (7 contract + 12 runninghub + 2 signed-url) |
| lumen-adapter typecheck | `npm run typecheck --workspace=@busos/lumen-adapter` | clean |
| operator-workspace UI | `vitest run tests-workspace-ui` | 17 passed (incl. lumen-view) |
| operator-workspace API | `vitest run tests-workspace-api` | 19 passed (incl. lumen-action) |
| operator-workspace typecheck | `npm run typecheck --workspace=@busos/operator-workspace` | clean |
| operator-workspace build | `npm run build --workspace=@busos/operator-workspace` | browser + server bundles OK |
| operator-workspace smoke | `npm run smoke --workspace=@busos/operator-workspace` | SMOKE_OK (no regression) |
| Full `vitest run` (all dirs) | — | PRE-EXISTING Windows vitest fork crash in `tests-workspace-run/run-surface.test.ts` (untouched, unchanged from base). `npm test` excludes it; required command green. |

**Pre-existing note:** `tests-workspace-run/run-surface.test.ts` imports
cross-package `@busos/orchestrator` helpers and crashes the single-fork worker on
this Windows host (silent exit 1, no output). It is **unchanged from base
`729108d`** and outside this task's scope (no refactor / expansion). The required
`npm test` runs only `tests-workspace-ui` + `tests-workspace-api`, so it is
unaffected.

## G. Deferred (prohibitions unchanged)

- Real RunningHub LIVE proof (owner-gated: needs `RUNNINGHUB_API_KEY` +
  `RUNNINGHUB_CONFIG_JSON`).
- Production deployment / CloudBase redeploy / production release gate.
- Full async worker / queue (current poll is bounded but request-synchronous;
  acceptable for demo).
- Multi-provider routing (single RunningHub backend only).
- Feishu writeback; Service Agent / Business Data / Evaluation rewrites.
- H3 / H4; `creative-production` full integration (Lumen workbench runs
  standalone; seam left for future `creative-production` wiring).
- BL-018 closure; secret operations.

## Final Verdict

- **COMPLETE** (engineering + demo product delivered on the authority base).
- **ENGINEERING PASS**
- **DEMO PRODUCT PASS** (honest in-browser Fake adapter; capability-template
  workbench; no secret leakage into the browser)
- **REAL WORKFLOW PROOF = BLOCKED** (owner-gated — no `RUNNINGHUB_API_KEY`; never
  faked as success)
- **OWNER REVIEW PENDING** (next step: owner supplies RunningHub credentials +
  workflow config to flip the LIVE gate to PASS, then product acceptance /
  merge-to-main)

NOT "PRODUCTION COMPLETE".
