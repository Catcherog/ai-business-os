# Current State

PROJECT: AI Business OS
VERSION: V1
PHASE: P1 — Foundation Implementation
STATUS: ACTIVE

PRIMARY OBJECTIVE:
Implement the minimum foundations required to run GP-001.

CURRENT GOLDEN PATH:
GP-001 — Consultation -> LeadCandidate -> Governance -> Lead -> optional Customer -> Feishu -> Readback

CURRENT TASKS:
1. BUSOS-P1-01 — Contract Package  [DONE — P1-01 gate PASS, 2026-08-11]
2. BUSOS-P1-02 — Service Agent Candidate Builder  [DONE — P1-02 gate PASS (gates 1-8), 2026-08-11]
3. BUSOS-P1-03 — Business Repository + Feishu Adapter Skeleton  [DONE — skeleton + fake-verified; REAL Feishu E2E BLOCKED (BL-013)]

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
P1-03 REAL Feishu E2E BLOCKED — FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_BASE_APP_TOKEN / FEISHU_LEAD_TABLE_ID / FEISHU_CUSTOMER_TABLE_ID are not present in this environment (BL-013). Skeleton + fake-verified logic complete. Non-blocking findings also in 06-BACKLOG.md (BL-005, BL-008, BL-009, BL-010..BL-012, BL-013, BL-014).

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
