# Current State

PROJECT: AI Business OS

BASELINE:
R1 technical / business core complete (P0–P6). See `01-MASTER-PLAN.md` (R1
history preserved) and completion reports (09/10/11-Px-01-COMPLETION.md,
BUSOS-P5-X03-STATUS.md, BUSOS-P6-01-PLAN.md). Detailed evidence for P1–P6 is
preserved in those completion reports and git history — not duplicated here.

CURRENT PHASE:
R2 — H1 Operator Workspace MVP

CURRENT TASK:
BUSOS-R2-H1-03 — Run Detail / Trace Surface
[COMPLETE]

CURRENT ENGINEERING STATUS:
H1-01 COMPLETE — Operator Workspace shell (Overview / Projects / Reviews / Runs)
shipped with the read-only Projects list + Project Detail (Project + Customer +
Tasks + Assets) surface on top of the R1 core. See `BUSOS-R2-H1-01-COMPLETION.md`.

H1-02 COMPLETE — the placeholder **Reviews** navigation is now a real, usable
Human Review surface. A new minimal `@busos/workspace-review`
`WorkspaceReviewService` delegates every review decision (APPROVE / EDIT+APPROVE
/ REJECT) to the existing `@busos/human-review` `HumanReviewService` (which
reuses the P2 golden-path commit path + readback verification + fail-closed).
The Operator Workspace (`apps/operator-workspace`) renders a deterministic
Reviews list (pending-first), a Review Detail (original AI candidate /
governance / AI evidence / original snapshot), and the three human decisions
with terminal-outcome display and repeat-decision guard. Deterministic demo
review cases seed the in-memory `FakeFeishuAdapter`; no Feishu credential reaches
the browser. Gates H1-02-A..H1-02-J all PASS. See
`BUSOS-R2-H1-02-COMPLETION.md`.

H1-03 COMPLETE — the placeholder **Runs** navigation is now a real, read-only Run
Detail / Trace surface. A new minimal `@busos/workspace-run` `WorkspaceRunService`
reads process executions from the existing `@busos/orchestrator`
`ProcessRegistryReadPort` (additive; `InMemoryProcessRegistry` already implements
both `ProcessRegistry` and `ProcessRegistryReadPort`) and maps each canonical
`BusinessProcessResult` into a presentation-safe `RunView` / `RunStageView` /
`RunTraceEventView` (no second state machine). It reuses the P6 contract directly
(`BusinessProcessStatus` / `BusinessProcessStage` / `ProcessError` /
`ProcessRejection` / `ProcessTraceEvent`) and the P6 `sanitizeTraceMetadata` /
`sanitizeMessage` allowlist so no secret / token / prompt / raw third-party
payload reaches the view models or the browser. The Operator Workspace
(`apps/operator-workspace`) renders a deterministic Runs list (updated_at desc;
RUNNING shown honestly as registry-only with empty trace / null output / null
duration) and a Run Detail (status pill, per-stage structured trace, sanitized
error, safe output refs). Deterministic demo executions seed the shared
`InMemoryProcessRegistry`: A SUCCEEDED / B FAILED (system fault) / C RUNNING
(honest) / D HUMAN_REQUIRED (normal pause, never a system error). Gates
H1-03-A..H1-03-J all PASS. See `BUSOS-R2-H1-03-COMPLETION.md`.

EXISTING CAPABILITIES (short list):
- Candidate / Governance (Service Agent → `LeadCandidateV1`, deterministic governance)
- Human Review (`@busos/human-review`: approve / edit+approve / reject)
- BusinessRepository / FeishuAdapter (write + readback verification, D019)
- Project / Task lifecycle (`@busos/project-lifecycle`)
- Creative / Asset (`@busos/creative-production` + `@busos/lumen-adapter`)
- Orchestrator / Trace (`@busos/orchestrator`: `runBusinessProcess`, process
  state, structured trace, error classification, idempotency, fail-closed)

ACTIVE BLOCKERS:
- none blocking R2 engineering
- BL-018 = external live evidence dependency only (CloudBase quota + Lumen /
  Feishu live credentials). Not an engineering defect; tracked separately from
  R2 scope.

NEXT AUTHORIZED WORK:
H1-03 is CLOSED. Per the STOP rule, do not start H1-04 (AI action), H1-05, or
H2 / H3 / H4 without explicit owner authorization. They cannot be auto-started.
H1-03 productized the existing R1/P6 Orchestrator execution visibility as a
workspace surface; it did NOT add a new execution/run persistence database, a
second state machine, live trace streaming, a re-run/retry UI, RBAC, or any
business-mutation capability. The next step after H1-03 closure is commit + push
+ clean tree.

IMPORTANT DEFERRED ITEMS:
- BL-018 — live full-process E2E (P6-C); OPEN / NON-ENGINEERING LIVE DEPENDENCY.
- BL-015 — P1-02 extraction gap ("新中式" alone); DEFERRED / NON-BLOCKING.
- BL-016 — CLOSED (P5 owner override).
- BL-017 — Feishu Lead DateTime write; DEFERRED / NON-BLOCKING maintenance item.
- BL-019 — CLOSED (BUSOS-P6-03 golden-path simulator regression repaired).
- H2 / H3 / H4 horizons — deferred per `R2-LONG-TERM-ROADMAP.md`; cannot be
  auto-started.

NOTE ON STALE OBJECTIVES:
Prior P3/P4/P5 "PRIMARY OBJECTIVE" text described past task objectives and is
intentionally not retained as the current objective. This file now reflects only
the R2 planning state above. Historical objectives remain in the completion
reports and git history.

LATEST CONTROL DECISIONS:
R1 decisions D001–D020 are FROZEN (see `03-DECISIONS.md`). R2 direction is set by
`R2-LONG-TERM-ROADMAP.md`. No R1 frozen decision is re-opened by R2 planning.

ON TASK COMPLETION:
Update this file with: task status, next authorized work, evidence location, and
any new blocker/deferred item.
