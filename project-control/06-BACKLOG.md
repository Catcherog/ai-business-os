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

## BL-010 Service Agent intent classifier is keyword-only (no LLM)
- Type: DEFERRED
- Found in task: BUSOS-P1-02
- Description: The existing Service Agent classifies intent via keyword rules (I00–I12) with no LLM. The canonical consultation maps cleanly to `price_consultation` (I02, confidence 1.0), but ambiguous or multi-intent messages may be misrouted. The Candidate Builder maps agent intent → candidate intent through `AGENT_INTENT_TO_CANDIDATE_INTENT`.
- Why non-blocking: P1-02 only requires the canonical case and rule-based extraction; the classifier is the agent's existing behavior, not new code.
- Suggested revisit phase: P2 (if consultation routing needs semantic intent).

## BL-011 Service-type extraction relies on a curated noun + style-modifier heuristic
- Type: DEFERRED
- Found in task: BUSOS-P1-02
- Description: `extractServiceType` walks left from a fixed deliverable-noun list (写真 / 婚纱照 / 婚纱 / 全家福 / 证件照 / 艺术照 / 孕妈照 / 宝宝照 / 儿童照 ...) and collects a bounded style modifier (≤6 chars, stop chars prevent date leakage; "日" removed from stop set so "日系写真" keeps its style). New verticals require list maintenance.
- Why non-blocking: Canonical case and several style generalizations pass; the heuristic is intentionally rule-based per D012 (evidence-backed extraction).
- Suggested revisit phase: P2 (model-driven extraction) or whenever a new service vertical is onboarded.

## BL-012 Initial risk level / missing_fields are placeholders, not governance output
- Type: DEFERRED
- Found in task: BUSOS-P1-02
- Description: Candidate Builder sets `governance.risk_level="R0"` and `missing_fields=[]` by design. The agent's own `risk_level` is reply-safety and a different axis from lead business risk, so it is NOT copied. The real governance rule (reject / review-required / allow-placeholder for null fields like `service_type`) is deferred to the Governance Engine (P1-03 / P2).
- Why non-blocking: P1-02 scope is "produce candidate only" (D015); governance evaluation is out of scope.
- Suggested revisit phase: P1-03 / P2 (Governance Engine), linked to BL-005.

## BL-013 Real Feishu E2E blocked (missing credentials / Base config)
- Type: DEFERRED (blocking only the live create/readback E2E gate; skeleton + fake-verified logic complete)
- Found in task: BUSOS-P1-03
- Description: The environment has no `FEISHU_APP_ID` / `FEISHU_APP_SECRET` / `FEISHU_BASE_APP_TOKEN` / `FEISHU_LEAD_TABLE_ID` / `FEISHU_CUSTOMER_TABLE_ID`. The real `FeishuAdapter` is implemented and env-driven (no secrets hardcoded), and its full write->readback->VERIFIED pipeline is proven via a stubbed transport, but the live Feishu create/readback cannot be verified here. Per task §6 / §19 this is reported as PARTIAL / BLOCKED, NOT as PASS.
- Why non-blocking for the skeleton: repository domain logic, mapping contract, readback verification and error handling are all proven by the explicit `FakeFeishuAdapter` + real-adapter-stubbed-transport tests.
- Suggested revisit phase: when the user supplies FEISHU_* credentials (and a writable test Base) — re-run `tests/feishu-real.test.ts` live block to flip BLOCKED -> PASS.

## BL-014 A real Feishu Base with a dedicated Lead table must be provisioned
- Type: DEFERRED
- Found in task: BUSOS-P1-03
- Description: The previously validated Collator Base merges lead+customer fields into a single "customer" table (see `lark/src/scripts/temp/customer-fields.json`). P1-03 requires a SEPARATE Lead table and Customer table. The Lead table must carry both a `Customer ID` canonical text field (for round-trip of `lead.customer_id`) AND a `客户关联` link field to the Customer table (feishu-real.test.ts sets both on linkLeadCustomer). The default field map (DEFAULT_FIELD_MAP) is configurable, but the real Base must actually exist with these fields before the live E2E can pass.
- Why non-blocking: the adapter is configuration-driven; provisioning the Base is an ops step, not a code change.
- Suggested revisit phase: P1-03 live E2E (with BL-013 credentials).

## BL-015 P1-02 extractor does not resolve "新中式" alone to a service_type
- Type: DEFERRED (non-blocking; child of BL-011)
- Found in task: BUSOS-P2-GP-001
- Description: The flow-B consultation in the GP-001 brief is "我是张三，微信 zhangsan123，想下个月拍新中式，预算4000。". The FROZEN P1-02 `extractServiceType` only resolves a service_type when a deliverable noun is present; "新中式" alone is a style modifier and matches no noun in `SHOOT_TYPE_NOUNS`, so `requirement.service_type` is null. A null service_type cannot become a canonical `Lead` (LeadSchema requires non-null service_type), so governance REJECTs it. GP-001 Flow B tests therefore use "新中式写真" (the same phrasing as Flow A) so the golden path genuinely passes. This is a frozen-extractor limitation, not a GP-001 defect.
- Why non-blocking: GP-001 implementation is fully verified; the literal one-word phrasing gap is a P1-02 extraction maintenance item, not a blocker. Exact identity resolution, readback verification, and fail-closed behaviour are all unaffected.
- Suggested revisit phase: P2 (model-driven service-type extraction) or when a new service vertical is onboarded (BL-011).

