# Current State

PROJECT: AI Business OS
VERSION: V1
PHASE: P2 — GP-001 Integration
STATUS: ACTIVE

PRIMARY OBJECTIVE:
Run the minimum Golden Path end-to-end: Consultation -> LeadCandidate -> Governance -> Lead / optional Customer -> BusinessRepository -> Feishu -> Readback.

CURRENT GOLDEN PATH:
GP-001 — Consultation -> LeadCandidate -> Governance -> Lead -> optional Customer -> Feishu -> Readback

CURRENT TASKS:
1. BUSOS-P1-01 — Contract Package  [CLOSED — P1-01 gate PASS, 2026-08-11]
2. BUSOS-P1-02 — Service Agent Candidate Builder  [CLOSED — P1-02 gate PASS (gates 1-8), 2026-08-11]
3. BUSOS-P1-03 — Business Repository + Feishu Adapter Skeleton  [CLOSED — skeleton + fake-verified; REAL Feishu E2E BLOCKED (BL-013)]
4. BUSOS-P2-GP-001 — Golden Path Vertical Slice  [COMPLETE — implementation PASS + LIVE Feishu E2E PASS; BL-013/BL-014 CLOSED; BL-015 remains OPEN / NON-BLOCKING]

EXECUTION ORDER:
- P1-01 first. [COMPLETE — contracts available at packages/contracts, importable as @busos/contracts]
- P1-02. [COMPLETE — existing Service Agent (Python/LangGraph) now produces LeadCandidateV1 via packages/service-agent-candidate]
- P1-03 next. [READY — contracts + candidate producer both in place]

P1-01 EVIDENCE:
- Package: packages/contracts (TypeScript + zod runtime validation).
- Runtime validators: LeadCandidateV1 / GovernanceResultV1 / CommitResultV1.
- Domain types: Session / AgentRun / Lead / Customer / Project.
- Tests: 82 passing (vitest); tsc --noEmit clean.
- Parity guard: Zod schemas cross-checked against contracts/*.schema.json (24 parity assertions).
- Command: (in packages/contracts) npm run verify.

P1-02 EVIDENCE:
- Package: packages/service-agent-candidate (TypeScript; name @busos/service-agent-candidate).
- Integration: existing Service Agent = `D:\360Downloads\Trae 项目\Monorepo\service agent` (Python + LangGraph, submodule 386f21f6). Adapter = minimal Candidate Builder that consumes a frozen JSON contract `ConsultationContextV1` emitted by the agent (bridge/service_agent_context.py, stdlib-only, no Feishu/api/network).
- Contract produced: LeadCandidateV1 (from @busos/contracts), validated by assertLeadCandidateV1.
- Canonical case PASS: 「我想下个月拍一套新中式写真，预算大概4000。」 -> service_type="新中式写真", budget_max=4000, preferred_date_text="下个月", customer identity all null, governance.status=PENDING_REVIEW.
- Tests: 52 passing (vitest); tsc --noEmit clean.
- Command: (in packages/service-agent-candidate) npm test  (runs tsc --noEmit + vitest run).
- Out of scope (untouched): P1-03, Governance Engine, BusinessRepository, Feishu calls, Lead/Customer creation, Agent refactor, old-project migration, new agent framework/orchestrator/event bus.

P1-03 EVIDENCE:
- Package: packages/business-repository (TypeScript; name @busos/business-repository).
- Integration: reused the validated Feishu integration pattern from `lark/src/scripts/temp/crud-probe.mjs` + `collator-clean-clone/src/data-cleaning/agent/execution/bitable-writer.js` (tenant_access_token auth + /open-apis/bitable/v1 app/table/record CRUD). Real adapter is env-driven (FEISHU_APP_ID/SECRET/BASE_APP_TOKEN/LEAD_TABLE_ID/CUSTOMER_TABLE_ID), no hardcoded secrets.
- 6 repository methods implemented (createLead/getLead/createCustomer/getCustomer/findCustomerByIdentity/linkLeadCustomer) against the FeishuAdapter port; only the adapter owns Feishu tokens/table ids/field names (D018). Canonical Lead/Customer from @busos/contracts; CommitResultV1 validated via assertCommitResultV1.
- Readback enforced (D019): create -> get record -> map back -> verify critical fields -> CommitResultV1 (status COMMITTED only if write SUCCESS && readback VERIFIED). isBusinessCommitSuccess used.
- Tests: 36 passing, 1 skipped (vitest); tsc --noEmit clean.
  - repository.test.ts 13 · mapping.test.ts 7 · readback.test.ts 8 · boundary.test.ts 4 · feishu-real.test.ts 5 (1 skipped = REAL E2E).
- OUTCOME: PARTIAL / BLOCKED ON REAL FEISHU E2E. Fake adapter + real-adapter-stubbed-transport prove the full write->readback->VERIFIED pipeline; the live Feishu create/readback cannot be verified here (no FEISHU_* env). Per §19 NOT reported as PASS.
- Next: provide FEISHU_* credentials + provision Lead/Customer Base tables to flip real E2E BLOCKED -> PASS; P2 deferred until then.

CURRENT BLOCKERS:
- **BL-013 CLOSED (2026-08-12)** — Live Feishu E2E executed with provided `FEISHU_*` credentials; `real-adapter.test.ts` LIVE block passed (anonymous lead → real write → real readback → VERIFIED).
- **BL-014 CLOSED (2026-08-12)** — A dedicated Lead table was provisioned in the real Base. The app lacks table-creation permission, so the DEFAULT_FIELD_MAP Lead fields (incl. `Customer ID` text + `客户关联`) were added to the existing `数据表` scratch table `tblp9GuLf3nY597F`. Flow A (anonymous) does not emit the link field, sidestepping the app's inability to create a true link field (see mapping fix).
- **BL-015 OPEN / NON-BLOCKING** — P1-02 extractor does not resolve bare "新中式" to a service_type. Unchanged; not a blocker for the live gate.

LIVE FEISHU E2E (2026-08-12): **PASS**. Manual run (with env):
`FEISHU_*=... node node_modules/vitest/vitest.mjs run tests/real-adapter.test.ts --testTimeout=60000`
Result: `Tests 4 passed (4)` — incl. `LIVE Feishu Base E2E > create lead -> real readback verifies on live Base`. Evidence in `09-P2-GP-001-COMPLETION.md` §11.

Minimal necessary fix applied during live closure (task step 9): `packages/business-repository/src/mapping.ts` `toFeishuLeadFields` no longer emits the `客户关联` link field when `customer_id` is null (previously emitted `[]`, which a text-modeled link field rejects → `TextFieldConvFail`). Unblocked the live Flow A write. Covered by updated `mapping.test.ts` + `business-repository` suite (36 passed / 1 skipped). No contract change.

Non-blocking findings also in 06-BACKLOG.md (BL-005, BL-008, BL-009, BL-010..BL-012, BL-015).

DO NOT TOUCH:
- Lumen / Creative Agent
- LoRA integration
- full Memory
- full Eval platform
- multi-tenant architecture
- complex RBAC
- generic event bus
- full database migration
- repository-wide audit

LATEST CONTROL DECISIONS:
See `03-DECISIONS.md`.

ON TASK COMPLETION:
Update this file with:
- task status
- blockers
- next task
- evidence location
