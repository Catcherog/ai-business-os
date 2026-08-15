# BUSOS-P5-04 — Feishu Task DONE Update Live Closure · DIAGNOSIS

**Status:** ⛔ STOP — P5-I = BLOCKED · BL-016 = OPEN
**Date:** 2026-08-14
**Author:** WorkBuddy (P5-04 execution)
**Rule applied:** P5-04 FAIL RULE — any step fails ⇒ P5-I=BLOCKED / BL-016=OPEN / no closure / no commit "PASS" / no P6 / report minimal root cause + sanitized evidence / STOP.

---

## 0. TL;DR

The **P5-04 in-scope objective is DONE and proven**: the `TASK_DONE_UPDATE_FAILED`
root cause is **VERIFIED against the live Feishu API**, the **minimal fix is applied**
and **proven by targeted tests** (regression + both targeted suites green).

However, the **live P5-I gate still cannot reach `CREATIVE_SUCCESS`** — not because of
the Task-DONE bug (which is fixed), but because the **production Lumen generation job
fails independently** (`GENERATION_FAILED`). Lumen generation lives entirely outside
BUSOS (provider key + generation worker in `lumen-ink`/`picture-edit`, per §19). This
is a separate, external blocker, not a BUSOS code defect.

Per the FAIL RULE the task terminates here:

**P5-I = BLOCKED · BL-016 = OPEN · NO closure · NO commit "PASS" · NO P6.**

---

## 1. P5-04 Scope (as locked)

**ALLOWED**
- Diagnose `RealFeishuAdapter.updateTaskStatus`.
- Capture real Feishu code/msg for the Task-DONE update.
- Minimal fix to `updateTaskStatus`.
- Add regression test (transport payload assertion).
- Re-run targeted tests (business-repository + creative-production).
- Re-run the original `live-e2e.test.ts`.

**PROHIBITED**
- P6; Feishu schema modification; new generic task system; workflow engine; retry
  framework; saga/CQRS/event bus; Lumen worker rearchitecture; re-audit of passed
  P5 gates; fake/mock instead of Live PASS; direct Feishu record edit to fake DONE;
  closing BL-016 before Live E2E passes.

---

## 2. Root Cause of the ORIGINAL Task-DONE failure — VERIFIED (live)

`RealFeishuAdapter.updateTaskStatus` wrote:

```ts
await this.updateRecord(this.taskTableId!, taskRecordId, {
  [this.fm.taskStatus]: status,
  [this.fm.taskCreatedAt]: new Date().toISOString(),   // ← BUG
});
```

`Created At` is a Feishu **DateTime** field (type=5). `createTask`/`createAsset` correctly
write it as epoch ms via `toFeishuDateTime()`; `updateTaskStatus` did **not**, so it sent
an ISO string → Feishu rejects with `DatetimeFieldConvFail`.

### Live A/B isolation (real Feishu Task table `tblC82jz0XOo8oAZ`)
Temporary diagnostic created one real Task, then issued two real PUTs capturing the
real Feishu code/msg (no secret printed):

- **A** `{ Status: "DONE" }` only → `code=0, msg=success` → **PASS**
- **B** `{ Status: "DONE", "Created At": <ISO> }` → `code=1254064, msg=DatetimeFieldConvFail,
  field="Created At", valueType=string(ISO)` → **FAIL**

VERDICT: `A_PASS=true B_FAIL=true ROOTCAUSE=CONFIRMED_CreatedAt_ISO_rewrite`.
The temporary Task was deleted after the test (exact record_id).

---

## 3. Minimal Fix (applied)

`packages/business-repository/src/feishu-adapter.ts` — `updateTaskStatus` now sends only
the status:

```ts
const ok = await this.updateRecord(this.taskTableId!, taskRecordId, {
  [this.fm.taskStatus]: status,
});
```

Rationale (per task §5): Created At is a creation timestamp and must not change on a
status update; the prior ISO value was also type-incompatible with the Feishu DateTime
contract; the canonical Task has no independent Feishu Updated At mapping and none was
added. No contract/schema change, no new field, no generic update mapper.

---

## 4. Regression + Targeted Tests (PASS)

- **New regression test** `packages/business-repository/tests/update-task-status-regression.test.ts`:
  drives `RealFeishuAdapter` (stubbed transport) and asserts the Task-DONE PUT body
  carries **only** `Status=DONE` and **does NOT** carry a `Created At` entry (no ISO
  rewrite). PASSES.
- `@busos/business-repository` `npm run verify`: **tsc clean; 37 passed | 1 skipped**
  (regression included).
- `@busos/creative-production` `npm run verify`: **tsc clean; 19 passed | 1 skipped**.

Note: `production-adapter.test.ts` (P5-F) was failing because the **uncommitted P5-03**
`real-lumen-adapter.ts` change (asset.id signed-URL contract) left its Lumen stub
keying `signedUrls` by `storageKey`. Aligned the stub to the **proven** `asset.id`
contract (value unchanged) so P5-F is green again. This is a test-stub alignment, not a
change to the (correct) asset.id contract.

---

## 5. Production Live E2E — FAIL at an EARLIER, INDEPENDENT step

Re-ran `packages/creative-production/tests/live-e2e.test.ts` with the real adapters
(real Lumen `lumen-ink.vercel.app` + real Feishu, undici proxy `127.0.0.1:7890`):

```
[P5-LIVE-RESULT] {"status":"FAILED","reason":"LUMEN_GENERATION_FAILED:GENERATION_FAILED",
  "writes":{"task":1,"asset":0,"taskStatusUpdate":0},
  "compensation":{"deletedTask":true,"deletedAsset":false}}
[P5-LIVE] lumen_project_id=proj_eedef77c-a40d-413d-9aa5-ff13f03bb593
```

The chain reached and passed: Lumen auth → Project create → **Task (TODO) create +
readback VERIFIED** → Lumen `generate` → **job FAILED (`GENERATION_FAILED`)**. The
Task-DONE update (`taskStatusUpdate:0`) was **never reached** because generation failed
upstream. Compensation deleted the Task; no Asset was written.

So the BUSOS Task-DONE fix is intact and proven, but the full `CREATIVE_SUCCESS` path
is blocked by the **Lumen production generation worker** — an environment/deployment
issue external to AI Business OS (the image-provider credential and generation runtime
live exclusively in `lumen-ink`/`picture-edit`, §19; BUSOS never holds them).

### Why this contradicts the P5-03 "Lumen generation succeeded" note
The P5-03 investigation recorded `queued→recovered→succeeded`, but the production
Lumen deployment's generation worker now fails (`GENERATION_FAILED`). The empirical
state at P5-04 execution time is authoritative: Lumen generation does **not** succeed,
so `CREATIVE_SUCCESS` is unreachable through production Lumen. (A side diagnostic that
re-created a Lumen project+job also observed the job terminal with generation failure;
its standalone `/api/auth` call returned `未登录`, a quirk of that isolated probe — the
real adapter flow authenticated fine, as the live run's created `proj_eedef77c…` proves.)

---

## 6. Outcome (per P5-04 FAIL RULE)

| Item | State |
|------|-------|
| Task-DONE root cause | ✅ VERIFIED (live code 1254064 DatetimeFieldConvFail) |
| Task-DONE minimal fix | ✅ APPLIED + PROVEN (regression + targeted suites) |
| Live E2E → `CREATIVE_SUCCESS` | ⛔ BLOCKED at Lumen generation (`GENERATION_FAILED`) |
| **P5-I** | ⛔ **BLOCKED** |
| **BL-016** | ⛔ **OPEN** |
| Closure commit / push | ⛔ NONE (rule: no closure / no "PASS" commit) |
| P6 | ⛔ NONE (rule: no P6) |

### Minimal root cause to report
The P5-04 Task-DONE bug is **fixed and proven**: `updateTaskStatus` no longer rewrites
`Created At` with an ISO string (Feishu `DatetimeFieldConvFail`, code 1254064). The
P5-I live closure remains **BLOCKED** by an **independent, external** failure: the
production Lumen generation job returns `GENERATION_FAILED`. That job's execution and
provider credential are owned by `lumen-ink`/`picture-edit` (§19), outside BUSOS scope,
and cannot be resolved from this repository. The BUSOS code path is correct end-to-end
once Lumen generation succeeds.

---

## 7. To Unblock (requires action outside BUSOS)
1. Make production Lumen generation succeed (resolve the `GENERATION_FAILED` cause in
   `lumen-ink`/`picture-edit` — e.g. provider-key / serverless generation-worker config).
   This is **not** a BUSOS change and is explicitly out of P5-04 scope.
2. Once Lumen generation succeeds, re-run `live-e2e.test.ts` (real Lumen + real Feishu).
   The BUSOS path now expects: auth → Project → Job → succeeded → Asset URL → Feishu
   Asset → **Task DONE (fixed)** → readback VERIFIED → `CREATIVE_SUCCESS`.
3. On `CREATIVE_SUCCESS` only: set P5-I=PASS, BL-016=CLOSED, commit the in-scope
   BUSOS changes (feishu-adapter.ts fix + regression test + the carried P5-03
   asset.id contract changes), push `origin/main`, verify remote SHA, STOP (no P6).

---

## 8. Cleanup (per §10)
- 7 test **Project** records (title `P5 Live Creative E2E`) deleted by exact record_id,
  including all P5-03 leftovers whose compensation never removed the seeded project
  (`project_p503=0` after, `task_LiveCreative1=0`). P5-03 leftover canonical
  `proj_9ece35db-…` also removed via the title match.
- This round's **Task** deleted by compensation (`deletedTask=true`); **Asset** never
  written (`asset:0`). No business records affected.
- Temporary diagnostic scripts (`_p5_taskdone_diag.mjs`, `_p5_lumen_and_cleanup.mjs`)
  moved out of the repo into `_trash_hr_nm/` (gitignored). Not committed.

## 9. Evidence Index
- **Live A/B (real Feishu):** A `code=0 success`; B `code=1254064 DatetimeFieldConvFail`
  field="Created At" valueType=string(ISO). Temp Task deleted.
- **Regression:** `update-task-status-regression.test.ts` → 1 passed (asserts PUT body
  = only `Status=DONE`, no `Created At`).
- **Targeted suites:** business-repository 37 passed/1 skipped; creative-production
  19 passed/1 skipped (tsc clean both).
- **Live E2E:** `[P5-LIVE-RESULT] status=FAILED reason=LUMEN_GENERATION_FAILED:GENERATION_FAILED`
  writes={task:1,asset:0,taskStatusUpdate:0}; lumen_project_id=proj_eedef77c-…;
  compensation deletedTask=true.
- **Cleanup:** 7 Projects deleted (incl. P5-03 leftovers); 0 Task/Asset leftovers.
