# Current State

PROJECT: AI Business OS
VERSION: V1
PHASE: P3 — Productize Human Review
STATUS: ACTIVE
CURRENT TASK: BUSOS-P3-01 — Minimal Human Review Surface
BASELINE: 669c7202e502647399ab4978abf18429e237df0f
CURRENT BLOCKERS: None

PRIMARY OBJECTIVE:
Productize the minimum human-review vertical slice required by R1:
LeadCandidateV1 -> GovernanceResultV1(REVIEW_REQUIRED) -> Human Review Surface
(APPROVE / EDIT+APPROVE / REJECT) -> deterministic validation/governance ->
BusinessRepository -> FeishuAdapter -> write -> readback -> VERIFIED.

This task productizes Human Review only. It does NOT build a general workflow engine.

CURRENT P3 TASK:
- BUSOS-P3-01 — Minimal Human Review Surface  [DONE — IMPLEMENTATION PASS / LIVE P3 REVIEW E2E BLOCKED]

EXECUTION ORDER:
- P0 VERIFIED. [done]
- P1 COMPLETE. [done — contracts + candidate builder + business repository/adapter]
- P2 COMPLETE. [done — GP-001 vertical slice, live Feishu E2E PASS]
- BUSOS-P3-01 next. [ACTIVE]

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
- Completion evidence: 09-P3-01-COMPLETION.md — status `IMPLEMENTATION PASS / LIVE P3 REVIEW E2E BLOCKED` (NOT reported COMPLETE; HR-H live Feishu E2E is env-blocked).

CURRENT BLOCKERS:
- **BL-013 CLOSED (2026-08-12)** — Live Feishu E2E executed with provided FEISHU_* credentials; real-adapter LIVE block passed.
- **BL-014 CLOSED (2026-08-12)** — Dedicated Lead table provisioned in the real Base.
- **BL-015 OPEN / NON-BLOCKING** — P1-02 extractor does not resolve bare "新中式" to a service_type. Unchanged; not a blocker for the live gate.
- **HR-H LIVE E2E — BLOCKED (environmental, non-blocking for code)** — BUSOS-P3-01 live Feishu review slice could not execute this run because FEISHU_* env is absent. The live HR-H tests are written and gated; supplying creds flips them to PASS with no code change. (See 09-P3-01-COMPLETION.md §8.)

LATEST CONTROL DECISIONS:
See `03-DECISIONS.md` (D001..D020 FROZEN).

ON TASK COMPLETION:
Update this file with:
- task status
- blockers
- next task
- evidence location
