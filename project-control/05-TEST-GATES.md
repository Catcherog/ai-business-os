# Test Gates R1

Testing is for phase progression, not endless auditing.

## Global rules

- One formal review per phase/task set.
- If review fails, re-review only failed gates.
- Do not restart a full audit after a targeted fix.
- New non-blocking findings are logged to backlog.
- Tests should prove the current acceptance criteria, not system perfection.

## P1-01 Gate — Contract Package

PASS if:
- LeadCandidateV1 exists and validates a canonical example.
- GovernanceResultV1 exists and validates.
- CommitResultV1 exists and validates.
- Domain types for Session/AgentRun/Lead/Customer/Project exist.
- Contract version fields are present.
- Tests cover at least valid and clearly invalid samples.

## P1-02 Gate — Candidate Builder

PASS if:
1. Input: `我想下个月拍一套新中式写真，预算大概4000。`
   produces valid `LeadCandidateV1`.
2. `service_type = 新中式写真` or normalized equivalent.
3. budget extraction preserves 4000 correctly.
4. preferred date original wording is retained.
5. missing customer identity remains null.
6. evidence includes support for at least service type/budget when available.
7. output passes contract validation.
8. Service Agent does not write Feishu.

## P1-03 Gate — Repository + Feishu

PASS if:
- Domain `Lead` can be created through repository.
- Domain `Customer` can be created through repository.
- Feishu-specific mapping is isolated in adapter.
- a committed write is followed by readback.
- readback verifies critical fields.
- repository returns canonical domain objects, not raw Feishu objects.
- exact customer lookup by phone/WeChat is implemented if feasible; otherwise explicitly deferred without blocking create/readback.

## P2 GP-001 Gate

Test A — Anonymous inquiry:
`我想下个月拍一套新中式写真，预算大概4000。`

Expected:
- Candidate generated
- governance result generated
- lead committed
- `customer_id = null`
- readback verified

Test B — Identified inquiry:
`我是张三，微信 zhangsan123，想下个月拍新中式，预算4000。`

Expected:
- candidate generated
- customer resolution performed
- customer created or matched
- lead linked to customer
- readback verified

Test C — Invalid/risk case:
Must not silently commit invalid or risk-blocked business data.

## Reviewer output format

Only:

PASS

or

FAIL
- Gate ID
- Evidence
- Minimal fix required

No open-ended recommendations.

## P3-01 Gate — Human Review

PASS only if all gates below pass.

### HR-A — Review interception

Given a valid candidate whose governance decision is:

`REVIEW_REQUIRED`

Expected:
- review case/surface available;
- candidate and governance issues visible;
- trace IDs retained;
- BusinessRepository write count = 0;
- Feishu write count = 0.

### HR-B — Approve

Given a REVIEW_REQUIRED candidate and human APPROVE:

Expected:
- approval explicitly recorded;
- hard REJECT/invalid data cannot be overridden;
- domain object created;
- repository write succeeds;
- readback verifies critical fields;
- final commit status is COMMITTED.

### HR-C — Edit + approve

Given a REVIEW_REQUIRED candidate:

Reviewer changes at least one critical business field.

Example:

```text
budget_max:
4000 → 4500
```

Expected:
- original AI candidate snapshot retained;
- human before/after edit retained;
- edited value validated;
- committed business value = 4500;
- readback business value = 4500;
- stale AI evidence is not presented as evidence for the human-edited value.

### HR-D — Reject

Human REJECT:

Expected:
- zero repository writes;
- zero Feishu writes;
- no COMMITTED result.

### HR-E — Invalid edit / hard rejection

Invalid edited candidate or governance REJECT:

Expected:
- fail closed;
- zero business writes;
- no COMMITTED result.

### HR-F — Architecture boundary

PASS if Human Review/application/presentation code has no direct dependency on:
- Feishu table IDs;
- Feishu field mappings;
- credentials;
- raw Feishu record structures;
- direct Feishu API calls.

### HR-G — Regression

Existing:
- contracts tests;
- service-agent-candidate tests;
- business-repository tests;
- golden-path tests;

must remain PASS.

TypeScript compile/typecheck must remain clean.

### HR-H — Live Feishu vertical slice

Run at least one reviewed APPROVE or EDIT + APPROVE case through:

```text
Human Review
→ BusinessRepository
→ RealFeishuAdapter
→ real Feishu write
→ real Feishu readback
→ VERIFIED
```

Requirements:
- do not print credentials;
- record sanitized evidence only;
- clean generated test records by exact `record_id`;
- cleanup must not affect existing business records.

If live credentials unexpectedly become unavailable:
mark:

`IMPLEMENTATION PASS / LIVE P3 REVIEW E2E BLOCKED`

Do not substitute Fake/Simulator PASS for Live PASS.

P3-01 is not COMPLETE until HR-H passes.

---

## P4-01 Gate — Project Lifecycle Slice

PASS only if all gates below pass.

### PL-A — Contract delta (additive)

PASS if:
- A canonical `Task` schema exists (`task_id`, `project_id`, `task_type`, `title`,
  `status` ∈ {TODO, IN_PROGRESS, DONE, CANCELLED}, `due_date` nullable, `created_at`,
  `updated_at`) and validates a canonical example;
- `COMMIT_DOMAIN_OBJECTS` includes `project` and `task`;
- no breaking change to existing contract types;
- `BL-006` date semantics are documented (explicit `YYYY-MM-DD` → value;
  relative-only → `null`; never hallucinated).

### PL-B — Happy lifecycle

Given a QUALIFIED lead with a resolved customer and an explicit `scheduled_date`:

Expected:
- `convertLeadToProject` returns `LIFECYCLE_SUCCESS`;
- Project created with `status = DRAFT` (not IN_PROGRESS) and linked `customer_id`/`lead_id`;
- a Task created with default `task_type = PROJECT_SETUP`, `title = "Project setup"`,
  `status = TODO` when none supplied (no LLM);
- all three commits (`project`/`task`/`lead`) have `readback_status = VERIFIED`;
- `businessRepository` write counts: project = 1, task = 1, lead-status = 1.

### PL-C — Anonymous lead

Given a lead with `customer_id = null`:

Expected:
- `BLOCKED`, `reason = CUSTOMER_REQUIRED`;
- zero Project/Task/Lead-status writes;
- no Customer auto-created.

### PL-D — Dangling / already-converted / LOST

Expected:
- Dangling customer (id present but not found) → fail closed, 0 writes;
- already-`CONVERTED` lead → `BLOCKED`, 0 new writes, no dedup engine;
- `LOST` lead → `BLOCKED`, 0 writes.

### PL-E — Partial-failure compensation

Expected:
- Project created but Task write/readback fails → Project deleted by exact record id,
  result `FAILED`, Task create never attempted;
- Project + Task created but Lead `CONVERTED` update/readback fails → Task + Project
  deleted by exact record id, result `FAILED`;
- Lead is **not** reported `CONVERTED` in any failure case;
- compensation uses exact record ids (no transaction/saga/retry).

### PL-F — Architecture boundary

PASS if `packages/project-lifecycle/src/**` has no direct dependency on:
- Feishu table IDs;
- Feishu field mappings;
- credentials;
- raw Feishu record structures;
- direct Feishu API calls / `RealFeishuAdapter` / `open-apis` / `FEISHU_`.

### PL-G — Regression

Existing suites for:
- contracts
- business-repository
- golden-path
- human-review
- project-lifecycle

must remain PASS. TypeScript compile/typecheck must remain clean.

### PL-H — Live Feishu vertical slice

**Status: PASS (2026-08-13).** Executed via BUSOS-P4-01-LIVE-CLOSURE with user-supplied `FEISHU_*` + `FEISHU_PROJECT_TABLE_ID`/`FEISHU_TASK_TABLE_ID`; the real chain wrote + read-back VERIFIED and cleaned all generated records by exact `record_id`. See `10-P4-01-COMPLETION.md` §4/§10.

Run the full lifecycle through:

```text
Existing Lead (QUALIFIED)
→ verify Customer
→ BusinessRepository.createProject (DRAFT)
→ BusinessRepository.createTask (TODO)
→ BusinessRepository.updateLeadStatus (CONVERTED)
→ RealFeishuAdapter
→ real Feishu write
→ real Feishu readback
→ VERIFIED
```

Requirements:
- do not print credentials;
- record sanitized evidence only;
- clean generated test records by exact `record_id`;
- cleanup must not affect existing business records;
- gated on `FEISHU_*` + `FEISHU_PROJECT_TABLE_ID` / `FEISHU_TASK_TABLE_ID`.

If live credentials / Project+Task tables unexpectedly become unavailable:
mark:

`IMPLEMENTATION PASS / LIVE P4 LIFECYCLE E2E BLOCKED`

Do not substitute Fake/Simulator PASS for Live PASS.

P4-01 is not COMPLETE (live) until PL-H passes; it is reported
`IMPLEMENTATION PASS / LIVE P4 LIFECYCLE E2E BLOCKED` and the task STOPS at
commit + push + clean tree (no automatic P5).

---

## P5-01 Gate — Creative Production Slice

PASS only if all gates below pass. Status as of 2026-08-15 (P5-X03): **FUNCTIONAL PASS — LIVE RE-RUN DEFERRED (CloudBase quota, owner override)**. Implementation/contracts/production-persistence all verified; live CREATIVE_SUCCESS not re-asserted this run.

### P5-A1 — Lumen real-dependency capability probe

MAPPED + validated via stubbed transport. The real Lumen HTTP boundary was read
from `github.com/Catcherog/lumen-ink` (`D:\360Downloads\Trae 项目\picture-edit`):
`POST /api/auth` → `POST /api/projects` → `POST /api/projects/:id/jobs`
(`Idempotency-Key` + `prompt` + `inputVersionId`) → `GET /api/jobs/:id` poll →
`GET /api/projects/:id` (`signedUrls`) → `DELETE /api/projects/:id`.
`RealLumenAdapter` is validated against a faithful stub (happy + release-on-failure).
**REAL invocation BLOCKED** (no Vercel `LUMEN_BASE_URL` + `LUMEN_AUTH_PASSWORD`).

### P5-A2 — Feishu Asset storage probe

Validated via `FakeFeishuAdapter` (in-memory Asset store, `corruptReadbackAsset` /
`failTaskStatusUpdate` injectors) + `RealFeishuAdapter`-via-stub (same simulator as
P4). Asset write → readback `VERIFIED` (`verifyAssetCriticalFields`) → delete by
exact `record_id` all proven. **REAL invocation BLOCKED** (no `FEISHU_*`
+ `FEISHU_ASSET_TABLE_ID`).

### P5-B — Additive Asset contract

PASS if:
- canonical `Asset` schema exists (`asset_id`, `project_id`, `task_id`,
  `asset_type` ∈ {`IMAGE`}, `source` ∈ {`LUMEN`}, `asset_uri`, `mime_type` nullable,
  `created_at`, `updated_at`) and validates;
- `COMMIT_DOMAIN_OBJECTS` includes `asset`;
- no breaking change to existing contract types.

### P5-C — Fake happy path

Given a Project (DRAFT/IN_PROGRESS) + prompt + single source image base64:

Expected:
- `executeCreativeProduction` returns `CREATIVE_SUCCESS`;
- Creative Task created (`task_type = CREATIVE_GENERATION`, `status = TODO`) then
  advanced to `DONE`;
- Asset created (`asset_type = IMAGE`, `source = LUMEN`, `asset_uri` from Lumen);
- all commits `readback_status = VERIFIED`;
- `businessRepository` write counts: task = 1, asset = 1, taskStatusUpdate = 1;
- `compensation` all false.

### P5-D — Eligibility fails closed, ZERO writes

Expected:
- missing Project → `BLOCKED`, `reason = PROJECT_NOT_FOUND`, 0 writes;
- `CANCELLED` Project → `BLOCKED`, `reason = PROJECT_CANCELLED`, 0 writes;
- `DELIVERED` Project → `BLOCKED`, `reason = PROJECT_DELIVERED`, 0 writes;
- empty prompt → `BLOCKED`, `reason = PROMPT_EMPTY`, 0 writes;
- empty source image → `BLOCKED`, `reason = SOURCE_IMAGE_EMPTY`, 0 writes;
- `lumen.generate` is never called in any BLOCKED case.

### P5-E — Failure & exact-record-id compensation

Expected (each compensation path deletes by exact record id, no saga/retry):
- E1 Lumen FAILED → Task deleted, Asset never written, `LUMEN_GENERATION_FAILED`;
- E2 Task create/readback failed → Task deleted, `TASK_WRITE_FAILED`;
- E3 Asset create/readback failed → Asset + Task deleted, `ASSET_WRITE_FAILED`;
- E4 Task DONE update failed → Asset + Task deleted, `TASK_DONE_UPDATE_FAILED`;
- the created records are physically gone after compensation (verified by
  `getTask`/`getAsset` returning null).

### P5-F — Real Lumen adapter through orchestration (stubbed transport)

PASS if the REAL `RealLumenAdapter` driven through `executeCreativeProduction`
against a faithful Lumen stub yields `CREATIVE_SUCCESS` with `asset_uri` exactly
equal to the Lumen `signedUrls` entry, and on a Lumen job failure propagates
`LUMEN_GENERATION_FAILED` + invokes `release()` (cascade cleanup).

### P5-G — Architecture boundary

PASS if `packages/creative-production/src/**` has no direct dependency on:
- Feishu table IDs / field mappings / credentials / raw Feishu records /
  `RealFeishuAdapter` / `open-apis` / `FEISHU_`;
- Lumen HTTP paths (`/api/auth`), `signedUrls`, Lumen secrets (`AUTH_PASSWORD`,
  `JWT_SECRET`, `PROVIDER_ENCRYPTION_KEY`), `RealLumenAdapter`, `fetchImpl`.
(Only the `LumenPort` interface and `BusinessRepository` are allowed.)

### P5-H — Regression

Existing suites for:
- contracts
- business-repository
- project-lifecycle
- lumen-adapter
- creative-production

must remain PASS. TypeScript compile/typecheck must remain clean.

**Status: PASS** — contracts 85 · business-repository 36+1skip · project-lifecycle
20+1skip · lumen-adapter 7 · creative-production 19+1skip (all tsc clean).

### P5-I — Live Creative vertical slice

Run the full path through:

```text
Existing Project
→ BusinessRepository.createTask (CREATIVE_GENERATION / TODO)
→ Lumen.generate (prompt + single source image)
→ BusinessRepository.createAsset (IMAGE / LUMEN)
→ BusinessRepository.updateTaskStatus (DONE)
→ RealFeishuAdapter + Real Lumen (Vercel)
→ real write + real readback
→ VERIFIED
```

Requirements:
- do not print credentials (Lumen `AUTH_PASSWORD` only; never the provider key);
- record sanitized evidence only;
- clean generated test records by exact `record_id`;
- cleanup must not affect existing business records;
- gated on `LUMEN_BASE_URL` + `LUMEN_AUTH_PASSWORD` (Vercel Lumen) and `FEISHU_*`
  + `FEISHU_ASSET_TABLE_ID`.

**Status: FUNCTIONAL PASS — LIVE RE-RUN DEFERRED** (CloudBase NoSQL read quota
exhausted, non-code; secrets now present). Per owner override 2026-08-15 the
task is reported `P5 FUNCTIONAL PASS — LIVE RE-RUN DEFERRED — CLOUDBASE QUOTA`
and **P6 is authorized** (live CREATIVE_SUCCESS rerun deferred). Do not substitute
Fake/Simulator PASS for Live PASS; the `live-e2e.test.ts` sketch remains gated and
skipped until secrets are supplied.

---

## P6-01 Gate — Orchestrator MVP (Composition Only)

PASS only if all gates below pass. Status as of 2026-08-15: **FAKE E2E PASS — LIVE FULL-PROCESS E2E DEFERRED (CloudBase quota + live credentials, BL-018 OPEN / NON-ENGINEERING LIVE DEPENDENCY)**. BL-016 is CLOSED and is not a blocker here.

### P6-A — Composition fake E2E

`runBusinessProcess` with `FakeFeishuAdapter` + `createFakeLumenAdapter` runs
Consultation → Lead/Customer → Project/Task → Asset end to end and returns
`SUCCESS` with a 3-stage (GOLDEN_PATH → PROJECT_LIFECYCLE → CREATIVE_PRODUCTION)
all-OK trace; asset id + asset uri defined.

**Status: PASS** — `packages/orchestrator` fake-e2e.test.ts (1 of 2):
full happy-path SUCCESS, trace records 3 OK stages in order.
(Migrated to the P6-02 contract 2026-08-15: `status === 'SUCCEEDED'`,
`completedStages` in order, `output.assetId`/`output.assetUri` defined.)

### P6-B — Failure observability

On a Lumen generation failure the trace marks CREATIVE_PRODUCTION FAILED and
`result.failedStage === 'CREATIVE_PRODUCTION'`; zero partial Asset (upstream
compensation already proven by P4/P5). Early-exit stops the process at the failed
stage with the prior stages recorded.

**Status: PASS** — fake-e2e.test.ts (2 of 2): Lumen-failure → FAILED at
CREATIVE_PRODUCTION, 3 stages recorded (last FAILED).
(Migrated to the P6-02 contract 2026-08-15: `status === 'FAILED'`,
`currentStage === 'CREATIVE_PRODUCTION'`, terminal trace event per stage.)

### P6-C — Live full-process E2E (deferred — BL-018)

Run the SAME `runBusinessProcess` with REAL `BusinessRepository`
(`RealFeishuAdapter`) + REAL `LumenPort` (`RealLumenAdapter`) through the full
chain (Consultation → Real Feishu Lead/Customer write+readback → Real Feishu
Project/Task write+readback → Real Vercel Lumen generate → Real Feishu Asset
write+readback → VERIFIED). Requirements: no credential print; sanitized evidence
only; cleanup by exact `record_id`; gated on `FEISHU_*`+`FEISHU_ASSET_TABLE_ID`
and `LUMEN_BASE_URL`+`LUMEN_AUTH_PASSWORD`.

**Status: DEFERRED** — tracked by **BL-018 (OPEN / NON-ENGINEERING LIVE DEPENDENCY)**:
CloudBase quota availability + LUMEN live credentials + FEISHU live credentials. Not an
engineering blocker; no code change pending. Do NOT substitute Fake PASS for Live PASS.
The orchestrator makes this a single re-runnable call once the dependency is available.

---

## P6-02 Gate — Orchestrator Reliability + Trace Contract

PASS only if all gates below pass. Status as of 2026-08-15: **PASS**.
No live environment required. Command (in `packages/orchestrator`):
`npx vitest run --pool=forks` → **37 passed / 0 failed** (4 files); `npx tsc --noEmit` exit 0.
P6-C stays DEFERRED (BL-018); BL-016 is CLOSED and is not a blocker here.

### P6-D — Process contract happy path

Fake-deps happy path returns `status === 'SUCCEEDED'`, `completedStages ===
['GOLDEN_PATH','PROJECT_LIFECYCLE','CREATIVE_PRODUCTION']`, `output` containing
only stable refs (leadId / customerId / projectId / taskId / assetId / assetUri),
`startedAt`/`endedAt`/`durationMs` present and coherent, `error` absent, and a
caller-supplied `processId` honored.

**Status: PASS** — `tests/process-contract.test.ts` (P6-D block).

### P6-E — Business outcome semantics (rejection ≠ failure)

Governance `REJECT` → `status === 'REJECTED'` (never FAILED), `rejection.stage
=== 'GOLDEN_PATH'`, `rejection.reasonCode === 'REJECT'`, and **zero downstream
side effects** (createProject / lumenGenerate / createAsset counters all 0).
Governance `REVIEW_REQUIRED` → `status === 'HUMAN_REQUIRED'` (not FAILED).
A creative-stage business rejection (empty prompt) → `status === 'REJECTED'` with
`reasonCode === 'PROMPT_EMPTY'` and the upstream stages still marked completed.

**Status: PASS** — `tests/process-contract.test.ts` (P6-E block).

### P6-F — Failure propagation / fail closed

A throwing creative-production dependency (Lumen 503) → `status === 'FAILED'`,
`currentStage === 'CREATIVE_PRODUCTION'`, `error` = `ProcessError` with `code`,
`message`, `stage`, `disposition === 'RETRYABLE'`. A golden-path write failure →
`FAILED` at `GOLDEN_PATH` with **no** PROJECT_LIFECYCLE / CREATIVE_PRODUCTION
execution; a project-lifecycle failure → `FAILED` at `PROJECT_LIFECYCLE` with no
creative execution. `runBusinessProcess` never throws.

**Status: PASS** — `tests/process-contract.test.ts` (P6-F block).

### P6-G — Structured trace

Every executed stage emits exactly one `STARTED` event plus exactly one terminal
event (`SUCCEEDED` | `FAILED` | `REJECTED` | `HUMAN_REQUIRED`) with
`startedAt`/`endedAt`/`durationMs`; no dangling `STARTED` remains in any outcome
(success, rejection, failure, throw). Trace `metadata` carries only allowlisted
stable refs — `sanitizeTraceMetadata` drops non-allowlisted keys, objects/arrays
and non-primitive values, and clamps long strings; no secret/token/prompt/raw
third-party payload appears anywhere in the trace.

**Status: PASS** — `tests/process-contract.test.ts` (P6-G block, incl.
`sanitizeTraceMetadata` unit assertions).

### P6-H — Idempotency success path

Running the same `idempotencyKey` twice against a shared
`InMemoryProcessRegistry` executes downstream work **once**
(goldenPathCalls === 1, projectLifecycleCalls === 1, creativeProductionCalls === 1)
and the second call returns the same result (same `processId`, same status/output)
flagged `deduplicated`. Different keys execute independently. A duplicate arriving
while the first run is `RUNNING` returns a deterministic duplicate with no
execution. Supplying an `idempotencyKey` without a registry fails closed with
`INVALID_INPUT` / `TERMINAL`. A registry injected via `deps.processRegistry` is
honored.

**Status: PASS** — `tests/idempotency.test.ts` (P6-H block; counters via spy deps).

### P6-I — Idempotency terminal failure

After a `TERMINAL` failure, re-running the same `idempotencyKey` does **not**
auto-rerun and produces no duplicate side effect (counters unchanged); the prior
failure is replayed. An explicit retry request is still refused for `TERMINAL`.
A prior `RETRYABLE` failure replays by default and re-executes only when the
explicit `retryPreviousFailure` extension point is used.

**Status: PASS** — `tests/idempotency.test.ts` (P6-I block).

### P6-J — Error classification

`classifyFailure` maps: CloudBase read-quota exhaustion → `EXTERNAL_QUOTA_EXHAUSTED`
/ `EXTERNAL_DEPENDENCY`; Lumen 5xx + timeout → `UPSTREAM_TEMPORARY_FAILURE` /
`RETRYABLE`; Feishu timeout/network → `RETRYABLE`; contract validation → 
`CONTRACT_VALIDATION_FAILED` / `TERMINAL`; invalid input → `INVALID_INPUT` /
`TERMINAL`; unverified write → `RETRYABLE`; unclassifiable → `TERMINAL`
(fail closed). `sanitizeMessage` redacts bearer tokens / passwords / token-like
values and clamps length. The same dispositions are asserted end-to-end through
`runBusinessProcess` (result `error.disposition` and the trace event error match).

**Status: PASS** — `tests/error-classification.test.ts` (unit + wired-through).

## P6-03 Gate — Golden Path Regression Integrity / BL-019 Closure

PASS only if all conditions below hold. Status as of 2026-08-15: **PASS**.
No live environment required. Scope: golden-path test harness / in-memory Feishu
simulator only — no production, contract, governance, Feishu production mapping,
Lumen or CloudBase behavior changed.

### P6-K — Targeted reproduction (Flow B restored)

`packages/golden-path/tests/real-adapter.test.ts` Flow B
(`customer find/create + lead + link VERIFIED`) returns `status === 'SUCCESS'`
with `counts.writes.customer === 1`, `counts.writes.lead === 1`,
`counts.writes.link === 1`, `lead.customer_id === customer.customer_id`, and both
`leadCommit`/`customerCommit` `isBusinessCommitSuccess`. The whole file: 3 passed |
1 skipped (the skip is the LIVE-Feishu E2E block, not hidden).

**Status: PASS** — `tests/real-adapter.test.ts` (Flow B block).

### P6-L — Golden Path regression

`npx tsc --noEmit` clean in `packages/golden-path`; full `vitest run` →
**11 passed | 1 skipped** (6 files: anonymous · identified · governance-block ·
readback-failure · identity-boundary · real-adapter). Zero unexpected failures.

**Status: PASS.**

### P6-M — Business Repository regression (simulator-boundary)

The fix lives in the golden-path simulator but crosses the BusinessRepository
boundary, so its suite must stay green: `packages/business-repository` tsc clean;
`vitest run` → **37 passed | 1 skipped** (the skip is the LIVE-Feishu E2E block).

**Status: PASS.**

### P6-N — Orchestrator regression (P6-02 gates intact)

`packages/orchestrator` tsc clean; `npx vitest run --pool=forks` → **37 passed / 0
failed** (P6-D..P6-J unchanged). P6-02 behavior was not modified by P6-03.

**Status: PASS.**

### P6-O — Full workspace regression

All 9 `@busos/*` packages typecheck clean and their test suites pass; the only
non-passing items are LIVE credential-gated SKIPs (reported, not hidden):
- contracts 85 · service-agent-candidate 53 · business-repository 37+1skip ·
  golden-path 11+1skip · human-review 42+2skip · project-lifecycle 20+1skip ·
  lumen-adapter 9 · creative-production 19+1skip · orchestrator 37.

BL-019 → **CLOSED (2026-08-15) — test-harness regression repaired**. P6-C stays
DEFERRED (BL-018); BL-016 CLOSED; P6+ NOT STARTED.

**Status: PASS.**

---

## R2-H1-01 Gate — Operator Workspace Shell + Project Read Surface

PASS only if all gates below pass. Status as of 2026-08-15: **PASS**.
No live environment required for any H1-01 gate — the read surface is exercised
against the in-memory `FakeFeishuAdapter` and against the `RealFeishuAdapter`
simulator (stubbed transport). H1-01 is strictly read-only.

Scope lock: only H1-01 implemented. H1-02 (Reviews), H1-03 (Runs), H1-04
(AI action), H1-05 are NOT started. No business mutation UI/API, no Human
Review, no Creative Production, no Lumen, no Orchestrator execution.

### H1-01-A — Baseline / authority

`git reset --hard` to the authorized baseline `4b5ca9c7eaba3c9571b3dfb1d50d3119a75a9aa9`
(remote `main` verified equal). R2 AUTHORITY CONFIRMED, COMPATIBILITY PASS,
H1-01 AUTHORIZED. Stale pre-R2 working edits were backed up out-of-tree
(`/tmp/h1-backup`, `/tmp/h1-repo-edit`) and NOT merged back.

**Status: PASS.**

### H1-01-B — Workspace Shell

`apps/operator-workspace` is a minimal, maintainable TS web app (no separate
frontend/backend deployment). Desktop-first, responsive. Exactly four top-level
nav entries: **Overview / Projects / Reviews / Runs**. Projects is the only
functional domain; Overview / Reviews / Runs are bounded placeholders. Built and
headless-smoke-tested (bundle loads, seeds the in-memory workspace, renders
without throwing).

**Status: PASS.**

### H1-01-C — Canonical Project List

`WorkspaceReadService.listProjects()` returns canonical `Project[]` (most-recently
updated first), proven over both the fake and the real-adapter simulator. The
Projects list renders titles, type, customer_id, and status; loading / empty /
error states implemented.

**Status: PASS** — `packages/workspace-read/tests/fake-e2e.test.ts` +
`real-adapter-simulator.test.ts` (list assertions) and the bundled UI.

### H1-01-D — Project Detail

`WorkspaceReadService.getProjectWorkspace(projectId)` returns
`{ project, customer, tasks, assets }` (null when missing). The Project Detail
view renders Project + Customer + Tasks table + Assets table. Every seeded
project resolves its own customer / tasks / assets through both adapters.

**Status: PASS** — `fake-e2e.test.ts` (3 tests) + `real-adapter-simulator.test.ts`
(2 tests) assert the full aggregate over both adapters.

### H1-01-E — Repository Read Boundary

Additive collection reads added behind the frozen persistence boundary:
`BusinessRepository.listProjects / listTasksByProject / listAssetsByProject`,
implemented in both `FakeFeishuAdapter` (in-memory maps, deterministic order) and
`RealFeishuAdapter` (reuses the same `/records/search` + unwrap +
`fromFeishu*Record` mapping). No Feishu record id / table id / field name escapes
the adapter — only canonical domain types reach `WorkspaceReadService`.

**Status: PASS.**

### H1-01-F — Read-Only Enforcement

`WorkspaceReadService` and the three new repository methods are reads only: they
delegate to `getProject` / `getCustomer` / `listProjects` / `listTasksByProject`
/ `listAssetsByProject` and never to any create/update/delete path, so they
cannot mutate storage. Static review of the H1-01 diff confirms no new write /
mutation surface was introduced (the only `create*` usage is `seedFakeWorkspace`,
a seed-setup helper consumed by tests and the demo bootstrap — not by the
read-only service or UI). No Feishu credential is present in the browser bundle.

**Status: PASS.**

### H1-01-G — Fake Product E2E

End-to-end read surface against `FakeFeishuAdapter`: seed deterministic demo
data (≥2 Projects, Customers, Tasks, Assets), then prove `WorkspaceReadService`
exposes the canonical structures with no Feishu leakage and returns `null` for
unknown ids.

**Status: PASS** — `packages/workspace-read/tests/fake-e2e.test.ts`
**3 passed / 0 failed**.

### H1-01-H — Real-Adapter Simulator Regression

The production `RealFeishuAdapter` (driven by a stubbed `fetchImpl`, no live
credentials) writes the demo dataset then reads it back through
`WorkspaceReadService`, proving the real adapter's collection-read mapping is
correct end-to-end.

**Status: PASS** — `packages/workspace-read/tests/real-adapter-simulator.test.ts`
**2 passed / 0 failed**.

### H1-01-I — Existing Regression

All `@busos/*` packages + the new `@busos/workspace-read` typecheck clean and
their test suites pass; only LIVE credential-gated SKIPs are non-passing:
- contracts 85 · service-agent-candidate 53 · business-repository 37+1skip ·
  golden-path 11+1skip · human-review 42+2skip · project-lifecycle 20+1skip ·
  lumen-adapter 9 · creative-production 19+1skip · orchestrator 37 ·
  **workspace-read 5 (new)**.

**Status: PASS.**

### H1-01-J — Build / Type Safety

`packages/workspace-read` `tsc --noEmit` clean; all packages typecheck clean.
The `apps/operator-workspace` frontend bundles cleanly via esbuild
(aliases for `@busos/*`, `node:crypto` shim, `process` shim) to
`dist/bundle.js` (headless smoke PASS); no Feishu secret in the artifact.

**Status: PASS.**


---

## R2-H1-02 Gate — Operator Workspace Review Surface (BUSOS-R2-H1-02)

PASS only if all gates below pass. Status as of 2026-08-16: **PASS**.
No live environment required for any H1-02 gate — the review surface is
exercised against the in-memory `FakeFeishuAdapter` (deterministic seed) and
delegates every decision to the existing `@busos/human-review`
`HumanReviewService` (which reuses the P2 golden-path commit path). H1-02 is
strictly a product-surface integration: it does NOT reimplement ReviewState /
ReviewAction / validation / governance / edit allowlist / commit / readback /
fail-closed — all of that lives in HumanReviewService.

Scope lock: only H1-02 implemented. H1-03 (Runs), H1-04 (AI action), H1-05 are
NOT started. No new ReviewRepository / RBAC / notifications / multi-reviewer /
assignment engine / event bus / Feishu schema redesign / Lumen work.

### H1-02-A — Authority / scope

Baseline `73938197daa783ab245ff4957578945ffed9e63d` confirmed equal to
`origin/main` (verified via `git ls-remote`). H1-01 remains intact (Projects
read surface unchanged, 4-nav constraint preserved). No H1-03/H1-04 work.
New `@busos/workspace-review` package is a thin delegation adapter only.

**Status: PASS.**

### H1-02-B — Reviews list

`WorkspaceReviewService.listReviews()` returns deterministic seeded
`ReviewCase[]` (≥3 PENDING_REVIEW cases: APPROVE / EDIT+APPROVE / REJECT
demos), pending-first then `updated_at` desc. Each item exposes canonical
`ReviewCase` data (candidate id, state, service type, customer identity,
budget, governance issue summary). No raw Feishu structures leak (asserted:
no `FEISHU_APP_SECRET` / `app_token` / `table_id` / `record_id` in the list
dump).

**Status: PASS** — `packages/workspace-review/tests/review-e2e.test.ts`
(H1-02-B).

### H1-02-C — Review detail / inspection

`getReview(caseId)` exposes original candidate (customer / service_type /
budget / preferred_date_text / notes), governance decision + issues,
AI evidence, and the retained original snapshot (`reviewed_candidate`
equal to `original_candidate` at start). No Feishu raw records exposed.

**Status: PASS** — `review-e2e.test.ts` (H1-02-C).

### H1-02-D — APPROVE

`approve()` calls the existing `HumanReviewService.applyReview` → candidate
validation → governance rerun → canonical `commitApprovedCandidate` →
repository write → readback verification. Final state `COMMITTED` on success;
`commit.write_status=SUCCESS`, `readback_status=VERIFIED`; committed Lead
reflects the ORIGINAL AI value; no false COMMITTED. A hard governance REJECT
cannot be overridden by human approval (governance rerun guards it).

**Status: PASS** — `review-e2e.test.ts` (H1-02-D).

### H1-02-E — EDIT + APPROVE

`editAndApprove()` applies ONLY the allowlisted edit (canonical P3 example
`budget_max: 4000 → 4500`). Original AI candidate snapshot retained (4000);
`reviewed_candidate` carries 4500; human before/after retained in `edits`;
candidate revalidated; governance rerun; committed / readback value = 4500;
stale AI evidence for the edited field is NOT reused (AI evidence entry
dropped, replaced by `HUMAN_EDIT` marker — asserted).

**Status: PASS** — `review-e2e.test.ts` (H1-02-E).

### H1-02-F — REJECT

`reject()` returns `state=REJECTED`, `commit=null`, zero repository/business
writes (`lead=customer=link=0`), no COMMITTED result. Presented as a valid
business decision, not an error.

**Status: PASS** — `review-e2e.test.ts` (H1-02-F).

### H1-02-G — Fail closed

Invalid edited candidate (e.g. `budget_max = -5`) fails contract validation →
`state=FAILED`, `commit=null`, zero business writes, sanitized
`failure_reason` visible. No false COMMITTED. A hard governance REJECT after
edit is likewise fail-closed.

**Status: PASS** — `review-e2e.test.ts` (H1-02-G).

### H1-02-H — Architecture boundary

`apps/operator-workspace` presentation code imports only
`@busos/workspace-review`. That package depends only on
`@busos/human-review`, `@busos/golden-path`, `@busos/business-repository`,
`@busos/contracts` — none of which are Feishu API / table IDs / field
mappings / credentials / raw Feishu records. The browser bundle statically
scans clean of `FEISHU_*`, `LUMEN_AUTH_PASSWORD`, `open-apis`, `app_token`.

**Status: PASS** — `apps/operator-workspace/smoke.mjs` (secret scan) +
static review.

### H1-02-I — Product smoke

Headless browser smoke drives the real UI module graph
(`apps/operator-workspace/src/ui.ts`) through: Reviews list → open pending
review → inspect candidate/governance/evidence → Approve → UI reflects
terminal `COMMITTED` state/outcome.

**Status: PASS** — `apps/operator-workspace/smoke-review.mjs`
(`REVIEW_SMOKE_OK`) + `smoke.mjs` (`SMOKE_OK`).

### H1-02-J — Regression

- `packages/workspace-review` tsc clean; **7 passed / 0 failed**.
- `packages/human-review` tsc clean; **42 passed / 2 skipped**.
- `packages/workspace-read` tsc clean; **5 passed / 0 failed**.
- `packages/business-repository` tsc clean; **37 passed / 1 skipped**.
- `apps/operator-workspace` build clean; `smoke.mjs` SMOKE_OK;
  `smoke-review.mjs` REVIEW_SMOKE_OK; no existing gate regression.
- All relevant `@busos/*` packages typecheck clean.

**Status: PASS.**

---

## R2-H1-03 Gate — Operator Workspace Run Detail / Trace Surface (BUSOS-R2-H1-03)

PASS only if all gates below pass. Status as of 2026-08-16: **PASS**.
No live environment required for any H1-03 gate — the run surface reads from the
in-memory `FakeFeishuAdapter` + a shared `InMemoryProcessRegistry` (deterministic
demo seed) and reuses the existing P6 Orchestrator contract. H1-03 is strictly
read-only and adds **no** second state machine.

Scope lock: only H1-03 implemented. H1-04 (AI action), H1-05 are NOT started. No
new run/execution persistence database, no live trace streaming, no re-run/retry
UI, no RBAC, no business mutation.

### H1-03-A — Authority / scope

Baseline `508dbfc38f0a17fe533dd8d286e54be5d940b1e9` confirmed equal to
`origin/main` (verified via `git ls-remote`). H1-01/H1-02 surfaces intact (4-nav
constraint + Projects/Reviews read surfaces preserved). No H1-04/H1-05 work.
`WorkspaceRunService` is a thin read adapter over `ProcessRegistryReadPort`.

**Status: PASS.**

### H1-03-B — Runs list read surface

`WorkspaceRunService.listRuns()` returns deterministic seeded `RunView[]`
(updated_at desc, `limit` respected), each backed by a canonical
`BusinessProcessResult` from `ProcessRegistryReadPort`. `RUNNING` is rendered
**honestly** — `trace = []`, `output = null`, `durationMs = null`, exactly one
`current` stage + the not-yet-reached stages (registry-only; no fabricated
trace/asset). `getRun(unknownId)` returns `null`.

**Status: PASS** — `packages/workspace-run/tests/run-surface.test.ts` (H1-03-B).

### H1-03-C — Run detail mapping

`SUCCEEDED` → `outcome.kind = 'success'` with only stable `outputRefs`
(leadId/customerId/projectId/taskId/assetId/assetUri). `FAILED` →
`outcome.kind = 'system_error'` with `code` (e.g. `CREATIVE_GENERATION_FAILED`)
+ sanitized `message` + the failed `stage`. `REJECTED` → `business_rejection`;
`HUMAN_REQUIRED` → `human_required`. `getRun(processId)` maps the full
`RunView` (status / stages / sanitized trace / outcome).

**Status: PASS** — `run-surface.test.ts` (H1-03-C).

### H1-03-D — Real orchestrator wiring (no second state machine)

A REAL `runBusinessProcess(input, fakeDeps, { registry })` (SUCCESS path) writes
to the shared `InMemoryProcessRegistry`; `WorkspaceRunService` constructed with
that same registry returns a `RunView` whose `status = 'SUCCEEDED'` and
`outputRefs` match the process result. A FAILURE path → `status = 'FAILED'` →
`system_error`. The service reuses the canonical `BusinessProcessResult`; it does
NOT re-implement status/stage/error semantics.

**Status: PASS** — `run-surface.test.ts` (H1-03-D, e2e via shared registry).

### H1-03-E — Semantic gate (FAILED ≠ rejection/human)

`FAILED` maps to `system_error` (a real system fault). `REJECTED` maps to
`business_rejection` and `HUMAN_REQUIRED` maps to `human_required` — both are
normal business / human pauses and are **never** surfaced as a system error in the
UI. The mapping is exhaustively covered across all five status kinds.

**Status: PASS** — `run-surface.test.ts` (H1-03-E).

### H1-03-F — Trace sanitization / security boundary

The view-model trace uses the P6 `sanitizeTraceMetadata` allowlist — keys like
`apiKey` / `password` / `systemPrompt` / `source_image_base64` /
`thirdPartyPayload` are dropped; only allowlisted stable refs
(`leadId`/`governanceDecision`/…) survive. `sanitizeMessage` redacts
token-like values (`sk-secret-999` / `hunter2` → `[REDACTED]`). A whole-app
forbidden-token scan over the bundled UI graph finds no leaked secret/credential
(raw Feishu/Lumen creds never enter the view models).

**Status: PASS** — `run-surface.test.ts` (H1-03-F) + `apps/operator-workspace/smoke-run.mjs`
(forbidden-token injection + whole-app scan).

### H1-03-G — Deterministic demo seed

`buildDemoRuns()` seeds the shared `InMemoryProcessRegistry` with four cases:
A SUCCEEDED / B FAILED (system fault) / C RUNNING (honest, registry-only) /
D HUMAN_REQUIRED (normal pause). The Runs list + Run Detail render all four
correctly; C shows honest empty trace / null output / null duration.

**Status: PASS** — `run-surface.test.ts` + `smoke-run.mjs` (open A/B/C/D).

### H1-03-H — Architecture boundary

`apps/operator-workspace` presentation code imports only `@busos/workspace-run`.
That package depends only on `@busos/orchestrator` (the `ProcessRegistryReadPort`
+ `sanitizeTraceMetadata` / `sanitizeMessage`) and `@busos/contracts` — none of
which are Feishu API / table IDs / field mappings / credentials / raw Feishu
records / Lumen secrets. The browser bundle statically scans clean of `FEISHU_*`,
`LUMEN_AUTH_PASSWORD`, `open-apis`, `app_token`, `apiKey`, `password`,
`systemPrompt`, `source_image_base64`, `thirdPartyPayload`.

**Status: PASS** — `apps/operator-workspace/smoke-run.mjs` (secret scan) +
static review.

### H1-03-I — Product smoke

Headless browser smoke drives the real UI module graph
(`apps/operator-workspace/src/ui.ts`) through: Runs list → open `proc_seed_b002`
(FAILED) → verify stage / status / structured trace / sanitized error; open
`proc_seed_a001` (SUCCEEDED) → safe output refs; open `proc_seed_d004`
(HUMAN_REQUIRED) → rendered as a normal pause (NOT a system error); inject
forbidden tokens into a stored record's trace metadata → re-open → assert stripped
+ legit refs preserved; whole-app forbidden scan.

**Status: PASS** — `apps/operator-workspace/smoke-run.mjs` (`RUN_SMOKE_OK` ×5).

### H1-03-J — Regression

- `packages/workspace-run` tsc clean; **12 passed / 0 failed** (≥8 required).
- `packages/orchestrator` tsc clean (regression fix: `ProcessExecutionRecord`
  imported from local declaration, not `process-contract.js`); P6-02 suite intact.
- `packages/workspace-read` / `workspace-review` / `human-review` /
  `business-repository` tsc clean; existing suites green.
- `apps/operator-workspace` build compiles cleanly (esbuild, aliases for
  `@busos/*`); `smoke.mjs` SMOKE_OK; `smoke-review.mjs` REVIEW_SMOKE_OK;
  `smoke-run.mjs` RUN_SMOKE_OK; no existing gate regression.
- All relevant `@busos/*` packages typecheck clean.

**Status: PASS.**

---

## R2-H1-04 Gate — First Real AI Action Vertical Slice (BUSOS-R2-H1-04)

PASS only if all gates below pass. Engineering status as of 2026-08-17:
**ENGINEERING COMPLETE**. No live environment required for H1-04-A..H1-04-J — the
action is exercised through the in-memory DEMO path and the server-only CONNECTED
boundary probe. **LIVE GATE BLOCKED** under **BL-018** (real Feishu Project + real
Lumen generation + real Asset write + readback VERIFIED + UI Run/Asset view not
executed in this environment). Fake PASS is NOT substituted for Live Pass.

Scope lock: only H1-04 implemented. H1-05 (Real Usage Closure / MVP Review), H2, H3,
H4 are NOT started. No second state machine, no generic Action framework, no
RBAC/multi-tenant, no Redis/MQ, no live trace streaming.

### H1-04-A — Authority / scope

Baseline `91e614360d08c65c3fca4739f66b4ebaca3f549e` confirmed equal to
`origin/main` (verified via `git ls-remote` / local object DB). H1-01/H1-02/H1-03
surfaces intact (4-nav constraint + Projects/Reviews/Runs surfaces preserved). No
H1-05 work. `runCreativeProjectAction` is a thin additive entry in
`@busos/orchestrator`; no existing package behaviour changed beyond the additive
action.

**Status: PASS.**

### H1-04-B — Narrow entry (no runBusinessProcess, no second state machine)

`apps/operator-workspace` triggers the NEW `runCreativeProjectAction` (CREATIVE_PRODUCTION
only) — it does NOT call `runBusinessProcess`, adds no second state machine, and
reuses the P6 status / trace / registry / sanitizer / error-classification. 6
orchestrator unit tests (`packages/orchestrator/tests/creative-action.test.ts`) cover
SUCCEEDED surfaces assetId/assetUri, empty-prompt→REJECTED, Lumen-fail→FAILED,
idempotency replay, key-without-registry fails closed, and trace-leak.

**Status: PASS** — `creative-action.test.ts` **6 passed / 0 failed**.

### H1-04-C — DEMO browser action (end-to-end)

Headless browser smoke drives the REAL in-browser `runGenerateVisualReference` (DEMO
mode) against an existing Project: asserts `status === 'SUCCEEDED'`,
`mode === 'DEMO'`, `output.assetId` + `output.assetUri` (lumen-stub://), a real
Task (status DONE) + Asset written and visible on the project, and the run recorded
in the shared `InMemoryProcessRegistry` (same instance the Runs surface reads).

**Status: PASS** — `apps/operator-workspace/smoke-action.mjs` (`SMOKE_ACTION_OK`).

### H1-04-D — Idempotency / no duplicate Task/Asset

A duplicate `idempotencyKey` replays the recorded outcome with `deduplicated: true`
and ZERO new Task/Asset (asserted in both the unit test and the browser smoke by
re-running the same key and confirming task/asset counts stay 1).

**Status: PASS** — `creative-action.test.ts` (dedup) + `smoke-action.mjs`.

### H1-04-E — Trace / payload sanitization

The action never emits the prompt, `source_image_base64`, or secrets into the trace.
Unit test asserts the trace JSON contains none of: the prompt, the base64 image,
`source_image`, `prompt`, `Bearer`, `password`, `token`, `secret`, `api_key`,
`lumen-stub://`. Only allowlisted stable refs (projectId/taskId/assetId/idempotency/
reasonCode) appear.

**Status: PASS** — `creative-action.test.ts` (leak test).

### H1-04-F — Browser secret boundary

The browser bundle (`dist/bundle.js`) statically scans clean of `FEISHU_APP_SECRET`,
`FEISHU_APP_ID`, `FEISHU_BASE_APP_TOKEN`, `FEISHU_*_TABLE_ID`, `LUMEN_AUTH_PASSWORD`,
`LUMEN_BASE_URL`, `open-apis`, `app_token`. The CONNECTED `Real*` adapters + secrets
live only in `server/` and are never imported by the browser graph.

**Status: PASS** — `apps/operator-workspace/smoke-action.mjs` (forbidden-token scan).

### H1-04-G — CONNECTED server boundary (honest BLOCKED)

`server/workspace-action.ts` builds `RealFeishuAdapter` / `RealLumenAdapter` from
`FEISHU_*` / `LUMEN_*` via `createFeishuAdapterFromEnv` / `createLumenAdapterFromEnv`;
with no credentials it short-circuits to `BLOCKED` (carries a credential reason). The
probe (`smoke-server.mjs`) asserts mode `BLOCKED` with empty env — never a faked
LIVE success.

**Status: PASS** — `apps/operator-workspace/smoke-server.mjs` (`SMOKE_SERVER_OK`).

### H1-04-H — Two explicit modes, Fake labelled DEMO

DEMO (in-browser fakes) and CONNECTED (server-only reals) are separate code paths.
Fake/Demo data is labelled **DEMO** in the UI (badge + copy) and is never presented
as LIVE. The server boundary is the only place real credentials are used.

**Status: PASS** — static review of `src/action.ts` (DEMO) + `server/workspace-action.ts`
(CONNECTED) + UI badge.

### H1-04-I — Build / type safety / reproducible entry

`apps/operator-workspace` typechecks clean (src + server, `tsc --noEmit`), bundles
cleanly via esbuild to `dist/bundle.js` (browser, DEMO) AND `server/dist/*.js`
(node, CONNECTED). Root npm workspace + single lockfile + minimal CI: `npm ci &&
npm run verify` runs typecheck → test → build → smoke across workspaces.

**Status: PASS** — app `tsc --noEmit` clean; `build.mjs` emits both bundles; root
`verify` script defined.

### H1-04-J — Regression

- `packages/orchestrator` tsc clean; `vitest run --pool=forks` → **43 passed / 0 failed**
  (37 P6-02 + 6 H1-04).
- `packages/creative-production` / `lumen-adapter` / `business-repository` tsc clean;
  existing suites green.
- `apps/operator-workspace` typecheck clean (src+server); `smoke.mjs` SMOKE_OK;
  `smoke-action.mjs` SMOKE_ACTION_OK; `smoke-server.mjs` SMOKE_SERVER_OK; no existing
  gate regression.
- All relevant `@busos/*` packages typecheck clean.

**Status: PASS.**

### H1-04 — LIVE GATE (real Feishu + real Lumen + real Asset + readback + UI)

Run the SAME `runCreativeProjectAction` with REAL `BusinessRepository`
(`RealFeishuAdapter`) + REAL `LumenPort` (`RealLumenAdapter`) through: existing Project
→ `createTask` (CREATIVE_GENERATION/TODO) → `Lumen.generate` (prompt + single source
image) → `createAsset` (IMAGE/LUMEN) → `updateTaskStatus` (DONE) → real Feishu/Lumen
write + readback VERIFIED → Run + Asset visible in the Operator Workspace UI.

**Status: BLOCKED** — tracked by **BL-018 (OPEN / NON-ENGINEERING LIVE DEPENDENCY)**:
CloudBase quota availability + `LUMEN_BASE_URL`+`LUMEN_AUTH_PASSWORD` + `FEISHU_*`+
`FEISHU_ASSET_TABLE_ID` not present in this environment. The engineering slice is
complete and verified by the DEMO path + CONNECTED probe; the live execution is NOT
substituted by a fake PASS. H1-04 is reported **ENGINEERING COMPLETE / LIVE GATE
BLOCKED** and the task STOPS (no automatic H1-05 / H2 / H3 / H4).
