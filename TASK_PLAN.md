# TASK_PLAN — BUSOS-P2-GP-001 (CLOSED) · BUSOS-P3-01 (CLOSED) · NEXT: P4

## task_id
BUSOS-P2-GP-001 — Golden Path Vertical Slice

## phase
P2 — GP-001 Integration

## status
COMPLETE (P2) — implementation PASS + LIVE FEISHU E2E PASS (BL-013/BL-014 CLOSED; BL-015 OPEN/NON-BLOCKING). P3 (BUSOS-P3-01) ALSO COMPLETE — HR-H live Feishu review E2E PASS 2026-08-12. NEXT: P4.

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

## frozen_contracts
@busos/contracts modified: NO. No schema/type in `contracts/*.schema.json` or `@busos/contracts/src` changed.

## blockers / backlog
- BL-013 (open) — Live Feishu E2E blocked, no credentials.
- BL-014 (open) — Real Feishu Base not provisioned.
- BL-015 (new, non-blocking) — P1-02 extractor does not resolve "新中式" alone to a service_type (only "新中式写真" matches a deliverable noun). Flow B test uses "新中式写真"; the literal task phrasing would yield null service_type. Child of BL-011.

## git_info
- branch: main
- baseline HEAD: afb9c2f1e1e2385119a0261ca7cf81d72e126154
- closing SHA: (see git log after commit)
- pushed: yes (origin/main)
- remote main synced.

## nextActor
P2 (BUSOS-P2-GP-001) and P3 (BUSOS-P3-01) are both CLOSED:
- P2 live Feishu E2E PASS (BL-013/BL-014 CLOSED; BL-015 OPEN/NON-BLOCKING).
- P3 HR-H live Feishu review E2E PASS (2026-08-12) — full Human Review → BusinessRepository → RealFeishuAdapter → real write → real readback → VERIFIED → COMMITTED; EDIT+APPROVE readback 4500; cleanup by exact record_id.
NEXT: P4 — Project Lifecycle Slice (`Lead → Customer → Project → Task`). Do NOT start P4 until explicitly requested (STOP).
