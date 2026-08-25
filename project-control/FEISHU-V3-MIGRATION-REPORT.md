# BUSOS Feishu v3 Drive Discovery Resume Report

Runbook: `BUSOS-R2-FEISHU-V3-AUTHORIZED-CONFIG-RESUME-01`

This report records the current controlled run. Owner-provided resource URLs,
tokens, credentials, raw Feishu responses, record IDs, and personal payloads
are intentionally omitted.

## A. VERDICT

`CONFIGURATION_BLOCKED`

The migration package now accepts a Drive-folder source configuration and a
target Base configuration from the runtime process. The standalone
read-only inventory command was invoked in the current local process, but the
rotated runtime credentials and required runtime resource fields were not
present. It stopped before Feishu client construction and before any HTTP
request.

This is a pre-HTTP configuration blocker, not an observed
`AUTHORIZATION_BLOCKED` response. The previously exposed App Secret was not
read or used. No guessed source token or DEMO fallback was used.

## B. AUTHORITY / SHA CHAIN

- `BRANCH`: `codex/busos-feishu-v3`
- `PRE_RESUME_BRANCH_SHA`: `289a9807f14b66cd3e079d6b1b1bc74f53d47dfc`
- `IMPLEMENTATION_SHA`: `a3ca81b5729e586589ee81d207466172411df2c4`
- `TARGET_BRANCH_POLICY`: current branch only; no main merge and no force push
- `COORDINATOR_WORKTREE`: `C:\Users\Catcher\AppData\Local\Temp\codex-busos-feishu-v3`
- `MAIN_MERGE`: `NO`
- `DEPLOYMENT`: `NO`

The implementation started from the requested origin branch baseline. The
local coordinator worktree was isolated; the initial user worktree remained
dirty and was not rewritten.

## C. CONFIGURATION SAFETY

The runtime contract now supports:

- `FEISHU_SOURCE_DRIVE_FOLDER_TOKEN` as a raw token or Drive-folder resource
  URL;
- `FEISHU_TARGET_BASE_TOKEN` as a raw token or Base resource URL;
- optional explicit `FEISHU_SOURCE_BASE_TOKEN` and exactly eight explicit
  `FEISHU_SOURCE_SHEET_*_TOKEN` overrides when a Drive folder is configured;
- value-free configuration diagnostics and bounded, fail-closed errors.

Current process check:

| Runtime field | Status |
| --- | --- |
| `FEISHU_APP_ID` | `MISSING` |
| rotated `FEISHU_APP_SECRET` | `MISSING` |
| `FEISHU_SOURCE_DRIVE_FOLDER_TOKEN` | `MISSING` |
| `FEISHU_TARGET_BASE_TOKEN` | `MISSING` |
| explicit source Base / Sheet overrides | `NOT_REQUIRED_IN_DRIVE_MODE` |

No local authorization document was copied into this worktree, staged, or
used as a fallback. No `.env`, credential file, owner URL, raw token, or raw
response was added to the repository or report.

## D. SOURCE / TARGET IDENTITY

`NOT VERIFIED — CONFIGURATION_BLOCKED BEFORE HTTP`

The live source candidate set was not fetched, so live counts are zero only as
an unattempted state and are not an inventory result. The implementation and
synthetic tests cover the required source identity gate: exactly one legacy
Base, exactly eight source workbooks, recursive folder traversal, returned
type/token/name/URL classification, explicit override matching, pagination
failure, and permission denial.

The target allowlist and target Base identity were not checked live. The
target table metadata endpoint was not called.

## E. READ-ONLY PREFLIGHT

`BLOCKED` before Feishu client construction.

The CLI produced a redacted inventory artifact with only safe status/count
fields and `feishu_writes: 0`. No Drive listing request was made, so no
authorization response was observed in this run.

## F. DRY-RUN / INVENTORY

Live result: `INVENTORY_BLOCKED` with blocker `CONFIGURATION_BLOCKED`.

The standalone command has been added as `npm.cmd run migrate:inventory` and
uses the same in-memory preflight that now gates plan, schema bootstrap,
apply, and verify. Its redacted output contains no resource token, URL,
credential, raw response, or candidate payload.

## G. SCHEMA / CANARY / READBACK

`NOT RUN` — inventory, identity, and target allowlist gates did not pass.

## H. FULL MIGRATION

`NOT RUN` — no schema write, record create, record update, or source mutation
was attempted.

## I. IDEMPOTENCY

`NOT RUN` — there was no live batch to apply a zero-write second run against.

## J. EXACT FEISHU HTTP / READ / WRITE COUNTS

| Scope | HTTP total | Reads | Writes |
| --- | ---: | ---: | ---: |
| live Feishu API in this run | `0` | `0` | `0` |
| source Drive / legacy Base / workbooks | `0` | `0` | `0` |
| target Base | `0` | `0` | `0` |
| unauthorized target | `0` | `0` | `0` |

Synthetic fixtures and mocked client tests are local tests and do not count as
Feishu HTTP.

## K. VERIFICATION

- `npm.cmd run test --workspace=@busos/feishu-migration`: exit `0`; 10 test
  files, 72 passed, 0 failed.
- `npm.cmd run typecheck --workspace=@busos/feishu-migration`: exit `0`.
- `npm.cmd run build`: exit `0`.
- `npm.cmd run smoke`: exit `0`; local smoke emitted
  `SMOKE_FEISHU_V3_OK`.
- `npm.cmd run migrate:inventory` without runtime credentials: exit `1`, safe
  `INVENTORY_BLOCKED`, `feishu_writes: 0`.
- `git diff --check`: pass before implementation commit.

The repository-wide `npm.cmd run verify` was retried with the required
isolated-worktree read permission. Typechecks passed and the migration package
passed; the overall command stopped on two unrelated existing
`service-agent-candidate` integration assertions receiving mojibake instead of
the canonical Chinese fixture. This migration change did not modify that
workspace. Build and smoke were run separately and passed.

## L. SECRET / FILE SAFETY

- previously exposed App Secret: `NOT USED`;
- rotated secret: `NOT PRESENT IN CURRENT PROCESS`;
- owner-provided resource values: runtime-only, not persisted or printed;
- candidate reports: names sanitized, types/counts only;
- raw Feishu response bodies and personal payloads: not persisted;
- source/legacy resources: read-only path only;
- target writes before all gates: `0`.

## M. CHANGED FILES

Implementation commit `a3ca81b5729e586589ee81d207466172411df2c4` contains only
the requested migration package, tests, and CLI wiring:

- `package.json`
- `packages/feishu-migration/package.json`
- `packages/feishu-migration/src/cli.ts`
- `packages/feishu-migration/src/config-document.ts`
- `packages/feishu-migration/src/drive-inventory.ts`
- `packages/feishu-migration/src/feishu-client.ts`
- `packages/feishu-migration/src/types.ts`
- `packages/feishu-migration/tests/cli.test.ts`
- `packages/feishu-migration/tests/config-document.test.ts`
- `packages/feishu-migration/tests/source-readers.test.ts`

This report and the closure are separate handoff documentation. No local
authorization file is in Git.

## N. AUTHORIZATION HANDOFF

If the next authorized run reaches Drive and the bot cannot access the owner
folder, the required honest result is `AUTHORIZATION_BLOCKED` with the exact
returned missing scope, the `bot-tenant-access-token` identity, and the
required sharing/identity change. The implementation does not guess tokens or
fall back to explicit overrides after that failure.

The known Drive metadata requirement is
`drive:drive.metadata:readonly`; it is reported only when the live API returns
the permission denial or when the safe client fallback is exercised.

## O. DEPLOYMENT / HANDOFF

- `main` merged: `NO`
- production deployed: `NO`
- real messages sent: `NO`
- old Feishu Base modified: `NO`
- Feishu writes: `0`
- Owner Review: `PENDING`

Next authorized action: inject the rotated App ID/Secret and the two runtime
resource fields only through the approved local runtime process, rerun the
read-only inventory, and stop with the exact authorization requirement if the
Drive folder is not visible to the bot identity. Only after inventory,
source/target identity, and target allowlist pass may the existing schema,
per-table canary, readback, full migration, and idempotency gates resume.
