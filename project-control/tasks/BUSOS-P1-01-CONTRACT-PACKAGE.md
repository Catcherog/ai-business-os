# BUSOS-P1-01 — Contract Package

## Objective

Create the minimum shared contract/domain package required by GP-001.

## Must implement

- LeadCandidateV1
- GovernanceResultV1
- CommitResultV1
- Session
- AgentRun
- Lead
- Customer
- Project

Use the repository's existing language/framework if one already exists in the target project.
If the new project directory is empty, prefer TypeScript for contracts unless a clearly established project stack already exists.

## Requirements

- Runtime validation for external contracts is required.
- Static typing is required.
- Contract version must be explicit.
- Unknown optional business values use `null`, not fabricated defaults.
- Add minimal validation tests.

## Allowed work

- Create contract/domain package.
- Add minimal test infrastructure needed for this package.

## Forbidden work

- No Service Agent implementation.
- No Feishu API implementation.
- No UI.
- No Lumen.
- No broad architecture refactor.

## Acceptance

See P1-01 gate in `../05-TEST-GATES.md`.

## Completion report

Return:
- files changed
- validation approach
- tests
- PASS/FAIL for every P1-01 gate
- blockers
- backlog items
