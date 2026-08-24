# FEISHU-V3 Goal

## Objective

Execute the Feishu new Base migration and AI Business OS cutover with a clean,
auditable baseline. Useful data from the legacy Feishu Base and eight source
spreadsheets may be consolidated into the NEW test Base only through additive,
canary-gated, idempotent, readback-verified writes. AI Business OS CONNECTED
mode must eventually read only from that NEW test Base and honestly present
`CONNECTED TEST BASE` or `BLOCKED`.

## Frozen Baseline and Isolation

- Frozen code authority: `origin/main@729108d8059e3e143194a05f43e510af3587d385`.
- Active branch: `codex/busos-feishu-v3`.
- Active isolated worktree: `C:\Users\Catcher\AppData\Local\Temp\codex-busos-feishu-v3`.
- This task preserves the current dirty source checkout and records control
  state only.

## Source Inventory Scope

- Legacy Feishu Base: read-only source during migration planning and manifest
  generation.
- Eight source spreadsheets: read-only source during migration planning and
  manifest generation.
- Feishu Drive and Wiki references: read-only source context only.
- NEW test Base: the only runtime target for future schema bootstrap and
  migration writes.

## Target Base API and Secret Handling

- Target Base API endpoint: `https://open.feishu.cn`.
- The deployment-specific NEW test Base identifier is supplied only at live
  migration time via `FEISHU_TARGET_BASE_TOKEN`; the repository contains no
  non-secret instance URL to record, so no Base instance is guessed here.
- The configured NEW test Base table IDs are supplied only at live migration
  time via environment variables.
- No app token, table ID, credential, access token, or personal raw payload is
  recorded in Git, manifests, tests, reports, or logs.

## Write Authority and Safety Rules

- No delete rule: do not delete, move, rename, or destructively convert any
  table, field, or record in the old Base, source spreadsheets, Drive, Wiki, or
  NEW test Base.
- Additive-only schema rule: create missing compatible tables/fields only.
  Existing incompatible field types must stop the run before writes.
- Canary rule: the first real write is canary only, with at most 5
  high-confidence records per target table, and every canary write must pass
  exact Migration Key readback verification before full migration is allowed.
- Idempotency rule: unchanged `source_payload_hash` must SKIP; changed payloads
  default to `NEEDS_REVIEW` and must not be silently overwritten.
- Runtime honesty rule: CONNECTED mode must never silently fall back to DEMO
  data.
- Negative scope: no real message sending, automatic booking confirmation,
  permission change, or production deployment.

## Lane Ownership

| Lane | Ownership | Constraints |
| --- | --- | --- |
| `L0 Integration Coordinator` | Baseline refresh, task state, serialized integration, final verification | Sole merge authority |
| `L1 Migration Tool` | Manifest, source reads, normalization, dedupe, apply, verify logic | No live writes |
| `L2 Feishu Schema/Live Migration` | Target schema bootstrap, canary, batch migration, readback | Exclusive real-write owner |
| `L3 Contracts/Repository` | New contracts, repository adapter, fake client, tests | Frozen fixtures only |
| `L4 Workspace API/Scheduling` | Server read APIs, scheduling, outreach draft logic | Depends on L3 interfaces |
| `L5 Operator UI` | Business Data, scheduling, outreach surfaces | Depends on L4 contracts |

Integration order is frozen as `L1 → L3 → L4 → L5 → L2 live evidence → L0 closure`.
Lane workers do not self-merge and do not operate outside owned paths.

## STOP Conditions

Stop the Goal immediately and report evidence if any of the following occurs:

1. `origin/main` changes after lanes start and rebasing would alter owned files.
2. Source inventory differs by more than 10% from the plan baseline, or a source
   table disappears.
3. The NEW test Base contains an incompatible field type for a required
   canonical field.
4. Any write targets the old Base, source spreadsheets, Drive, or Wiki.
5. Canary has any readback mismatch, untracked record, duplicate Migration Key,
   or partial registry failure.
6. Target Base record count changes from an external actor during the exclusive
   live migration window.
7. A credential, access token, or personal raw payload is written to Git or log
   output.
8. A batch returns partial success that cannot be reconciled by exact Migration
   Key readback.
9. OS CONNECTED mode can silently fall back to demo data.
10. Completing the work would require deleting tables/fields/records, sending
    real messages, modifying permissions, or deploying production.

Ordinary type/test/build failures are not STOP conditions; fix them within the
owning lane and rerun the relevant gate.
