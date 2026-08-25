# Feishu v3 Migration Closure

## Verdict

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
