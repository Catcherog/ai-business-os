# BUSOS Feishu v3 Migration Resume Report

Runbook: `BUSOS-FEISHU-V3-MIGRATION-RESUME-02`

## Authoritative post-resume closure — 2026-08-25

This addendum is the authoritative result for `BUSOS-FEISHU-V3-SCHEMA-RESUME-03`.
The pre-resume report below is retained as historical evidence; its earlier
`SCHEMA_BLOCKED` verdict is superseded by this closure.

### Final verdict

`MIGRATION_PASS`

Inventory, target identity/allowlist, schema, canary, canary readback, full
migration, full readback, and same-batch idempotency all passed. The 562
`NEEDS_REVIEW` decisions were retained with redacted reasons and were not
silently written. Legacy/source resources remained read-only; all writes were
confined to the allowlisted target Base.

### Authority and boundary

- Branch: `codex/busos-feishu-v3`
- PRE / expected remote SHA: `a19bbcc66105c2b53f5c7165535f09d3a3fdafef`
- POST commit SHA: `POST_COMMIT_SHA_FILLED_AFTER_COMMIT`
- Remote feature SHA: `REMOTE_FEATURE_SHA_FILLED_AFTER_PUSH`
- Main before/after: `729108d8059e3e143194a05f43e510af3587d385`
- Main merged: `NO`; deployed: `NO`
- Initial dirty user worktree was preserved; implementation ran in the
  isolated coordinator lane.
- No force push, reset, checkout, merge, deployment, or Git repack repair was
  performed. The shared `bad tree object` / geometric-repack warning remains
  an environment warning.

### Configuration and discovery

- Credential verdict: `CREDENTIAL_VALID`; authorized local runtime values were
  consumed in memory only and no App Secret was persisted or printed.
- Runtime accepts `FEISHU_SOURCE_DRIVE_FOLDER_TOKEN` and
  `FEISHU_TARGET_BASE_TOKEN`.
- Explicit source token configuration remains an optional override.
- Inventory: `INVENTORY_PASS`; resources `388`, folders `54`, exactly one
  legacy Base candidate, exactly eight source workbooks.
- Target allowlist: `PASS`; target identity verified; target table count `17`.

| Candidate/workbook | Type |
| --- | --- |
| 泽怀影像全流程业务管理中台 | `shortcut` legacy Base candidate |
| 成品发布情况表 | `sheet` |
| 项目统计表 | `sheet` |
| 化妆资源 | `sheet` |
| 客户资源库 | `sheet` |
| 模特资源 | `sheet` |
| 场地资源 | `sheet` |
| 道具资源 | `sheet` |
| 服装资源 | `sheet` |

### Plan and schema

- Run ID: `busos-v3-schema-resume-03`.
- Planned source records: `903`; decisions: `661`.
- Expected decisions: `CREATE 99`, `UPDATE 0`, `SKIP 0`, `NEEDS_REVIEW 562`.
- Target-before record count: `21`.
- Final schema fingerprint:
  `44796e74f99b9eaea4e9daa4858c164264b5c48c31671b444bcf5ff9d8941066`.
- Global schema status: `UPDATED`; schema verdict: `PASS`; created tables: `0`.
- Schema writes: `179` (`178` field additions plus one additive option
  update); no field/table delete, rename, overwrite, or reorder.

`Customers.Source Channel` readback:

- Feishu type: `3`.
- Expected names: `BASE`, `COLLATOR`, `DOCUMENT`, `OTHER`, `SHEET`.
- Actual names: `BASE`, `COLLATOR`, `DOCUMENT`, `FEISHU`, `OTHER`, `SHEET`,
  `WEB`, `WECHAT`.
- Missing expected names: none; preserved extras: `FEISHU`, `WEB`, `WECHAT`.
- Classification: `SEMANTIC_SUBSET_PASS`.
- Additive options: `BASE`, `COLLATOR`, `DOCUMENT`, `SHEET`.
- Immediate schema readback: `PASS`.

Required existing target table preflights:

| Table | Verdict |
| --- | --- |
| 数据表 | `PASS` |
| Customers | `PASS` |
| Projects | `PASS` |
| Business Events | `PASS` |
| Tasks | `PASS` |
| Evidence | `PASS` |
| BUSOS Asset | `PASS` |

Unknown or ambiguous Source Channel values were routed to review; no unknown
source value created a target option.

### Canary and readback

Canary dry-run selected `21` records: `CREATE 20`, `REVIEW 1`.

| Metric | Count |
| --- | ---: |
| Attempted manifest records | 21 |
| Net business records created | 20 |
| Updated | 0 |
| Final apply skips | 7 |
| Review | 1 |
| Failed at closure | 0 |
| Business writes | 20 |
| Registry writes | 20 |

The final resume process was `APPLIED 13 / SKIP 7 / NEEDS_REVIEW 1 /
FAILED 0`; skips were existing migration-key-fenced records. Two earlier
canary attempts stopped fail-closed on live display-name projection and date
type issues; the partial state was reconciled by readback before continuation.
No records were deleted.

Canary readback: `PASS`; planned `21`, applied `20`, unique keys true, payload
hashes/required fields/schema fingerprint verified, field mismatches `0`,
dangling canonical IDs `0`.

### Full migration, readback, and idempotency

First full apply:

| Metric | Count |
| --- | ---: |
| Applied | 79 |
| Updated | 0 |
| Skipped | 20 |
| Needs review | 562 |
| Failed | 0 |
| Business writes | 79 |
| Registry writes | 79 |
| Untracked writes | 0 |
| Schema conflicts | 0 |

Full readback: `PASS`; `99` applied records verified (20 canary + 79 full).
Final target counts: Content Research `21`, Customers `71`, Projects `7`,
Resources `9`. Unique migration keys, payload hashes, required fields, and
schema fingerprint passed; mismatches and dangling canonical IDs were `0`.

Same-input/same-run-id idempotency: `PASS` — `APPLIED 0`, `SKIP 99`,
`NEEDS_REVIEW 562`, `FAILED 0`, business writes `0`, registry writes `0`,
Feishu writes `0`. Final readback remained `PASS` and counts were stable.

### Request counters

Each row is the redacted counter emitted by one live CLI process. HTTP includes
the credential-token request; reads exclude it; writes count attempted
non-credential mutations, including fail-closed attempts.

| Scope | HTTP | Reads | Writes |
| --- | ---: | ---: | ---: |
| Authority baseline supplied before this run | 258 | 255 | 0 |
| Recorded cumulative before canary | 970 | 780 | 191 |
| Canary dry-run before first attempt | 138 | 137 | 0 |
| Canary fail-closed attempt 1 | 160 | 139 | 20 |
| Canary fail-closed attempt 2 | 225 | 164 | 60 |
| Resume canary dry-run | 138 | 137 | 0 |
| Final canary apply | 162 | 148 | 13 |
| Canary readback | 149 | 148 | 0 |
| First full apply | 307 | 148 | 158 |
| Full readback | 149 | 148 | 0 |
| Idempotency rerun | 149 | 148 | 0 |
| Final full readback | 149 | 148 | 0 |
| Post-full inventory | 57 | 56 | 0 |
| Recorded cumulative through closure | **2753** | **2301** | **442** |

One interrupted pre-resume dry-run had no write request and no persisted
counter; the cumulative row is therefore the exact sum of emitted/retained
process counters and conservative for HTTP/read requests. It does not affect
the zero-write idempotency or final verdict.

### Verification and artifacts

- Feishu migration package: `83/83 PASS` across `10` test files.
- Repository typecheck, build, smoke, and product integration smoke: `PASS`.
- Browser bundle secret scan: `PASS` (`X01-C`, product-integration boundary,
  `SMOKE_FEISHU_V3_OK`). Changed-file secret/resource scan: `PASS`, zero
  unclassified credentials.
- Repository-wide test command: exit `1` only on the two pre-existing mojibake
  assertions in `packages/service-agent-candidate/tests/service-agent-bridge.test.ts`;
  those files were not changed. No migration or operator test failed.
- Report: `project-control/FEISHU-V3-MIGRATION-REPORT.md`.
- Closure: `project-control/FEISHU-V3-CLOSURE.md`.
- Redacted manifest: `.artifacts/feishu-v3-migration-resume/manifest.json`.
- First full report: `.artifacts/feishu-v3-migration-resume/full-first.json`.
- Idempotency report: `.artifacts/feishu-v3-migration-resume/full.json`.
- Final readback: `.artifacts/feishu-v3-migration-resume/verify-full.json`.
- Schema report: `.artifacts/feishu-v3-schema-resume-3/schema.json`.
- Post-full inventory: `.artifacts/feishu-v3-post-full-inventory/source-inventory.json`.

All tracked evidence is redacted; no credential, token, URL, record ID, or raw
personal payload is stored.

## Historical pre-resume record

This report records the authorized local-credential run on 2026-08-25.
Credentials, resource URLs, tokens, raw Feishu responses, record IDs, and
personal payloads are intentionally omitted.

## A. VERDICT

`SCHEMA_BLOCKED`

Credential verdict: `CREDENTIAL_VALID`. The authorized local runtime
authenticated successfully, listed the owner Drive folder, read the target
Base identity/schema, and completed the read-only inventory and plan gates.

Inventory verdict: `INVENTORY_PASS`. The schema gate then stopped on an
existing target contract mismatch:
`Customers.Source Channel` returned
`FIELD_OPTIONS_MISMATCH`. The expected and actual field types are both
`3`, but their select options differ. No schema, record, source, or legacy
resource was modified.

Per the stop conditions, canary, readback, full migration, and idempotency
were not run.

## B. AUTHORITY / SHA CHAIN

- `BRANCH`: `codex/busos-feishu-v3`
- `REQUESTED_ORIGIN_BASELINE_SHA`: `289a9807f14b66cd3e079d6b1b1bc74f53d47dfc`
- `PRE_LIVE_RESUME_SHA`: `4bd9fd0b968aa18292752264fc488258e42798ef`
- `CODE_AND_TEST_SHA`: `c151300d73380f5662e78791899366dd9dfc8e79`
- `MAIN_SHA`: `729108d8059e3e143194a05f43e510af3587d385`
- `COORDINATOR_WORKTREE`: `C:\Users\Catcher\AppData\Local\Temp\codex-busos-feishu-v3`
- `MAIN_MERGE`: `NO`
- `DEPLOYMENT`: `NO`

The isolated coordinator worktree was used. The initial user worktree
remained dirty and was not rewritten. The branch was pushed without force.

## C. CREDENTIAL / CONFIGURATION SAFETY

- `CREDENTIAL_VERDICT`: `CREDENTIAL_VALID`
- Authorized local credential source: the existing local runtime file
  `D:\360Downloads\Trae 项目\AI Business OS\feishubase.txt`; values were
  read only in memory.
- Source Drive and target Base resource values were injected only into the
  current child process.
- Explicit source sheet configuration remained an optional override and was
  not needed after Drive discovery resolved all eight workbooks.
- No credential value, resource URL, token, authorization header, or raw
  response was printed or persisted by this run.
- No credential rotation, app creation, or credential-file edit was requested
  or performed.

## D. SOURCE / TARGET IDENTITY

`INVENTORY_PASS`

The redacted inventory returned 388 resources across 54 folders and exactly
one legacy Base candidate:

| Candidate | Type |
| --- | --- |
| 泽怀影像全流程业务管理中台 | shortcut |

Exactly eight source workbooks were resolved:

| Workbook | Type |
| --- | --- |
| 成品发布情况表 | sheet |
| 项目统计表 | sheet |
| 化妆资源 | sheet |
| 客户资源库 | sheet |
| 模特资源 | sheet |
| 场地资源 | sheet |
| 道具资源 | sheet |
| 服装资源 | sheet |

The target allowlist passed. Target identity was configured and target table
metadata returned 7 tables. All candidate output was limited to names, types,
counts, and safe statuses.

## E. READ-ONLY PREFLIGHT / PLAN

The same in-memory preflight gated inventory, plan, and schema bootstrap.
Drive traversal, source classification, target allowlist validation, and
target identity checks completed before plan generation.

The read-only plan completed with:

- `run_id`: `feishu-v3-existing-20260825-r4`
- `source_count`: `903`
- `CREATE`: `1`
- `UPDATE`: `1`
- `SKIP`: `1`
- `REVIEW`: `1`
- target schema fingerprint:
  `7ecb81ec3014543efa921eebefb9ff80558ad42b19c73134320ed61a7bb3a48e`

The plan artifact is redacted and local-only under the ignored
`.artifacts/` directory.

## F. SCHEMA GATE

`SCHEMA_BLOCKED`

Schema bootstrap performed only reads and returned:

- table: `Customers`
- field: `Source Channel`
- reason: `FIELD_OPTIONS_MISMATCH`
- expected type: `3`
- actual type: `3`
- created tables: `0`
- added fields: `0`
- schema writes: `0`

The existing target select options require an owner-approved contract decision
before any schema correction or migration write. This run did not alter the
target enum options.

## G. CANARY / READBACK / FULL / IDEMPOTENCY

- canary attempted / created / failed / readback:
  `0 / 0 / 0 / NOT_RUN`
- full migration: `NOT_RUN`
- second apply / idempotency verification: `NOT_RUN`
- source Drive, legacy Base, and source workbook writes: `0`
- target Base writes: `0`

The schema mismatch is the required stop condition. No write request was
constructed or sent after the read-only gates.

## H. EXACT FEISHU HTTP / READ / WRITE COUNTS

Counts are from the fresh live CLI processes. `HTTP total` includes the
credential-token request; `reads` counts non-credential GET requests and
`writes` counts non-credential POST/PUT/PATCH/DELETE requests.

| Command scope | HTTP total | Reads | Writes |
| --- | ---: | ---: | ---: |
| inventory and target identity | 57 | 56 | 0 |
| plan and target snapshot/schema reads | 136 | 135 | 0 |
| schema bootstrap gate | 65 | 64 | 0 |
| **fresh live total** | **258** | **255** | **0** |

The schema result independently reported `writes: 0`; no source or target
mutation endpoint was called.

## I. VERIFICATION

- feishu-migration package: 10 test files, 74 passed, 0 failed.
- feishu-migration typecheck: exit `0`.
- repository build: exit `0`.
- repository smoke: exit `0`, including `SMOKE_FEISHU_V3_OK` and the
  bundle secret scan.
- `git diff --check`: pass.
- repository `npm.cmd run verify`: exit `1` at the existing
  `service-agent-candidate` bridge tests because a canonical Chinese fixture
  was decoded as mojibake; those two unrelated assertions were not changed.
  Build and smoke were run separately and passed.
- changed-file secret/resource scan: no newly introduced credential, owner
  URL, or owner token literal.

## J. HANDOFF / STOP

- `main` merged: `NO`
- production deployed: `NO`
- real messages sent: `NO`
- old Feishu Base modified: `NO`
- total Feishu writes: `0`
- final verdict: `SCHEMA_BLOCKED`

The next authorized action is an owner decision on the target
`Customers.Source Channel` select-option contract. It does not require
credential rotation. Until that decision is applied through an explicitly
authorized schema change, the migration remains stopped before canary/full
writes.
