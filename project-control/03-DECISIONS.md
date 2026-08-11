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
