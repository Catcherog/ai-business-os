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
Status: CURRENT

Tasks:
- BUSOS-P1-01 Contract Package
- BUSOS-P1-02 Service Agent Candidate Builder
- BUSOS-P1-03 Business Repository + Feishu Adapter Skeleton

Exit:
- Core schemas/types compile and validate.
- Service Agent can output valid `LeadCandidateV1`.
- Repository/adapter can perform minimal create/get/readback operations.

## P2 — GP-001 Integration

Goal:
Integrate:

`Service Agent -> Candidate -> Governance -> Repository -> Feishu -> Readback`

Exit:
- GP-001 passes with at least:
  - anonymous lead input
  - identified customer input
  - invalid/risk case that does not commit

## P3 — Productize Human Review

Goal:
Minimal review UI or review surface for:
- approve
- edit
- reject

No complex workflow engine.

## P4 — Project Lifecycle Slice

Goal:
`Lead -> Customer -> Project -> Task`

Only after GP-001 is stable.

## P5 — Creative Slice

Goal:
`Project -> Creative Task -> Lumen -> Asset`

Later phase. Not current scope.

## P6+ — Deferred

Possible later work:
- Orchestrator
- Memory
- HITL policy automation
- Evaluation center
- observability expansion
- dashboard
- production hardening
- portfolio/demo packaging

Do not start these until earlier gates are closed.
