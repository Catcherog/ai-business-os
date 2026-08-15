# Current State

PROJECT: AI Business OS
VERSION: V1
PHASE: P5 COMPLETE (FUNCTIONAL PASS 2026-08-15; live rerun deferred — CloudBase quota) · P6 Orchestrator [ACTIVE — BUSOS-P6-01 COMPLETE, BUSOS-P6-02 COMPLETE, BUSOS-P6-03 COMPLETE 2026-08-15]
STATUS: P5 COMPLETE (FUNCTIONAL PASS 2026-08-15; live CREATIVE_SUCCESS rerun DEFERRED — CloudBase NoSQL read quota exhausted, owner override). P6-01 COMPLETE (orchestrator composition MVP). P6-02 COMPLETE / PASS (orchestrator reliability + trace contract; 37/37 orchestrator tests, tsc clean, gates P6-D..P6-J PASS, 2026-08-15). P6-03 COMPLETE / PASS (golden-path real-adapter-simulator regression repaired; BL-019 CLOSED; golden-path 11+1skip, full workspace regression green, 2026-08-15).
CURRENT TASK: BUSOS-P6-03 — Golden Path Regression Integrity / BL-019 Closure  [COMPLETE / PASS — Flow B restored; BL-019 CLOSED; no live env required]
BASELINE: e7b97d576273d968857ceffd8eba57392c4ea4d9
CURRENT BLOCKERS: none blocking P6 engineering. Live full-process E2E (P6-C) DEFERRED — external non-engineering live dependency (CloudBase NoSQL read quota + LUMEN_* / FEISHU_* live credentials), tracked by **BL-018 OPEN / NON-ENGINEERING LIVE DEPENDENCY**. **BL-016 is CLOSED** (P5 engineering blocker resolved / owner override recorded) and must not be cited as an active blocker. BL-015 OPEN/NON-BLOCKING. **BL-019 CLOSED (2026-08-15)** — golden-path real-adapter-simulator Flow B regression repaired (stale `/records/search` stub branch added; no production code changed).

PRIMARY OBJECTIVE:
Productize the minimum human-review vertical slice required by R1:
LeadCandidateV1 -> GovernanceResultV1(REVIEW_REQUIRED) -> Human Review Surface
(APPROVE / EDIT+APPROVE / REJECT) -> deterministic validation/governance ->
BusinessRepository -> FeishuAdapter -> write -> readback -> VERIFIED.

This task productizes Human Review only. It does NOT build a general workflow engine.

CURRENT P4 TASK:
- BUSOS-P4-01 — Project Lifecycle Vertical Slice  [COMPLETE — LIVE P4 LIFECYCLE E2E PASS]

EXECUTION ORDER:
- P0 VERIFIED. [done]
- P1 COMPLETE. [done — contracts + candidate builder + business repository/adapter]
- P2 COMPLETE. [done — GP-001 vertical slice, live Feishu E2E PASS]
- BUSOS-P3-01. [COMPLETE — live HR-H Feishu E2E PASS 2026-08-12]
- BUSOS-P4-01. [COMPLETE — LIVE P4 LIFECYCLE E2E PASS 2026-08-13; PL-A..PL-H all PASS. NEXT: none — STOP per task §15.]
- BUSOS-P5-01. [COMPLETE — FUNCTIONAL PASS 2026-08-15 (P5-X03); P5-A..P5-H PASS; live CREATIVE_SUCCESS rerun DEFERRED on CloudBase quota (owner override). P6 authorized.]
- BUSOS-P6-01. [COMPLETE — Orchestrator MVP (composition only). `@busos/orchestrator` composes golden-path → project-lifecycle → creative-production behind `runBusinessProcess` with a structured trace. tsc clean; fake-E2E gates P6-A/P6-B PASS (2026-08-15).]
- BUSOS-P6-02. [COMPLETE / PASS — Orchestrator Reliability + Trace Contract. Process state contract (RUNNING/SUCCEEDED/FAILED/REJECTED/HUMAN_REQUIRED), `BusinessProcessResult` (refs only), structured `ProcessTraceEvent` with allowlisted metadata sanitizer, error classification (RETRYABLE/TERMINAL/EXTERNAL_DEPENDENCY), idempotency via `ProcessRegistry` port + `InMemoryProcessRegistry`, fail-closed stage propagation. Gates P6-D..P6-J PASS; 37/37 orchestrator tests; tsc --noEmit clean on all packages. No live env required. NEXT: none — STOP per task §15.]
- Live full-process E2E (P6-C). [DEFERRED — external non-engineering live dependency (CloudBase read quota + LUMEN_*/FEISHU_* credentials); BL-018 OPEN.]

P1-01 EVIDENCE:
- Package: packages/contracts (TypeScript + zod runtime validation).
- Runtime validators: LeadCandidateV1 / GovernanceResultV1 / CommitResultV1.
- Domain types: Session / AgentRun / Lead / Customer / Project.
- Tests: 82 passing (vitest); tsc --noEmit clean.
- Command: (in packages/contracts) npm run verify.

P1-02 EVIDENCE:
- Package: packages/service-agent-candidate (TypeScript; name @busos/service-agent-candidate).
- Canonical case PASS: 「我想下个月拍一套新中式写真，预算大概4000。」 -> service_type="新中式写真", budget_max=4000, preferred_date_text="下个月".
- Tests: 52 passing (vitest); tsc --noEmit clean.
- Command: (in packages/service-agent-candidate) npm test.

P1-03 EVIDENCE:
- Package: packages/business-repository (TypeScript; name @busos/business-repository).
- 6 repository methods against the FeishuAdapter port; only the adapter owns Feishu tokens/table ids/field names (D018).
- Readback enforced (D019): create -> get record -> map back -> verify critical fields -> CommitResultV1 (status COMMITTED only if write SUCCESS && readback VERIFIED).
- Tests: 36 passing, 1 skipped (vitest); tsc --noEmit clean.

P2 GP-001 EVIDENCE:
- Package: packages/golden-path (TypeScript; name @busos/golden-path).
- Thin orchestration: Service Agent candidate -> Governance -> BusinessRepository -> FeishuAdapter -> readback -> VERIFIED / FAILED.
- Live Feishu E2E: PASS (BL-013/BL-014 CLOSED; BL-015 OPEN / NON-BLOCKING).
- Tests: 14 passing (fake + real-adapter-simulator), 1 live-skipped; tsc --noEmit clean.

P3-01 PLAN:
- New package: packages/human-review (name @busos/human-review).
- Minimal governance rule added to golden-path/src/governance.ts to expose a deterministic REVIEW_REQUIRED case (intent.confidence < 0.6 -> REVIEW_REQUIRED, issue INTENT_CONFIDENCE_LOW). Documented in completion evidence; does not redesign governance; P2 tests remain green.
- golden-path commit path extracted into `commitApprovedCandidate(candidate, repo)` and reused by the review service (no duplicated business logic).
- HumanReviewService: createReviewCase (Flow A, zero writes) + applyReview(APPROVE / EDIT_APPROVE / REJECT) (Flows B/C/D/E).
- Minimal HTTP + HTML review surface (scripts/review-server.ts) — no existing presentation stack, so smallest runtime used; FakeFeishuAdapter default, RealFeishuAdapter if FEISHU_* env present.
- HR-A..HR-H gates implemented; HR-H live E2E gated on FEISHU_* env.

P3-01 EVIDENCE:
- Package: packages/human-review (TypeScript; name @busos/human-review).
- Minimal review surface: createReviewCase (Flow A, zero writes) + applyReview(APPROVE / EDIT_APPROVE / REJECT) (Flows B/C/D/E). Reuses commitApprovedCandidate + govern from @busos/golden-path (no duplicated commit logic). Feishu knowledge stays behind BusinessRepository -> FeishuAdapter (HR-F static scan PASS: 34 token assertions).
- Tests: HR-A..HR-E 7 passing, HR-F 34 token assertions passing, HR-G regression green across all 5 packages (contracts 82 / sac 53 / br 36+1skip / gp 11+1skip / hr 42+2skip), HR-H fake/sim PASS + live SKIPPED (FEISHU_* absent). tsc --noEmit clean on all modified packages.
- Completion evidence: 09-P3-01-COMPLETION.md — status `COMPLETE / LIVE P3 REVIEW E2E PASS` (HR-H live Feishu E2E PASSED 2026-08-12; all HR-A..HR-H gates PASS).

P4-01 PLAN:
- New package: packages/project-lifecycle (name @busos/project-lifecycle).
- Additive contract delta (no breaking change): canonical `Task` (task_id, project_id, task_type, title, status TODO|IN_PROGRESS|DONE|CANCELLED, due_date nullable, created_at, updated_at) added to @busos/contracts; `COMMIT_DOMAIN_OBJECTS` gains `project`/`task`; `BL-006` date semantics documented (explicit YYYY-MM-DD → value; relative-only → null; never hallucinated).
- BusinessRepository + FeishuAdapter increment: `updateLeadStatus`, `createProject`(DRAFT), `getProject`, `createTask`(TODO), `getTask`, `deleteProject`/`deleteTask` (exact record id, test-hygiene/compensation only). Upper layer receives only canonical domain objects + `CommitResultV1`.
- Methods are fail-closed (`assertWith`); readback-verify on every write (D019); exact-record-id compensation on partial failure (no saga/retry/CQRS).
- `convertLeadToProject(input, deps)` is the single primary API: 7-step write order, eligibility Cases 1–5 (Normal / Anonymous-BLOCKED / Dangling-fail-closed / Already-Converted-BLOCKED / Lost-BLOCKED), default initial task PROJECT_SETUP/"Project setup" (no LLM).
- PL-A..PL-G gates implemented; PL-H live E2E gated on FEISHU_* + FEISHU_PROJECT_TABLE_ID/FEISHU_TASK_TABLE_ID.

P4-01 EVIDENCE:
- Package: packages/project-lifecycle (TypeScript; name @busos/project-lifecycle).
- Full lifecycle implemented and verified through Fake + RealFeishuAdapter-via-simulator: Lead(QUALIFIED) → verify Customer → createProject(DRAFT) → createTask(TODO, default PROJECT_SETUP) → readback VERIFIED (Project+Task+Lead CONVERTED) → LIFECYCLE_SUCCESS. Eligibility cases (Anonymous/Dangling/Already-Converted/Lost) fail closed with 0 writes. Partial-failure compensation deletes by exact record id; Lead never reported CONVERTED on failure. PL-F static scan PASS (6 assertions: no forbidden Feishu tokens in src/).
- Tests: 20 passed / 1 skipped (vitest) + tsc --noEmit clean. Regression PL-G green across all 5 affected packages (contracts 85 / br 36+1skip / gp 11+1skip / hr 42+2skip / pl 20+1skip).
- PL-H live Feishu E2E: PASS (2026-08-13) — executed via BUSOS-P4-01-LIVE-CLOSURE with user-supplied `FEISHU_*` + `FEISHU_PROJECT_TABLE_ID`/`FEISHU_TASK_TABLE_ID`; full real chain VERIFIED + exact-record-id cleanup. Reported honestly as `Real Feishu E2E: PASS` (distinct from the in-memory-simulator PASS).
- Completion evidence: 10-P4-01-COMPLETION.md — status `COMPLETE / LIVE P4 LIFECYCLE E2E PASS` (PL-A..PL-H all PASS).

P5-01 PLAN:
- New package: packages/lumen-adapter (name @busos/lumen-adapter). Lumen `LumenPort` + `RealLumenAdapter` (maps deployed Lumen HTTP API) + `FakeLumenAdapter` (in-memory). Holds ONLY Lumen `AUTH_PASSWORD` + base URL — never the provider key (§19).
- New package: packages/creative-production (name @busos/creative-production). `executeCreativeProduction(input, deps)`: Project → eligibility (fail closed, 0 writes) → create Creative Task (TODO) → readback VERIFIED → Lumen.generate → create Asset (IMAGE/LUMEN) → readback VERIFIED → update Task DONE → readback VERIFIED → CREATIVE_SUCCESS, with exact-record-id compensation on each failure point.
- Additive contract delta: canonical `Asset` (asset_type ∈ {IMAGE}, source ∈ {LUMEN}); `COMMIT_DOMAIN_OBJECTS` gains `asset`. BusinessRepository/FeishuAdapter increment: `updateTaskStatus`, `createAsset`, `getAsset`, `deleteAsset`; `createFeishuAdapterFromEnv` now requires `FEISHU_ASSET_TABLE_ID`.
- Architecture boundaries strict: creative-production depends only on `CreativeProductionRepository` + `LumenPort`; never imports Feishu/Lumen secrets, `RealFeishuAdapter`, `/api/auth`, `signedUrls`. business-repository never imports Lumen.

P5-01 EVIDENCE:
- Packages: @busos/lumen-adapter (tsc clean; 7 tests PASS), @busos/creative-production (tsc clean; 19 passed / 1 skipped).
- Full slice verified through Fake + RealLumenAdapter-via-stub: Project(DRAFT) → Creative Task(TODO) → Lumen generate → Asset(IMAGE/LUMEN, uri from Lumen signedUrls) → Task DONE, readback VERIFIED at every step. Eligibility cases (missing/CANCELLED/DELIVERED/empty prompt/empty image) fail closed with 0 writes. Compensation E1–E4 delete by exact record id. P5-G static scan PASS (4 source files, 18 forbidden-token assertions).
- Regression P5-H green across all 5 packages (contracts 85 / br 36+1skip / pl 20+1skip / la 7 / cp 19+1skip). tsc --noEmit clean on all.
- P5-I REAL end-to-end: closed as FUNCTIONAL PASS 2026-08-15 (P5-X03 HARDEN + tests + prod deploy dpl_AdnQygPLZ7fB58QJECcvj5o4NxGV). Live CREATIVE_SUCCESS rerun DEFERRED on CloudBase read-quota exhaustion (owner override; not a code defect). Reported honestly as `P5 FUNCTIONAL PASS — LIVE RE-RUN DEFERRED — CLOUDBASE QUOTA`.
- Completion evidence: 11-P5-01-COMPLETION.md (impl); BUSOS-P5-X03-STATUS.md (functional closure + owner override). P5-A..P5-H PASS; P5-I live rerun deferred.

P6-01 PLAN:
- New package: packages/orchestrator (name @busos/orchestrator).
- Composition only — no existing package modified, no new infra. `runBusinessProcess(input, deps)` wires the three slices with a shared `BusinessRepository` (Feishu port) + single `LumenPort`. `TraceCollector` records per-stage OK/FAILED for observability and makes the deferred live rerun (BL-016) a single inspectable call.
- Imports ONLY from @busos/golden-path, @busos/project-lifecycle, @busos/creative-production, @busos/contracts, @busos/business-repository, @busos/lumen-adapter. Holds no secret.
- P6-A fake E2E + P6-B failure-observability gates implemented; live full-process E2E (P6-C) gated on FEISHU_* + FEISHU_ASSET_TABLE_ID and LUMEN_BASE_URL + LUMEN_AUTH_PASSWORD, deferred on CloudBase quota.

P6-01 EVIDENCE:
- Package: packages/orchestrator (TypeScript; name @busos/orchestrator).
- tsc --noEmit clean (exit 0). vitest 2 passed / 0 failed (13ms, 1 file).
- Tests: fake-e2e.test.ts (2) — full happy-path SUCCESS (asset id/uri defined, 3 OK stages in order) · Lumen-failure → FAILED at CREATIVE_PRODUCTION with 3 stages recorded (last FAILED).
- Plan/acceptance: BUSOS-P6-01-PLAN.md.
- Live P6-C E2E: DEFERRED (BL-018 — CloudBase NoSQL read-quota exhaustion + missing live credentials; non-engineering). Not substituted for Fake PASS.

P6-02 PLAN:
- Scope: `@busos/orchestrator` only. Upgrade `runBusinessProcess` from "composition" into a reliable business process orchestrator. No Memory, no dashboard, no eval platform, no queue/Redis/MQ, no new DB, no new AI agent, no new UI, no resume engine, no distributed lock.
- Four deliverables: (1) Process State Contract, (2) `BusinessProcessResult` (refs only), (3) Structured Trace Contract, (4) Error Classification + basic Idempotency.
- Stage naming keeps the real composition names (GOLDEN_PATH / PROJECT_LIFECYCLE / CREATIVE_PRODUCTION); governance, customer resolution and business persistence execute inside golden-path and are not force-renamed into separate stages.
- Idempotency storage stays in-process: `ProcessRegistry` port + `InMemoryProcessRegistry`, injected via `options.registry` or `deps.processRegistry`. No CloudBase/Feishu/Postgres added.
- Gates P6-D..P6-J; no live environment required (P6-C stays DEFERRED).

P6-02 EVIDENCE:
- New source: `packages/orchestrator/src/process-contract.ts` (status/stage/result/trace/error types), `src/errors.ts` (classifier + message sanitizer), `src/process-registry.ts` (`ProcessRegistry` port + `InMemoryProcessRegistry`). Rewritten: `src/trace.ts` (structured `ProcessTraceEvent` + allowlisted `sanitizeTraceMetadata`), `src/run-business-process.ts` (state machine, fail-closed propagation, idempotency, never throws), `src/types.ts`, `src/index.ts`.
- New tests: `tests/helpers.ts` (counting deps + fault injection + rejecting/review governance), `tests/process-contract.test.ts` (P6-D/P6-E/P6-F/P6-G), `tests/idempotency.test.ts` (P6-H/P6-I), `tests/error-classification.test.ts` (P6-J). `tests/fake-e2e.test.ts` migrated to the new contract (P6-A/P6-B still PASS).
- Verification: `npx vitest run --pool=forks` in packages/orchestrator → **37 passed / 0 failed** (4 files). `npx tsc --noEmit` clean (exit 0) in all 9 packages.
- Regression sweep: contracts 85 · service-agent-candidate 53 · business-repository 36+1skip · project-lifecycle 20+1skip · human-review 42+2skip · lumen-adapter 7 · creative-production 19+1skip · orchestrator 37 → all PASS. golden-path: 1 pre-existing failure (real-adapter simulator Flow B, `linkLeadCustomer: lead not found in Feishu`) — proven byte-identical to remote `0b515e9` and untouched by P6-02; tracked as BL-019 — **CLOSED by BUSOS-P6-03 (2026-08-15)**.
- Behavior: business rejection → `REJECTED` (not FAILED) with zero downstream writes; REVIEW_REQUIRED → `HUMAN_REQUIRED`; stage failure → `FAILED` with `ProcessError { code, message, stage, disposition }` and no stage N+1; duplicate idempotency key after success replays the prior result with downstream call counts unchanged (1/1/1); prior TERMINAL failure never auto-reruns.

P6-03 PLAN:
- Scope: golden-path test harness only. Reproduce + diagnose + minimally fix the pre-existing `real-adapter.test.ts` Flow B failure (`expected 'FAILED' to be 'SUCCESS'`). Close BL-019. No production/contract/business behavior change; no orchestrator, governance, Feishu production mapping, Lumen, CloudBase or live-env change.
- Allowed touch points: `packages/golden-path/tests/**`, the in-memory Feishu simulator in `packages/golden-path/tests/testkit.ts`.

P6-03 EVIDENCE:
- Root cause: `packages/golden-path/tests/testkit.ts` `makeFeishuStub` is a stale copy of `packages/business-repository/tests/feishu-real.test.ts`. Production `RealFeishuAdapter.findRecordsByField` uses `POST /open-apis/bitable/v1/apps/{app}/tables/{table}/records/search` (BUSOS-P4-01 live-closure fix — the list `?filter=` query returns InvalidFilter on the live Base). The golden-path stub only handled `POST /records`, `GET /records/{id}`, `PUT /records/{id}`, `GET /records?filter=` — so `/records/search` fell through to `unsupported` (400) → zero records → `linkLeadCustomer` throws `lead not found in Feishu`.
- Fix: added the `POST .../records/search` branch to `makeFeishuStub` (identical semantics to the business-repository stub). Simulator now faithfully emulates the existing adapter contract.
- Verification: golden-path `tsc --noEmit` clean; `vitest run` → 11 passed / 1 skipped (skip = LIVE block). business-repository 37 passed / 1 skip; orchestrator 37 passed / 0 (P6-02 gates green); full workspace tsc clean + green (contracts 85 · sac 53 · project-lifecycle 20+1skip · human-review 42+2skip · lumen-adapter 9 · creative-production 19+1skip · golden-path 11+1skip · business-repository 37+1skip · orchestrator 37). Only skipped items are LIVE credential-gated blocks (not hidden).

CURRENT BLOCKERS:
- **BL-013 CLOSED (2026-08-12)** — Live Feishu E2E executed with provided FEISHU_* credentials; real-adapter LIVE block passed.
- **BL-014 CLOSED (2026-08-12)** — Dedicated Lead table provisioned in the real Base.
- **BL-015 OPEN / NON-BLOCKING** — P1-02 extractor does not resolve bare "新中式" to a service_type. Unchanged; not a blocker for the live gate.
- **HR-H LIVE E2E — PASS (2026-08-12)** — BUSOS-P3-01 live Feishu review slice executed with real FEISHU_* credentials; both live HR-H tests PASSED and records were cleaned by exact record_id. HR-H gate CLOSED. (See 09-P3-01-COMPLETION.md §7/§8.)
- **PL-H LIVE P4 LIFECYCLE E2E — PASS (2026-08-13)** — executed via BUSOS-P4-01-LIVE-CLOSURE with user-supplied `FEISHU_*` + `FEISHU_PROJECT_TABLE_ID`/`FEISHU_TASK_TABLE_ID`; full real chain (Customer → Lead QUALIFIED → link → Project DRAFT → Task TODO → Lead CONVERTED) wrote + read-back VERIFIED, `LIFECYCLE_SUCCESS`, and cleaned all four generated records by exact `record_id`. PL-H gate CLOSED; BUSOS-P4-01 is `COMPLETE / LIVE P4 LIFECYCLE E2E PASS`. (See 10-P4-01-COMPLETION.md §4/§7/§10.)
- **BL-016 CLOSED (2026-08-15)** — P5 engineering blocker resolved / owner override recorded (P5 closed as FUNCTIONAL PASS). BL-016 is history and must NOT be cited as an active blocker; live evidence tracking moved to BL-018.
- **BL-018 OPEN / NON-ENGINEERING LIVE DEPENDENCY** — live full-process E2E (P6-C) deferred: CloudBase NoSQL read quota + `LUMEN_BASE_URL`/`LUMEN_AUTH_PASSWORD` + `FEISHU_*`/`FEISHU_ASSET_TABLE_ID` not available. Not an engineering defect; closes by one `runBusinessProcess(input, realDeps)` call once quota + credentials are supplied.
- **BL-019 CLOSED (2026-08-15)** — golden-path real-adapter-simulator Flow B failure (`linkLeadCustomer: lead not found in Feishu`). Root cause: stale in-memory Feishu stub in `packages/golden-path/tests/testkit.ts` lacked the `/records/search` branch that production `RealFeishuAdapter.findRecordsByField` adopted in BUSOS-P4-01; hence `linkLeadCustomer`/`findCustomerByIdentity` resolved to zero records and Flow B failed closed. BUSOS-P6-03 added the `/records/search` stub branch (mirrors the already-correct `packages/business-repository/tests/feishu-real.test.ts` stub). **No production/contract/business behavior changed.** All golden-path + workspace gates green.
- **LIVE CREATIVE E2E (P5-I) — BLOCKED** — BUSOS-P5-01 REAL end-to-end (live Feishu Asset write/readback + live Vercel Lumen generation) could not execute: no `LUMEN_BASE_URL`/`LUMEN_AUTH_PASSWORD` (Vercel Lumen) and no `FEISHU_*` + `FEISHU_ASSET_TABLE_ID` were provided. Implementation is COMPLETE and verified by fake + real-adapter(stubbed) gates (P5-A..P5-H PASS). Reported honestly as `IMPLEMENTATION PASS / LIVE CREATIVE E2E BLOCKED`; the task STOPS at commit + push + clean tree (no automatic P6). (See 11-P5-01-COMPLETION.md §4/§6.)

LATEST CONTROL DECISIONS:
See `03-DECISIONS.md` (D001..D020 FROZEN).

ON TASK COMPLETION:
Update this file with:
- task status
- blockers
- next task
- evidence location
