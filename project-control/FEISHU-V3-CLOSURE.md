# Feishu v3 Drive Discovery Resume Closure

## Verdict

`CONFIGURATION_BLOCKED`

The over-constrained source-token contract has been replaced with a
read-only, recursive Drive inventory and shared migration preflight. The
current live attempt stopped before Feishu client construction because the
approved local runtime did not provide the rotated credentials and required
resource fields. No previous exposed App Secret was used.

This is not an observed `AUTHORIZATION_BLOCKED` response: no Drive request was
sent. The exact permission/identity handoff is implemented for the next run.

## Implementation

- branch: `codex/busos-feishu-v3`
- baseline: `289a9807f14b66cd3e079d6b1b1bc74f53d47dfc`
- implementation: `a3ca81b5729e586589ee81d207466172411df2c4`
- source folder and target Base are runtime-only inputs;
- source Drive, legacy Base, and workbooks are read-only;
- target writes remain behind inventory, identity, allowlist, schema, canary,
  readback, full migration, and idempotency gates.

## Evidence

- Feishu migration package: 10 test files, 72 passed;
- Feishu migration typecheck: passed;
- repository build: passed;
- repository smoke: passed with local `SMOKE_FEISHU_V3_OK`;
- inventory without rotated runtime configuration: safe exit `1`,
  `INVENTORY_BLOCKED`, `CONFIGURATION_BLOCKED`, `feishu_writes: 0`;
- live Feishu HTTP/read/write counts: `0 / 0 / 0`;
- no old Base mutation, main merge, deployment, or real message.

The full repository verification command also exposed two unrelated existing
Chinese-encoding assertions in `service-agent-candidate`; those failures are
recorded in the detailed report and were not changed here.

## Not evidenced

- live source candidate counts and names;
- target Base identity and allowlist proof;
- permission response from the owner Drive folder;
- schema bootstrap, per-table canary, readback, full migration, and
  idempotency;
- connected product data or live Feishu browser E2E.

## Handoff

The next authorized local runtime must provide the rotated credentials and the
two resource fields without persisting them. Run the standalone inventory
first. If Drive denies access, preserve `AUTHORIZATION_BLOCKED` and report the
returned missing scope plus whether the bot must be granted folder access or a
user-authorized identity must be used. Do not guess tokens or continue to
migration writes.
