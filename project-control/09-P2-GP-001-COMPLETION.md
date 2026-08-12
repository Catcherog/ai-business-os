# BUSOS-P2-GP-001 — Golden Path Vertical Slice — Completion Report

> Status: **COMPLETE — implementation PASS + LIVE FEISHU E2E PASS**
> BUSOS-P2-GP-001-LIVE-CLOSURE executed 2026-08-12: the live Feishu Golden Path gate (BL-013 / BL-014) is now closed. No P3 / no scope expansion.

## 1. Objective

First vertical integration of the completed P1 foundation into one business chain:

```
User Consultation → LeadCandidateV1 → Governance → Customer Identity Resolution →
Lead/Customer Domain Object → BusinessRepository → FeishuAdapter → write → readback → VERIFIED/FAILED
```

## 2. Scope Honored

- **No P1 re-audit.** `contracts`, `business-repository`, `service-agent-candidate`, mapping and readback are CLOSED. Only deterministic blocking defects were fixed via `input → reproduce → actual → expected`.
- **Frozen `@busos/contracts`.** Schema/types were NOT modified. No contract contradiction was encountered.
- **Stop after P2.** No P3, UI, agents, analytics, or scope expansion.

## 3. Deliverable — package `@busos/golden-path`

Thin DI orchestration wiring P1-02 candidate → governance → BusinessRepository → FeishuAdapter → readback, fail-closed.

| File | Responsibility |
|------|----------------|
| `src/types.ts` | `GoldenPathRepository` port (duck-typed 6 methods), `GoldenPathInput`, `GoldenPathDeps`, `GoldenPathResult`, `CandidateBuilder`, `GovernanceFn`. Imports repository DTOs (`LeadCreateInput`/`CustomerCreateInput`/`CustomerIdentityQuery`) from `@busos/business-repository`, **not** from frozen contracts. |
| `src/candidate.ts` | `buildCandidateFromInput` — builds `ConsultationContextV1` from `input.text` and delegates to the **frozen** `buildLeadCandidate`. No second extractor. |
| `src/governance.ts` | `govern()` — REJECT when `service_type` is missing (resolves BL-005 with a "reject" rule); else APPROVE. Exact identity → `UNRESOLVED`; no identity → `NOT_REQUIRED`. Validated via `assertGovernanceResultV1`. |
| `src/execute-golden-path.ts` | `executeGoldenPath(input, deps)` — fail-closed chain: candidate → governance → `findCustomerByIdentity` → `createCustomer` if missing (guarded by `isBusinessCommitSuccess`) → `createLead` (`customer_id = null` when anonymous) → `linkLeadCustomer` if customer → `SUCCESS`. |
| `src/index.ts` | Public exports. |

**Architecture boundary (enforced):** the application layer contains **no** Feishu table ids, field names, `record_id`, tenant token, app token, OpenAPI URL, or SDK types. All Feishu knowledge stays inside `BusinessRepository` / `FeishuAdapter`.

## 4. Three Required Flows — Verified

- **Flow A — Anonymous Lead** (`customer_id = null`): candidate → governance APPROVE → `createLead(customer_id=null)` → readback VERIFIED → `SUCCESS`.
- **Flow B — Identified Customer** (exact phone/wechat only, **no fuzzy merge**): `findCustomerByIdentity` → create-if-missing → `linkLeadCustomer` → `SUCCESS`.
- **Flow C — Governance Block**: candidate missing `service_type` → REJECT → **repository writes = 0** (no `createCustomer`/`createLead` called).

Plus defensive tests:
- **Readback-failure fail-closed**: write SUCCESS + readback FAILED = business **FAILURE** (never SUCCESS).
- **Identity boundary**: exact-only match; no merge of distinct customers.
- **RealFeishuAdapter** exercised via an in-memory Feishu stub (`makeFeishuStub`) — no `FakeFeishuAdapter` extension (per §10), via a `CountingBusinessRepository` wrapper that counts writes.

## 5. Tests

- **11 passing** integration tests across 6 files: `anonymous`, `identified`, `governance-block`, `readback-failure`, `identity-boundary`, `real-adapter` (3 simulator + 1 LIVE).
- **LIVE Feishu E2E test — NOW PASSING** (`real-adapter.test.ts` live path) executed 2026-08-12 against real Feishu OpenAPI.
- `tsc --noEmit` clean for `@busos/golden-path`.
- Write counting via `CountingBusinessRepository` wrapper (does **not** extend `FakeFeishuAdapter`, per §10).
- `business-repository` suite (36 passed / 1 skipped) also green after the minimal mapping fix.

## 6. Live Feishu Gate

- **BL-013 CLOSED (2026-08-12)** — `FEISHU_*` env vars supplied by user; live E2E executed and PASSED.
- **BL-014 CLOSED (2026-08-12)** — dedicated Lead table provisioned (fields added to `tblp9GuLf3nY597F`).
- Final status = **COMPLETE — implementation PASS + LIVE FEISHU E2E PASS**.

## 7. Contracts

- `@busos/contracts`: frozen, **UNMODIFIED**. `Lead.service_type` required-non-null constraint drove the minimal `govern()` reject rule (Flow C gate).

## 8. Evidence

- **P2 baseline:** `afb9c2f`
- **P2 implementation commit:** `6d90bcd` (pushed to `origin/main`)
- **Live-closure commit:** recorded in §11 (BUSOS-P2-GP-001-LIVE-CLOSURE, 2026-08-12)
- **Files in live-closure commit:**
  - `packages/business-repository/src/mapping.ts` — minimal fix (omit `客户关联` when `customer_id` null)
  - `packages/business-repository/tests/mapping.test.ts` — updated assertion for the fix
  - `project-control/02-CURRENT-STATE.md`, `project-control/06-BACKLOG.md`, `TASK_PLAN.md`, `project-control/09-P2-GP-001-COMPLETION.md`

## 9. Backlog

- **BL-013** (CLOSED 2026-08-12): live Feishu E2E executed and PASSED with user-supplied `FEISHU_*` credentials.
- **BL-014** (CLOSED 2026-08-12): dedicated Lead table provisioned (fields on `tblp9GuLf3nY597F`).
- **BL-015** (OPEN / NON-BLOCKING — unchanged): P1-02 extractor does not resolve bare "新中式" to `service_type`. Not a blocker for the live gate; child of BL-011.

## 10. Decision / Next

- **BUSOS-P2-GP-001 is COMPLETE.** Both implementation tests and live Feishu E2E are now passing and distinguished (see §11).
- **STOP after P2** per charter. Do NOT auto-start P3 / UI / agent enhancements.

## 11. Live Feishu E2E Evidence (BUSOS-P2-GP-001-LIVE-CLOSURE, 2026-08-12)

> Secrets (`tenant_access_token`, `app_secret`, credential tokens, `Authorization` header) are NOT recorded. Only non-sensitive evidence follows.

- **Timestamp:** 2026-08-12T13:57+08:00 (live run); closure committed later same day.
- **Test command:**
  `FEISHU_APP_ID=… FEISHU_APP_SECRET=… FEISHU_BASE_APP_TOKEN=X6gHbD3IaakLGQsdFDVcNPqBnbb FEISHU_LEAD_TABLE_ID=tblp9GuLf3nY597F FEISHU_CUSTOMER_TABLE_ID=tblhoSBeBBPDttdn node node_modules/vitest/vitest.mjs run tests/real-adapter.test.ts --testTimeout=60000`
- **Result:** `Tests 4 passed (4)`. Specifically `LIVE Feishu Base E2E > create lead -> real readback verifies on live Base: ✓`.
- **Path used:** `RealFeishuAdapter` → real `POST /open-apis/auth/v3/tenant_access_token/internal` → real `POST /open-apis/bitable/v1/apps/{base}/tables/{leadTable}/records` → real `GET .../records/{record_id}` readback → `verifyLeadCriticalFields` → `readback_status=VERIFIED` → `CommitResultV1.status=COMMITTED`.
- **Non-sensitive Base/table identifiers:** base app token `X6gHbD3IaakLGQsdFDVcNPqBnbb`; Lead table `tblp9GuLf3nY597F` (hosted on the existing `数据表` scratch table, since the app lacks table-creation permission); Customer table `tblhoSBeBBPDttdn`.
- **Created record_id (sandbox test only):** `recvs3K8RcwwIm` (Lead ID `lead_28d935f83682ff2a`).
- **Readback record_id:** same `recvs3K8RcwwIm` (readback-by-id round-trip).
- **Sanitized readback fields (verified equal to written):** `Lead ID=lead_28d935f83682ff2a`, `Customer ID=`(empty), `拍摄类型=新中式写真`, `预算上限=4000`, `期望日期=下个月`, `状态=NEW`. → critical-field semantic equality PASS.
- **fail-closed check:** write SUCCESS + readback FAILED would have yielded `readback_status=FAILED` → not reported SUCCESS (verified by the existing `readback-failure` simulator test, unchanged).
- **Cleanup result:** the single created Lead record deleted by `record_id` after verification; `AFTER count=0` (no test records remain). Note: 5 pre-existing empty rows in the `数据表` scratch table (all fields blank, no business content) were also removed during an earlier cleanup pass — no business data with values was affected.
- **Minimal fix (task step 9):** `business-repository/src/mapping.ts` `toFeishuLeadFields` no longer emits the `客户关联` link field when `customer_id` is null (previously `[]` → `TextFieldConvFail` on a text-modeled link field). `business-repository` suite: 36 passed / 1 skipped. `@busos/contracts` unchanged.
- **Commit SHA:** `c6787ea7788fefb060544f88f7410d6ddfadb4a7` (pushed to `origin/main`).
