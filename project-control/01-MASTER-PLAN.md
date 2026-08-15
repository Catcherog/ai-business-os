# AI Business OS — Master Plan R1

## P0 — Foundation Design
Status: VERIFIED

Deliverables:
- Charter
- Domain model
- Contracts
- Module boundaries
- Golden Path
- execution rules

## P1 — Foundation Implementation
Status: COMPLETE

Tasks:
- BUSOS-P1-01 Contract Package
- BUSOS-P1-02 Service Agent Candidate Builder
- BUSOS-P1-03 Business Repository + Feishu Adapter Skeleton

Exit:
- Core schemas/types compile and validate.
- Service Agent can output valid `LeadCandidateV1`.
- Repository/adapter can perform minimal create/get/readback operations.

## P2 — GP-001 Integration
Status: COMPLETE

Goal:
Integrate:

`Service Agent -> Candidate -> Governance -> Repository -> Feishu -> Readback`

Exit:
- GP-001 passes with at least:
  - anonymous lead input
  - identified customer input
  - invalid/risk case that does not commit

## P3 — Productize Human Review
Status: COMPLETE

Goal:
Minimal review UI or review surface for:
- approve
- edit
- reject

No complex workflow engine.

## P4 — Project Lifecycle Slice
Status: COMPLETE

Goal:
`Lead -> Customer -> Project -> Task`

Only after GP-001 is stable.

## P5 — Creative Slice

Goal:
`Project -> Creative Task -> Lumen -> Asset`

Status: COMPLETE (FUNCTIONAL PASS — 2026-08-15; live CREATIVE_SUCCESS rerun deferred on CloudBase quota, owner override).
Implemented as `@busos/creative-production` + `@busos/lumen-adapter` behind the
canonical `LumenPort` (only Lumen `AUTH_PASSWORD` + base URL held; provider key
stays in Lumen, §19). P5-A..P5-H PASS via fake + real-adapter(stubbed) gates; P5-I
REAL E2E was BLOCKED (CloudBase read-quota exhaustion on live run). **2026-08-15
owner override**: P5 closes as FUNCTIONAL PASS; live CREATIVE_SUCCESS rerun deferred
(non-code, third-party quota). P6 authorized to start.

## P6 — Orchestrator MVP  [ACTIVE — BUSOS-P6-01 started 2026-08-15]

Goal: Compose the existing vertical slices (Golden Path → Project Lifecycle →
Creative Production) into a single runnable business process behind one
`runBusinessProcess(input, deps)` entrypoint, with a structured execution trace
for observability. Composition only — no existing package is modified, no new
infra (no Redis / MQ / orchestration engine). The orchestrator also turns the
deferred live CREATIVE_SUCCESS rerun (BL-016) into one inspectable call instead
of three manual runs.

Status: BUSOS-P6-01 IN PROGRESS — first implementation task COMPLETE
(`@busos/orchestrator` package; tsc clean; 2/2 fake-E2E tests pass 2026-08-15).
See `BUSOS-P6-01-PLAN.md`. Live full-process E2E deferred on CloudBase quota
(BL-016).

### P6+ — Remaining deferred (not started)
- Memory
- HITL policy automation
- Evaluation center
- observability expansion (beyond the trace)
- dashboard
- production hardening (beyond the P5-X03 sweeper fix)
- portfolio/demo packaging

Do not start these until P6 gates close.
