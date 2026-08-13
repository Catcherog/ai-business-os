# Test Gates R1

Testing is for phase progression, not endless auditing.

## Global rules

- One formal review per phase/task set.
- If review fails, re-review only failed gates.
- Do not restart a full audit after a targeted fix.
- New non-blocking findings are logged to backlog.
- Tests should prove the current acceptance criteria, not system perfection.

## P1-01 Gate — Contract Package

PASS if:
- LeadCandidateV1 exists and validates a canonical example.
- GovernanceResultV1 exists and validates.
- CommitResultV1 exists and validates.
- Domain types for Session/AgentRun/Lead/Customer/Project exist.
- Contract version fields are present.
- Tests cover at least valid and clearly invalid samples.

## P1-02 Gate — Candidate Builder

PASS if:
1. Input: `我想下个月拍一套新中式写真，预算大概4000。`
   produces valid `LeadCandidateV1`.
2. `service_type = 新中式写真` or normalized equivalent.
3. budget extraction preserves 4000 correctly.
4. preferred date original wording is retained.
5. missing customer identity remains null.
6. evidence includes support for at least service type/budget when available.
7. output passes contract validation.
8. Service Agent does not write Feishu.

## P1-03 Gate — Repository + Feishu

PASS if:
- Domain `Lead` can be created through repository.
- Domain `Customer` can be created through repository.
- Feishu-specific mapping is isolated in adapter.
- a committed write is followed by readback.
- readback verifies critical fields.
- repository returns canonical domain objects, not raw Feishu objects.
- exact customer lookup by phone/WeChat is implemented if feasible; otherwise explicitly deferred without blocking create/readback.

## P2 GP-001 Gate

Test A — Anonymous inquiry:
`我想下个月拍一套新中式写真，预算大概4000。`

Expected:
- Candidate generated
- governance result generated
- lead committed
- `customer_id = null`
- readback verified

Test B — Identified inquiry:
`我是张三，微信 zhangsan123，想下个月拍新中式，预算4000。`

Expected:
- candidate generated
- customer resolution performed
- customer created or matched
- lead linked to customer
- readback verified

Test C — Invalid/risk case:
Must not silently commit invalid or risk-blocked business data.

## Reviewer output format

Only:

PASS

or

FAIL
- Gate ID
- Evidence
- Minimal fix required

No open-ended recommendations.

## P3-01 Gate — Human Review

PASS only if all gates below pass.

### HR-A — Review interception

Given a valid candidate whose governance decision is:

`REVIEW_REQUIRED`

Expected:
- review case/surface available;
- candidate and governance issues visible;
- trace IDs retained;
- BusinessRepository write count = 0;
- Feishu write count = 0.

### HR-B — Approve

Given a REVIEW_REQUIRED candidate and human APPROVE:

Expected:
- approval explicitly recorded;
- hard REJECT/invalid data cannot be overridden;
- domain object created;
- repository write succeeds;
- readback verifies critical fields;
- final commit status is COMMITTED.

### HR-C — Edit + approve

Given a REVIEW_REQUIRED candidate:

Reviewer changes at least one critical business field.

Example:

```text
budget_max:
4000 → 4500
```

Expected:
- original AI candidate snapshot retained;
- human before/after edit retained;
- edited value validated;
- committed business value = 4500;
- readback business value = 4500;
- stale AI evidence is not presented as evidence for the human-edited value.

### HR-D — Reject

Human REJECT:

Expected:
- zero repository writes;
- zero Feishu writes;
- no COMMITTED result.

### HR-E — Invalid edit / hard rejection

Invalid edited candidate or governance REJECT:

Expected:
- fail closed;
- zero business writes;
- no COMMITTED result.

### HR-F — Architecture boundary

PASS if Human Review/application/presentation code has no direct dependency on:
- Feishu table IDs;
- Feishu field mappings;
- credentials;
- raw Feishu record structures;
- direct Feishu API calls.

### HR-G — Regression

Existing:
- contracts tests;
- service-agent-candidate tests;
- business-repository tests;
- golden-path tests;

must remain PASS.

TypeScript compile/typecheck must remain clean.

### HR-H — Live Feishu vertical slice

Run at least one reviewed APPROVE or EDIT + APPROVE case through:

```text
Human Review
→ BusinessRepository
→ RealFeishuAdapter
→ real Feishu write
→ real Feishu readback
→ VERIFIED
```

Requirements:
- do not print credentials;
- record sanitized evidence only;
- clean generated test records by exact `record_id`;
- cleanup must not affect existing business records.

If live credentials unexpectedly become unavailable:
mark:

`IMPLEMENTATION PASS / LIVE P3 REVIEW E2E BLOCKED`

Do not substitute Fake/Simulator PASS for Live PASS.

P3-01 is not COMPLETE until HR-H passes.

---

## P4-01 Gate — Project Lifecycle Slice

PASS only if all gates below pass.

### PL-A — Contract delta (additive)

PASS if:
- A canonical `Task` schema exists (`task_id`, `project_id`, `task_type`, `title`,
  `status` ∈ {TODO, IN_PROGRESS, DONE, CANCELLED}, `due_date` nullable, `created_at`,
  `updated_at`) and validates a canonical example;
- `COMMIT_DOMAIN_OBJECTS` includes `project` and `task`;
- no breaking change to existing contract types;
- `BL-006` date semantics are documented (explicit `YYYY-MM-DD` → value;
  relative-only → `null`; never hallucinated).

### PL-B — Happy lifecycle

Given a QUALIFIED lead with a resolved customer and an explicit `scheduled_date`:

Expected:
- `convertLeadToProject` returns `LIFECYCLE_SUCCESS`;
- Project created with `status = DRAFT` (not IN_PROGRESS) and linked `customer_id`/`lead_id`;
- a Task created with default `task_type = PROJECT_SETUP`, `title = "Project setup"`,
  `status = TODO` when none supplied (no LLM);
- all three commits (`project`/`task`/`lead`) have `readback_status = VERIFIED`;
- `businessRepository` write counts: project = 1, task = 1, lead-status = 1.

### PL-C — Anonymous lead

Given a lead with `customer_id = null`:

Expected:
- `BLOCKED`, `reason = CUSTOMER_REQUIRED`;
- zero Project/Task/Lead-status writes;
- no Customer auto-created.

### PL-D — Dangling / already-converted / LOST

Expected:
- Dangling customer (id present but not found) → fail closed, 0 writes;
- already-`CONVERTED` lead → `BLOCKED`, 0 new writes, no dedup engine;
- `LOST` lead → `BLOCKED`, 0 writes.

### PL-E — Partial-failure compensation

Expected:
- Project created but Task write/readback fails → Project deleted by exact record id,
  result `FAILED`, Task create never attempted;
- Project + Task created but Lead `CONVERTED` update/readback fails → Task + Project
  deleted by exact record id, result `FAILED`;
- Lead is **not** reported `CONVERTED` in any failure case;
- compensation uses exact record ids (no transaction/saga/retry).

### PL-F — Architecture boundary

PASS if `packages/project-lifecycle/src/**` has no direct dependency on:
- Feishu table IDs;
- Feishu field mappings;
- credentials;
- raw Feishu record structures;
- direct Feishu API calls / `RealFeishuAdapter` / `open-apis` / `FEISHU_`.

### PL-G — Regression

Existing suites for:
- contracts
- business-repository
- golden-path
- human-review
- project-lifecycle

must remain PASS. TypeScript compile/typecheck must remain clean.

### PL-H — Live Feishu vertical slice

**Status: PASS (2026-08-13).** Executed via BUSOS-P4-01-LIVE-CLOSURE with user-supplied `FEISHU_*` + `FEISHU_PROJECT_TABLE_ID`/`FEISHU_TASK_TABLE_ID`; the real chain wrote + read-back VERIFIED and cleaned all generated records by exact `record_id`. See `10-P4-01-COMPLETION.md` §4/§10.

Run the full lifecycle through:

```text
Existing Lead (QUALIFIED)
→ verify Customer
→ BusinessRepository.createProject (DRAFT)
→ BusinessRepository.createTask (TODO)
→ BusinessRepository.updateLeadStatus (CONVERTED)
→ RealFeishuAdapter
→ real Feishu write
→ real Feishu readback
→ VERIFIED
```

Requirements:
- do not print credentials;
- record sanitized evidence only;
- clean generated test records by exact `record_id`;
- cleanup must not affect existing business records;
- gated on `FEISHU_*` + `FEISHU_PROJECT_TABLE_ID` / `FEISHU_TASK_TABLE_ID`.

If live credentials / Project+Task tables unexpectedly become unavailable:
mark:

`IMPLEMENTATION PASS / LIVE P4 LIFECYCLE E2E BLOCKED`

Do not substitute Fake/Simulator PASS for Live PASS.

P4-01 is not COMPLETE (live) until PL-H passes; it is reported
`IMPLEMENTATION PASS / LIVE P4 LIFECYCLE E2E BLOCKED` and the task STOPS at
commit + push + clean tree (no automatic P5).
