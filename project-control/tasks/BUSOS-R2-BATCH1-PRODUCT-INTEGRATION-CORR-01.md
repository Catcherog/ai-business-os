# BUSOS-R2-BATCH1-PRODUCT-INTEGRATION-CORR-01 — Audit Packet

## Status

- Engineering: **PASS**
- DEMO: **PASS** — Service Agent / Business Data / Evaluation are real,
  discoverable, clickable product surfaces in the Operator Workspace SPA
  (typed router + real UI render + Overview entry cards).
- CONNECTED (server boundary): **PASS (registered + served)** — the built
  `server/dist/server.js` serves `/`, `/api/evaluation/report` (real Golden Set,
  `SUCCESS 42/28/14`), `/api/business-data/customers` (honest
  `CONNECTED/BLOCKED`), and `/api/service-agent/*` (fail-closed `READY` stub).
  No production binding was authorized or attempted.
- LIVE / Owner acceptance: **NOT AUTHORIZED / PENDING**.
- Implementation commit: `f1a351643a5797a001881c774db3d11c722406a4`
  (`f1a3516`).
- Final report commit: **externally verified after push; not written here to
  avoid a self-referential SHA** (protocol §4).
- Deterministic Evaluation harness: **unchanged** — same evaluators, gates and
  canonical Golden Set (42 total / 28 PASS / 0 FAIL / 0 ERROR / 14
  NOT_EVALUABLE); no judge behavior modified.

## Authority and isolation

- Remote baseline: `origin/main@1b58f42e0339447ce1dc7cd06fc3540b4ad5b79e`
  (frozen baseline, verified by `git ls-remote` before and after).
- Branch: `codex/busos-r2-batch1-product-integration-corr-01`.
- Worktree: `D:/360Downloads/Trae 项目/busos-corr01` (isolated; the dirty main
  checkout and coordinator worktrees were not used as implementation
  workspaces).
- Dependency isolation: `npm ci` in the worktree against the **unchanged**
  baseline `package-lock.json` / `package.json` / operator `package.json`;
  `@busos/*` resolves to the worktree's own packages (verified by vitest runs).

## Root cause (frozen in the task)

Batch 1's Service Agent / Business Data / Evaluation feature modules reached
`main` without Router / Navigation / UI shell / server registration wiring. The
final build therefore exposed only `Overview / Projects / Reviews / Runs` in the
user interface — the three new feature modules existed as code but were not
product-visible.

## What was wired

- **Router / Navigation** (`src/router.ts`): `NavigationId` extended with
  `service-agent` / `business-data` / `evaluation`; `Route` extended with
  `service-agent`, `business-data`, `business-data-detail`, `evaluation`;
  `NAVIGATION` now has 7 entries; `parseRoute` / `serializeRoute` /
  `isNavigationActive` extended (fail-closed on unknown hash → overview).
- **UI shell** (`src/ui.ts` + `src/styles.css`): four view functions
  (`viewServiceAgent`, `viewBusinessData`, `viewBusinessDataCustomer`,
  `viewEvaluation`), `routeForView` / `renderContent` / `syncRoute` cases,
  lazy feature holders, and an Overview「新增产品面（Product Integration）」
  section with capability-card entry buttons.
- **DEMO data channels** (`src/demo/*`, browser-safe, no credentials):
  - `service-agent-demo.ts` — reuses the real orchestrator
    `runServiceAgentConsultation` with a deterministic in-memory
    `ServiceAgentPort` stand-in and the shared `InMemoryProcessRegistry`
    (`instanceof`-narrowed), so consultations produce canonical Runs visible on
    the Runs surface.
  - `business-data-demo.ts` — projects the seeded customers / leads / projects
    into the `BusinessDataEnvelope` contract (honest `CONNECTED` DEMO
    projection, read-only).
  - `evaluation-demo.ts` — runs the real `createEvaluationReportStore` over the
    bundled canonical Golden Set (42 / 28 / 14), never a hard-coded number.
- **Server registration** (`server/server.ts`): registered
  `/api/service-agent/*` (fail-closed stub, `SERVICE_AGENT_NOT_CONFIGURED`),
  `/api/evaluation/report` (real deterministic Golden Set), and
  `/api/business-data/customers` (+ `/:id`) (read-only `CONNECTED/BLOCKED`
  envelopes — honest, never a silent DEMO masquerade).
- **Bundled-server path repair** (same file): esbuild rewrites
  `import.meta.url` to the bundle output, so the original import.meta.url
  relative paths made the built server return 500 for `/` and 422
  `MALFORMED_DATASET` for the Evaluation report. Server paths are now anchored
  on `process.cwd()` with fallbacks, the static SPA host uses `pathToFileURL`,
  and `createEvaluationServerFeature` receives an explicit dataset path.

## Browser product-integration smoke (`smoke-product-integration.mjs`)

Runs the REAL `dist/bundle.js` module graph under a minimal DOM shim and drives
it through the actual hash router / navigation / view functions, then verifies
the built CONNECTED server:

- **A Navigation discovery** — all 7 nav labels present; each surface renders
  via hash navigation; a real nav-button click navigates to Evaluation.
- **B Service Agent** — KB journey (answer / Intent I05 / Risk R1 / Route
  KB_PATH / Evidence 0.87 / canonical Run link) and handoff journey (I03 / R3 /
  HUMAN_PATH / 转人工 / HUMAN_REQUIRED) + governance button rendered.
- **C Business Data** — seeded customer list (林晚晴 / 陈思远) → customer detail
  (Leads / Projects) with real router hash `#/business-data/<id>`.
- **D Evaluation** — UI recompute renders 42 / 28 / 14, and
  `GET /api/evaluation/report` on the built server returns the same canonical
  summary (UI numbers come from the real seam / report API, not hard-coded
  strings).
- **E Legacy regression** — Overview / Projects / Project detail / Reviews /
  Runs still render (GVR / Memory deep journeys remain covered by
  `smoke-action.mjs` / `smoke-memory.mjs` in the same smoke chain).
- Server seams + static SPA host (200) + build identity (rendered short SHA) +
  browser bundle secret scan (no `FEISHU_*` / `LUMEN_*` tokens).

## Test gates

- Operator workspace: `tsc --noEmit` **PASS**; vitest 8 suites / 27 tests
  **PASS**; business-data feature suites 2 files / 7 tests **PASS**.
- `@busos/service-agent-port`: 4 files / 21 tests **PASS** (incl. 3 REAL frozen
  Service Agent E2E via the Python bridge).
- `@busos/evaluation`: 13 files / 86 tests **PASS**.
- Full root verify (`PYTHONUTF8=1 PYTHONIOENCODING=utf-8 npm run verify`):
  **PASS** — all workspace typechecks + tests + operator build + all smokes
  (incl. `SMOKE_PRODUCT_INTEGRATION_OK`).
- `git diff --check`: **clean**.
- Secret scan: **no forbidden tokens** in the browser bundle.

## Exact ownership

Owned/expected changed files (implementation commit `f1a3516`):

- `apps/operator-workspace/build.mjs` (release identity + evaluation alias)
- `apps/operator-workspace/package.json` (smoke chain wiring)
- `apps/operator-workspace/server/server.ts` (product surface registration +
  bundled-server path repair)
- `apps/operator-workspace/smoke-preview.mjs` (release label assertion)
- `apps/operator-workspace/smoke-product-integration.mjs` (new, Journeys A–E)
- `apps/operator-workspace/src/api.ts` (seeded workspace exposure)
- `apps/operator-workspace/src/router.ts` (typed routes + nav)
- `apps/operator-workspace/src/styles.css` (product surface styles)
- `apps/operator-workspace/src/ui.ts` (views + routing + Overview entry cards)
- `apps/operator-workspace/src/demo/service-agent-demo.ts` (new)
- `apps/operator-workspace/src/demo/business-data-demo.ts` (new)
- `apps/operator-workspace/src/demo/evaluation-demo.ts` (new)
- `apps/operator-workspace/tests-workspace-ui/router.test.ts`
- `project-control/tasks/BUSOS-R2-BATCH1-PRODUCT-INTEGRATION-CORR-01.md` (this file)

Unexpected product files: **NONE**. Vitest config timestamp temp files
(`vitest.config.ts.timestamp-*.mjs`) were generated by test runs and removed —
never committed. `package-lock.json` remains **UNCHANGED** vs baseline.

## Deferred (prohibitions unchanged)

Production deployment, SCS Production Connect, CloudBase redeploy, real Feishu
credentials/writes, Lumen repair, BL-018 closure, secret operations, H3, H4,
force push / reset --hard / clean / gc / prune / shared object repair — all
remain outside this task. The next authorized step is Owner product review /
acceptance of this correction (or an explicitly authorized follow-on task).
