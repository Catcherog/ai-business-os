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
BUSOS-R2-H1-05 — Real Usage Closure / MVP Review
[FINAL VERDICT B — H1 ENGINEERING COMPLETE / MVP LIVE CLOSURE BLOCKED per BL-018]

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

H1-04 ENGINEERING COMPLETE — the first **real AI action** vertical slice.
`Generate Visual Reference` now lives on the Project Detail view: an existing
Project runs through the real Creative Production + Lumen + Asset path via a NEW
narrow `@busos/orchestrator` entry `runCreativeProjectAction` (CREATIVE_PRODUCTION
only; it does NOT call `runBusinessProcess`, adds no second state machine, reuses the
P6 status / trace / registry / sanitizer / error-classification). The Operator
Workspace exposes two explicit modes: **DEMO** (in-browser `FakeFeishuAdapter` +
`FakeLumenAdapter`, same shared `InMemoryProcessRegistry` as the Runs surface, so the
new run + Task + Asset appear there) and **CONNECTED** (server-only
`server/workspace-action.ts` building `RealFeishuAdapter` / `RealLumenAdapter` from
env; secrets never reach the browser bundle). Idempotency (`idempotencyKey`) replay
the recorded outcome on a double-click with zero new Task/Asset. Trace carries NO
prompt / source_image / secret (P6 allowlist). The browser smoke
(`smoke-action.mjs`) drives the real DEMO action end-to-end and asserts
`SUCCEEDED` + `assetId`/`assetUri` + a real Task/Asset written + the run recorded in
the shared registry + no secret leak. The server probe (`smoke-server.mjs`) asserts
the CONNECTED boundary returns `BLOCKED` with no credentials — honest, never a faked
LIVE result.

**LIVE GATE STATUS: BLOCKED (BL-018).** The real Feishu Project + real Lumen
generation + real Asset write + readback VERIFIED + UI Run/Asset view could NOT be
executed because `LUMEN_*` + `FEISHU_*` live credentials / CloudBase quota are not
available in this environment. Per requirement #7 this task is reported as
**ENGINEERING COMPLETE / LIVE GATE BLOCKED** — it does NOT claim H1-04 LIVE PASS and
does NOT auto-start H1-05/H2/H3/H4. Gates H1-04-A..H1-04-J defined in
`05-TEST-GATES.md`; see `BUSOS-R2-H1-04.md` for the full completion report.

H1-05 COMPLETE — **Real Usage Closure / MVP Review** (product walkthrough + usability
audit + smallest genuine defect repair + backlog capture). The full H1-01 → H1-04
user journey was exercised end-to-end in the in-browser **DEMO** mode and the
server-only **CONNECTED** boundary probe. All H1 success checkpoints H1-S1..H1-S7
PASS on engineering / DEMO evidence (orchestrator **43/43**, workspace-read **5/5**,
workspace-review **7/7**, workspace-run **12/12** recorded + `RUN_SMOKE_OK ×5`, all
five app smokes green). One genuine **P1** product defect was found and **fixed**: the
Projects / Reviews / Runs nav entries were mislabelled `LIVE` (contradicting the honest
`IN-MEMORY` / `DEMO` footer + GVR badge) — corrected to `DEMO` in
`apps/operator-workspace/src/ui.ts` (the only code change). P2/P3 UI papercuts
(BL-021 manual refresh after GVR, BL-022 Overview placeholder, BL-023 raw DEMO
assetUri) are captured in the backlog as non-blocking. **Final verdict B:**
`H1 ENGINEERING COMPLETE / MVP LIVE CLOSURE BLOCKED — BL-018`. The LIVE gate remains
BLOCKED (BL-018); the MVP is NOT claimed LIVE-COMPLETE. See `BUSOS-R2-H1-05.md` for the
full 12-section closure report.

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
  R2 scope. **Directly blocks the H1-04 LIVE gate** (real Feishu Project + real
  Lumen generation + real Asset write + readback VERIFIED + UI Run/Asset view).
  The H1-04 engineering slice is complete and verified by the DEMO path + the
  CONNECTED boundary probe; only the live execution is deferred.

NEXT AUTHORIZED WORK:
H1-05 (Real Usage Closure / MVP Review) is COMPLETE and pushed; its final verdict is
**B** (`H1 ENGINEERING COMPLETE / MVP LIVE CLOSURE BLOCKED — BL-018`). The H1 MVP
engineering is closed and the product walkthrough passes; the LIVE gate remains BLOCKED
under BL-018 (reported honestly, not a fake PASS). Per the STOP rule, do NOT start
H2 / H3 / H4, BL-018 remediation, or any re-run/retry/live-trace UI without explicit
owner authorization — they cannot be auto-started. The next step after H1-05 closure is
commit + push + clean tree (with the live gate recorded as BLOCKED). The only remaining
authorized future step that would move the LIVE gate is an owner-authorized live closure
run supplying `LUMEN_BASE_URL` + `LUMEN_AUTH_PASSWORD` + `FEISHU_*` + `FEISHU_ASSET_TABLE_ID`
+ CloudBase quota, then re-running `runConnectedGenerateVisualReference` once.

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
