# BUSOS-R2-H1-02 — Review Surface Integration

## Task name
BUSOS-R2-H1-02 — Review Surface Integration

## Starting SHA
`73938197daa783ab245ff4957578945ffed9e63d`
(Remote `origin/main` verified equal to the authorized H1-01 baseline via
`git ls-remote`. Local working tree aligned to this baseline before
implementation; the git-watcher/index-lock condition is bypassed with a fresh
external `GIT_INDEX_FILE` at commit time.)

## Objective
Turn the existing placeholder **Reviews** navigation in `apps/operator-workspace`
into a real, usable Human Review surface — the productization of the already
built R1/P3 Human Review capability. The operator can list reviews, open a
Review Detail, inspect the original AI proposal + governance issues + evidence,
and choose APPROVE / EDIT+APPROVE / REJECT, observing the resulting review state
and business outcome.

## Authorized scope
- Exactly four top-level nav entries preserved: Overview / Projects / Reviews / Runs.
- Projects remains the H1-01 read-only vertical slice, unchanged.
- Reviews becomes functional (list + detail + three decisions + outcome).
- Overview / Runs remain bounded placeholders.
- A minimal `@busos/workspace-review` `WorkspaceReviewService` delegation boundary.
- Deterministic demo review seed (canonical `LeadCandidateV1` /
  `GovernanceResultV1`) for APPROVE / EDIT+APPROVE (budget 4000→4500) / REJECT.
- Reuse of the existing `HumanReviewService`, `InMemoryReviewStore`,
  `commitApprovedCandidate`, `govern`, edit allowlist, readback, fail-closed.

## Explicit non-goals
- No new persistent Review database (InMemoryReviewStore is sufficient; BL note only).
- No Human Review semantics reimplementation; no new ReviewState/ReviewAction.
- No RBAC, notifications, multi-reviewer workflow, assignment/inbox routing engine.
- No Redis / MQ / event bus / generic workflow or approval platform.
- No Feishu schema redesign; no Lumen work; no `RealFeishuAdapter` change.
- No H1-03 (Runs detail), H1-04 (AI action), H1-05.
- No unrelated UI redesign, refactors, or drive-by cleanup.

## Acceptance gates (from task instruction)
- H1-02-A Baseline / authority / scope
- H1-02-B Reviews list (deterministic, pending first, canonical data, no Feishu leak)
- H1-02-C Review detail / inspection (candidate / governance / evidence / snapshot)
- H1-02-D APPROVE (existing HumanReviewService → commit → readback → COMMITTED)
- H1-02-E EDIT+APPROVE (allowlisted edit, 4000→4500, snapshot retained, committed=4500, stale evidence not reused)
- H1-02-F REJECT (zero writes, no COMMITTED result)
- H1-02-G Fail closed (invalid edit / hard reject → FAILED, zero writes, sanitized reason)
- H1-02-H Architecture boundary (no Feishu API / table IDs / credentials / raw records in presentation)
- H1-02-I Product smoke (Reviews → open pending → inspect → decide → UI reflects terminal state)
- H1-02-J Regression (human-review / workspace-read / business-repository / workspace-review tests + tsc + operator-workspace build/smoke all PASS)

## STOP rule
Implement only H1-02. On mandatory gate failure, diagnose minimally and fix only
inside H1-02 scope; otherwise record blocker and stop. After closure, STOP — do
not start H1-03 / H1-04 / H1-05 without explicit owner authorization.
