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

## P6 — Orchestrator  [ACTIVE — BUSOS-P6-02 COMPLETE 2026-08-15]

Goal: Compose the existing vertical slices (Golden Path → Project Lifecycle →
Creative Production) into a single runnable business process behind one
`runBusinessProcess(input, deps)` entrypoint, with a structured execution trace
for observability, then harden that entrypoint into a reliable business process
orchestrator (explicit process state, structured trace contract, unified error
classification, basic idempotency). Composition + reliability only — no existing
slice is refactored, no new infra (no Redis / MQ / orchestration engine / new DB).

### BUSOS-P6-01 — Orchestrator MVP (composition only)
Status: COMPLETE (2026-08-15). `@busos/orchestrator` composes the three slices
behind `runBusinessProcess(input, deps)` with a `TraceCollector`. tsc clean;
fake-E2E gates P6-A/P6-B PASS. See `BUSOS-P6-01-PLAN.md`.

### BUSOS-P6-02 — Orchestrator Reliability + Trace Contract
Status: COMPLETE / PASS (2026-08-15).
Delivered inside `@busos/orchestrator` (no other package modified):
- **Process state contract** — `BusinessProcessStatus` = RUNNING | SUCCEEDED |
  FAILED | REJECTED | HUMAN_REQUIRED; `BusinessProcessStage` keeps the real
  composition names GOLDEN_PATH | PROJECT_LIFECYCLE | CREATIVE_PRODUCTION
  (governance / customer resolution / business persistence all execute inside
  golden-path — no forced rename). Business rejection and human review are
  first-class business outcomes, never system failures.
- **`BusinessProcessResult`** — processId, idempotencyKey, status, currentStage,
  completedStages, startedAt/endedAt/durationMs, `output` (stable refs only),
  `error` / `rejection`, `trace`. No internal object dump.
- **Structured trace contract** — `ProcessTraceEvent` (processId, stage, status
  STARTED|SUCCEEDED|FAILED|REJECTED|HUMAN_REQUIRED, timing, error, metadata) with
  an allowlisted `sanitizeTraceMetadata`: no secrets, tokens, prompts or raw
  third-party payloads, stable refs only.
- **Error classification** — `ProcessErrorDisposition` = RETRYABLE | TERMINAL |
  EXTERNAL_DEPENDENCY; `ProcessError { code, message, stage, disposition }`.
  CloudBase quota → EXTERNAL_DEPENDENCY; Lumen/Feishu 5xx/timeout → RETRYABLE;
  contract-validation / invalid input → TERMINAL; unclassifiable → TERMINAL
  (fail closed).
- **Idempotency** — `processId` + `idempotencyKey` via
  `runBusinessProcess(input, deps, options?)` over a `ProcessRegistry` port with
  `InMemoryProcessRegistry` (injected; no new persistence). Duplicate after
  success/rejection replays the prior result with zero re-execution; duplicate
  while RUNNING returns a deterministic duplicate; a prior TERMINAL failure is
  never auto-rerun; a prior RETRYABLE failure replays unless the explicit
  `retryPreviousFailure` extension point is used.
- **Fail closed** — stage N FAILED blocks stage N+1; every STARTED trace event is
  always terminated (dangling events finalized as FAILED).

Gates P6-D..P6-J PASS (37/37 orchestrator tests, `vitest run --pool=forks`);
tsc --noEmit clean across all packages. No live environment required.

Live full-process E2E (P6-C) remains DEFERRED — external, non-engineering live
dependency (CloudBase NoSQL read quota + Lumen/Feishu live credentials), tracked
by **BL-018 OPEN / NON-ENGINEERING LIVE DEPENDENCY**. BL-016 is CLOSED and must
not be cited as an active blocker.

### P6+ — Remaining deferred (not started)
- Memory
- HITL policy automation
- Evaluation center
- observability expansion (beyond the trace)
- dashboard
- production hardening (beyond the P5-X03 sweeper fix)
- portfolio/demo packaging

Do not start these until P6 gates close.
