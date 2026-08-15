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
BUSOS-R2-H1-01 — Workspace Shell + Project Read Surface
[COMPLETE]

CURRENT ENGINEERING STATUS:
H1-01 COMPLETE — Operator Workspace shell (Overview / Projects / Reviews / Runs)
shipped with the read-only Projects list + Project Detail (Project + Customer +
Tasks + Assets) surface on top of the R1 core. Additive repository collection
reads (listProjects / listTasksByProject / listAssetsByProject) implemented in
both Fake + Real Feishu adapters, behind a new `@busos/workspace-read`
`WorkspaceReadService` boundary (no Feishu leakage). `apps/operator-workspace`
is a minimal client-side TS app (in-memory fake adapter; no Feishu credential in
the browser). Gates H1-01-A..H1-01-J all PASS. No business mutation was
authorized or implemented. See `BUSOS-R2-H1-01-COMPLETION.md`.

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
H1-01 is CLOSED. Per the STOP rule, do not start H1-02 (Reviews), H1-03 (Runs),
H1-04 (AI action), or H1-05 without explicit owner authorization. They cannot be
auto-started. The next step after H1-01 closure is commit + push + clean tree
(H1-01 is a non-live, self-contained read surface).

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
