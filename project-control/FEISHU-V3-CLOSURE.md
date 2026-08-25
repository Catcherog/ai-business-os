# Feishu v3 Migration Closure

## Authoritative post-resume closure — 2026-08-25

`MIGRATION_PASS`

This is the authoritative closure for `BUSOS-FEISHU-V3-SCHEMA-RESUME-03`.
Read-only inventory, target identity/allowlist, schema, canary, canary
readback, full migration, full readback, and same-batch idempotency all
passed. The 562 `NEEDS_REVIEW` decisions remain traceable and were not
silently written.

- Branch: `codex/busos-feishu-v3`.
- PRE / expected remote SHA: `a19bbcc66105c2b53f5c7165535f09d3a3fdafef`.
- POST commit SHA: `POST_COMMIT_SHA_FILLED_AFTER_COMMIT`.
- Remote feature SHA: `REMOTE_FEATURE_SHA_FILLED_AFTER_PUSH`.
- Main before/after: `729108d8059e3e143194a05f43e510af3587d385`.
- Main merge: `NO`; deployment: `NO`.
- Inventory: `INVENTORY_PASS`; 388 resources, 54 folders, one legacy Base,
  eight source workbooks; target allowlist `PASS`, 17 tables.
- Plan: 903 source records, 661 decisions, 99 executable creates, 562 review.
- Source Channel: type `3`; expected option names are a semantic subset of
  actual names; four missing names were added, target extras preserved, no
  option deleted or renamed; schema readback `PASS`.
- Seven required existing target table preflights: all `PASS` — 数据表,
  Customers, Projects, Business Events, Tasks, Evidence, BUSOS Asset.
- Canary: 21 selected; net 20 created, 0 updated, 7 final skips, 1 review,
  0 failed; readback `PASS`.
- Full: 79 applied, 20 skips, 562 review, 0 failed; 79 business and 79
  registry writes.
- Idempotency: 0 applied, 99 skips, 562 review, 0 failed, 0 writes.
- Final full readback: `PASS`; applied `99`, mismatches `0`, dangling
  canonical IDs `0`.
- Final target counts: Content Research 21, Customers 71, Projects 7,
  Resources 9.
- Recorded cumulative counters through closure: `2753 HTTP / 2301 reads /
  442 writes`; one interrupted dry-run had no writes and no persisted counter.
- Migration package tests: `83/83 PASS`; typecheck, build, smoke, product
  integration smoke, and browser bundle secret scan: `PASS`.
- Repository-wide test command still has exactly two pre-existing mojibake
  assertion failures in `packages/service-agent-candidate/tests/service-agent-bridge.test.ts`;
  that file was not changed.

Source Drive, legacy Base, and source workbooks remained read-only. No
credential, token, URL, record ID, or raw personal payload was persisted in
the tracked closure.

## Historical pre-resume verdict

`SCHEMA_BLOCKED`

The existing authorized local credential was accepted and the read-only Drive
inventory passed. It discovered exactly one legacy Base and eight source
workbooks, and the target allowlist and identity checks passed.

The migration stopped at schema bootstrap because
`Customers.Source Channel` returned `FIELD_OPTIONS_MISMATCH`: the expected
and actual field types are both `3`, but the select options differ. Schema
writes, record writes, source writes, canary, full migration, and idempotency
were all `0` or `NOT_RUN`.

## Live evidence

- inventory: `INVENTORY_PASS`, 388 resources, 54 folders, 8 workbooks;
- target identity: 7 tables, allowlist `PASS`;
- plan: 903 source records; CREATE 1, UPDATE 1, SKIP 1, REVIEW 1;
- schema fingerprint:
  `7ecb81ec3014543efa921eebefb9ff80558ad42b19c73134320ed61a7bb3a48e`;
- fresh live Feishu totals: **258 HTTP / 255 reads / 0 writes**;
- package verification: 74/74 tests and typecheck passed;
- repository build and smoke passed, including `SMOKE_FEISHU_V3_OK`;
- repository-wide verify still exits 1 on two unrelated existing
  mojibake assertions in `service-agent-candidate`;
- no old Base mutation, main merge, deployment, or real message.

## Implementation

- branch: `codex/busos-feishu-v3`;
- code/test tip before closure docs:
  `c151300d73380f5662e78791899366dd9dfc8e79`;
- requested origin baseline:
  `289a9807f14b66cd3e079d6b1b1bc74f53d47dfc`;
- main remains at:
  `729108d8059e3e143194a05f43e510af3587d385`;
- source and target resource values remained runtime-only;
- source Drive, legacy Base, and workbooks remained read-only;
- target writes remained behind the schema, canary, readback, full, and
  idempotency gates.

## Handoff

Owner direction is required for the target select-option contract. This is a
schema-contract decision, not a credential-rotation request. Until it is
resolved through an explicitly authorized change, the migration must remain
stopped before canary/full writes.
