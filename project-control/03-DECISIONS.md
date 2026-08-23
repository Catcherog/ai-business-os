# Frozen Decisions

## D001 — Vertical slices
Build end-to-end slices, not entire layers in isolation.
Status: FROZEN

## D002 — GP-001 first
GP-001 outranks architecture completeness.
Status: FROZEN

## D003 — Lumen excluded from first Golden Path
Creative capability is deferred.
Status: FROZEN

## D004 — Reviewer scope is fixed
Reviewer may verify predefined gates only.
Reviewer may not expand scope or run open-ended audits.
Status: FROZEN

## D005 — Non-blocking findings go to backlog
New issues do not interrupt current work unless they meet blocker criteria.
Status: FROZEN

## D006 — LeadCandidate is the first cross-module contract
Service Agent outputs `LeadCandidateV1`.
Status: FROZEN

## D007 — Native multimodal LLM
V1 uses native multimodal LLM capabilities for image/screenshot/document understanding.
Do not introduce dedicated OCR or multimodal small-model infrastructure unless a later measured constraint requires it.
Status: FROZEN

## D008 — Storage abstraction
Domain model is decoupled from Feishu schema through `BusinessRepository` + `FeishuAdapter`.
Status: FROZEN

## D009 — Lead vs Customer
Lead = business opportunity.
Customer = person/entity.
They are not the same object.
Status: FROZEN

## D010 — Anonymous lead allowed
A Lead may exist with `customer_id = null`.
Status: FROZEN

## D011 — Project created after conversion
Project represents delivery/execution state, not an initial inquiry.
Status: FROZEN

## D012 — Evidence, not excessive confidence fields
Important AI-extracted fields should keep evidence.
V1 does not introduce field-level confidence for every field.
Status: FROZEN

## D013 — No premature migration
Do not move all existing projects into a new monorepo merely for cleanliness.
Integrate through contracts first.
Status: FROZEN

## D014 — Contract-based module interaction
Modules/agents communicate through contracts, not internal cross-imports.
Status: FROZEN

## D015 — Service Agent cannot create business facts
Service Agent produces candidates only.
Status: FROZEN

## D016 — Governance produces explicit result
Governance must produce `GovernanceResultV1`.
Status: FROZEN

## D017 — BusinessRepository is the domain persistence boundary
Upper layers do not call Feishu directly.
Status: FROZEN

## D018 — FeishuAdapter owns Feishu-specific knowledge
Only the adapter knows Base token/table IDs/field IDs or names.
Status: FROZEN

## D019 — Readback required
A successful API write is not enough.
Commit success requires readback verification of critical fields.
Status: FROZEN

## D020 — Multimodal inputs converge to the same contracts
Text/image/document inputs may differ at ingestion, but downstream business flow uses the same Candidate contract.
Status: FROZEN

---

# Proposed Post-H1 Decisions

These decisions were approved as a planning direction in conversation on 2026-08-23.
They are **PROPOSED / PENDING OWNER REPOSITORY REVIEW** on branch
`codex/busos-r2-unified-os-rebaseline`. They become FROZEN only after the owner
approves the written artifact and authorizes integration into `main`.

## D021 — Unified OS is the post-H1 product direction
Post-H1 productization converges existing capabilities into one Unified AI Business OS.
The H1 four-navigation limit remains historical to H1 and does not constrain post-H1 IA.
Status: PROPOSED — PENDING MERGE

## D022 — New navigation ships with working vertical slices
The target IA is Overview, Customers, Projects, Service Agent, Reviews, Runs,
Evaluation and Integrations. A navigation item is introduced only with a usable
surface; empty placeholder pages are not a deliverable.
Status: PROPOSED — PENDING MERGE

## D023 — Runtime mode is explicit and fail-closed
DEMO, CONNECTED and LIVE are separate evidence/runtime states. Missing Connected
dependencies return BLOCKED and never silently fall back to fake data.
Status: PROPOSED — PENDING MERGE

## D024 — Service Agent remains candidate-only
The Service Agent surface may generate `LeadCandidateV1`, but D015 remains binding:
Governance and Human Review must precede any canonical Lead/Customer/Project write.
Status: PROPOSED — PENDING MERGE

## D025 — Feishu is the server-only business data plane
Workspace domain services use `BusinessRepository`; only `FeishuAdapter` owns
Feishu-specific details. Credentials and raw provider records never enter the browser.
Status: PROPOSED — PENDING MERGE

## D026 — Memory and Lumen stay contextual
Memory remains embedded in Customer/Project context. Lumen remains a Project-bound
Business Action. Neither becomes a top-level tool surface in this roadmap.
Status: PROPOSED — PENDING MERGE

## D027 — Production deployment is an independent gate
Local-real integration, product UI, push, merge, BUSOS production connection to SCS,
Lumen deployment and Unified LIVE closure are separately authorized and separately
evidenced. The completed external SCS deployment prerequisite is not reopened by BUSOS.
Status: PROPOSED — PENDING MERGE

## D028 — Parallel lanes with serialized authoritative integration
Only `02-CURRENT-STATE.md` plus an explicit owner instruction authorizes execution.
There may be one active bounded task per isolated lane/worktree, with an exact baseline
SHA, file ownership, Audit Packet and STOP. Multiple explicitly authorized development
lanes may run concurrently after their shared contract dependency is merged. There is at
most one authoritative Integration Coordinator / merge task at a time; completed lanes
stop and never self-merge into main.
Status: PROPOSED — PENDING MERGE
