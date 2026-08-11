# BUSOS-P1-03 — Business Repository + Feishu Adapter Skeleton

## Prerequisite

BUSOS-P1-01 contracts/domain types are frozen.

## Objective

Implement the minimum persistence path for canonical Lead/Customer objects through a BusinessRepository and FeishuAdapter.

## BusinessRepository minimum methods

- createLead
- getLead
- createCustomer
- getCustomer
- findCustomerByIdentity
- linkLeadCustomer

## FeishuAdapter responsibilities

- map canonical Lead/Customer fields to Feishu Base fields
- create lead record
- create customer record
- read record back
- verify critical fields
- expose enough information for `CommitResultV1`

## Hard rules

- Upper layers must not depend on raw Feishu fields.
- API 200 is not enough.
- Commit success requires readback verification.
- Do not redesign the entire existing Feishu system.
- Reuse working authenticated Feishu code if available.
- If credentials/table IDs are missing, implement adapter interfaces and test with an explicit local fake only for development, but mark real E2E as BLOCKED rather than pretending success.

## Customer resolution

V1 auto-match:
- exact phone
- exact WeChat

If current Feishu schema cannot support lookup without major changes, defer lookup and do not block create/readback.

## Acceptance

See P1-03 gate in `../05-TEST-GATES.md`.

## Completion report

Return:
- files changed
- repository interface
- adapter mapping
- real vs fake execution clearly distinguished
- readback evidence
- PASS/FAIL per gate
- blockers
- backlog findings
