# AI Business OS — Master Plan

## Top-Level Planning State (updated by BUSOS-R2-00, 2026-08-15)

- **R1 / P0–P6 = COMPLETED TECHNICAL BASELINE.** The R1 sections below are
  preserved as history and remain authoritative for what was built.
- **P6-C (live full-process E2E) = DEFERRED external live evidence** under
  **BL-018 (OPEN / NON-ENGINEERING LIVE DEPENDENCY)**. Not an R2 engineering
  blocker. BL-016 is CLOSED and must not be cited as an active blocker.
- **R2 = productization of the R1 core**, beginning with **H1 — Operator
  Workspace MVP** (see `R2-LONG-TERM-ROADMAP.md`). R2 is an extension of R1, not
  a replacement or restart.
- **H2 / H3 / H4 remain deferred horizons** and cannot be auto-started.
- Current authorized planning task: **BUSOS-R2-00 — R1→R2 Planning Baseline**
  (control-document only). Next authorized implementation unit: **H1-01**, only
  after BUSOS-R2-00 closure and an explicit task authorization.

The R1 plan (P0–P6) below is retained verbatim as the completed baseline history.

---

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

---

# R2 — Productization of the R1 Core (begins after R1 baseline)

> R2 is an **extension of R1**, not a replacement or restart. R1 frozen decisions
> (D001–D020) remain authoritative. Full direction: `R2-LONG-TERM-ROADMAP.md`.
> This master plan records only the planning state; it does **not** authorize
> implementation beyond the current task (`BUSOS-R2-00`, control-docs only).

## R2 Planning State

- R1 / P0–P6 = **COMPLETED TECHNICAL BASELINE** (preserved above).
- P6-C (live full-process E2E) = DEFERRED external live evidence under
  **BL-018 (OPEN / NON-ENGINEERING LIVE DEPENDENCY)**; not an R2 engineering
  blocker. BL-016 CLOSED.
- R2 begins with **H1 — Operator Workspace MVP**: productize the existing R1
  core behind four navigation surfaces — **Overview, Projects, Reviews, Runs**.
- **H2 (Intelligence Improvement)**, **H3 (Operations & Reliability)**,
  **H4 (Scale / SaaS)** remain **deferred horizons** and cannot be auto-started.

## H1 Roadmap Units (planning decomposition only — not authorized tasks)

1. **H1-01 — Workspace Shell + Project Read Surface**
2. **H1-02 — Review Surface Integration**
3. **H1-03 — Run Detail / Trace Surface**
4. **H1-04 — First Real AI Action Vertical Slice** (`Generate Visual Reference`,
   reusing Creative Production + Lumen + Asset)
5. **H1-05 — Real Usage Closure / MVP Review**

H1 success definition (exact):

> A user can open AI Business OS, inspect an existing real project, see its Tasks
> and Assets, trigger one real AI-assisted business action, observe the Run
> status, and inspect the resulting business output without leaving the Business
> OS product surface.

These units are executed **one at a time**, each requiring a separate bounded
task authorization. Do **not** start H1-01 from this planning task.
