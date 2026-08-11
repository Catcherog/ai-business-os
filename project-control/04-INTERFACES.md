# Interfaces R1

These interfaces define module boundaries. Implementations may vary, contracts may not be silently changed.

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
