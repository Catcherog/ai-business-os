# Feishu Drive Discovery and Migration Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the over-constrained source-token gate with a read-only Drive inventory that discovers exactly one legacy Base and eight source workbooks, verifies the explicit target allowlist, and only then unlocks the existing migration gates.

**Architecture:** Keep credentials and resource tokens in the current runtime process only. Extend the server-only `FeishuClient` with a paginated `drive/v1/files` GET; keep recursive traversal, candidate classification, explicit override validation, target allowlist checks, and redacted reporting in a separate `drive-inventory.ts` module. The CLI runs the same preflight for a standalone `inventory` command and before `plan`; existing bootstrap/apply/verify remain write-capable only after a successful redacted preflight artifact and continue to use the resolved source tokens in memory.

**Tech Stack:** TypeScript ES2022, Node `fetch`, Vitest, existing `@busos/feishu-migration` package and `vite-node` CLI.

## Execution status — 2026-08-25

- [x] Tasks 1–4 implemented and committed; the request-count instrumentation
  and regression fixes are on `c151300d73380f5662e78791899366dd9dfc8e79`.
- [x] Authorized local credentials authenticated successfully; live Drive
  inventory passed with 388 resources, 54 folders, one legacy Base, and eight
  source workbooks.
- [x] Read-only plan passed with 903 source records and a stable target schema
  fingerprint; live totals were 258 HTTP / 255 reads / 0 writes across the
  fresh inventory, plan, and schema processes.
- [x] Schema bootstrap was attempted as the next gate and stopped without
  writes on `Customers.Source Channel` / `FIELD_OPTIONS_MISMATCH`.
- [ ] Per-table canary, readback, full migration, and idempotency remain
  intentionally unrun because the schema gate is blocked.

The current blocker is `SCHEMA_BLOCKED`, not a credential or authorization
failure. The existing target select options need an owner-approved contract
decision before any schema correction or migration write. Credential rotation
is not required.

## Global Constraints

- Source Drive, legacy Base, and source workbooks are read-only.
- Target Base is the only permitted write target, and target writes remain `0` until discovery, source identity, and target allowlist checks pass.
- Accept `FEISHU_SOURCE_DRIVE_FOLDER_TOKEN` and `FEISHU_TARGET_BASE_TOKEN`; `FEISHU_APP_ID` and the authorized local `FEISHU_APP_SECRET` remain runtime-only.
- Explicit `FEISHU_SOURCE_BASE_TOKEN` and exactly eight `FEISHU_SOURCE_SHEET_*_TOKEN` variables are optional overrides when a Drive folder is configured; they must match discovered resources and cannot bypass zero/multiple-candidate or permission/pagination blockers.
- Stop on zero or multiple legacy Base candidates, any workbook count other than eight, missing pagination continuation, permission denial, credential failure, source/target identity mismatch, or target allowlist mismatch.
- Logs and artifacts may contain only redacted candidate names, resource types, counts, statuses, safe error codes, and required scope/identity names; never tokens, URLs containing tokens, credentials, raw responses, record IDs, or personal payloads.
- Do not merge `main`, deploy, send messages, modify old/source resources, or use the previously exposed App Secret.

---

### Task 1: Relax runtime configuration without weakening explicit mode — COMPLETE

**Files:**
- Modify: `packages/feishu-migration/src/config.ts`
- Modify: `packages/feishu-migration/src/config-document.ts`
- Modify: `packages/feishu-migration/tests/source-readers.test.ts`
- Modify: `packages/feishu-migration/tests/config-document.test.ts`

**Interfaces:**
- `FeishuMigrationConfig` produces `sourceDriveFolderToken?: string`, `sourceBaseToken?: string`, `sourceSheets: SourceSheetConfig[]`, `targetBaseToken: string`, and optional `targetBaseUrl?: string`.
- `loadFeishuMigrationConfig(env)` accepts a drive-folder route with zero explicit Sheet variables, or the legacy explicit route with a source Base and exactly eight Sheet variables.

- [ ] **Step 1: Write the failing tests**

Add tests proving:

```ts
const env = {
  FEISHU_APP_ID: 'app',
  FEISHU_APP_SECRET: 'rotated-secret-test-fixture',
  FEISHU_SOURCE_DRIVE_FOLDER_TOKEN: 'https://tenant.feishu.cn/drive/folder/folder-source',
  FEISHU_TARGET_BASE_TOKEN: 'https://tenant.feishu.cn/base/base-target?table=tbl-target',
};

const config = loadFeishuMigrationConfig(env);
expect(config.sourceDriveFolderToken).toBe('folder-source');
expect(config.targetBaseToken).toBe('base-target');
expect(config.sourceSheets).toEqual([]);
```

Also add a regression assertion that the old explicit eight-sheet environment remains valid, and that a drive-folder configuration with an incomplete explicit override fails by field name only.

- [ ] **Step 2: Run the focused tests to verify RED**

Run: `npm.cmd run test --workspace=@busos/feishu-migration -- tests/source-readers.test.ts tests/config-document.test.ts`

Expected: FAIL because the current loader requires `FEISHU_SOURCE_BASE_TOKEN` and exactly eight Sheet variables and does not normalize resource URLs.

- [ ] **Step 3: Implement the minimal configuration contract**

Add URL-structure normalization for `/drive/folder/<token>` and `/base/<token>`, keep raw token inputs valid, require the target token, and require either a source Drive folder or explicit source Base. Permit zero Sheet overrides only for Drive discovery; if any Sheet override is present, require exactly eight. Extend the document parser with `FEISHU_SOURCE_DRIVE_FOLDER_TOKEN` and optional `FEISHU_TARGET_BASE_URL` aliases while keeping diagnostics value-free.

- [ ] **Step 4: Run the focused tests to verify GREEN**

Run: `npm.cmd run test --workspace=@busos/feishu-migration -- tests/source-readers.test.ts tests/config-document.test.ts`

Expected: PASS with the existing explicit-mode tests and the new Drive-mode tests.

- [ ] **Step 5: Commit the configuration contract**

Run: `git add packages/feishu-migration/src/config.ts packages/feishu-migration/src/config-document.ts packages/feishu-migration/tests/source-readers.test.ts packages/feishu-migration/tests/config-document.test.ts && git commit -m "feat: accept Drive-backed migration configuration"`

Expected: one task-owned commit; no local config file is staged.

### Task 2: Add server-only, read-only Drive pagination and safe authorization errors — COMPLETE

**Files:**
- Modify: `packages/feishu-migration/src/feishu-client.ts`
- Modify: `packages/feishu-migration/tests/source-readers.test.ts`

**Interfaces:**
- `DriveFile` contains internal `token`, `type`, `name`, optional `url`, and optional `parent_token`.
- `DriveFilesPage` contains `files`, `has_more`, and optional `next_page_token`.
- `FeishuClient.listDriveFiles(folderToken, pageToken?)` performs one GET to `/open-apis/drive/v1/files` and returns only typed page data.
- `FeishuAuthorizationError` exposes only `status`, `code`, `missingScopes`, and `identityKind`; it never stores or prints the response body.

- [ ] **Step 1: Write the failing transport tests**

Add fixtures for a first Drive page, a continuation page, a missing continuation token, and a 403 permission response. Assert every Drive request is `GET`, the page token is forwarded only to the same folder, and the thrown authorization error exposes `drive:drive.metadata:readonly` as the required scope when the API omits a scope list.

- [ ] **Step 2: Run the focused transport tests to verify RED**

Run: `npm.cmd run test --workspace=@busos/feishu-migration -- tests/source-readers.test.ts`

Expected: FAIL because `FeishuClient.listDriveFiles` and the safe authorization error do not exist.

- [ ] **Step 3: Implement the minimal read-only client method**

Add the Drive page types and a GET-only method. Extend the safe error classification so HTTP 401/403 and known permission responses become `FeishuAuthorizationError` with `identityKind: 'bot-tenant-access-token'`, the fine-grained Drive metadata scope name, and no message/body/token fields. Do not add POST/PUT/PATCH/DELETE methods beyond the existing migration methods.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm.cmd run test --workspace=@busos/feishu-migration -- tests/source-readers.test.ts`

Expected: PASS; the fixture records zero non-auth write methods.

- [ ] **Step 5: Commit the client read path**

Run: `git add packages/feishu-migration/src/feishu-client.ts packages/feishu-migration/tests/source-readers.test.ts && git commit -m "feat: add read-only Drive file listing"`

Expected: task-owned commit with no raw response fixtures containing real values.

### Task 3: Implement recursive Drive discovery, classification, overrides, and target allowlist — COMPLETE

**Files:**
- Create: `packages/feishu-migration/src/drive-inventory.ts`
- Create: `packages/feishu-migration/tests/drive-inventory.test.ts`
- Modify: `packages/feishu-migration/src/inventory.ts`
- Modify: `packages/feishu-migration/src/types.ts`

**Interfaces:**
- `discoverDriveSourceInventory(options)` returns `{ config, report, sourceResources, legacyBase, sourceSheets }` in memory.
- `DriveInventoryReport` contains only redacted candidate `{name,type}` entries, counts, `verdict`, and safe blocker fields.
- `assertTargetAllowlist(config)` validates a non-empty target token and, when `targetBaseUrl` is supplied, requires URL-embedded Base token equality without logging either value.

- [ ] **Step 1: Write failing classifier and traversal tests**

Cover these exact behaviors:

1. Two pages and a nested folder produce one deduplicated resource set.
2. `type: 'bitable'` or a `/base/` URL is a Base candidate; `type: 'sheet'` or a `/sheets/` URL is a workbook candidate.
3. Exactly one Base and exactly eight workbooks returns resolved source tokens.
4. Zero/multiple Base candidates, seven/nine workbooks, missing `next_page_token`, repeated page keys, and permission errors throw safe blockers.
5. Eight explicit Sheet overrides preserve their keys but must match discovered workbook tokens; mismatches stop.
6. Candidate output includes redacted names/types/counts only and does not contain any fixture token, URL, credential, or response body.
7. Target URL/token mismatch blocks before the target client is read.

- [ ] **Step 2: Run the focused tests to verify RED**

Run: `npm.cmd run test --workspace=@busos/feishu-migration -- tests/drive-inventory.test.ts`

Expected: FAIL because the module and classifier do not exist.

- [ ] **Step 3: Implement bounded recursive discovery**

Use a queue of `{folderToken, depth}` and a `visitedPages` set keyed by folder/page. Retry a missing continuation token at most three times, then throw a pagination blocker. Recurse only into returned `folder` resources with a token; deduplicate by internal type/token. Classify candidates from returned type first and URL path second. Never infer a token from a name. Resolve explicit overrides only after discovery has passed the exact candidate-count gates.

- [ ] **Step 4: Implement redacted report shaping and target allowlist**

Sanitize candidate names by removing control characters, replacing URL-looking substrings with `[REDACTED_URL]`, and truncating display text. Report counts and safe statuses only. Keep all tokens in local memory for the next migration step. Require the target token, and if a target URL is configured compare its URL-structured token to the target token before reading target tables.

- [ ] **Step 5: Run focused tests to verify GREEN**

Run: `npm.cmd run test --workspace=@busos/feishu-migration -- tests/drive-inventory.test.ts tests/source-readers.test.ts`

Expected: PASS with all blocker cases and zero simulated write methods.

- [ ] **Step 6: Commit discovery**

Run: `git add packages/feishu-migration/src/drive-inventory.ts packages/feishu-migration/tests/drive-inventory.test.ts packages/feishu-migration/src/inventory.ts packages/feishu-migration/src/types.ts && git commit -m "feat: discover Feishu migration sources from Drive"`

Expected: task-owned commit; no resource token is written to code or report fixtures.

### Task 4: Gate the CLI, persist only the redacted inventory report, and keep migration writes behind it — COMPLETE

**Files:**
- Modify: `packages/feishu-migration/src/cli.ts`
- Modify: `packages/feishu-migration/tests/cli.test.ts`
- Modify: `package.json`
- Modify: `packages/feishu-migration/package.json`

**Interfaces:**
- Add CLI command `inventory`; `npm.cmd run migrate:inventory` invokes it.
- `runInventory` writes only `.artifacts/feishu-migration/source-inventory.json` containing the redacted report.
- `runPlan` calls the same in-memory preflight before target table/schema reads and uses its resolved source tokens; no fallback to guessed tokens occurs after a Drive authorization error.

- [ ] **Step 1: Write failing CLI tests**

Assert `parseCliArgs(['inventory', '--output', '.artifacts/feishu-migration'])` parses, missing runtime configuration reports field names only, a mocked successful inventory writes a report without token strings, and a mocked authorization error returns exit `1` with `AUTHORIZATION_BLOCKED`, the required scope, and identity kind.

- [ ] **Step 2: Run the focused CLI tests to verify RED**

Run: `npm.cmd run test --workspace=@busos/feishu-migration -- tests/cli.test.ts`

Expected: FAIL because `inventory` and the preflight gate do not exist.

- [ ] **Step 3: Implement the inventory command and shared preflight gate**

Add `inventory` to the parser and usage. Load runtime configuration only from the explicit `--config-file` or current process environment. Construct one server-only client, run Drive discovery, run target allowlist validation, read target table metadata only after the allowlist passes, write the redacted report, and map safe blockers to exit `1`. Do not print candidate tokens or raw errors.

- [ ] **Step 4: Put the gate before the existing plan/bootstrap/apply/verify flow**

Refactor the existing command path so source resolution is performed before `readTargetSnapshot`, schema fingerprint, schema bootstrap, canary, full apply, or verify. Apply/verify must require the successful redacted inventory artifact and rehydrate source tokens only in memory. Preserve explicit-only mode when no Drive folder is configured.

- [ ] **Step 5: Run focused and package verification**

Run: `npm.cmd run test --workspace=@busos/feishu-migration`; then `npm.cmd run typecheck --workspace=@busos/feishu-migration`.

Expected: all package tests pass, typecheck exits `0`, and mocked inventory runs record zero migration writes.

- [ ] **Step 6: Commit CLI gating**

Run: `git add package.json packages/feishu-migration/package.json packages/feishu-migration/src/cli.ts packages/feishu-migration/tests/cli.test.ts && git commit -m "feat: gate migration on Drive inventory"`

Expected: task-owned commit with only the redacted artifact path added to the runtime flow.

### Task 5: Execute the authorized read-only inventory and record the handoff — BLOCKED AT SCHEMA GATE

**Files:**
- Modify: `project-control/FEISHU-V3-MIGRATION-REPORT.md`
- Modify: `project-control/FEISHU-V3-CLOSURE.md`

**Interfaces:**
- Runtime-only inputs are `FEISHU_APP_ID`, the authorized local `FEISHU_APP_SECRET`, `FEISHU_SOURCE_DRIVE_FOLDER_TOKEN`, and `FEISHU_TARGET_BASE_TOKEN`; no credential value is printed or persisted.
- The report records verdict, candidate counts/types/names in redacted form, target identity/allowlist status, exact read/write counts, and blocker scope/identity without tokens.

- [x] **Step 1: Run the standalone read-only inventory**

Run from the coordinator worktree with the existing authorized credential
injected only by the local runtime process:

```powershell
npm.cmd run migrate:inventory -- --output .artifacts/feishu-migration
```

Observed: `INVENTORY_PASS`, exactly one legacy Base candidate, exactly eight
workbook candidates, target allowlist pass, and `57 / 56 / 0` HTTP/read/write
counts.

- [x] **Step 2: Preserve authorization stop behavior**

Drive listing did not return a permission denial. The implementation still
records `AUTHORIZATION_BLOCKED`, `identityKind`, and the exact returned scope
without retrying with guessed tokens or explicit overrides.

- [x] **Step 3: Run the existing gates in order until the first blocker**

`migrate:plan` completed with 903 source records. Schema-only bootstrap then
returned `SCHEMA_BLOCKED` for `Customers.Source Channel` /
`FIELD_OPTIONS_MISMATCH` with `writes: 0`. Canary, readback, full apply, full
verify, and the second apply/verify idempotency check were not run.

- [x] **Step 4: Run secret scans and verify no write requests outside the target gates**

Package tests, typecheck, build, smoke, `git diff --check`, and the changed-file
secret/resource scan passed. Repository-wide verify still reports two existing
`service-agent-candidate` mojibake assertions. Source/Drive writes and target
writes were `0`.

- [x] **Step 5: Commit and push only the task-owned implementation/report files**

Run `git diff --check`, stage the exact changed files, commit, push
`codex/busos-feishu-v3` without force, then verify `git ls-remote origin
refs/heads/codex/busos-feishu-v3 refs/heads/main`. Do not merge `main` or
deploy. The code/test commit was already pushed; the report/closure update is
the final task-owned handoff change for this run.

## Self-review checklist

- [ ] Every requirement has a test and implementation task.
- [ ] No task permits Drive fallback or guessed source tokens after authorization failure.
- [ ] No report step persists tokens, URLs containing tokens, credentials, raw responses, or personal payloads.
- [ ] Every read path is GET-only; migration write paths remain downstream of the preflight gate.
- [ ] The plan contains no unresolved placeholder or unbounded retry instruction.
