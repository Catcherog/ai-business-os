# Feishu v3 Migration Report

## Verdict

**BLOCKED — live migration not executed.**

This report records the live-gate attempt on 2026-08-25 from the isolated
coordinator worktree. No Feishu credential value, Base token, table ID,
personal payload, or token-bearing URL is recorded here.

## Authority and scope

- Frozen baseline: `origin/main@729108d8059e3e143194a05f43e510af3587d385`.
- Coordinator branch: `codex/busos-feishu-v3`.
- Coordinator worktree: `C:\Users\Catcher\AppData\Local\Temp\codex-busos-feishu-v3`.
- Implementation checkpoint before this report: `b410bce`.
- Target: NEW test Base only; the deployment-specific identifier is intentionally omitted.
- Source systems: read-only; no delete, move, rename, or cleanup was attempted.

## Gate evidence

| Plan step | Result | Evidence |
| --- | --- | --- |
| Generate plan | **BLOCKED** | `npm run migrate:plan` stopped before client construction with `Missing required environment variable: FEISHU_APP_ID`. |
| Bootstrap schema | **BLOCKED** | `npm run migrate:bootstrap` returned the same missing-configuration error before any Feishu request. |
| Canary | **NOT RUN** | No manifest, schema fingerprint, or authorized live configuration was available. |
| Full batch | **NOT RUN** | Canary precondition was not met. |
| Idempotency rerun | **NOT RUN** | No live batch was executed. |
| Redacted verification | **BLOCKED** | No target counts, schema fingerprint, readback, or Base link can be truthfully recorded. |

The package-level apply and verify entry points were also invoked with the
supported workspace argument form; both stopped at the same configuration
gate. Therefore this attempt produced **zero Feishu HTTP calls and zero
Feishu writes**.

## CLI contract follow-up

The initial blocked attempt exposed a compatibility gap between the attached
runbook and the migration CLI: `--output`, `--schema-only`, and `--scope` were
not accepted, and the root npm scripts did not forward the flags correctly.
That gap was fixed in `e34843d`. The root commands were re-run without live
configuration and now reach the intended fail-closed gate:

- `migrate:plan -- --output .artifacts/feishu-migration` → missing
  `FEISHU_APP_ID` before client construction.
- `migrate:apply -- --schema-only --run-id blocked-cli-contract` → the same
  missing-configuration gate.
- `migrate:verify -- --run-id blocked-cli-contract --scope canary` → the same
  missing-configuration gate.

These checks produced no Feishu HTTP calls and no writes; they prove CLI
contract compatibility only, not live migration success.

## Safe next action

Run the migration only after the owner supplies the live configuration through
the server/CLI environment, then capture counts, schema fingerprint, canary,
full verification, idempotency, and the target Base link in a new redacted
report. Do not paste credential values into chat, Git, artifacts, or logs.
