# BUSOS-P4-01 — Project Lifecycle Vertical Slice · Completion Evidence

**Date:** 2026-08-13
**Baseline:** `bcfa102` (P3 post-closure hygiene)
**Final status:** `COMPLETE / LIVE P4 LIFECYCLE E2E PASS`
*(P4-01 first landed as IMPLEMENTATION PASS — PL-A..PL-G PASS, PL-H live E2E
BLOCKED (env absent). On 2026-08-13 the user supplied `FEISHU_*` +
`FEISHU_PROJECT_TABLE_ID` / `FEISHU_TASK_TABLE_ID` (credentials in
`C:\Users\Catcher\Desktop\feishu.env.txt`; App Secret kept unchanged per user
note) and the BUSOS-P4-01-LIVE-CLOSURE run executed PL-H end-to-end on the real
Base: Lead(QUALIFIED) → verify Customer → create Project(DRAFT) → real write →
readback VERIFIED → create Task(TODO) → real write → readback VERIFIED → update
Lead CONVERTED → readback VERIFIED → LIFECYCLE_SUCCESS, then cleaned up all four
generated records by exact `record_id`. PL-H now PASS; PL-A..PL-H all PASS. Per
the STOP rule the task ends at commit + push + clean tree — no automatic P5.)*

---

## 1. Objective met (R1 P4 alignment)

Implemented the minimum business-lifecycle vertical slice required by R1 — the
*state transition from opportunity to delivery execution* — and explicitly
**not** a project-management platform:

```
Existing Lead (QUALIFIED)
→ verify Customer (D009 Lead != Customer; D010 anonymous allowed)
→ create Project (status DRAFT, not IN_PROGRESS)  (D011 only after conversion)
→ create Initial Task (default PROJECT_SETUP / "Project setup")
→ readback Project  (D019 write != success until readback VERIFIED)
→ readback Task
→ mark Lead CONVERTED
→ readback Lead
→ LIFECYCLE_SUCCESS
```

This task productised **Project Lifecycle only**. No generic task platform, no
workflow DSL, no event bus, no RBAC, no notifications, no recurrence, no
dependencies/subtasks/comments/attachments/assignee/priority were built. Frozen
decisions D001–D020 preserved; the additive contract delta added exactly one new
canonical object (`Task`) and one documented date semantics (`BL-006`).

---

## 2. Files changed

### New package `@busos/project-lifecycle` (`packages/project-lifecycle/`)
- `package.json`, `tsconfig.json`, `vitest.config.ts` (paths alias to contracts
  + business-repository; mirrors other packages).
- `src/types.ts` — `ProjectLifecycleRepository` port (getLead, getCustomer,
  updateLeadStatus, createProject, getProject, createTask, getTask, deleteProject,
  deleteTask), `LifecycleStatus` (`LIFECYCLE_SUCCESS`|`BLOCKED`|`FAILED`),
  `BlockedReason` (`LEAD_NOT_FOUND`|`CUSTOMER_REQUIRED`|`DANGLING_CUSTOMER`|
  `ALREADY_CONVERTED`|`LEAD_LOST`|`SCHEDULED_DATE_NOT_EXPLICIT`),
  `ConvertLeadToProjectInput/Result`, `InitialTaskInput`, `LifecycleCompensation`.
- `src/eligibility.ts` — `checkConversionEligibility(lead, customer)`:
  CONVERTED/LOST checked first → then anonymous → then dangling customer.
  Returns `ALLOWED`|`ANONYMOUS`|`DANGLING_CUSTOMER`|`ALREADY_CONVERTED`|`LEAD_LOST`.
- `src/scheduled-date.ts` — `isExplicitDate` (regex `^\d{4}-\d{2}-\d{2}$` **plus**
  real calendar-date validation) + `resolveScheduledDate` (BL-006): explicit
  `YYYY-MM-DD` → value; `null`/`''` → `null`; relative/hallucinated → `ok:false`.
- `src/convert-lead-to-project.ts` — `convertLeadToProject(input, deps)`
  implementing the 7-step write order with fail-closed eligibility, BL-006
  resolution, and exact-record-id compensation (no transaction/saga/retry).
  `DEFAULT_INITIAL_TASK = PROJECT_SETUP / "Project setup"` (no LLM).
- `src/index.ts` — public surface.
- `tests/testkit.ts` — `CountingBusinessRepository`, `fakeDeps()`, re-declared
  `makeFeishuStub` (extended with Project/Task tables + DELETE), `makeRealAdapter`,
  re-export of `createFeishuAdapterFromEnv`.
- `tests/lifecycle.test.ts` — PL-B (happy, default task, BL-006 null), PL-C
  (anonymous), PL-D (dangling/already-converted/LOST), PL-E (all three partial
  failures with compensation assertions), BL-006 unit.
- `tests/architecture-boundary.test.ts` — PL-F static scan (6 assertions).
- `tests/real-adapter.test.ts` — §12 RealFeishuAdapter-via-simulator (full
  lifecycle through the production adapter; reported honestly as NOT live) +
  PL-H LIVE block (gated on `createFeishuAdapterFromEnv()`, SKIPPED here).

### Modified — contracts (`packages/contracts/`)  *(additive contract delta only)*
- `src/domain.ts` — added `TASK_STATUSES`, `TaskStatusSchema`, `TaskSchema`
  (strict; comment lists the forbidden add-ons), and `Task` type after
  `ProjectSchema`.
- `src/index.ts` — exported `TASK_STATUSES`, `TaskSchema`, `TaskStatusSchema`,
  `Task`, `TaskStatus`.
- `src/commit-result.ts` — added `'project'`, `'task'` to `COMMIT_DOMAIN_OBJECTS`
  (additive; required so `buildCommit` can emit Project/Task commits).
- `tests/fixtures.ts` — `canonicalTask` fixture.
- `tests/domain.test.ts` — Task parse test + "P4 additive contract — no breaking
  change" block.
- `tests/commit-result.test.ts` — fixed a stale assertion that used `'project'`
  as the example *unknown* domain object (now invalid after the additive delta);
  changed to a genuinely unknown value (`'widget'`). **This was the one real
  regression PL-G caught.**

### Modified — business-repository (`packages/business-repository/`)
- `src/types.ts` — `FeishuAdapter` port gains `updateLeadStatus`,
  `createProject`, `getProject`, `createTask`, `getTask`, `deleteProject`,
  `deleteTask`; added `ProjectCreateInput`/`TaskCreateInput` DTOs.
- `src/mapping.ts` — `FeishuFieldMap` extended with Project/Task field keys +
  defaults; `toFeishuProjectFields`/`fromFeishuProjectRecord`/
  `toFeishuTaskFields`/`fromFeishuTaskRecord`.
- `src/verify.ts` — `PROJECT_CRITICAL_FIELDS`/`TASK_CRITICAL_FIELDS` +
  `verifyProjectCriticalFields`/`verifyTaskCriticalFields`.
- `src/feishu-adapter.ts` — `projectTableId`/`taskTableId` optional (required via
  `createFeishuAdapterFromEnv`); implemented the 7 new methods; readback-verify
  on `updateLeadStatus`; `buildCommit` accepts `'project'|'task'`.
- `src/feishu-adapter-fake.ts` — `projects`/`tasks` stores + exact-record-id
  delete; `corruptReadbackProject`/`corruptReadbackTask`/`failLeadStatusUpdate`
  fault injectors; upper layer never sees table IDs/field names/raw records.
- `src/business-repository.ts` — `createProject` (DRAFT default), `createTask`
  (TODO default), `updateLeadStatus`, `getProject`, `getTask`, `deleteProject`,
  `deleteTask`, all with `assertWith` fail-closed validation.
- `src/index.ts` — exported new mapping + verify symbols/types.

### Control files
- `project-control/04-INTERFACES.md` — §7 Addendum (P4) already appended during
  PL-A (Task canonical JSON, BL-006 semantics, new repository interface, new
  FeishuAdapter responsibilities, new env vars).
- `project-control/02-CURRENT-STATE.md` — flipped to P4 ACTIVE → COMPLETE.
- `project-control/05-TEST-GATES.md` — appended **P4-01 Gate (PL-A..PL-H)**.
- `10-P4-01-COMPLETION.md` — this document.

---

## 3. Conversion chain & write order (the 7 steps)

```
1. getLead(leadId)                          → lead (or LEAD_NOT_FOUND)
2. getCustomer(lead.customer_id)            → customer (null for anonymous)
3. checkConversionEligibility(lead, customer)
     CASE 1 Normal   → ALLOWED
     CASE 2 Anonymous→ BLOCKED / CUSTOMER_REQUIRED   (0 writes, no auto-Customer)
     CASE 3 Dangling → fail closed (0 writes)
     CASE 4 Converted→ ALREADY_CONVERTED → BLOCKED    (0 new writes, no dedup engine)
     CASE 5 Lost     → LEAD_LOST → BLOCKED
4. createProject(input)  status=DRAFT  → readback VERIFIED   (else compensate)
5. createTask(input)    status=TODO   → readback VERIFIED   (else compensate project)
6. updateLeadStatus(CONVERTED)        → readback VERIFIED   (else compensate task+project)
7. LIFECYCLE_SUCCESS
```

**Partial-failure compensation (exact record id, no saga/retry):**
- Project created, Task write/readback fails → `deleteProject(exactRecordId)`.
- Project + Task created, Lead `CONVERTED` update/readback fails →
  `deleteTask(exactRecordId)` + `deleteProject(exactRecordId)`.
- Result `FAILED`; Lead is **not** reported CONVERTED.
- The upper layer (`project-lifecycle`) never receives Feishu record ids, table
  ids, field names, tokens, or `/open-apis/` paths — only canonical domain
  objects + `CommitResultV1` (D017/D018/D019).

---

## 4. Test gates — PL-A .. PL-H

| Gate | Result | Evidence |
|------|--------|----------|
| **PL-A** Contract delta | **PASS** | `TaskSchema` added; canonical `canonicalTask` fixture validates; "additive contract — no breaking change" block asserts `scheduled_date` stays nullable string and `Task` keeps exact shape; `COMMIT_DOMAIN_OBJECTS` gains `project`/`task`. No breaking change. |
| **PL-B** Happy lifecycle | **PASS** | `convertLeadToProject` full chain: `LIFECYCLE_SUCCESS`; Project `status=DRAFT`, `customer_id`/`lead_id` linked; Task `task_type=PROJECT_SETUP`, `title="Project setup"`, `status=TODO` (default when none supplied, no LLM); all three commits `readback_status=VERIFIED`; `counts.writes = {project:1, task:1, leadStatus:1}`. BL-006 `preferred_date_text="下个月"` → `scheduled_date=null`. |
| **PL-C** Anonymous lead | **PASS** | Anonymous (`customer_id=null`) lead → `BLOCKED`, `reason=CUSTOMER_REQUIRED`; `CountingBusinessRepository` project/task/leadStatus writes = 0; no auto-Customer created. |
| **PL-D** Dangling / already-converted / LOST | **PASS** | Dangling customer (customer_id present but `getCustomer`→null) → `DANGLING_CUSTOMER`, fail closed, 0 writes. `ALREADY_CONVERTED` lead → `BLOCKED`, 0 new writes, no dedup engine. `LOST` lead → `LEAD_LOST`, 0 writes. |
| **PL-E** Partial-failure compensation | **PASS** | (a) Project readback corrupted → `deleteProject` called, Task create never attempted, `result=FAILED`. (b) Project+Task created, Task readback corrupted → `deleteProject` called, `result=FAILED`. (c) Project+Task created, `updateLeadStatus` injected failure → `deleteTask`+`deleteProject` called by exact record id; `result=FAILED`; Lead not reported CONVERTED. All compensation assertions on exact record id. |
| **PL-F** Architecture boundary | **PASS** | 6 static assertions: `src/**` contains **none** of the forbidden Feishu tokens (`open-apis`, `tenant_access_token`, `FEISHU_`, `RealFeishuAdapter`, `FeishuRecord`, raw record structures, mapping fns, concrete Base field names). Also asserts no direct Feishu import in `src/`. |
| **PL-G** Regression | **PASS** | All 5 affected packages green + `tsc --noEmit` clean (see §5). One stale contract test caught and fixed. |
| **PL-H** Live Feishu vertical slice | **PASS** | Real LIVE E2E executed 2026-08-13 against the real Base with user-supplied `FEISHU_*` + `FEISHU_PROJECT_TABLE_ID`/`FEISHU_TASK_TABLE_ID`. Full chain ran for real: create Customer → create Lead(QUALIFIED) → linkLeadCustomer → `convertLeadToProject` → createProject(DRAFT) real write + readback VERIFIED → createTask(TODO) real write + readback VERIFIED → updateLeadStatus(CONVERTED) real write + readback VERIFIED → `LIFECYCLE_SUCCESS`. All three commits `readback_status=VERIFIED`. Cleanup deleted the four generated records by exact `record_id` (`delLead=true`, `delCust=true`, Project+Task deleted). No `FEISHU_*` secret printed. PL-H gate CLOSED. (The in-memory-simulator §12 test remains PASS and is reported separately as NOT live.) |

---

## 5. Regression run (PL-G) — exact output

| Package | tsc | Tests |
|---------|-----|-------|
| `@busos/contracts` | clean | 85 passed |
| `@busos/business-repository` | clean | 36 passed · 1 skipped (live `feishu-real`) |
| `@busos/golden-path` | clean | 11 passed · 1 skipped (live) |
| `@busos/human-review` | clean | 42 passed · 2 skipped (live HR-H) |
| `@busos/project-lifecycle` | clean | 20 passed · 1 skipped (live PL-H) |

All TypeScript compiles clean. P2/P3 golden-path and human-review suites remain
green. The newly-fixed `commit-result.test.ts` ("unknown domain object" now uses
`'widget'`) is included in contracts' 85 passing tests.

`project-lifecycle` breakdown: `lifecycle.test.ts` 13 (PL-B/C/D/E + BL-006 unit),
`architecture-boundary.test.ts` 6 (PL-F), `real-adapter.test.ts` 2 · 1 skipped
(§12 simulator PASS + PL-H live SKIP).

---

## 6. Fake vs Live — clearly distinguished

- **Fake:** `FakeFeishuAdapter` (in-memory) for all PL-B..PL-E unit gates and the
  architecture-boundary scan. No network, no secret.
- **Simulator:** `RealFeishuAdapter` driven by the in-memory Feishu bitable
  simulator (`makeFeishuStub`) — exercises the **production** adapter logic
  (auth→create→readback→map→verify→CommitResultV1) for Project/Task. Reported
  honestly as "NOT live".
- **Live:** `RealFeishuAdapter` built from `createFeishuAdapterFromEnv()`; only
  runs when `FEISHU_*` + `FEISHU_PROJECT_TABLE_ID`/`FEISHU_TASK_TABLE_ID` are
  present. Credentials are **never** printed; only non-sensitive status is logged.

---

## 7. Blockers

- **PL-H LIVE P4 LIFECYCLE E2E — PASS (2026-08-13).** Executed via
  BUSOS-P4-01-LIVE-CLOSURE with user-supplied `FEISHU_*` +
  `FEISHU_PROJECT_TABLE_ID` / `FEISHU_TASK_TABLE_ID` (App Secret unchanged per
  user note — "key 就保持不变即可"). The full real chain passed with all three
  commits `readback_status=VERIFIED`; all four generated records cleaned by exact
  `record_id`. PL-H gate CLOSED; P4-01 is now fully COMPLETE (live).
- Prerequisites **BL-013 / BL-014 remain CLOSED** (from P2/P3); **BL-015 remains
  OPEN / NON-BLOCKING** (unchanged). No new code-level blockers.
- **BUSOS-P4-01 — COMPLETE / LIVE P4 LIFECYCLE E2E PASS** (PL-A..PL-H all PASS).
  Per the STOP rule the task ends at commit + push + clean tree; no automatic P5.

---

## 8. Deferred findings / backlog

- **No new non-blocking findings.** Out-of-scope items from task §13 (generic task
  platform, workflow DSL, event bus, RBAC, notifications, recurrence,
  subtasks/dependencies/comments/attachments, analytics dashboard, Lumen,
  Postgres migration, event-sourcing/CQRS, multi-tenant, retry engine, etc.) were
  **not** implemented, per the task's explicit scope boundary.
- One minor test-hygiene note (not a defect): the LIVE PL-H test creates a
  test-dedicated Customer + Lead and cleans up only Project/Task (deleteLead/
  deleteCustomer are out of P4 scope). The user runs the live test in a dedicated
  test Base and removes those manually.

---

## 10. Live-closure regression fixes (BUSOS-P4-01-LIVE-CLOSURE, 2026-08-13)

The live E2E exposed real Base behaviors the original (fake/simulator-only)
implementation did not anticipate. Per task §F only these regressions were
fixed; no broad re-audit was performed.

- **List `?filter=` → `POST /records/search`.** The live Base's list endpoint
  returns `1254018 InvalidFilter` for the `?filter=` query param; the
  `/records/search` body-filter endpoint works. `findRecordsByField` and
  `findCustomerByExactIdentity` now POST to `/records/search`. Mirrored into BOTH
  test stubs (`packages/project-lifecycle/tests/testkit.ts` and
  `packages/business-repository/tests/feishu-real.test.ts`) so PL-A..PL-G stay
  green.
- **`/records/search` value wrapper.** Search returns text (and other) field
  values as `[{ text, type }]` arrays, unlike the GET/readback path. Added
  `unwrapFeishuValue` / `unwrapFeishuFields` (applied to `/search` results) so
  canonical mapping still receives plain values.
- **Datetime field write format.** Projects/Tasks `Created At` is DateTime
  (type=5). Writing an ISO string fails with `1254064 DatetimeFieldConvFail`;
  the Base expects **epoch-millisecond numbers**. `toFeishuProjectFields` /
  `toFeishuTaskFields` now emit `created_at` as ms (`toFeishuDateTime`); readback
  converts ms → ISO (`feishuDateTimeToIso`). Single-select fields (`Project
  Type` / `Status` / `Task Type` / `Status`, type=3) are written as **plain
  strings** (object/array forms are rejected); readback returns them as plain
  strings, so no extra handling is needed.
- **Lead↔Customer link field.** The live Base models `客户关联` as a text
  field; writing a link object `[{ record_ids: [...] }]` fails with
  `TextFieldConvFail`. `linkLeadCustomer` (and `linkValue` / `asLinkIdOrNull`)
  now write/read the canonical customer id as a plain string. The
  `business-repository` unit test asserting the array form was updated to expect
  the string (the real, correct format).
- **LIVE cleanup completeness.** The PL-H LIVE block now also deletes the
  test-dedicated Lead and Customer by exact `record_id` (previously only
  Project/Task were compensated); all four generated records are removed.

No contract schema changed. All changes are confined to the adapter/mapping and
their tests.

## 9. Commit / push / tree

- Live-closure implementation commit SHA: **a07f58b414503b9a3bde08128a2e09f6b4496fe5**
- Control-doc evidence commit SHA: **a07f58b414503b9a3bde08128a2e09f6b4496fe5**
- Push status: **PUSHED** to `origin/main`.
- Working tree: **clean** after final commit (`git status --short` → empty).
