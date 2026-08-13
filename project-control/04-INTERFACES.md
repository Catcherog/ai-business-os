# Interfaces R1

These interfaces define module boundaries. Implementations may vary, contracts may not be silently changed.

## 0. Lumen Port (BUSOS-P5-01)

Lumen (光砚 / Lumen Ink) is an external multi-provider AI image-editing service.
The application layer (`@busos/creative-production`) depends ONLY on `LumenPort`
(`@busos/lumen-adapter`):

```ts
interface LumenPort {
  generate(input: {
    prompt: string;
    project_name: string;
    source_image_base64: string;
    source_image_mime_type: string;
  }): Promise<{
    status: 'GENERATED' | 'FAILED';
    asset_uri?: string;
    mime_type?: string | null;
    lumen_project_id?: string;
    error_code?: string;
    error_message?: string;
  }>;
  release(lumenProjectId: string): Promise<void>;
}
```

- `RealLumenAdapter` maps the deployed Lumen HTTP API and owns all Lumen HTTP +
  auth knowledge. `FakeLumenAdapter` is the in-memory stand-in.
- **Security boundary (§19):** AI Business OS holds at most Lumen's `AUTH_PASSWORD`
  + base URL. The image-provider credential (Seedream / Volcengine Ark) lives
  exclusively inside Lumen and is never read or forwarded. `business-repository`
  never imports Lumen (the `Asset.source` is the frozen enum `LUMEN`, not a live
  client).
- Lumen requires a source image (V0 becomes the project `activeVersionId`); the app
  layer sends exactly one `source_image_base64` + `mime_type` per P5 §16.

## 1. LeadCandidateV1

Required version:
`lead_candidate.v1`

Conceptual schema:

```json
{
  "version": "lead_candidate.v1",
  "candidate_id": "cand_xxx",
  "session_id": "sess_xxx",
  "agent_run_id": "run_xxx",
  "intent": {
    "type": "portrait_consultation",
    "confidence": 0.94
  },
  "customer_candidate": {
    "name": null,
    "phone": null,
    "wechat": null
  },
  "requirement": {
    "service_type": "新中式写真",
    "budget_min": null,
    "budget_max": 4000,
    "preferred_date_text": "下个月",
    "notes": null
  },
  "evidence": [
    {
      "field": "requirement.budget_max",
      "source_text": "预算大概4000"
    }
  ],
  "governance": {
    "status": "PENDING_REVIEW",
    "risk_level": "R0",
    "missing_fields": [
      "customer_candidate.name",
      "customer_candidate.phone"
    ]
  },
  "created_at": "ISO-8601"
}
```

Rules:
- Do not hallucinate missing customer data.
- Unknown values are `null`.
- Keep original date wording in `preferred_date_text` in V1.
- At least important extracted values should have supporting evidence when possible.
- Candidate is not yet a canonical business record.

## 2. GovernanceResultV1

Version:
`governance_result.v1`

```json
{
  "version": "governance_result.v1",
  "candidate_id": "cand_xxx",
  "decision": "APPROVE | REVIEW_REQUIRED | REJECT",
  "issues": [
    {
      "code": "CUSTOMER_IDENTITY_MISSING",
      "field": "customer_candidate"
    }
  ],
  "customer_resolution": {
    "status": "RESOLVED | UNRESOLVED | NOT_REQUIRED",
    "customer_id": null
  },
  "normalized_data": {},
  "created_at": "ISO-8601"
}
```

V1 customer resolution automatic match:
- exact phone
- exact WeChat ID

No fuzzy identity merge in V1.

## 3. CommitResultV1

Version:
`commit_result.v1`

```json
{
  "version": "commit_result.v1",
  "status": "COMMITTED | FAILED",
  "domain_object": "lead | customer",
  "domain_id": "lead_xxx",
  "storage": "feishu",
  "external_record_id": "recxxx",
  "write_status": "SUCCESS | FAILED",
  "readback_status": "VERIFIED | FAILED | NOT_RUN",
  "errors": []
}
```

Business success requires:
- `status = COMMITTED`
- `write_status = SUCCESS`
- `readback_status = VERIFIED`

## 4. Domain Objects

### Session
- session_id
- user_id nullable if anonymous strategy requires
- channel
- status: OPEN | CLOSED
- created_at
- updated_at

### AgentRun
- agent_run_id
- session_id
- agent_type
- status: RUNNING | SUCCEEDED | FAILED | HANDED_OFF
- started_at
- completed_at nullable

### Lead
- lead_id
- customer_id nullable
- source_session_id
- source_candidate_id
- service_type
- budget_min nullable
- budget_max nullable
- preferred_date_text nullable
- status: NEW | QUALIFIED | CONVERTED | LOST
- created_at
- updated_at

### Customer
- customer_id
- display_name
- phone nullable
- wechat nullable
- status: ACTIVE | ARCHIVED
- created_at
- updated_at

### Project
- project_id
- customer_id
- lead_id
- project_type
- title
- status: DRAFT | CONFIRMED | IN_PROGRESS | DELIVERED | CANCELLED
- scheduled_date nullable
- created_at
- updated_at

## 5. BusinessRepository minimum interface

Required V1 methods:

- `createLead(input) -> Lead`
- `getLead(leadId) -> Lead | null`
- `createCustomer(input) -> Customer`
- `getCustomer(customerId) -> Customer | null`
- `findCustomerByIdentity({phone?, wechat?}) -> Customer | null`
- `linkLeadCustomer(leadId, customerId) -> Lead`

Upper layers must not receive raw Feishu record structures as their main return type.

## 6. FeishuAdapter minimum responsibilities

- create lead record
- create customer record
- update lead/customer relationship if needed
- read record
- exact lookup by phone/WeChat if feasible with current Base structure
- map canonical domain fields to Feishu-specific fields
- perform readback support

Only this module may know:
- Base token
- table IDs
- field IDs / actual Feishu field names

---

## 7. Addendum — P4 Project Lifecycle (BUSOS-P4-01, ADDITIVE)

This section is additive to the frozen R1 interfaces above. It does not modify
any existing Lead / Customer / Project contract or decision. It only introduces
the canonical `Task` object (D011: created only after conversion) and the
minimal repository/adapter surface required for the `Lead → Customer → Project →
Task` vertical slice.

Frozen decisions respected: D008 (storage abstraction), D009 (Lead !=
Customer), D010 (anonymous Lead allowed), D011 (Project/Task only after
conversion), D014 (contract-based interaction), D017 (BusinessRepository is the
persistence boundary), D018 (FeishuAdapter owns Feishu knowledge), D019 (write
!= success until readback VERIFIED).

### 7.1 Task (canonical, additive)

```json
{
  "task_id": "task_xxx",
  "project_id": "proj_xxx",
  "task_type": "PROJECT_SETUP",
  "title": "Project setup",
  "status": "TODO | IN_PROGRESS | DONE | CANCELLLED",
  "due_date": "string | null",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

Explicitly OUT of scope for P4 (per task §2 "禁止加入"): assignee system,
priority engine, dependencies, subtasks, comments, attachments, workflow DSL,
event bus, RBAC, notifications, recurrence, generic task platform. `Task` exists
only to serve the current P4 lifecycle slice.

### 7.2 BL-006 — V1 `scheduled_date` semantics (now fixed)

`Project.scheduled_date` remains a nullable string at the contract layer (no
breaking change). The V1 *resolution* rule, applied by the project-lifecycle
package at conversion time, is:

- An **explicitly confirmed calendar date** is stored verbatim as `YYYY-MM-DD`.
- A **relative-only expression** ("下个月" / "周末" / "最近") resolves to `null`.
- The original Lead `preferred_date_text` (e.g. "下个月") is **preserved as-is**
  and is **never** auto-hallucinated into a concrete date.
- Any non-explicit string supplied as `scheduled_date` is rejected (BLOCKED),
  never silently coerced.

This is a documented semantic decision, not a redesign of the date system.

### 7.3 BusinessRepository additional interface (P4)

Existing V1 methods (`createLead`, `getLead`, `createCustomer`, `getCustomer`,
`findCustomerByIdentity`, `linkLeadCustomer`) are unchanged. Added for P4:

- `updateLeadStatus(leadId, status) -> { lead: Lead; commit: CommitResultV1 }`
- `createProject(input) -> { project: Project; commit: CommitResultV1 }`
- `getProject(projectId) -> Project | null`
- `createTask(input) -> { task: Task; commit: CommitResultV1 }`
- `getTask(taskId) -> Task | null`
- `deleteProject(exactRecordId) -> boolean`  (test-hygiene / compensation only)
- `deleteTask(exactRecordId) -> boolean`     (test-hygiene / compensation only)

Upper layers (project-lifecycle) must not receive raw Feishu record structures;
only the canonical domain objects + `CommitResultV1`.

### 7.4 FeishuAdapter additional responsibilities (P4)

- create / read / delete Project records in the Project table
- create / read / delete Task records in the Task table
- update a Lead's status (and readback-verify the new status)
- map canonical Project/Task fields <-> Feishu-specific fields

Only this module may know the Project/Task **table IDs**, field names, and the
new env vars `FEISHU_PROJECT_TABLE_ID` / `FEISHU_TASK_TABLE_ID` (added
alongside the existing `FEISHU_APP_ID` / `FEISHU_APP_SECRET` /
`FEISHU_BASE_APP_TOKEN` / `FEISHU_LEAD_TABLE_ID` / `FEISHU_CUSTOMER_TABLE_ID`).
No secret is ever written to the repository.
