# BUSOS-P3-01 — Minimal Human Review Surface · Completion Evidence

**Date:** 2026-08-12
**Baseline:** `669c7202e502647399ab4978abf18429e237df0f`
**Final status:** `COMPLETE / LIVE P3 REVIEW E2E PASS`
*(Per task §17/§19: P3-01 is reported COMPLETE because the HR-H live Feishu E2E PASSED
on 2026-08-12 — see §7/§8. All HR-A..HR-H gates PASS. The earlier reported status was
`IMPLEMENTATION PASS / LIVE P3 REVIEW E2E BLOCKED` pending this live closure run.)*

---

## 1. Objective met (R1 P3 alignment)

Implemented the minimum human-review vertical slice required by R1:

```
LeadCandidateV1
→ GovernanceResultV1(REVIEW_REQUIRED)
→ Human Review Surface (APPROVE / EDIT+APPROVE / REJECT)
→ deterministic validation / governance protection
→ BusinessRepository
→ FeishuAdapter
→ write
→ readback
→ VERIFIED
```

This task productised **Human Review only**. No general workflow engine was built.
Frozen decisions D001–D020 preserved (no contract change; Feishu knowledge stays
behind `BusinessRepository` + `FeishuAdapter`).

---

## 2. Files changed

### New package `@busos/human-review` (`packages/human-review/`)
- `package.json`, `tsconfig.json`, `vitest.config.ts`
- `src/types.ts` — P3-local review types (`ReviewCase`, `ReviewOutcome`, `ReviewAction`,
  `ReviewState`, `AllowedEditField`, `FieldEdit`, `HumanApproval`). **Not** in frozen `@busos/contracts`.
- `src/allowlist.ts` — the 8 allowlisted editable `LeadCandidate` fields (task §5 Flow C);
  `applyEdits()` clones the original, applies edits, and replaces AI evidence for edited
  fields with a `HUMAN_EDIT` marker (evidence rule — stale AI evidence never reused).
- `src/review-service.ts` — `HumanReviewService.createReviewCase` (Flow A, zero writes) +
  `applyReview(APPROVE | EDIT_APPROVE | REJECT)` (Flows B/C/D/E). Reuses
  `commitApprovedCandidate` + `govern` from `@busos/golden-path`; depends only on
  `@busos/contracts`, `@busos/golden-path`, and the `GoldenPathRepository`/`BusinessRepository` boundary.
- `src/store.ts` — minimal in-memory review store (task §8; not a generic ReviewRepository platform).
- `src/index.ts` — public surface.
- `scripts/review-server.ts` — minimal `node:http` review surface (task §6). Fake adapter by
  default; Real adapter when `FEISHU_*` env present. No Feishu tokens/table ids/field names in code.
- `tests/testkit.ts`, `tests/hr-a-e.test.ts`, `tests/hr-f.test.ts`, `tests/hr-h.test.ts`.

### Modified (reused, not duplicated)
- `packages/golden-path/src/governance.ts` — added the **minimum deterministic rule** exposing a
  `REVIEW_REQUIRED` case: `intent.confidence < 0.6` softens `APPROVE → REVIEW_REQUIRED`
  (issue `INTENT_CONFIDENCE_LOW`, an already-defined contract code). Reuses existing issue code;
  does **not** redesign governance; P2 tests remain green. *(task §12 Case 1.)*
- `packages/golden-path/src/execute-golden-path.ts` — extracted `commitApprovedCandidate(candidate, repo)`
  (customer resolution → lead create → link); `executeGoldenPath` now delegates to it. No behaviour change.
- `packages/golden-path/src/index.ts` — exports `commitApprovedCandidate`, `INTENT_CONFIDENCE_REVIEW_THRESHOLD`.
- `packages/business-repository/src/types.ts` — `FeishuAdapter` port gains `deleteLead`/`deleteCustomer`
  (test-hygiene cleanup; Feishu knowledge stays in the adapter).
- `packages/business-repository/src/feishu-adapter.ts` — `deleteLead`/`deleteCustomer` via
  `DELETE /open-apis/bitable/v1/.../records/{recordId}`.
- `packages/business-repository/src/feishu-adapter-fake.ts` — `deleteLead`/`deleteCustomer` +
  `leadCount`/`customerCount` getters (test probes).

### Control files
- `project-control/02-CURRENT-STATE.md` — PHASE P3 ACTIVE / BUSOS-P3-01.
- `project-control/05-TEST-GATES.md` — appended **P3-01 Gate (HR-A..HR-H)** without altering prior gates.
- `09-P3-01-COMPLETION.md` — this document.

---

## 3. Review surface location & supported actions

- **Location:** `packages/human-review/scripts/review-server.ts`
  - Run: `cd packages/human-review && npm run serve` (vite-node), default port `4173`
    (`REVIEW_PORT` env overrides).
  - `GET /` creates a sample `REVIEW_REQUIRED` case and redirects to its page.
  - `GET /review/:id` renders the case: AI snapshot (service type, budget, preferred date,
    customer info), governance issues, evidence, and an allowlisted edit form.
  - `POST /api/review/:id/approve` → APPROVE
  - `POST /api/review/:id/edit` (form fields) → EDIT+APPROVE
  - `POST /api/review/:id/reject` → REJECT
  - Result page shows terminal state, commit status, write/readback, human edits, evidence notes.
- **Supported actions (task §4):** APPROVE · EDIT+APPROVE (allowlisted fields only) · REJECT.
- **Smoke test result:** APPROVE→`COMMITTED`, EDIT+APPROVE(budget_max 4000→4500)→`COMMITTED`
  (page shows `4500` + `HUMAN_EDIT` marker), REJECT→`REJECTED`. All three verified live via curl.

---

## 4. Test gates — HR-A .. HR-H

| Gate | Result | Evidence |
|------|--------|----------|
| **HR-A** Review interception | **PASS** | `createReviewCase` builds `PENDING_REVIEW` case; candidate + `INTENT_CONFIDENCE_LOW` issue visible; `session_id`/`agent_run_id`/`candidate_id` retained; `CountingBusinessRepository` writes = 0; Fake adapter `leadCount`/`customerCount` = 0. |
| **HR-B** Approve | **PASS** | APPROVE → `approval` recorded, `lead` created (新中式写真 / 4000), `writes.lead=1`, `customer=null`; `commit.status=COMMITTED`, `write_status=SUCCESS`, `readback_status=VERIFIED`. Separate test: REJECT governance candidate → APPROVE fails closed (no override). |
| **HR-C** Edit + approve | **PASS** | budget_max 4000→4500: original snapshot retains 4000 + AI evidence `预算大概4000`; `edits=[{before:4000,after:4500}]`; committed `lead.budget_max=4500`; readback `=4500`; reviewed evidence for the field is the `HUMAN_EDIT` marker, **not** `预算大概4000`. |
| **HR-D** Reject | **PASS** | REJECT → `state=REJECTED`, `commit=null`, `writes.lead/customer/link=0`, Fake adapter `leadCount=0`. |
| **HR-E** Invalid edit / hard rejection | **PASS** | (a) EDIT+APPROVE clearing `service_type` → contract-valid but governance REJECT → fail closed, 0 writes. (b) REJECT-governance candidate → APPROVE → fail closed, 0 writes. |
| **HR-F** Architecture boundary | **PASS** | 34 static assertions: `src/**` + `scripts/**` contain **none** of the forbidden Feishu tokens (credentials, `tenant_access_token`, `open-apis`, `DEFAULT_FIELD_MAP`, `FeishuRecord`, `record_ids`, mapping fns, `RealFeishuAdapter`, concrete Feishu Base field names). Also asserts no direct Feishu/internal import. |
| **HR-G** Regression | **PASS** | All existing suites green + `tsc --noEmit` clean (see §5). |
| **HR-H** Live Feishu vertical slice | **PASS (live)** | LIVE block (2 tests) ran 2026-08-12 with real `FEISHU_*` credentials against real Feishu OpenAPI: (1) EDIT+APPROVE 4000→4500 → `COMMITTED`/`SUCCESS`/`VERIFIED`, readback `lead.budget_max`=4500; (2) APPROVE (no edit) → `COMMITTED`/`VERIFIED`. Both cleaned by exact `record_id` (`deleteLead` returned true). Full chain: Human Review → BusinessRepository → RealFeishuAdapter → real create → real readback → VERIFIED → `commit.status=COMMITTED`. Plus the always-on RealFeishuAdapter-via-simulator test (NOT live) → PASS. |

---

## 5. Regression run (HR-G) — exact output

| Package | tsc | Tests |
|---------|-----|-------|
| `@busos/contracts` | clean | 82 passed |
| `@busos/service-agent-candidate` | clean | 53 passed |
| `@busos/business-repository` | clean | 36 passed · 1 skipped (live `feishu-real`) |
| `@busos/golden-path` | clean | 11 passed · 1 skipped (live) |
| `@busos/human-review` | clean | 42 passed · 2 skipped (live HR-H) |

All TypeScript compiles clean. P2 golden-path tests (incl. `RealFeishuAdapter` simulator)
remain green after the `commitApprovedCandidate` extraction.

---

## 6. Fake vs Live — clearly distinguished

- **Fake:** `FakeFeishuAdapter` (in-memory) for all HR-A..HR-E unit gates and the
  `RealFeishuAdapter`-via-simulator HR-H coverage. No network, no secret.
- **Live:** `RealFeishuAdapter` built from `createFeishuAdapterFromEnv()`; only runs when
  `FEISHU_*` credentials are present. Credentials are **never** printed; only the local
  surface URL / non-sensitive status is logged.
- The simulator HR-H test is explicitly labelled "NOT live" and is **not** substituted for
  the live gate.

---

## 7. Sanitized live evidence / cleanup (LIVE run — 2026-08-12)

- **Config used (sanitized):** App ID `cli_a9257d5b89b95ccb` (matches P2-verified identity);
  Base app token `X6gHbD3IaakLGQsdFDVcNPqBnbb`; Lead table `tblp9GuLf3nY597F`; Customer table
  `tblhoSBeBBPDttdn`. **App Secret, tenant access token, and Authorization headers are NEVER
  written to logs or this evidence.**
- **Records created / cleaned:** 2 Lead records (one per live test). Both deleted by exact
  `external_record_id` via `FeishuAdapter.deleteLead` (returned `true`). Zero Customer records
  created — the canonical reviewable case is anonymous (no customer identity extracted), so
  `commitApprovedCandidate` set `customer=null` and no customer write occurred. Existing
  business records untouched.
- **Verification chain (live):** `HumanReviewService.applyReview` → `BusinessRepository` →
  `RealFeishuAdapter` (real `tenant_access_token` → real `POST /open-apis/bitable/.../records`
  → real `GET .../records/{id}` readback) → critical fields semantically equal →
  `readback_status=VERIFIED` → `commit.status=COMMITTED`, `write_status=SUCCESS`. EDIT+APPROVE
  `budget_max` 4000→4500 read back as **4500** (not the original 4000); APPROVE (no edit)
  preserved `budget_max=4000`.
- **Test command (env-provided, secrets redacted here):** `FEISHU_APP_ID=cli_a9257d5b89b95ccb
  FEISHU_APP_SECRET=***REDACTED*** FEISHU_BASE_APP_TOKEN=X6gHbD3IaakLGQsdFDVcNPqBnbb
  FEISHU_LEAD_TABLE_ID=tblp9GuLf3nY597F FEISHU_CUSTOMER_TABLE_ID=tblhoSBeBBPDttdn
  node node_modules/vitest/vitest.mjs run tests/hr-h.test.ts --testTimeout=60000`
  → `Test Files 1 passed · Tests 3 passed (3)`.

---

## 8. Blockers

- **HR-H LIVE Feishu E2E — RESOLVED / PASS (2026-08-12).** The live slice ran with real
  `FEISHU_*` credentials supplied for this process only (injected inline on the test command,
  never persisted, never logged). Both live HR-H tests passed and records were cleaned by exact
  `record_id`. No code change was required — the live tests were already written and gated.
- Prerequisites **BL-013 / BL-014 remain CLOSED**; **BL-015 remains OPEN / NON-BLOCKING**
  (unchanged). No code-level blockers. **BUSOS-P3-01 is COMPLETE.**

---

## 9. Deferred findings / backlog

- **No new non-blocking findings.** `BL-015` remains **OPEN / NON-BLOCKING** (unchanged).
- Out-of-scope items from task §13 (P4 lifecycle, Lumen, dashboard, RBAC, retry engine,
  PostgreSQL migration, event sourcing/CQRS, multi-tenant, etc.) were **not** implemented,
  per the task's explicit scope boundary.

---

## 10. Commit / push / tree

- Commit SHA: `02188e754339ad3b2266bf736b77ea1465a25739`
- Push status: **PUSHED** to `origin/main` (`669c720..02188e7`, 22 files, +2012 / −101).
- Working tree: **clean** after commit (`git status --short` → empty).
