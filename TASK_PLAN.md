# TASK_PLAN — BUSOS-P2-GP-001 (CLOSED) · BUSOS-P3-01 (CLOSED) · BUSOS-P4-01 (CLOSED — LIVE P4 LIFECYCLE E2E PASS)

## task_id
BUSOS-P4-01 — Project Lifecycle Vertical Slice

## phase
P4 — Project Lifecycle Slice

## status
COMPLETE (P4) — LIVE P4 LIFECYCLE E2E PASS (PL-A..PL-H all PASS 2026-08-13 via BUSOS-P4-01-LIVE-CLOSURE). P2 (GP-001) COMPLETE — LIVE FEISHU E2E PASS (BL-013/BL-014 CLOSED; BL-015 OPEN/NON-BLOCKING). P3 (BUSOS-P3-01) COMPLETE — HR-H live Feishu review E2E PASS 2026-08-12. NEXT: none — STOP per task §15.

- Golden Path orchestration built on the frozen P1 building blocks (Service Agent candidate → Governance → BusinessRepository → FeishuAdapter → readback) is complete and verified by 11 passing integration tests (1 live E2E skipped).
- (P2 live Feishu E2E later PASSED — see `live_feishu` below — closing BL-013/BL-014. P3 live HR-H review E2E also PASSED 2026-08-12 — see `09-P3-01-COMPLETION.md`.)

## baseline
- starting SHA: afb9c2f1e1e2385119a0261ca7cf81d72e126154 (P1-03 closing)
- branch: main
- P1-03 outcome (unchanged): CLOSED / PASS at skeleton level; live Feishu E2E BLOCKED.

## scope_enforced
ONLY BUSOS-P2-GP-001. Built one thin application orchestration layer (`packages/golden-path`) that wires the existing P1 components into a deterministic chain. Did NOT:
- re-audit / rewrite `@busos/contracts`, P1-02 candidate builder, P1-03 repository, Feishu adapter, or mapping.
- modify any frozen contract schema/type.
- extend `FakeFeishuAdapter` (per §10) — write counting is done via a `CountingBusinessRepository` wrapper over `BusinessRepository`.
- implement any out-of-scope item from §10 (UI, bot, OCR, RAG, memory, multi-agent, event bus, DAO/ORM, Postgres, dedup engine, analytics, P3+ …).

## new_package
`packages/golden-path/` (@busos/golden-path)
- `src/types.ts` — repository port (`GoldenPathRepository`), result/input types.
- `src/candidate.ts` — `buildCandidateFromInput`: replays the Service Agent boundary (ConsultationContextV1) and delegates to the FROZEN P1-02 `buildLeadCandidate` (no second extraction implementation).
- `src/governance.ts` — minimal `govern()`: APPROVE when `service_type` present; REJECT when missing (resolves BL-005 for GP-001). Exact identity → UNRESOLVED, absent identity → NOT_REQUIRED.
- `src/execute-golden-path.ts` — `executeGoldenPath(input, deps)`: fail-closed orchestration. Deps injected (`candidateBuilder`, `governance`, `businessRepository`); never imports Feishu tokens/table ids/field names/SDK types.
- `src/index.ts` — public surface.

## golden_path_architecture
Consultation (text)
→ LeadCandidateV1 (P1-02)
→ GovernanceResultV1 (govern)
→ Customer resolution (exact phone/wechat via BusinessRepository)
→ BusinessRepository (P1-03)
→ FeishuAdapter (P1-03)
→ Readback verification (D019)
→ VERIFIED / FAILED

## flows
- Flow A (anonymous): text → candidate → APPROVE → no identity → lead created (customer_id=null) → readback VERIFIED → SUCCESS.
- Flow B (identified): text → candidate → APPROVE → findCustomerByIdentity → create (new) or reuse (exact match) → lead created → link → readback VERIFIED → SUCCESS.
- Flow C (governance block): text → candidate → REJECT (missing service_type) → zero repository writes → BLOCKED.

## tests
command (in `packages/golden-path`):
```
npm run verify      # tsc --noEmit && vitest run
```
- typecheck: PASS (tsc --noEmit exit 0)
- vitest: 6 files, **11 passed | 1 skipped** (12 total)
  - anonymous.test.ts (1) · identified.test.ts (2) · governance-block.test.ts (2) · readback-failure.test.ts (2) · identity-boundary.test.ts (1) · real-adapter.test.ts (4 · 1 skipped = LIVE E2E)
- The skipped test is the LIVE Feishu E2E gated behind `createFeishuAdapterFromEnv()` — skipped because no `FEISHU_*` env.

## fake_adapter
PASS — `FakeFeishuAdapter` proves candidate→governance→repository→readback across Flows A/B/C, readback-failure fail-closed, and exact-only identity boundary.

## real_adapter_plus_stub
PASS — `RealFeishuAdapter` driven by the in-memory Feishu bitable simulator (`makeFeishuStub`, re-declared from P1-03's test, not modifying P1-03): Flow A/B/C run through the PRODUCTION adapter logic (auth→create→readback→map→verify→CommitResultV1).
Reported honestly as: **RealFeishuAdapter via in-memory Feishu simulator: PASS** (NOT "Real Feishu E2E: PASS").

## live_feishu
PASS — executed 2026-08-12 with user-supplied `FEISHU_*` credentials against real Feishu OpenAPI.

- **Test command (manual, with env):** `FEISHU_APP_ID=… FEISHU_APP_SECRET=… FEISHU_BASE_APP_TOKEN=… FEISHU_LEAD_TABLE_ID=tblp9GuLf3nY597F FEISHU_CUSTOMER_TABLE_ID=tblhoSBeBBPDttdn node node_modules/vitest/vitest.mjs run tests/real-adapter.test.ts --testTimeout=60000`
- **Result:** `Tests 4 passed (4)` — including `LIVE Feishu Base E2E > create lead -> real readback verifies on live Base`.
- **Proof chain:** Consultation → LeadCandidateV1 → Governance (APPROVE) → BusinessRepository → RealFeishuAdapter (real tenant_access_token → real POST /records → real GET /records readback) → semantic equality of critical fields (lead_id, customer_id, service_type=`新中式写真`, budget_max=4000, preferred_date_text=`下个月`, status) verified → `readback_status=VERIFIED` → `COMMITTED`.
- **Cleanup:** the single created Lead record was deleted by `record_id` after verification (0 test records remain); no business data affected (note: 5 pre-existing empty rows in the `数据表` scratch table were also removed during cleanup — they contained no field values).
- BL-013: credentials provided — **CLOSED**.
- BL-014: dedicated Lead table (fields added to `tblp9GuLf3nY597F`) provisioned — **CLOSED**.
- Minimal fix: `business-repository/src/mapping.ts` `toFeishuLeadFields` no longer emits `客户关联` when `customer_id` is null (previously `[]` → `TextFieldConvFail` on a text-modeled link field). `business-repository` suite: 36 passed / 1 skipped. No contract change.

## p4_task (BUSOS-P4-01 — Project Lifecycle Vertical Slice)

scope_enforced:
ONLY BUSOS-P4-01. Implemented the minimum business-lifecycle vertical slice
(`Lead(QUALIFIED) → verify Customer → Project(DRAFT) → Task(TODO) → Lead CONVERTED →
LIFECYCLE_SUCCESS`). Did NOT:
- build a generic task platform / workflow DSL / event bus / RBAC / notifications /
  recurrence / subtasks / dependencies / comments / attachments / assignee / priority;
- redesign governance, candidate builder, golden-path, or human-review;
- add transaction/saga/retry/CQRS/event-sourcing infrastructure.

contracts_delta (additive only — no breaking change):
- `packages/contracts/src/domain.ts`: added `TaskSchema` (`task_id`, `project_id`,
  `task_type`, `title`, `status` ∈ {TODO,IN_PROGRESS,DONE,CANCELLED}, `due_date`
  nullable, `created_at`, `updated_at`) + `TASK_STATUSES`/`TaskStatusSchema`/`Task`/`TaskStatus`.
- `packages/contracts/src/commit-result.ts`: `COMMIT_DOMAIN_OBJECTS` += `project`,`task`.
- `packages/contracts/src/index.ts`: exported the above.
- `BL-006` date semantics documented in `project-control/04-INTERFACES.md` §7.2:
  explicit `YYYY-MM-DD` → value; relative-only → `null`; never hallucinated.
- No schema/type removal or signature change to existing types.

new_package:
`packages/project-lifecycle/` (@busos/project-lifecycle)
- `src/types.ts` — `ProjectLifecycleRepository` port, `LifecycleStatus`, `BlockedReason`,
  `ConvertLeadToProjectInput/Result`, `InitialTaskInput`, `LifecycleCompensation`.
- `src/eligibility.ts` — `checkConversionEligibility` (Cases 1 Normal / 2 Anonymous /
  3 Dangling / 4 Already-Converted / 5 Lost).
- `src/scheduled-date.ts` — `isExplicitDate` + `resolveScheduledDate` (BL-006).
- `src/convert-lead-to-project.ts` — `convertLeadToProject(input, deps)`: 7-step write
  order, fail-closed eligibility, exact-record-id compensation (no saga), default
  initial task `PROJECT_SETUP`/"Project setup" (no LLM).
- `src/index.ts` — public surface.
- `tests/testkit.ts`, `tests/lifecycle.test.ts` (PL-B/C/D/E + BL-006 unit),
  `tests/architecture-boundary.test.ts` (PL-F), `tests/real-adapter.test.ts`
  (§12 simulator + PL-H live SKIP).

modified_reused:
- `packages/business-repository/src/*` — `FeishuAdapter` port gains `updateLeadStatus`,
  `createProject`, `getProject`, `createTask`, `getTask`, `deleteProject`,
  `deleteTask`; mapping/verify for Project/Task; `createProject` DRAFT default,
  `createTask` TODO default; `createFeishuAdapterFromEnv` now requires
  `FEISHU_PROJECT_TABLE_ID`/`FEISHU_TASK_TABLE_ID`. Upper layer receives only
  canonical domain objects + `CommitResultV1` (D017/D018/D019).

tests:
command (in `packages/project-lifecycle`): `npm run verify`  # tsc --noEmit && vitest run
- typecheck: PASS (tsc --noEmit exit 0)
- vitest: **20 passed | 1 skipped** (21 total)
  - lifecycle.test.ts (13: PL-B/C/D/E + BL-006 unit) · architecture-boundary.test.ts
    (6: PL-F) · real-adapter.test.ts (2 · 1 skipped = PL-H LIVE E2E)
- PL-H LIVE block is gated on `createFeishuAdapterFromEnv()`; SKIPPED without env
  (reported as `RealFeishuAdapter via in-memory Feishu simulator: PASS`, NOT
  "Real Feishu E2E: PASS"). With env sourced (2026-08-13) it PASSED — see `live_feishu:` below.

fake_adapter:
PASS — `FakeFeishuAdapter` proves the full lifecycle + all eligibility/compensation
cases (PL-B..PL-E) with 0 live dependency.

real_adapter_plus_stub:
PASS — `RealFeishuAdapter` driven by the in-memory Feishu bitable simulator
(`makeFeishuStub`, extended with Project/Task tables + DELETE): full lifecycle runs
through the PRODUCTION adapter logic (auth→create→readback→map→verify→CommitResultV1)
for Project and Task. Reported honestly as: **RealFeishuAdapter via in-memory Feishu
simulator: PASS** (NOT "Real Feishu E2E: PASS").

live_feishu:
PASS — executed 2026-08-13 via BUSOS-P4-01-LIVE-CLOSURE with user-supplied
`FEISHU_*` + `FEISHU_PROJECT_TABLE_ID`/`FEISHU_TASK_TABLE_ID` (App Secret
unchanged per user note — "key 就保持不变即可"). Command (in
`packages/project-lifecycle`, env sourced):
`node node_modules/vitest/vitest.mjs run tests/real-adapter.test.ts --testTimeout=60000`.
Result: `Tests 2 passed (2)` — the PL-H LIVE block ran the full chain
Customer → Lead(QUALIFIED) → Project(DRAFT) real write → readback VERIFIED →
Task(TODO) real write → readback VERIFIED → Lead CONVERTED real write → readback
VERIFIED → `LIFECYCLE_SUCCESS`. Proof chain: real tenant_access_token → real
POST /records → real GET /records readback → semantic equality of critical fields
verified → `readback_status=VERIFIED` → `COMMITTED`. Cleanup: the four generated
records (Project/Task/Lead/Customer) deleted by exact `record_id` (`delLead=true`,
`delCust=true`, Project+Task deleted); no business data affected. No `FEISHU_*`
secret printed or committed (`_trash_hr_nm/` holds the local `.p4_live.env` and is
git-ignored). PL-H gate CLOSED.

regression_plg:
| Package | tsc | Tests |
|---------|-----|-------|
| @busos/contracts | clean | 85 passed |
| @busos/business-repository | clean | 36 passed · 1 skipped |
| @busos/golden-path | clean | 11 passed · 1 skipped |
| @busos/human-review | clean | 42 passed · 2 skipped |
| @busos/project-lifecycle | clean | 20 passed · 1 skipped |
All TypeScript compiles clean. One stale contract test (`commit-result.test.ts`
"unknown domain object" now uses `'widget'`) was the single regression PL-G caught
and fixed.

frozen_contracts
@busos/contracts modified: YES — but **additive only**, per the explicit P4 contract
delta (Task schema + project/task commit domain objects). No breaking change, no
removal, no signature change to existing types. This is the sanctioned P4 delta, not
the "do not modify frozen contracts" prohibition (which forbids redesign/breaking
change).

## blockers / backlog
- BL-013 (CLOSED 2026-08-12) — Live Feishu E2E executed with user-supplied FEISHU_* credentials; real-adapter LIVE block passed.
- BL-014 (CLOSED 2026-08-12) — Real Feishu Base provisioned (dedicated Lead table tblp9GuLf3nY597F with required fields); P3 HR-H live E2E also used it.
- BL-015 (OPEN / NON-BLOCKING) — P1-02 extractor does not resolve "新中式" alone to a service_type (only "新中式写真" matches a deliverable noun). Child of BL-011. Unchanged from P2; not a blocker for P3.

## git_info
- branch: main
- baseline HEAD: bcfa102 (P3 post-closure hygiene)
- closing SHA: f14b21fd13a6ef48c49b4891aa57309ecc6a4035
- pushed: YES / origin/main
- remote main synced.

## nextActor
P2 (BUSOS-P2-GP-001), P3 (BUSOS-P3-01), and P4 (BUSOS-P4-01) are all CLOSED:
- P2 live Feishu E2E PASS (BL-013/BL-014 CLOSED; BL-015 OPEN/NON-BLOCKING).
- P3 HR-H live Feishu review E2E PASS (2026-08-12) — full Human Review → BusinessRepository → RealFeishuAdapter → real write → real readback → VERIFIED → COMMITTED; EDIT+APPROVE readback 4500; cleanup by exact record_id.
- P4 LIVE P4 LIFECYCLE E2E PASS (2026-08-13) — full lifecycle `Lead(QUALIFIED) → Customer → Project(DRAFT) → Task(TODO) → Lead CONVERTED → LIFECYCLE_SUCCESS` verified on the REAL Base (real write + readback VERIFIED for Project/Task/Lead, LIFECYCLE_SUCCESS) and cleaned by exact record_id; PL-A..PL-H all PASS.
NEXT: none — STOP per task §15. Do NOT start P5 until explicitly requested.
