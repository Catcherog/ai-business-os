# BUSOS-P1-02 — Service Agent Candidate Builder

## Prerequisite

BUSOS-P1-01 contracts are frozen and importable.

## Objective

Extend/integrate the existing Service Agent so a consultation can produce `LeadCandidateV1`.

## Required input case

`我想下个月拍一套新中式写真，预算大概4000。`

## Required output behavior

- intent present
- service_type extracted
- budget 4000 extracted
- preferred date text retained
- missing customer identity stays null
- evidence records key source text
- governance initial status is PENDING_REVIEW
- output passes `LeadCandidateV1` validation

## Important boundary

Service Agent must not:
- call Feishu
- create Lead
- create Customer
- bypass governance

## Integration guidance

Prefer the smallest change to the existing Service Agent.
Do not rewrite the Agent graph unless required.
If the existing Service Agent lives outside the new project folder, integrate via a bounded adapter or copy only the minimum necessary module after documenting the choice.

## Acceptance

See P1-02 gate in `../05-TEST-GATES.md`.

## Completion report

Return:
- files changed
- exact input/output example
- tests
- PASS/FAIL per gate
- blockers
- backlog findings
