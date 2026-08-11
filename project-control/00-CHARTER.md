# AI Business OS — Project Charter R1

## Product definition

AI Business OS is an AI-native operating platform for service businesses.

The first validated scenario is the photography studio business, but the system must use generic business concepts rather than hard-coding the entire architecture around one scenario.

## V1 objective

Prove that existing AI capabilities can operate as one business product by running a real end-to-end workflow:

`Consultation -> AI understanding -> structured candidate -> governance -> business object -> real storage -> readback`

## V1 success criteria

- V1-G1: A user can interact with Service Agent through a unified entry.
- V1-G2: Service Agent can produce a valid `LeadCandidateV1`.
- V1-G3: Candidate passes schema/business governance and can be reviewed.
- V1-G4: Approved data can be committed to Business Data and read back.
- V1-G5: The flow is traceable by `session_id`, `agent_run_id`, `candidate_id`, and domain IDs.

## Primary Golden Path

GP-001 — Consultation to Business Record

Example input:

`我想下个月拍一套新中式写真，预算大概 4000 元。`

Expected business flow:

`Session -> Service Agent -> AgentRun -> LeadCandidateV1 -> Governance -> Lead -> optional Customer Resolution -> BusinessRepository -> FeishuAdapter -> Readback -> COMMITTED`

## Priorities

1. P0 — Golden Path works
2. P1 — Data correctness
3. P2 — Core user experience
4. P3 — Failure recovery
5. P4 — Observability
6. P5 — Performance
7. P6 — Architecture elegance
8. P7 — Full audit / broad hardening

When a higher-priority objective is incomplete, a lower-priority issue cannot block progress unless it qualifies as a blocker.

## Development principles

- Vertical slices over horizontal platform-building.
- AI creates candidates; governance creates business facts.
- Probabilistic models understand; deterministic code constrains.
- Contracts before parallel implementation.
- Storage implementation is hidden behind repository/adapters.
- Existing systems are integrated before they are physically migrated.
- Multimodal understanding uses native multimodal LLM capabilities in V1.
- Human review is allowed and expected in V1.
- Do not optimize for architectural perfection before GP-001 works.

## Explicit V1 non-goals

- Full Creative Agent / Lumen integration
- LoRA workflow integration
- Full Memory platform
- Full Evaluation Center
- Multi-tenant SaaS
- Complex RBAC
- Generic event bus
- Event sourcing
- CQRS
- Full PostgreSQL migration
- Repository-wide security/performance audit
- Custom OCR or multimodal small-model stack
