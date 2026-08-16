# BUSOS-R2-H1-03 — Run Detail / Trace Surface

## Task name
BUSOS-R2-H1-03 — Run Detail / Trace Surface

## Starting SHA
`508dbfc38f0a17fe533dd8d286e54be5d940b1e9`
(Remote `origin/main` verified equal to the authorized H1-02 baseline via
`git ls-remote`. Local working tree aligned; the git-watcher/index-lock condition
is bypassed with a fresh external `GIT_INDEX_FILE` at commit time.)

## Objective
Turn the existing placeholder **Runs** navigation in `apps/operator-workspace`
into a real, read-only Run Detail / Trace surface — the productization of the
already-built R1/P6 Orchestrator execution visibility. The operator can list
process runs, open a Run Detail, and inspect the structured per-stage trace, the
outcome (success / system error / business rejection / human required), and safe
output refs — without ever running `runBusinessProcess` from the browser and
without leaking secrets.

## Authorized scope
- Exactly four top-level nav entries preserved: Overview / Projects / Reviews / Runs.
- Projects (H1-01) and Reviews (H1-02) remain unchanged and read-only.
- Runs becomes functional (list + detail + structured trace + outcome), read-only.
- A minimal `@busos/workspace-run` `WorkspaceRunService` read adapter over the
  existing `@busos/orchestrator` `ProcessRegistryReadPort` (additive;
  `InMemoryProcessRegistry` already implements both `ProcessRegistry` and
  `ProcessRegistryReadPort`).
- Deterministic demo run seed (canonical `BusinessProcessResult`): A SUCCEEDED /
  B FAILED / C RUNNING (honest, registry-only) / D HUMAN_REQUIRED.
- Reuse of the existing P6 contract (`BusinessProcessStatus` / `BusinessProcessStage`
  / `ProcessError` / `ProcessRejection` / `ProcessTraceEvent`) and the P6
  `sanitizeTraceMetadata` / `sanitizeMessage` allowlist. **No second state machine.**

## Explicit non-goals
- No new execution/run persistence database; no live trace streaming; no re-run/retry UI; no new Process state machine.
- No execution of `runBusinessProcess` from the browser; the surface is strictly read-only.
- No RBAC, notifications, event bus, multi-tenant.
- No Feishu schema redesign; no Lumen work; no `RealFeishuAdapter` change.
- No H1-04 (AI action), H1-05, H2 / H3 / H4.
- No unrelated UI redesign, refactors, or drive-by cleanup.

## Acceptance gates (from task instruction)
- H1-03-A Baseline / authority / scope
- H1-03-B Runs list (updated_at desc, limit, RUNNING honest — empty trace / null output / null duration)
- H1-03-C Run detail mapping (SUCCEEDED output refs; FAILED system_error + failed stage; REJECTED/HUMAN_REQUIRED; getRun null)
- H1-03-D Real orchestrator wiring (real runBusinessProcess → shared registry → WorkspaceRunService maps success; FAILURE → system_error; no second state machine)
- H1-03-E Semantic gate (FAILED=system_error; REJECTED=business_rejection; HUMAN_REQUIRED=human_required; never rendered as system error)
- H1-03-F Trace sanitization / security boundary (sanitizeTraceMetadata drops secrets; sanitizeMessage redacts; whole-app forbidden scan clean)
- H1-03-G Deterministic demo seed (A SUCCEEDED / B FAILED / C RUNNING / D HUMAN_REQUIRED)
- H1-03-H Architecture boundary (presentation imports only @busos/workspace-run; no Feishu/Lumen creds in bundle)
- H1-03-I Product smoke (Runs → open FAILED/SUCCEEDED/HUMAN_REQUIRED; inject forbidden → stripped)
- H1-03-J Regression (workspace-run tsc + ≥8 tests PASS; orchestrator tsc; reused suites green; build/smokes clean)

## STOP rule
Implement only H1-03. On mandatory gate failure, diagnose minimally and fix only
inside H1-03 scope; otherwise record blocker and stop. After closure, STOP — do
not start H1-04 / H1-05 / H2 / H3 / H4 without explicit owner authorization.
