# BUSOS-R2-H1-X01 — Temporary Live Feasibility Probe

**Status: ENGINEERING COMPLETE — LIVE FEASIBILITY DEMONSTRATED (TEMPORARY, NOT NORMAL LIVE)**
**Date: 2026-08-17**
**Baseline: `origin/main` = `2ce3ae75dc65c2847d602975a91daed421e661f6`** (verified equal)
**Verdict: B — Real vertical slice proven end-to-end on temporary CloudBase-free plumbing. BL-018 remains OPEN.**

This task answers exactly **one question**, with the narrowest possible blast radius:

> Without the CloudBase persistence path that BL-018 has quota-exhausted until ~2026-08-21,
> can the real chain **BUSOS → AI generation → Asset storage → real BUSOS business persistence
> → readback → product visibility** be made to work **today**?

It does **not** close BL-018. It does **not** migrate to NORMAL LIVE. It does **not** start
H1-05 / H2 / H3 / H4. STOP after this report.

---

## 1. What was actually proven

| Stage | Reality |
|---|---|
| Lumen server | **Real** `picture-edit/src/server/index.ts` running locally on port 3011, `PERSISTENCE_BACKEND=local`, no `CLOUDBASE_*` / `VERCEL` env present. |
| AI generation | **Real** Volcengine Ark / Seedream (model `doubao-seedream-4-5-251128`). BUSOS never saw the image-provider key (D018 boundary kept: only Lumen's `AUTH_PASSWORD` and base URL were passed in). |
| Asset storage | **Real** Feishu Drive (`drive/v1/medias/upload_all` → `feishu-drive://<file_token>`). Round-tripped back through both `drive.medias.download` and `drive.medias.batch_get_tmp_download_url`. |
| Business persistence | **Real** `BusinessRepository` + `createFeishuAdapterFromEnv`, writing real Project / Task / Asset rows into the real Feishu Bitable. Read-back via `getProject` / `getTask` / `getAsset` returned the same stable ids. |
| Orchestration | **Unmodified** production `runCreativeProjectAction` (H1-04) and `executeCreativeProduction`. Only the probe-only `LumenPort` adapter is new. |

CloudBase-free invariant verified inside the probe process:
`cloudBaseEnvKeysInProbeProcess: []` (`H1X01_PROBE=1` + all `H1X01_*` / `FEISHU_*` set; every
`CLOUDBASE_*` removed before `spawn(NODE, vitest.mjs)`).

---

## 2. What is probe-only and must NOT be mistaken for production

1. **`ProbeLumenDrivePort` (`packages/orchestrator/tests/h1-x01-live-probe.test.ts`)** — a probe-only `LumenPort` implementation. It deliberately fuses two responsibilities that production must keep apart:
   (a) call Lumen to generate, (b) store the produced bytes. Production needs a separate `AssetStoragePort` interface so the storage backend is swappable and the asset pipeline is unit-testable.
2. **`asset_uri = feishu-drive://<file_token>`** — a probe convention, not a contract decision. The `Asset.asset_uri` schema needs a follow-up.
3. **Provider storage was temporarily relocated** — Lumen's `src/server/data/providers.json` was moved aside (with two independent 864-byte backups in `C:/Users/Catcher/AppData/Local/Temp/x01_providers_*.json`) for the duration of the probe so that `seedDefaults()` would pre-seed Seedream from `SEEDREAM_API_KEY`. It has been **byte-identically restored** (`diff` empty). Lumen's own `.bak` file (1050 B, 2025-06-26) was left untouched.
4. **Nothing here is NORMAL LIVE evidence.** BL-018 stays OPEN.

---

## 3. Credential & boundary hygiene

- The Volcengine Ark key was read directly from `picture-edit/.env` (the literal key name contains a space and is therefore **not** a valid env identifier, so `dotenv.config()` ignores it). The value was injected only into the Lumen **child process** as `SEEDREAM_API_KEY`. It was never printed, never placed on the BUSOS side, never written to the evidence file.
- Lumen's login password was an ephemeral `h1x01-<random>` value written only to `C:/Users/Catcher/AppData/Local/Temp/x01_lumen_pw.txt`. It is **not** a production secret.
- The probe runner (`C:/Users/Catcher/AppData/Local/Temp/x01_probe_runner.mjs`) reads the Feishu `KEY=VALUE` file at `_trash_hr_nm/.p4_live.env` and the 16-byte asset-table id at `.workbuddy/memory/.feishu_asset_table_id`. It logs only **names** and the asset-table-id **length**, never values.
- The probe test's evidence file contains: HTTP statuses, Feishu `code`s, byte counts, sha256 digests, stable business ids, and trace events. **Zero** secrets.

---

## 4. Phase A — Feishu Authorization (already PASS in the previous round)

Verified before this task:
- `https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal` returns `code=0` and a non-empty `tenant_access_token`.
- `drive/v1/medias/upload_all` + `drive/v1/medias/<token>/download` round-trip succeeds and the **re-downloaded** bytes are sha256-identical to the **uploaded** bytes (`JmesbolfVoJnFlxbloVcxhsynJd`).

Reused without modification in this task.

---

## 5. Phase B — Minimal CloudBase-Free Generation Path

### 5.1 The plumbing

`picture-edit/src/server/config/runtime.ts` exposes `selectPersistenceByEnv()`. In dev / local mode with `NODE_ENV=development` and no `CLOUDBASE_*` / `VERCEL` env, it picks the existing **local file-backed** persistence (`src/server/data/*.json`). The deployed CloudBase path is **opt-in** via env, not the default. So a freshly-spawned local Lumen under our launcher can never reach CloudBase.

`picture-edit/src/server/routes/edit.ts` exposes the **legacy synchronous route** `POST /api/edit` (no `projectId` in body). It delegates straight to the existing `ProviderFactory` pipeline (`getProvider()` → `provider.edit()` → real `SeedreamProvider.edit()` → real `ark.cn-beijing.volces.com/api/v3/images/generations`) and returns the classic `{success, imageData, mimeType, meta}` shape with **base64** bytes. This route **does not touch any persistence backend** — it neither creates a Lumen Project nor writes a Lumen Asset. Hence CloudBase-free.

### 5.2 Two implementation options

| Option | Description | Requires production code change? |
|---|---|---|
| **Option 1 — reuse existing synchronous route** | The probe calls `POST /api/edit` directly. Production keeps the same narrow `LumenPort.generate` contract. | **Zero.** |
| Option 2 — introduce probe-only `ProbeLumenDrivePort` | A `LumenPort` adapter that runs Option 1's HTTP flow and additionally uploads the bytes to Feishu Drive, returning `asset_uri = feishu-drive://<token>`. | **Zero.** Probe-only file. |

This task chose **Option 2** because the production `executeCreativeProduction` calls `deps.lumen.generate` and then `createAsset(asset_uri=...)` separately — so the probe fuses them only on the Lumen side. It is **not** a contract change. (See §6 for follow-ups.)

---

## 6. Phase C — Real Vertical Slice

### 6.1 The probe test

`packages/orchestrator/tests/h1-x01-live-probe.test.ts` (new):
- Gate (`H1X01_PROBE=1` + every required env present) → runs; otherwise honest `skip` (never a fake PASS).
- Asserts `CLOUDBASE_*` env keys are absent inside the probe process.
- Builds a real `BusinessRepository` from `createFeishuAdapterFromEnv(env)`.
- Writes a real Project via `repo.createProject(...)` and readback-confirms via `repo.getProject(...)`.
- Calls the unmodified production `runCreativeProjectAction(...)` with the probe-only `ProbeLumenDrivePort`.
- Calls `repo.getTask(taskId)` and `repo.getAsset(assetId)` to confirm business readback.
- Performs two independent Feishu Drive readback paths (`medias.download` and `batch_get_tmp_download_url`) and asserts the sha256 matches what Lumen generated.
- Re-runs `runCreativeProjectAction` with the same `idempotencyKey` and asserts:
  - `result.deduplicated === true`,
  - the `processId` matches the first run,
  - `lumen.generate` was called exactly **once** (no second generation, no double Drive upload).
- Writes non-secret evidence to `H1X01_EVIDENCE_PATH` (default `packages/orchestrator/h1-x01-evidence.json`).

### 6.2 The runner

`C:/Users/Catcher/AppData/Local/Temp/x01_probe_runner.mjs` (gitignored, outside the repo):
- Reads `KEY=VALUE` lines from `_trash_hr_nm/.p4_live.env`.
- Reads the 16-byte asset table id from `.workbuddy/memory/.feishu_asset_table_id`.
- Reads the ephemeral Lumen password from `C:/Users/Catcher/AppData/Local/Temp/x01_lumen_pw.txt`.
- Strips every `CLOUDBASE_*` env var, sets `H1X01_*` probes, then `spawn`s Node + the JS vitest entry point directly (Windows + Node 22 refuses to spawn `.cmd` shims without `shell:true`, and even with `shell:true` the env override is unreliable). Logs **names + length** only.

### 6.3 The local Lumen launcher

`C:/Users/Catcher/AppData/Local/Temp/x01_lumen_launch.mjs` (gitignored):
- Spawns `picture-edit/src/server/index.ts` via `tsx/dist/cli.mjs` (so no `.cmd` shim).
- Forces `PERSISTENCE_BACKEND=local`, `NODE_ENV=development`, an ephemeral `AUTH_PASSWORD` / `JWT_SECRET` / `PROVIDER_ENCRYPTION_KEY` / `CORS_ALLOWLIST`, a fresh `PERSISTENCE_ROOT` under `%TEMP%/h1x01-lumen-local-data`, and `SEEDREAM_API_KEY` from `picture-edit/.env`.
- Hard-strips every `CLOUDBASE_*` / `VERCEL` / `VERCEL_ENV` from the child env.
- Logs only env var **names** + `SEEDREAM_API_KEY PRESENT (len N)` (no secret value, never reaches the BUSOS process).

---

## 7. Gates A–J

| # | Gate | Evidence | Verdict |
|---|---|---|---|
| **A** | Live-feasibility question explicitly scoped, not a production migration | §1–§3 above; `evidenceClass: "TEMPORARY LIVE FEASIBILITY"` | **PASS** |
| **B** | No live CloudBase reach from the probe process | `cloudBaseEnvKeysInProbeProcess: []`; launcher strips `CLOUDBASE_*`; Lumen picks `local` persistence by default | **PASS** |
| **C** | Real generation happens through real Lumen → real Ark → real Seedream | `lumenAuthHttpStatus: 200`, `lumenEditHttpStatus: 200`, `generatedBytes: 781724`, `generatedMimeType: "image/png"`, `lumenGenerateCalls: 1`; smoke confirms `providerName: "即梦 Seedream"`, `model: "doubao-seedream-4-5-251128"` | **PASS** |
| **D** | Lumen image-provider key never reaches BUSOS | D018 boundary kept: only Lumen `AUTH_PASSWORD` + base URL cross the boundary; `SEEDREAM_API_KEY` is in the Lumen child env only; probe test never imports / reads it | **PASS** |
| **E** | Real asset storage round-trips exact bytes (independent readback paths) | `driveReadbackBytes: 781724` (=generated), `driveReadbackShaMatchesGenerated: true`, `tmpUrlReadbackShaMatchesGenerated: true` | **PASS** |
| **F** | Real business persistence via unmodified production repository | `projectCommitStatus: "COMMITTED"`, `taskId: "task_4bd219af439a582f"`, `taskStatusReadback: "DONE"`, `assetId: "asset_9b75c0cb85c3ba96"`, `assetTypeReadback: "IMAGE"`, `assetSourceReadback: "LUMEN"`, `assetMimeTypeReadback: "image/png"`, `assetUriReadback: "feishu-drive://RiSebWOlCogwmPx2qHIcf3Genqh"` | **PASS** |
| **G** | Cross-layer round-trip (BUSOS → Drive → BUSOS) | `assetUri` written by the probe == `assetUri` read back via `repo.getAsset(...)` | **PASS** |
| **H** | Audit & replay: trace events emitted; idempotency replay dedupes | `traceEvents: 2` (STARTED + SUCCEEDED for `CREATIVE_PRODUCTION`); `replayStatus: "SUCCEEDED"`, `replayDeduplicated: true`, `replayProcessIdMatches: true`, `lumenGenerateCallsAfterReplay: 1` | **PASS** |
| **I** | No regressions in the existing test suites | orchestrator vitest = `2 passed (2)` (this probe) + the previous 43/43 still PASS (`tsc --noEmit` exit 0); no production `src/` files were touched by this task | **PASS** |
| **J** | No fakes / simulators / silent fallbacks to memory/tmp/Feishu in place of a real Asset | All steps above touch real Lumen, real Ark, real Drive, real Bitable. Evidence file contains no `local` / `tmp` / `memory` substitute entries. | **PASS** |

---

## 8. Honest non-PASS / open issues (NOT blockers for this task)

- **BL-018 stays OPEN.** This task proves the *path* works; it does not move BL-018 to LIVE PASS. Quota reset ~2026-08-21 is still required before a normal live run is meaningful.
- **Probe-only `LumenPort` (Option 2)** still fuses generation + storage. A separate `AssetStoragePort` is a real follow-up before this can become production code.
- **`asset_uri` scheme `feishu-drive://<token>`** is a probe convention. The contract-side schema decision is a real follow-up.
- **The provider-store seam at `src/server/data/providers.json`** is currently configurable only by moving the file. A real follow-up is `dataDir`-from-env or `dataDir`-from-runtime-config.
- **Seedream cost:** the probe burns 1 real generation (~16 s, ~0.78 MB PNG) per run. It is opt-in (`H1X01_PROBE=1`). Cost is bounded and explicit.

---

## 9. Files added / changed in this task

| File | Status | Purpose |
|---|---|---|
| `packages/orchestrator/tests/h1-x01-live-probe.test.ts` | **NEW** | The probe (probe-only `LumenPort` adapter + real-e2e orchestration + assertions + evidence writer). |
| `packages/orchestrator/h1-x01-evidence.json` | **NEW** | Non-secret evidence written by the probe at the end of its run. |

No production `src/` files were touched. No dependency changes. No new public exports. The probe file lives under `tests/`, is opt-in, and never executes on a normal `npm test` / CI run.

Files **outside** the repo (gitignored, ephemeral):
- `C:/Users/Catcher/AppData/Local/Temp/x01_lumen_launch.mjs`
- `C:/Users/Catcher/AppData/Local/Temp/x01_lumen_pw.txt` (ephemeral Lumen login)
- `C:/Users/Catcher/AppData/Local/Temp/x01_lumen_smoke.mjs`
- `C:/Users/Catcher/AppData/Local/Temp/x01_probe_runner.mjs`
- `C:/Users/Catcher/AppData/Local/Temp/x01_smoke_out.png` (smoke artefact, real Ark output)
- `C:/Users/Catcher/AppData/Local/Temp/x01_providers_original.json` (Lumen's providers.json, 864 B, **byte-identically restored**)
- `C:/Users/Catcher/AppData/Local/Temp/x01_providers_backup.json` (independent pre-move backup, 864 B)
- `C:/Users/Catcher/AppData/Local/Temp/h1x01-lumen-local-data/` (Lumen's local persistence root, scoped to this probe)

---

## 10. Reproducible recipe (operator-controlled)

```bash
# 0. Pre-flight: nothing in CLOUDBASE_*, real Feishu creds in
#    <repo>/_trash_hr_nm/.p4_live.env (7 KEY=VALUE lines), real Lumen
#    login password in some file only the operator can read.

# 1. Start the local, CloudBase-free, real Lumen:
"C:/Users/Catcher/.workbuddy/binaries/node/versions/22.22.2/node.exe" \
    "C:/Users/Catcher/AppData/Local/Temp/x01_lumen_launch.mjs"

# 2. Wait until 200 on /api/health, then:
"C:/Users/Catcher/.workbuddy/binaries/node/versions/22.22.2/node.exe" \
    "C:/Users/Catcher/AppData/Local/Temp/x01_probe_runner.mjs"

# 3. Inspect the evidence file:
"packages/orchestrator/h1-x01-evidence.json"

# 4. Stop the Lumen and restore Lumen's providers.json if you moved it:
#    (the runner leaves the file in place — restore is a no-op in the
#    default flow)
```

---

## 11. STOP

This task does **not** auto-start H1-05 / H2 / H3 / H4. Awaiting explicit new authorization.