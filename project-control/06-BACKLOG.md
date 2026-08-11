# Backlog

Use this file for non-blocking findings.

Format:

## [ID] Title
- Type: DEFERRED | INVALID
- Found in task:
- Description:
- Why non-blocking:
- Suggested revisit phase:

Initial deferred items:

## BL-001 Full Evaluation Center
- Type: DEFERRED
- Found in task: Architecture planning
- Description: Unified eval platform for Service/Data/Creative agents.
- Why non-blocking: GP-001 can run without it.
- Suggested revisit phase: P6+

## BL-002 Creative Agent / Lumen integration
- Type: DEFERRED
- Found in task: Architecture planning
- Description: Project -> Creative Task -> Lumen -> Asset.
- Why non-blocking: Outside first Golden Path.
- Suggested revisit phase: P5

## BL-003 Full Memory platform
- Type: DEFERRED
- Found in task: Architecture planning
- Description: conversation/customer/business memory.
- Why non-blocking: GP-001 does not require it.
- Suggested revisit phase: P6+

## BL-004 Dedicated OCR / multimodal model
- Type: DEFERRED
- Found in task: Architecture planning
- Description: Specialized OCR or multimodal small-model stack.
- Why non-blocking: V1 uses native multimodal LLM.
- Suggested revisit phase: Only if measured cost/latency/privacy/accuracy constraints emerge.

## BL-005 service_type nullability gap between candidate and Lead
- Type: DEFERRED
- Found in task: BUSOS-P1-01
- Description: `LeadCandidateV1.requirement.service_type` is nullable (AI may fail to extract it), but `Lead.service_type` in 04-INTERFACES.md §4 is not marked nullable. Contracts were implemented exactly as specified, so governance must guarantee a non-null `service_type` before a Lead can be created. The rule (reject vs. review-required vs. allow a placeholder) is not yet defined.
- Why non-blocking: P1-01 only defines contracts; no Lead is created yet. GP-001 Test A supplies a service_type.
- Suggested revisit phase: P1-03 / P2 (governance rules).

## BL-006 Project.scheduled_date format unspecified
- Type: DEFERRED
- Found in task: BUSOS-P1-01
- Description: 04-INTERFACES.md §4 does not state whether `Project.scheduled_date` is a calendar date or a full timestamp. Implemented as an unconstrained nullable string to avoid over-constraining the contract.
- Why non-blocking: Project is created after conversion (D011) and is outside GP-001.
- Suggested revisit phase: P4 (Project lifecycle slice).

## BL-007 GovernanceResultV1.normalized_data is untyped
- Type: DEFERRED
- Found in task: BUSOS-P1-01
- Description: `normalized_data` is an open object in `governance_result.v1.schema.json`, so the repository layer receives unvalidated content. Domain schemas exported by `@busos/contracts` can be used to validate it once the governance output shape is settled.
- Why non-blocking: Matches the frozen schema; the repository validates canonical domain objects on its own boundary.
- Suggested revisit phase: P2 (GP-001 integration).

## BL-008 Local npm proxy config breaks dependency install
- Type: DEFERRED
- Found in task: BUSOS-P1-01
- Description: The machine's npm config sets `proxy`/`https-proxy` to `http://127.0.0.1:7897`, which refuses connections; `HTTP_PROXY`/`HTTPS_PROXY` point at `:7890`. Direct access to `registry.npmmirror.com` works. Install had to be run with `npm_config_proxy=` / `npm_config_https_proxy=` / `HTTP_PROXY=` / `HTTPS_PROXY=` cleared.
- Why non-blocking: Workaround succeeds; no project code is affected.
- Suggested revisit phase: Whenever the environment is set up again (document in project README or fix the local npm config).

## BL-009 @busos/contracts is consumed as TypeScript source (no build step)
- Type: DEFERRED
- Found in task: BUSOS-P1-01
- Description: `packages/contracts` exposes `src/index.ts` directly instead of emitting `dist/`. Consumers must run through a TS-aware runtime (vitest/tsx/bundler). No compile/publish pipeline was added because P1-01 does not require one.
- Why non-blocking: P1-02 and P1-03 live in the same repository and can import the source.
- Suggested revisit phase: When a runtime that needs compiled JS appears (e.g. a deployed service or a review UI).
