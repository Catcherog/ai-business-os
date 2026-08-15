# BUSOS-P5-03 — Lumen Asset URL Contract Alignment · DIAGNOSIS

**Status:** ⛔ STOP — P5-I = BLOCKED · BL-016 = OPEN
**Date:** 2026-08-14
**Author:** WorkBuddy (P5-03 execution)
**Rule applied:** P5-03 FAIL RULE — any step fails ⇒ P5-I=BLOCKED / BL-016=OPEN / no closure / output minimal root cause / STOP

---

## 0. TL;DR

The **P5-03 in-scope objective is DONE and proven**: the `ASSET_URL_MISSING` contract
defect (root-caused at the end of P5-02) is fixed on both sides (Lumen contract +
BUSOS adapter), deployed to Production, and covered by passing contract tests
(Test A + Test B). Live E2E now gets **past** asset-URL resolution and **writes the
Feishu Asset** (`recvsfgPyp9vwx`).

However, Live E2E **still cannot reach `CREATIVE_SUCCESS`** because of a **separate,
out-of-scope blocker** at the *final* step:

> `TASK_DONE_UPDATE_FAILED` — Feishu `updateRecord` for the **Task** status→DONE
> fails at the **write** step (`write_status:FAILED`, `errors:["feishu update task status failed"]`).

Fixing that requires a Feishu Task-table / adapter change, which P5-03 **explicitly
prohibits** (no Feishu schema modification; adapter touch authorized ONLY for the
asset-URL contract). Per the FAIL RULE, the task terminates here:

**P5-I = BLOCKED · BL-016 = OPEN · NO closure · NO commit · NO push · NO P6.**

---

## 1. P5-03 Scope (as locked)

**ALLOWED**
- Modify Lumen `GET /api/projects/:id` asset-URL return contract.
- Keep `asset.storageKey` redacted.
- Use `asset.id` as the signed-URL public association key.
- Modify BUSOS `real-lumen-adapter.ts` to align with the new contract.
- Add/modify tests directly related to this defect.
- Deploy Lumen Production.
- Re-run the original BUSOS `live-e2e.test.ts`.
- PASS ⇒ execute P5 closure.

**PROHIBITED**
- P6; Lumen worker rearchitecture; `createJob` inline execution;
  **Feishu schema modification**; new business capability; unrelated refactor;
  storageKey suffix/basename guessing; fake/mock instead of Live PASS;
  closing BL-016 before Live E2E passes.

---

## 2. Implementation Contract (how it was honored)

1. External API must not require knowing the real `storageKey`.
2. `storageKey` stays redacted in the payload.
3. Signed URL associates via a stable public ID — `signedUrls: { "<asset.id>": "<signed-url>" }`.
4. BUSOS adapter MUST use `signedUrls[asset.id]` — never redacted storageKey / basename / suffix / replacement / path traversal.
5. Audited other Lumen `signedUrls` consumers; the only in-repo consumer (`AppV2.tsx`) was realigned with a documented backwards-compatible COMPAT note. No silent breaking change.

### Files changed (in-scope)
| File | Change |
|------|--------|
| `picture-edit/src/server/services/ProjectService.ts` | `signedUrls` keyed by `asset.id`; interface doc + `getProjectSnapshot` + `createProject` updated; `storageKey` stays redacted. |
| `picture-edit/src/server/routes/projects.ts` | COMPAT doc block: `signedUrls` keyed by `asset.id`; pre-P5-03 map (storageKey-keyed) was unresolvable because storageKey is redacted ⇒ not a breaking change. |
| `picture-edit/src/client/src/AppV2.tsx` | Reads `signedUrls[asset.id]` (rule 5 in-repo consumer). |
| `AI Business OS/packages/lumen-adapter/src/real-lumen-adapter.ts` | `generate()` resolves `resultSnapshot.signedUrls[asset.id]` (forbidding redacted-key/basename/suffix/replacement). |
| Test fixtures aligned (`ProjectService.test.ts`, `AppV2.persist.test.tsx`, `useProject.test.tsx`, `VersionStrip.test.tsx`, BUSOS `lumen-adapter.test.ts`). |

---

## 3. Test Gates — RESULTS

### Test A — Lumen contract test (PASS)
`picture-edit/src/server/routes/signed-urls.contract.test.ts` (supertest harness):
- ✅ each `asset.storageKey` matches `/^redacted:\/\//` (redacted, real key never exposed);
- ✅ `signedUrls[asset.storageKey]` is `undefined`;
- ✅ `signedUrls[asset.id]` is a non-empty, parseable URL (`new URL()` does not throw);
- ✅ no `signedUrls` key matches `/^projects\//`.
- Lumen server `tsc --noEmit` → exit 0.

### Test B — BUSOS adapter contract test (PASS)
`AI Business OS/packages/lumen-adapter/tests/signed-url-contract.test.ts` (2 tests)
+ existing `lumen-adapter.test.ts` (7 tests) = **9 PASS**:
- ✅ B1: stub keyed by `asset.id` ⇒ `generate()` ⇒ `GENERATED` with `asset_uri` = stub URL;
- ✅ B2: stub keyed by `storageKey` ⇒ `FAILED` / `ASSET_URL_MISSING` (proves **no guessing fallback**).

### Production post-deploy check (PASS)
`post_deploy_check.js` against `https://lumen-ink.vercel.app`:
- ✅ auth 200; snapshot `signedUrls` keyed by `asset.id`; `storageKey` redacted; recover 200.
- printed **`CONTRACT_OK`**.

### Test C — Production Live E2E (FAIL at final step)
Real Lumen + worker recover + real Feishu, original `live-e2e.test.ts` harness:

```
[P5-LIVE] lumen_project_id=proj_9ece35db-50a2-4788-b10d-c4843cc10766
[P5-LIVE] asset_record_id=recvsfgPyp9vwx          ← Feishu Asset WRITTEN (ASSET_URL_MISSING eliminated)
[P5-LIVE-RESULT] {"status":"FAILED","reason":"TASK_DONE_UPDATE_FAILED",
  "writes":{"task":1,"asset":1,"taskStatusUpdate":1},
  "compensation":{"deletedTask":true,"deletedAsset":true}}
```

The run reached and passed: Lumen auth → Project create → Job create →
queued→recovered→succeeded → **Asset URL resolution PASS** → **Feishu Asset create PASS**,
then failed at the **final** `updateTaskStatus(DONE)` step.

---

## 4. Root Cause of the remaining failure (separate, out-of-scope)

A standalone diagnostic driving `BusinessRepository.updateTaskStatus(DONE)` against real
Feishu reproduced the exact failure:

```
CREATE commit= {write_status:SUCCESS, readback_status:VERIFIED, errors:[]}   ← create works
UPDATE commit= {domain_object:task, write_status:FAILED,
                readback_status:NOT_RUN, errors:["feishu update task status failed"]}
UPDATE task.status= DONE
CLEANUP deleted= true
```

**Interpretation:** the Feishu `updateRecord` call that transitions the **Task** record
to `DONE` fails at the **WRITE** step (`write_status:FAILED`, `readback_status:NOT_RUN`,
single error `"feishu update task status failed"`). This is a Feishu Task-table /
adapter write-path issue — **independent of, and not caused by, the P5-03 asset-URL
contract fix** (which is complete and proven).

`creative-production/src/execute.ts` returns `TASK_DONE_UPDATE_FAILED` (commit not success
or status≠DONE) at the write-failure path. Because the write fails, the readback branch is
never reached, hence `readback_status:NOT_RUN`.

P5-03 prohibits touching the Feishu schema/adapter for anything other than the asset-URL
contract. Therefore the fix for this separate blocker is **out of scope** and requires new
user authorization.

---

## 5. Outcome (per P5-03 FAIL RULE)

| Item | State |
|------|-------|
| P5-03 asset-URL contract fix | ✅ DONE & PROVEN (Test A + Test B + Production `CONTRACT_OK`) |
| `ASSET_URL_MISSING` defect | ✅ ELIMINATED (Feishu Asset `recvsfgPyp9vwx` written live) |
| Live E2E → `CREATIVE_SUCCESS` | ⛔ BLOCKED at final `TASK_DONE_UPDATE_FAILED` |
| **P5-I** | ⛔ **BLOCKED** |
| **BL-016** | ⛔ **OPEN** |
| Closure commit / push | ⛔ NONE (rule: no closure) |
| P6 | ⛔ NONE (rule: no P6) |

In-scope P5-03 code (`real-lumen-adapter.ts`, new/updated tests) is left **uncommitted**,
consistent with the prior P5 pattern, until the separate Feishu blocker is resolved and a
full Live E2E `CREATIVE_SUCCESS` is achieved.

### Minimal root cause to report
The P5-03 asset-URL contract fix is DONE and empirically proven (ASSET_URL_MISSING
eliminated; Feishu Asset written; Test A+B pass; Production deployed with CONTRACT_OK).
Live E2E still cannot reach CREATIVE_SUCCESS because of a **separate, out-of-scope
blocker**: `TASK_DONE_UPDATE_FAILED` — Feishu `updateRecord` for the Task status→DONE
fails at the write step (`write_status:FAILED`, `errors:["feishu update task status failed"]`).
Fixing it requires a Feishu Task-table/adapter change that P5-03 explicitly prohibits, so
it needs new user authorization.

---

## 6. To Unblock (requires new authorization — outside P5-03)

1. **Authorize a Feishu Task-table / adapter fix** so `updateTaskStatus(DONE)` writes
   successfully. Candidate root cause: a field-type / permission mismatch on the Feishu
   **Task** table's status field (the CREATE path works, only the UPDATE-write path fails).
2. Once the Feishu Task-DONE write is fixed, re-run `live-e2e.test.ts`:
   auth → Project → Job → recover → succeeded → Asset URL → Feishu Asset →
   **Task DONE** → readback → contract validation → `CREATIVE_SUCCESS`.
3. On `CREATIVE_SUCCESS` only: set P5-I=PASS, BL-016=CLOSED, commit in-scope P5-03
   changes, push `origin/main`, verify remote SHA, STOP (no P6).

---

## 7. Evidence Index

- **Live E2E:** `[P5-LIVE-RESULT] status=FAILED reason=TASK_DONE_UPDATE_FAILED`, `asset_record_id=recvsfgPyp9vwx`, `lumen_project_id=proj_9ece35db-50a2-4788-b10d-c4843cc10766`.
- **Temp diag (`BusinessRepository.updateTaskStatus(DONE)`):** CREATE `write_status:SUCCESS readback_status:VERIFIED`; UPDATE `write_status:FAILED readback_status:NOT_RUN errors:["feishu update task status failed"]`; CLEANUP `deleted=true`.
- **Production post-deploy check:** `CONTRACT_OK` (auth 200, `signedUrls` keyed by `asset.id`, `storageKey` redacted, recover 200).
- **Test A:** `signed-urls.contract.test.ts` → 1 passed.
- **Test B:** `signed-url-contract.test.ts` (2) + `lumen-adapter.test.ts` (7) → 9 passed.
- **Lumen server:** `tsc --noEmit` → exit 0.
