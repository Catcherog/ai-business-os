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

## R2 Planning Note (added by BUSOS-R2-00, 2026-08-15)

R2 product direction and H2/H3/H4 candidate areas live in
`R2-LONG-TERM-ROADMAP.md`. New photography-specific requirements (e.g. a
`ProjectParticipant` domain, scheduling, finance) discovered through **real
Workspace usage** in H1 must enter this backlog **first** as a non-blocking item
before they can change the active task. Execution windows must not pull roadmap
candidate areas (Memory, Evaluation Center, observability, multi-tenant, etc.)
into scope automatically — those remain deferred horizons until explicitly
authorized.

- BL-015 — DEFERRED / NON-BLOCKING (P1-02 extraction gap). Unchanged.
- BL-016 — **CLOSED** (P5 owner override). Must not be cited as an active blocker.
- BL-018 — **OPEN / LUMEN ENGINEERING REPAIR + LIVE DEPENDENCY**. The latest
  diagnostic (`8f9ad4a`) supersedes the quota-only classification: CloudBase
  accepted writes; the deployed Lumen application/SDK path did not reach the DB.
- BL-019 — **CLOSED** (BUSOS-P6-03 golden-path simulator regression repaired).

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
- Type: **CLOSED (2026-08-12)** — resolved during BUSOS-P2-GP-001-LIVE-CLOSURE.
- Found in task: BUSOS-P1-03
- Description: The environment had no `FEISHU_*` credentials. The real `FeishuAdapter` is implemented and env-driven (no secrets hardcoded); its full write->readback->VERIFIED pipeline was proven via a stubbed transport and is now proven against LIVE Feishu.
- Resolution: user supplied `FEISHU_APP_ID` / `FEISHU_APP_SECRET` / `FEISHU_BASE_APP_TOKEN` (+ Lead/Customer table ids). `packages/golden-path/tests/real-adapter.test.ts` LIVE block executed against real Feishu OpenAPI and PASSED (anonymous lead → real write → real readback → VERIFIED). Now honestly reported as **LIVE FEISHU E2E: PASS**.

## BL-014 A real Feishu Base with a dedicated Lead table must be provisioned
- Type: **CLOSED (2026-08-12)** — provisioned during BUSOS-P2-GP-001-LIVE-CLOSURE.
- Found in task: BUSOS-P1-03
- Description: P1-03 requires a Lead table carrying a `Customer ID` canonical text field and a `客户关联` link field. The provided app lacks table-creation permission, so the DEFAULT_FIELD_MAP Lead fields were added to the existing `数据表` scratch table `tblp9GuLf3nY597F` (which now hosts the Lead columns). The `客户关联` field is modeled as TEXT (a true link field could not be created via API); the adapter only emits it when a customer is linked, so the live Flow A (anonymous) write is unaffected.
- Why non-blocking: provisioning the Base is an ops step; the live E2E now passes against this table.

## BL-015 P1-02 extractor does not resolve "新中式" alone to a service_type
- Type: DEFERRED (non-blocking; child of BL-011)
- Found in task: BUSOS-P2-GP-001
- Description: The flow-B consultation in the GP-001 brief is "我是张三，微信 zhangsan123，想下个月拍新中式，预算4000。". The FROZEN P1-02 `extractServiceType` only resolves a service_type when a deliverable noun is present; "新中式" alone is a style modifier and matches no noun in `SHOOT_TYPE_NOUNS`, so `requirement.service_type` is null. A null service_type cannot become a canonical `Lead` (LeadSchema requires non-null service_type), so governance REJECTs it. GP-001 Flow B tests therefore use "新中式写真" (the same phrasing as Flow A) so the golden path genuinely passes. This is a frozen-extractor limitation, not a GP-001 defect.
- Why non-blocking: GP-001 implementation is fully verified; the literal one-word phrasing gap is a P1-02 extraction maintenance item, not a blocker. Exact identity resolution, readback verification, and fail-closed behaviour are all unaffected.
- Suggested revisit phase: P2 (model-driven service-type extraction) or when a new service vertical is onboarded (BL-011).

## BL-016 LIVE Creative E2E blocked (missing Lumen Vercel + Feishu Asset credentials)
- Type: **CLOSED** (2026-08-15) — P5 engineering blocker resolved / owner override recorded (see amendment below).
- Hygiene note (BUSOS-P6-02, 2026-08-15): BL-016 is CLOSED and MUST NOT be cited as
  an active/OPEN blocker. Any still-outstanding **live** evidence (P6-C) is tracked by
  **BL-018 (OPEN / NON-ENGINEERING LIVE DEPENDENCY)**. History below is preserved
  verbatim and is not rewritten.
- Found in task: BUSOS-P5-01
- Description: The REAL end-to-end creative slice (live Feishu Asset write/readback + live Vercel Lumen generation) requires `LUMEN_BASE_URL` + `LUMEN_AUTH_PASSWORD` (the Lumen `AUTH_PASSWORD`, NOT the provider key) and `FEISHU_*` + `FEISHU_ASSET_TABLE_ID`. Neither set was provided in this environment. The implementation is COMPLETE and verified by fake + real-adapter(stubbed) gates (P5-A..P5-H PASS); only the live run is blocked.
- Why non-blocking: Implementation is fully verified without live credentials; the slice is reported honestly as `IMPLEMENTATION PASS / LIVE CREATIVE E2E BLOCKED`. No production behaviour depends on the live run having executed.
- Suggested revisit phase: When CloudBase read quota is restored, rerun
  `lumen_repro_x02.mjs` (with the rotated `LUMEN_AUTH_PASSWORD`) + the
  `packages/creative-production` live-e2e to claim LIVE CREATIVE_SUCCESS.

### 2026-08-15 OWNER OVERRIDE (P5 closure authority)
P5 may close as **FUNCTIONAL PASS** with the live rerun **deferred** when the sole
remaining blocker is an exhausted third-party **CloudBase NoSQL read quota** and all
implementation / contracts / production persistence integration have been verified
(P5-X03 HARDEN deployed `dpl_AdnQygPLZ7fB58QJECcvj5o4NxGV`; NoSQL persistence 147/0;
P5-03 signed-urls contract PASS; `GET /api/projects` → 401). This exception does
**not** convert deferred live evidence into a PASS. BL-016 → CLOSED (engineering
blocker resolved; owner override recorded). P5 no longer blocks P6. The residual
live-evidence dependency migrated to **BL-018** (BUSOS-P6-02 hygiene pass).

## BL-002 Creative Agent / Lumen integration — status updated by BUSOS-P5-01
- Type: DEFERRED → **IMPLEMENTATION COMPLETE (live E2E still deferred, see BL-016)**
- Found in task: Architecture planning / BUSOS-P5-01
- Description: `Project -> Creative Task -> Lumen -> Asset` is now implemented as a bounded vertical slice in `@busos/creative-production` + `@busos/lumen-adapter`, behind the canonical `LumenPort` (only Lumen `AUTH_PASSWORD` + base URL held; provider key stays in Lumen, §19). The additive `Asset` contract (`asset_type=IMAGE`, `source=LUMEN`) and Asset/Task-status repository operations are in place.
- Why non-blocking for live: only the REAL Feishu+Lumen E2E is deferred (BL-016). The fake + real-adapter(stubbed) gates all PASS.
- Suggested revisit phase: P5 live closure (BL-016) — **P6 authorized 2026-08-15** (owner override); live rerun deferred on CloudBase quota.

## BL-017 updateLeadStatus writes Lead Created-At as ISO (DatetimeFieldConvFail risk)
- Type: DEFERRED (non-blocking — out of BUSOS-P5-X01 scope)
- Found in task: BUSOS-P5-X01 (discovered while fixing the sibling P5-04 `updateTaskStatus` bug)
- Description: `packages/business-repository/src/feishu-adapter.ts` `updateLeadStatus` writes the Lead `Created At` DateTime field as `new Date().toISOString()`. Feishu DateTime fields require epoch-ms via `toFeishuDateTime()` (as `createTask`/`createAsset` correctly do). `updateTaskStatus` had the identical defect and failed live with `code=1254064 msg=DatetimeFieldConvFail field="Created At"`; `updateLeadStatus` would hit the same failure if a Lead status update carries `Created At`.
- Why non-blocking: P5-X01 scope is the Lumen production-generation root cause (queue→worker, no on-demand execution). Lead-status writes are not on the P5 live closure path (the live E2E seeds `lead_id: 'lead_live_p5'` and never calls `updateLeadStatus`). The P5-04 Task-DONE fix is complete and unaffected.
- Suggested revisit phase: When a flow first calls `updateLeadStatus` with a `Created At` payload, or as a proactive hardening pass on Feishu DateTime writes. Fix mirrors P5-04: send only the status field, remove the ISO `Created At` rewrite.

## BL-018 P6-C live full-process E2E — historical origin and current blocker
- Type: **OPEN — LUMEN ENGINEERING REPAIR + LIVE DEPENDENCY** (classification
  updated by the 2026-08-23 write-path diagnostic)
- Found in task: BUSOS-P6-01 (origin), re-scoped in BUSOS-P6-02
- Origin (preserved): BL-018 was opened 2026-08-15 to track the BUSOS-P6-01
  Orchestrator MVP (composition only) — a single `@busos/orchestrator` package
  composing golden-path → project-lifecycle → creative-production behind one
  `runBusinessProcess` entrypoint, no existing package modified, no new infra.
  **That orchestrator implementation work is COMPLETE** (P6-01 COMPLETE; P6-02 COMPLETE).
  The original external-only classification below is preserved as history and is
  superseded by the later diagnostic notes.
- Historical prerequisites recorded in 2026-08-15 (superseded where noted later):
  - CloudBase availability (the quota interpretation was later ruled out)
  - **LUMEN live credentials** (`LUMEN_BASE_URL` + rotated `LUMEN_AUTH_PASSWORD`)
  - **FEISHU live credentials** (`FEISHU_*` + `FEISHU_ASSET_TABLE_ID`)
- Current nature: a Lumen application/SDK write-path engineering repair is pending
  in the separate `picture-edit` repository, followed by an owner-authorized LIVE rerun.
- Why non-blocking for engineering: the orchestrator is fully verified by fake-adapter
  gates (P6-A/P6-B) and the P6-02 reliability gates (P6-D..P6-J). Deferred live
  evidence is NEVER substituted by a fake PASS.
- Closure path: when quota is restored and both credential sets are supplied, run the
  SAME entrypoint once — `runBusinessProcess(input, { businessRepository: RealFeishuAdapter-based, lumen: RealLumenAdapter }, { idempotencyKey })` —
  and claim P6-C LIVE full-process E2E. Sanitized evidence only; cleanup by exact `record_id`.
- **H1-04 impact (2026-08-17):** the first real AI action — `Generate Visual Reference`
  (`runCreativeProjectAction`, CREATIVE_PRODUCTION only) — is ENGINEERING COMPLETE and
  verified via the in-browser DEMO path + the server-only CONNECTED boundary probe
  (`smoke-server.mjs` → `BLOCKED` with no credentials). Its **LIVE gate** (real Feishu
  Project + real Lumen generation + real Asset write + readback VERIFIED + UI Run/Asset
  view) is the very dependency BL-018 tracks, and is **not executed** in this
  environment. H1-04 is reported **ENGINEERING COMPLETE / LIVE GATE BLOCKED**, never as
  a fake LIVE PASS; the task STOPS (no auto H1-05 / H2 / H3 / H4).
- Suggested revisit phase: owner-authorized live closure run (H1-04 live gate or P6-C).

## BL-018 — H1-05 Real Usage Closure Note (updated 2026-08-17)

The **BUSOS-R2-H1-05 — Real Usage Closure** task **closed the operator loop** end-to-end in
the in-browser **DEMO** mode (Fake adapters + shared in-memory registry) and verified the
server-only **CONNECTED** boundary probe. Findings:

- The full journey now passes as a coherent product: Overview (real aggregated KPIs +
  activity) → Projects → Creative Action → Run → Review → return to Project with synced
  state. All H1-S1..H1-S7 pass on **engineering / DEMO** (see `BUSOS-R2-H1-05.md`, gates
  H1-05-A..J all PASS).
- Two genuine product gaps were **fixed** during closure: BL-020 (nav `LIVE`→`DEMO`, fixed in
  the earlier MVP-review pass) and, in this closure pass, **BL-021** (Project Detail now
  auto-refreshes Tasks/Assets/Related Runs after a GVR via `reloadDynamic`) and **BL-022**
  (Overview now aggregates real KPIs via `buildOverview`).
- The **NORMAL LIVE gate remains BLOCKED** under BL-018. No real Feishu Project write + real
  Lumen generation + real Asset write + readback VERIFIED + UI Run/Asset view was executed in
  this task. This is reported honestly — the verdict is
  `H1 ENGINEERING COMPLETE / TEMPORARY LIVE NOT RE-EXECUTED IN H1-05 / NORMAL LIVE DEFERRED —
  BL-018`, never a faked LIVE PASS. (Temporary-live feasibility was already demonstrated by
  H1-X01; H1-05 reuses that same GVR vertical slice and adds no new live action.)

BL-018 remains **OPEN / NON-ENGINEERING LIVE DEPENDENCY**. H1-05 STOPS after
commit + push; H2/H3/H4 are not auto-started.

## BL-018 — 2026-08-23 Re-Verification Note (BUSOS-R2-BL-018-LIVE-CLOSE)

Owner-authorized LIVE re-verification executed 2026-08-23 (authority baseline
`origin/main = 4e5f77f`, verified equal). Result: **STILL BLOCKED — BL-018 remains OPEN**;
H1-X01 remains **TEMPORARY LIVE FEASIBILITY** (NOT upgraded to NORMAL LIVE). Full report:
`project-control/BUSOS-R2-BL-018-LIVE-CLOSE.md`.

Live evidence (2026-08-23 11:47–11:54 GMT+8, deployed `https://lumen-ink.vercel.app`):
- `GET /api/health` → 200; `GET /api/projects` (no auth) → 401 fast (server healthy).
- `POST /api/auth` → **hang** (curl `000` after 40 s ×3); Vercel logs show **504 Vercel
  Runtime Timeout Error: Task timed out** @ 11:51:48 / 11:52:29 / 11:53:11.
- Vercel log @ 11:51:42: `GET /api/health → 200 [TCB][WARN] Your current request
  database.get…` — **CloudBase SDK read-quota warning**.
  > **ERRATUM (2026-08-23, RETRY-01):** the `[TCB][WARN] …database.get…` text is NOT a
  > quota error. Per the deployed SDK source (`@cloudbase/node-sdk/dist/utils/tcbapirequester.js`
  > `setSlowWarning`) the full message is `[TCB][WARN] Your current request <action> is longer
  > than 3s, it may be due to the network or your query performance` — a SLOW-QUERY warning.
  > See the RETRY-01 note below for the corrected diagnosis.

Conclusion: **CloudBase NoSQL read quota is STILL exhausted as of 2026-08-23** (the
~2026-08-21 expected reset did not materialize). The only missing evidence for closure —
the deployed-Lumen leg (real Vercel+CloudBase generation) — is unreachable at its first
step (Lumen auth reads NoSQL). No BUSOS engineering defect surfaced; no production code
touched; closure criteria NOT weakened. Retry only after the quota condition changes
(reset/upgrade).

## BL-018 — 2026-08-23 RETRY-01 Note (BUSOS-R2-BL-018-LIVE-CLOSE-RETRY-01)

Owner-authorized LIVE closure retry executed 2026-08-23 12:29–12:37 GMT+8 (authority
baseline `origin/main = c8b4577`, verified equal; no conflicting control state).
Result: **STILL BLOCKED — BL-018 remains OPEN**; H1-X01 remains **TEMPORARY LIVE
FEASIBILITY**. Full report: `project-control/BUSOS-R2-BL-018-LIVE-CLOSE-RETRY-01.md`.

Live evidence (deployed `https://lumen-ink.vercel.app`):
- Gate A PASS: `GET /api/health` → 200 ×3 (1.4–2.1 s). (Route does not touch the DB.)
- Gate B **FAIL**: `POST /api/auth` wrong password → hang (curl `000` @ 30–35 s ×6);
  Vercel logs **504 Vercel Runtime Timeout Error: Task timed out** @ 12:30:17 / 12:30:47
  / 12:31:18. Differential probe: empty body `{}` → **400 @ 1.1–1.8 s** (×3, fast) —
  the NoSQL **read** (`isBlocked`) completes; the hang is the **write**
  (`recordFailure` → `collection.authThrottle.doc(key).set()`). A correct password
  would also hang at `recordSuccess` (write) → auth unconditionally non-functional.
- Corrected diagnosis: CloudBase NoSQL **reads recovered but slow** (one probe logged the
  SDK slow-query WARN `…is longer than 3s…` @ 12:37:23.70); **writes hang** → Vercel 504.
  The earlier "read-quota exhausted" reading is superseded (see ERATUM above).

Conclusion: **the deployed Lumen auth path is still not operational as of 2026-08-23
12:37 GMT+8**; the "CloudBase recovered" premise was NOT confirmed by live evidence.
No BUSOS engineering defect surfaced (differential is external CloudBase behavior); no
production code touched; no closure, no weakened criteria, no fabricated downstream
evidence. Retry only when auth completes without 504 (CloudBase write path recovered).

## BL-018 — 2026-08-23 CLOUDBASE-WRITE-DIAG-01 Note (BUSOS-R2-BL-018-CLOUDBASE-WRITE-DIAG-01)

Owner-authorized write-path diagnostic executed 2026-08-23 14:04–16:21 GMT+8
(authority baseline `origin/main = 0d417af`, verified equal). CloudBase connector
connected by owner; control plane + metrics + admin write probes performed against
the CONFIRMED production env (`zeh-d7glqc07me2155c61`, verified = lumen-ink env via
lumen task doc). Full report:
`project-control/BUSOS-R2-BL-018-CLOUDBASE-WRITE-DIAG-01.md`.

**Result: CASE C — LUMEN-DEFECT-SUSPECTED. CloudBase provider EXONERATED.**
- Control plane: env NORMAL / DB RUNNING / prepaid 个人版 / Expire 2026-09-21 /
  not isolated / no write restriction.
- **DbWrite metric = ALL ZERO** 11:30→16:15 (writes never reach the DB), while
  **DbRead > 0** in the same windows (11:55=17, 12:30=6, 12:35=13, 12:40=17,
  14:05=11). Billing FLEXDB: ReadRequests=967, **WriteRequests=0** (write quota
  untouched — the "write quota" reading is now fully superseded).
- Admin write probes (connector) on **`prod_auth_throttle`** (the exact production
  throttle collection): insert / readback / upsert-update / delete — **ALL SUCCESS**
  @ 16:15–16:17; cleanup verified (Count back to 0).
- Same-time correlation: connector writes OK @ 16:15–16:17 vs deployed
  `POST /api/auth` still hanging @ 16:18:29 (curl 000 @ 30 s) and **504 @ 91.5 s**
  @ 16:20:25 (= Vercel `maxDuration: 90`).
- Open sub-question: SDK 3.18.3 write behavior vs env-level Server API Key vs
  Vercel-region→TCB data-plane write endpoint latency (reads also slow at 3–5 s).
  Exact-recordFailure-shape probe (same SDK + same key) still needs `CLOUDBASE_API_KEY`.

**BL-018 remains OPEN.** No closure, no fix, no deploy, no weakened criteria.
Recommended next step (owner decision): separate Lumen write-path repair task with
the same-SDK Probe D as verification, then re-run Gate A→G.

## BL-018 — Unified OS Rebaseline Classification (2026-08-23)

`BUSOS-R2-UNIFIED-OS-REBASELINE-01` adopts the latest evidence as the current
classification: **OPEN / LUMEN ENGINEERING REPAIR + LIVE DEPENDENCY**. Earlier
quota and “not an engineering defect” statements are historical and superseded.

Required closure order:

1. `LUMEN-WRITE-PATH-FIX-01` in `picture-edit`, separately authorized and audited.
2. Match the repaired Lumen deployment to its exact commit.
3. Run the BUSOS Connected/LIVE journey with real Feishu write/readback.
4. Close BL-018 only if every existing live gate passes without weakened criteria.

## BL-020 H1 nav surfaces mislabelled LIVE (contradicted honest DEMO footer)
- Type: **DEFERRED → FIXED IN H1-05 (non-blocking at closure)**
- Found in task: BUSOS-R2-H1-05 (product usability review)
- Description: `apps/operator-workspace/src/ui.ts` tagged the `Projects` /
  `Reviews` / `Runs` nav entries as `LIVE`. The app is an in-memory DEMO (Fake
  adapters) and its footer + `Generate Visual Reference` result badge already say
  `DEMO` / `IN-MEMORY`. The `LIVE` tag violated the DEMO/CONNECTED/LIVE honesty rule
  (requirement #6) and would mislead an operator into trusting seeded data as
  production. Severity P1 (honesty/trust, not a crash).
- Fix: changed all three nav tags `LIVE` → `DEMO` in `ui.ts`. No behaviour change;
  the shared registry / service wiring is untouched.
- Why non-blocking for engineering: does not affect any data path or contract; the
  CONNECTED (server-only) boundary is the only place real credentials are used and
  was already correctly labelled. The fix was applied during the H1-05 review itself.
- Suggested revisit phase: none (resolved).

## BL-021 Project Detail panels do not auto-refresh after Generate Visual Reference
- **CLOSED (2026-08-17) — fixed in BUSOS-R2-H1-05 (Real Usage Closure).**
- Found in task: BUSOS-R2-H1-05 (walkthrough).
- Resolution: `gvrPanel(projectId, onSuccess?)` now calls `onSuccess` (= `reloadDynamic`)
  on `SUCCEEDED`, which re-renders the Project Detail Tasks / Assets / Related Runs via the
  shared registry — no manual "刷新项目详情" required (state-consistency Case 1). The closure
  smoke re-verifies the synced state on return to the Project. Non-blocking papercut eliminated.

## BL-022 Overview surface is a placeholder (no aggregate KPIs)
- **CLOSED (2026-08-17) — fixed in BUSOS-R2-H1-05 (Real Usage Closure).**
- Found in task: BUSOS-R2-H1-05 (walkthrough).
- Resolution: `buildOverview(read, review, run)` (new pure projection, `apps/operator-workspace/
  src/overview-model.ts`) now aggregates real project counts + status breakdown + pending reviews
  (clickable) + recent runs (clickable) + a cross-surface recent-activity feed. KPIs are computed
  at render time from the live read services — no hardcoded values. Closure smoke asserts
  `projects=2, pendingReviews=3, runs=4` derived from the real surfaces.

## BL-023 DEMO assetUri shown raw (`lumen-stub://...`)
- Type: DEFERRED (non-blocking)
- Found in task: BUSOS-R2-H1-05 (walkthrough)
- Description: In DEMO mode the generated Asset `assetUri` is the literal
  `lumen-stub://generated/...` stub. It is correctly shown only after a SUCCEEDED
  result and is not presented as a real URL, but the raw scheme is visible to the
  operator. A small masking/label ("DEMO 资源（模拟）") would read more clearly.
- Why non-blocking: no secret/leak risk (the stub is a fake value); purely cosmetic.
- Suggested revisit phase: H2 (UI polish) — lowest priority.

## BL-019 golden-path real-adapter-simulator Flow B fails (`linkLeadCustomer: lead not found in Feishu`)
- **CLOSED (2026-08-15) — test-harness regression repaired (BUSOS-P6-03).** The
  diagnostic history below is preserved verbatim.
- Type (history): **OPEN / NON-BLOCKING** (pre-existing; observed during BUSOS-P6-02 regression sweep)
- Found in task: BUSOS-P6-02 (observation only — NOT caused by P6-02)
- Closure (BUSOS-P6-03): root cause confirmed as a **stale in-memory Feishu
  simulator** in `packages/golden-path/tests/testkit.ts` (`makeFeishuStub`). The
  production `RealFeishuAdapter.findRecordsByField` switched to the `/records/search`
  endpoint in BUSOS-P4-01 (the list `?filter=` query returns InvalidFilter on the
  live Base), but the golden-path stub copy never gained the `/records/search`
  branch. So `linkLeadCustomer`/`findCustomerByIdentity` resolved to zero records
  and Flow B failed closed. Fix: add the `POST .../records/search` branch to the
  golden-path stub (mirrors the already-correct `packages/business-repository/tests/feishu-real.test.ts`
  stub). **No production/contract/business behavior changed.** All golden-path +
  workspace gates green (see BUSOS-P6-03 FINAL REPORT).
- Description (history): `packages/golden-path/tests/real-adapter.test.ts` Flow B fails with
  `expected 'FAILED' to be 'SUCCESS'`. Root cause (probed, then probe removed):
  `linkLeadCustomer: lead not found in Feishu: lead_<id>` — the in-memory Feishu
  simulator's readback of the just-written Lead does not find the record, so the
  link step fails closed.
- Proof it is pre-existing: `git hash-object` shows
  `packages/golden-path/tests/real-adapter.test.ts`, `packages/golden-path/tests/testkit.ts`
  and `packages/business-repository/src/feishu-adapter.ts` are **byte-identical** to
  remote `0b515e9`, and `git diff --exit-code 0b515e9` on those packages exits 0.
  P6-02 touched `packages/orchestrator` only.
- Why non-blocking: it is a test-simulator fidelity issue in golden-path, not a
  production or contract defect; the live golden-path E2E (P2/GP-001) previously
  PASSED against real Feishu. All other 8 packages are green.
- Revisit phase (history): a dedicated golden-path test-harness maintenance task
  (fix the simulator Lead readback keying). Explicitly out of P6-02 scope
  (no refactor of existing packages allowed). **CLOSED by BUSOS-P6-03 (2026-08-15):
  the `/records/search` stub branch was added; no production code touched.**

