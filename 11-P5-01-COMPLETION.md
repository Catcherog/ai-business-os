# BUSOS-P5-01 — Creative Production Vertical Slice · Completion Evidence

**Date:** 2026-08-13
**Baseline:** `842d91e8b90e99919d577be4d4490937989223d4` (frozen; working tree clean at start)
**Final status:** `IMPLEMENTATION PASS / LIVE CREATIVE E2E BLOCKED`
*(P5-A..P5-H all PASS via fake + real-adapter(stubbed) gates. P5-I REAL end-to-end
is BLOCKED because the Vercel Lumen URL + `AUTH_PASSWORD` and the `FEISHU_*`
credentials (incl. `FEISHU_ASSET_TABLE_ID`) were NOT provided in this environment.
Per the STOP rule the task ends at commit + push + clean tree — no automatic P6.)*

---

## 1. Objective met (R1 P5 alignment)

Implemented the strictly-bounded creative-production vertical slice required by R1
— `Project → Creative Task → Lumen → Asset` — and explicitly **not** a DAM,
workflow engine, orchestrator, multi-agent system, or memory platform:

```
Existing Project (DRAFT / IN_PROGRESS — not CANCELLED/DELIVERED)
→ eligibility check (fail closed, ZERO writes)
→ create Creative Task (task_type CREATIVE_GENERATION, status TODO)
→ readback VERIFIED (D019)
→ Lumen.generate (prompt + single source image base64)
→ create Asset (asset_type IMAGE, source LUMEN, asset_uri from Lumen signedUrls)
→ readback VERIFIED
→ update Task.status -> DONE
→ readback VERIFIED
→ CREATIVE_SUCCESS
```

This task productised **Creative Production only**. No generic task platform, no
workflow DSL, no event bus, no RBAC, no DAM, no multi-agent, no memory were built.
Frozen decisions D001–D020 preserved; the additive contract delta added exactly one
new canonical object (`Asset`) and extended the repository/adapter surface by the
minimal `Task`-status + `Asset` operations.

---

## 2. Files changed

### Additive contract delta — `packages/contracts`
- `src/domain.ts` — canonical `Asset` schema (`asset_id`, `project_id`, `task_id`,
  `asset_type` ∈ {`IMAGE`}, `source` ∈ {`LUMEN`}, `asset_uri`, `mime_type` nullable,
  `created_at`, `updated_at`); `ASSET_TYPES`/`ASSET_SOURCES` enums. No breaking change.
- `src/commit-result.ts` — `COMMIT_DOMAIN_OBJECTS` gains `'asset'`.
- `src/index.ts` — exports `Asset`/`AssetType`/`AssetSource` + schemas.

### Repository/adapter increment — `packages/business-repository` (P5-B2)
- `src/types.ts` — `FeishuAdapter` port gains `updateTaskStatus`, `createAsset`,
  `getAsset`, `deleteAsset`; new `AssetCreateInput { project_id, task_id,
  asset_type, source, asset_uri, mime_type? }`.
- `src/mapping.ts` — `toFeishuAssetFields` / `fromFeishuAssetRecord` +
  `DEFAULT_FIELD_MAP` Asset keys (`Asset ID`, `Project ID`, `Task ID`, `Asset Type`,
  `Source`, `Asset URI`, `MIME Type`, `Created At`); writes `created_at` as epoch ms.
- `src/verify.ts` — `ASSET_CRITICAL_FIELDS` + `verifyAssetCriticalFields`.
- `src/feishu-adapter.ts` — `RealFeishuAdapter`: `assetTableId`, `updateTaskStatus`
  (readback verify), `createAsset` (write+readback+`verifyAssetCriticalFields`),
  `getAsset`, `deleteAsset`; `createFeishuAdapterFromEnv` now requires
  `FEISHU_ASSET_TABLE_ID`.
- `src/feishu-adapter-fake.ts` — `FakeFeishuAdapter`: in-memory `assets` store,
  `updateTaskStatus`/`createAsset`/`getAsset`/`deleteAsset`, fault injectors
  `corruptReadbackAsset` + `failTaskStatusUpdate`.
- `src/business-repository.ts` — `updateTaskStatus`, `createAsset`, `getAsset`,
  `deleteAsset` (fail-closed `assertWith`).
- `src/index.ts` — exports new types/mapping/verify symbols.

### NEW package `@busos/lumen-adapter` (`packages/lumen-adapter/`)
- `src/types.ts` — `LumenPort` (generate / release), `LumenGenerateInput`,
  `LumenGenerateResult`, `LumenAdapterConfig`. **Only `baseUrl` + `authPassword`
  are held here — never the provider key (§19).**
- `src/real-lumen-adapter.ts` — `RealLumenAdapter`: maps the deployed Lumen HTTP API
  (`POST /api/auth` → `POST /api/projects` → `POST /api/projects/:id/jobs` with
  `Idempotency-Key` → `GET /api/jobs/:id` poll → `GET /api/projects/:id` signedUrls
  → `DELETE /api/projects/:id` release). Normalizes all failures into
  `LumenGenerateResult` (never throws on provider/network error).
- `src/fake-lumen-adapter.ts` — `FakeLumenAdapter` (in-memory; `generateCalls`,
  `releasedProjectIds` for compensation assertions).
- `src/create-from-env.ts` — `createLumenAdapterFromEnv` (null when
  `LUMEN_BASE_URL`/`LUMEN_AUTH_PASSWORD` absent) + `createLumenAdapter`.
- `src/index.ts`, `package.json`, `tsconfig.json`, `vitest.config.ts`,
  `tests/lumen-adapter.test.ts` (7 tests: real-via-stub happy + release-on-failure,
  fake happy/injected-failure/release, env gating).

### NEW package `@busos/creative-production` (`packages/creative-production/`)
- `src/types.ts` — `CreativeProductionRepository` port (getProject, createTask,
  getTask, updateTaskStatus, createAsset, getAsset, deleteTask, deleteAsset);
  input/result types; `BlockedReason`/`FailedReason`; deps.
- `src/eligibility.ts` — `checkCreativeEligibility` (missing/CANCELLED/DELIVERED
  project → BLOCKED; empty prompt/source image → BLOCKED; fail closed, 0 writes).
- `src/execute.ts` — `executeCreativeProduction(input, deps)`: 7-step write order
  with readback verification (D019) at every step and exact-record-id compensation
  (no saga/retry/CQRS).
- `src/index.ts`, `package.json`, `tsconfig.json`, `vitest.config.ts`.
- `tests/testkit.ts`, `tests/creative-production.test.ts` (P5-C/D/E),
  `tests/production-adapter.test.ts` (P5-F), `tests/architecture-boundary.test.ts`
  (P5-G), `tests/live-e2e.test.ts` (P5-I).

---

## 3. Architecture boundaries (D017/D018/§19)

- `creative-production` depends ONLY on the canonical `CreativeProductionRepository`
  port and `LumenPort`. It never imports Feishu tokens, table ids, field names,
  `RealFeishuAdapter`, `RealLumenAdapter`, Lumen HTTP paths (`/api/auth`,
  `signedUrls`), or the provider key. **P5-G static scan PASS** (4 source files, 18
  forbidden-token assertions).
- `business-repository` never imports Lumen (the `Asset.source` is a frozen enum
  `LUMEN`, not a live client). `lumen-adapter` is the only holder of Lumen HTTP +
  `AUTH_PASSWORD`; the image-provider credential stays exclusively inside Lumen
  (§19) and is never read or forwarded by AI Business OS.
- Lumen requires a source image (V0 becomes the project `activeVersionId`); the
  app layer passes exactly one `source_image_base64` + `mime_type` per P5 §16.

---

## 4. Gate results

| Gate | Description | Status |
|------|-------------|--------|
| P5-A1 | Lumen real-dependency capability probe | MAPPED (real source `github.com/Catcherog/lumen-ink` read) + RealLumenAdapter validated via stubbed transport; **REAL invocation BLOCKED** (no Vercel URL + `AUTH_PASSWORD`) |
| P5-A2 | Feishu Asset storage probe | Validated via FakeFeishuAdapter + RealFeishuAdapter-via-stub (write/readback/delete); **REAL invocation BLOCKED** (no `FEISHU_*` + `FEISHU_ASSET_TABLE_ID`) |
| P5-B | Additive Asset contract | **PASS** |
| P5-C | Fake happy path (TODO→DONE, IMAGE/LUMEN asset) | **PASS** |
| P5-D | Eligibility fails closed, ZERO writes (missing/CANCELLED/DELIVERED/empty prompt/empty image) | **PASS** |
| P5-E | Failure & exact-record-id compensation (E1 Lumen FAILED, E2 task create/readback, E3 asset create/readback, E4 task DONE update) | **PASS** |
| P5-F | Real Lumen adapter through `executeCreativeProduction` (stubbed transport) | **PASS** |
| P5-G | Architecture boundary static scan | **PASS** |
| P5-H | Regression across all 5 packages | **PASS** |
| P5-I | REAL end-to-end (live Feishu + live Lumen) | **BLOCKED** (no Vercel Lumen URL+`AUTH_PASSWORD`, no `FEISHU_*` + `FEISHU_ASSET_TABLE_ID`) |

---

## 5. Test evidence

Command (per package): `npm run verify` (`tsc --noEmit && vitest run --no-cache`).

- **contracts** — tsc clean; **85 passed**.
- **business-repository** — tsc clean; **36 passed | 1 skipped**.
- **project-lifecycle** — tsc clean; **20 passed | 1 skipped**.
- **lumen-adapter** — tsc clean; **7 passed** (real-via-stub + fake + env gating).
- **creative-production** — tsc clean; **19 passed | 1 skipped** (P5-C 1, P5-D 5,
  P5-E 4, P5-F 2, P5-G 4, P5-I 2/1-skip).

P5-C/D/E (`creative-production.test.ts`): happy path writes task=1/asset=1/
taskStatusUpdate=1 with 0 compensation; eligibility cases assert `writes = {0,0,0}`
and `lumen.generateCalls = 0`; E1–E4 assert the created records are physically
removed (exact-record-id) and `compensation` flags are set.

P5-F (`production-adapter.test.ts`): drives the REAL `RealLumenAdapter` through
`executeCreativeProduction` against a faithful Lumen stub — `CREATIVE_SUCCESS` with
`asset_uri` exactly equal to the Lumen `signedUrls` entry; failure path propagates
`LUMEN_GENERATION_FAILED` + invokes `release()` (deleteCount=1).

P5-G (`architecture-boundary.test.ts`): 4 source files scanned against 18 forbidden
Feishu/Lumen-implementation tokens — all clean.

P5-I (`live-e2e.test.ts`): gated on `createLumenAdapterFromEnv()` +
`createFeishuAdapterFromEnv()`; **skipped** when secrets absent (expected state).

---

## 6. LIVE CREATIVE E2E — BLOCKED (honest report)

The implementation is COMPLETE and verified by fake + real-adapter(stubbed) gates.
The REAL end-to-end (live Feishu Base write/readback + live Vercel Lumen
generation) requires credentials that were NOT provided:

- Lumen deployment: `LUMEN_BASE_URL` (Vercel origin) + `LUMEN_AUTH_PASSWORD`
  (the Lumen `AUTH_PASSWORD` — NOT the provider key).
- Feishu: `FEISHU_APP_ID` / `FEISHU_APP_SECRET` / `FEISHU_BASE_APP_TOKEN` +
  `FEISHU_PROJECT_TABLE_ID` / `FEISHU_TASK_TABLE_ID` / `FEISHU_ASSET_TABLE_ID`.

Per the task's STOP rule, this is reported honestly as
`IMPLEMENTATION PASS / LIVE CREATIVE E2E BLOCKED` and the task STOPS at commit +
push + clean tree — **no automatic P6**. A live run can be executed later by
supplying the secrets (the `live-e2e.test.ts` sketch is already wired to
`executeCreativeProduction`).

---

## 7. Next

NONE — STOP per task §15/§49. No P6 is started automatically. The only deferred
item is the live creative E2E (BL-016) gated on deployment secrets.
