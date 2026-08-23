# BUSOS-R2-UNIFIED-OS-REBASELINE-01 — Unified AI Business OS Product Rebaseline

## 0. Document status

| Field | Value |
|---|---|
| Document type | Product design, roadmap, governance and audit baseline |
| Task type | Planning / control documents only |
| Design direction | Owner-approved in conversation on 2026-08-23 |
| Repository review | Plan direction approved; `REBASELINE-CORR-01` control patch pending owner re-review |
| Authority baseline | `origin/main@8f9ad4a830cfb8217bed2227269c570cc1237fb8` |
| Planning branch | `codex/busos-r2-unified-os-rebaseline` |
| Product code changes | None |
| Deployment / production mutation | None |
| Implementation authorization | None; every implementation unit requires a new explicit owner authorization |

This document supersedes `R2-LONG-TERM-ROADMAP.md` **only for post-H1 product
sequencing and information architecture**. It does not rewrite R1 history, reopen
D001–D020, or retroactively change prior task evidence.

`BUSOS-R2-UNIFIED-OS-REBASELINE-CORR-01.md` records the repository-review control
patch applied directly to this document: parallel lane governance, the SCS production
connection boundary, dual product journeys, the separate Evaluation loop and Runtime
Identity ownership.

---

## 1. Why this rebaseline is required

The repository has reached a capability/product-surface mismatch:

- H1 delivered the four-surface Operator Workspace: Overview, Projects, Reviews and Runs.
- H2 delivered governed Memory and a backend Evaluation Harness.
- Service Agent now has a real BUSOS port, orchestrator entry and Run Detail projection.
- Real Feishu and Lumen adapters exist behind server-only boundaries.
- The browser product still runs primarily on `FakeFeishuAdapter`, fake Lumen and
  in-memory registries.

The result is technically substantial but not yet a unified product. Existing
capabilities are visible only indirectly, use different runtime boundaries, or have
no product surface at all.

The new delivery direction is therefore:

> **Capability → Product Surface → Connected Data → Production Closure**

This is an extension of the existing platform. It is not a rewrite, a new ERP, a
generic chatbot, a workflow builder, or a multi-tenant SaaS expansion.

---

## 2. Verified baseline and corrected claims

### 2.1 Current authoritative facts

| Capability | Verified current state | Missing product/production boundary |
|---|---|---|
| Operator Workspace | Overview / Projects / Reviews / Runs are implemented | No scalable post-H1 IA; browser remains DEMO-first |
| Project workspace | Project + Customer ref + Tasks + Assets + embedded Memory + GVR action | Connected Feishu is not the Workspace-wide data source |
| Service Agent in BUSOS | `ServiceAgentPort`, real local bridge, orchestrator run, evidence/risk/handoff projection, Run Detail | No conversation store/read model, product API, conversation workspace or BUSOS binding to the production SCS endpoint |
| External SCS production | `SCS-R2-CLOUDBASE-REDEPLOY-02` evidence review: repair SHA `ab2b03bc3f1f6ac0c3c7481de33eb1e6a1d753f8`, Deploy `046`, readiness/smoke PASS | This closes the external deployment prerequisite only; it is not BUSOS Connected/LIVE evidence |
| Feishu | `BusinessRepository` + real/fake `FeishuAdapter`, canonical mapping, write readback | Current Connected server boundary covers a narrow GVR action, not all business reads/writes |
| Memory | Governed records and bounded context consumption | Embedded/read-only product surface; no durable repository |
| Evaluation | Deterministic harness, Golden Set, gates, JSON/Markdown reports and CLI | No server application boundary, report store or Evaluation Center UI |
| Lumen | Adapter and project business action exist | BL-018 is blocked at deployed Lumen auth/write path |
| Production | Stable public DEMO exists; external SCS production prerequisite is complete | BUSOS production binding and the Unified Connected/LIVE journeys are not proven |

### 2.2 BL-018 classification correction

Historical BL-018 notes described a CloudBase quota or external dependency. The latest
owner-authorized diagnostic at `8f9ad4a` supersedes that root-cause classification:

- CloudBase control plane is normal.
- The exact production collection accepted admin insert/readback/update/delete.
- Deployed Lumen `.set()` writes did not reach the database and timed out at the
  Vercel function boundary.
- Current classification: **LUMEN APPLICATION/SDK WRITE PATH DEFECT SUSPECTED**.

BL-018 remains open, but is no longer accurately described as only a non-engineering
CloudBase quota dependency. The repair belongs in the Lumen repository and remains a
separate owner-authorized task.

### 2.3 Windows test baseline note

The repository's real Service Agent bridge writes Unicode JSON to Python stdout. On a
Windows GBK process environment, canonical Chinese text and the `🎯` source block can be
corrupted or rejected. Planning worktree verification must set:

```powershell
$env:PYTHONIOENCODING='utf-8'
$env:PYTHONUTF8='1'
```

This is an execution-environment requirement for current tests, not evidence that a
production runtime adapter exists.

### 2.4 External SCS production prerequisite

`SCS-R2-CLOUDBASE-REDEPLOY-02` is treated as a completed external prerequisite:

- production repair SHA: `ab2b03bc3f1f6ac0c3c7481de33eb1e6a1d753f8`;
- remote ref independently rechecked during this correction:
  `refs/heads/scs/rag-phase-ab-01` resolves to that exact SHA;
- CloudBase deployment: `046`;
- reviewed evidence: source revision matched, `/healthz` and readiness returned 200,
  the prior manifest-integrity regression was absent, and the three-case smoke matrix
  passed;
- evidence verdict: `PRODUCTION_REDEPLOY_PASS / PRODUCTION_CLOSED` for SCS-R2.

This planning branch independently verifies the remote repair ref and records an
evidence-reviewed production prerequisite; it does not claim an independent live
endpoint/readiness rerun. The remaining BUSOS work is production **binding**, not another
SCS deployment. If the endpoint or deployed source revision drifts from this evidence,
the later BUSOS connection gate must stop.

---

## 3. Target product definition

### 3.1 Product success statement

A user can open one AI Business OS address and complete two distinct business
lifecycles. They may be verified continuously during release acceptance, but they are
not one domain state chain.

**Acquisition Journey**

```text
Prospect
  → Service Agent consultation
  → Intent / Risk / Route / Evidence / Handoff
  → LeadCandidateV1
  → GovernanceResultV1
  → Human Review
  → canonical Lead + Feishu readback
  → optional Customer conversion
  → Project only after conversion
```

`Prospect` is a product-entry concept, not a new canonical entity. A Lead may remain
anonymous. Service Agent remains candidate-only, and Customer/Project creation follows
the frozen conversion rules.

**Existing Business Journey**

```text
Customer / Project
  → contextual Service Agent + governed Memory
  → Task / Asset / Project-bound Lumen action
  → canonical Run / Trace
```

Evaluation is a separate operator loop, not an automatic downstream step of every
business run:

```text
Evaluation operator
  → approved Golden Set
  → deterministic Harness
  → Report
  → Cases / Metrics / Gates
```

The product must expose its current runtime truth—DEMO, CONNECTED or LIVE—without a
silent fallback or misleading badge.

### 3.2 Information architecture

| Top-level surface | Responsibility | Explicit non-goal |
|---|---|---|
| Overview | Cross-module operational command view | BI warehouse or report builder |
| Customers | Customers list/detail with Leads as a nested view | Full CRM rewrite |
| Projects | Project, Tasks, Assets, embedded Memory and business actions | Full photography ERP |
| Service Agent | Conversations, consultation, evidence, risk and handoff | Generic context-free chatbot |
| Reviews | Existing governed human decisions | Second governance engine |
| Runs | Canonical process/run detail and sanitized Trace | New parallel state machine |
| Evaluation | Golden Set run summary, cases, metrics and gates | Full experiment/model platform in first slice |
| Integrations | Sanitized runtime and connector health | Feishu/Lumen administration console |

Navigation items are introduced only when the corresponding vertical slice has a
working surface. The IA is frozen by this design; empty placeholder pages are not a
deliverable.

### 3.3 Embedded capabilities

- Memory stays inside Customer and Project context; it is not a top-level surface.
- Lumen stays a Project-bound Business Action; it is not a top-level tool.
- Feishu stays the persistence/data plane behind `BusinessRepository`; ordinary users
  operate BUSOS domain objects, not Feishu tables.
- Service Agent may create a candidate, never a business fact. D015 remains binding.

---

## 4. Runtime architecture

### 4.1 Browser/server boundary

The browser must depend on a stable Workspace Data Source contract rather than directly
constructing repositories and registries.

```text
Operator Workspace UI
  → Workspace Data Source
      → DemoWorkspaceDataSource
          → FakeFeishuAdapter / FakeLumenAdapter / in-memory stores
      → ServerWorkspaceDataSource
          → BUSOS server application services
              → BusinessRepository → RealFeishuAdapter
              → ServiceAgentPort → deployable runtime adapter
              → ProcessRegistry read/write ports
              → Evaluation application service
```

Rules:

1. `DEMO` is explicit and may use fake/in-memory adapters.
2. `CONNECTED` means a real server boundary is active; missing credentials or runtime
   dependencies produce `CONNECTED BLOCKED`.
3. `LIVE` requires a real external call, persistence, readback and visible business
   output evidence.
4. The browser never receives credentials, raw provider payloads, prompts, unrestricted
   trace metadata or Feishu table identifiers.
5. A server failure never causes an automatic switch from Connected to Demo.

### 4.2 Service Agent boundary

Current `ServiceAgentBridgeAdapter` is a valid local-real adapter but not a proven
production deployment design because it relies on a local Python executable, a frozen
source path and local model/vector assets.

The runtime slice must retain `ServiceAgentPort` and provide two explicit adapters:

- Local Connected: existing Python bridge for deterministic local-real evidence.
- Production: a deployable adapter, expected to be HTTP unless a co-located runtime
  probe proves packaging, startup, model assets and latency within the chosen platform.

The product application boundary must provide:

- run one consultation;
- list conversations;
- read one conversation;
- map each consultation to canonical Run/Trace;
- preserve stable conversation/customer/project references;
- return structured evidence/risk/handoff without exposing prompts or provider dumps.

Conversation durability is delivered behind a dedicated store port. The first DEMO
implementation may be in-memory; the production adapter must be proven before LIVE.

### 4.3 Candidate-to-fact boundary

Service Agent actions use the existing governed path:

```text
Service Agent answer
  → optional "Generate lead candidate"
  → LeadCandidateV1
  → GovernanceResultV1
  → APPROVE / EDIT+APPROVE / REJECT
  → BusinessRepository commit
  → Feishu write
  → critical-field readback
```

The Service Agent page must not offer a direct “create canonical lead/project” write.
A Project can only be created after the existing lead/customer conversion rules permit it.

### 4.4 Feishu data plane

Connected Workspace reads and writes are server-only and use canonical domain services:

- Customers and Leads;
- Projects and Project Detail;
- Tasks and Assets;
- Review decisions and candidate commits;
- business write/readback outcomes.

Integrations may expose only sanitized health fields:

```text
mode
connected
configured resource count
last successful read time
last successful write time
last readback status
latency bucket or bounded milliseconds
sanitized error code/message
```

Tokens, workspace secrets, raw field maps and full table IDs are not product fields.

### 4.5 Evaluation boundary

The existing harness remains authoritative. The product slice adds an application
boundary and report storage; it does not reimplement judges or metrics.

The Evaluation Center is operator-triggered and report-oriented in this roadmap. A
normal Service Agent, Feishu or Lumen business run ends at its canonical Run/Trace; it
does not automatically invoke the Golden Set harness. Online/per-run evaluation is a
future capability and is out of scope here.

Minimum Evaluation Center behavior:

- run the approved deterministic dataset;
- list the latest and recent reports;
- show summary buckets, metrics and gate status;
- inspect each case and failure reason;
- preserve `NOT_EVALUABLE` honestly;
- download the machine-readable report and Markdown summary.

Prompt/model comparison, experiment management and model registry remain excluded from
the first Evaluation surface.

---

## 5. Delivery roadmap

Every unit below is independently authorized, implemented, verified, committed, pushed
and stopped. A roadmap row is never authorization.

### 5.1 Dependency order

| Order | Task | Dependency | Primary outcome |
|---:|---|---|---|
| 0 | `BUSOS-R2-UNIFIED-OS-REBASELINE-01` | `main@8f9ad4a` | Written product/governance baseline |
| 0c | `REBASELINE-CORR-01` | Rebaseline review | Docs-only control correction; no implementation authority |
| 1 | `BUSOS-R2-UX-01` | Rebaseline merged | Scalable IA shell and explicit runtime identity |
| 2 | `BUSOS-R2-WORKSPACE-API-01` | UX-01 | Browser/server data-source boundary |
| 3 | `BUSOS-R2-SCS-RUNTIME-01` | Workspace API | Service Agent application/runtime boundary |
| 4 | `BUSOS-R2-SCS-UI-01` | SCS runtime | Productized Service Agent workspace |
| 5 | `BUSOS-R2-FEISHU-CONNECT-01` | Workspace API | Real Workspace-wide Feishu data plane |
| 6 | `BUSOS-R2-BUSINESS-DATA-UI-01` | Feishu connect | Customers/Leads and Integrations surfaces |
| 7 | `BUSOS-R2-EVAL-UI-01` | Workspace API | Minimal Evaluation Center |
| 8a | `BUSOS-R2-SCS-PROD-CONNECT-01` | SCS runtime + SCS UI + completed external SCS deployment prerequisite | BUSOS binding to the verified SCS production endpoint |
| 8b | `LUMEN-WRITE-PATH-FIX-01` in `picture-edit` | Separate owner authorization | Repair deployed Lumen write path and unblock BL-018 |
| 9 | `BUSOS-R2-PROD-01` | Required lanes integrated + SCS production binding + Lumen prerequisite | Unified production closure and owner journeys |

After the shared Workspace API is merged, three isolated development lanes may be
authorized concurrently:

```text
SCS lane:     SCS-RUNTIME-01 → SCS-UI-01
FEISHU lane:  FEISHU-CONNECT-01 → BUSINESS-DATA-UI-01
EVAL lane:    EVAL-UI-01
```

Each lane owns its own branch/worktree, baseline SHA, file ownership, Audit Packet and
STOP. Lane development may be parallel; authoritative integration into main is handled
by one serialized Integration Coordinator task at a time. Integration tasks are
authorization gates, not additional product roadmap scope. Task 8b is a cross-repository
prerequisite and must never be folded into a BUSOS product commit.

The resulting dependency shape is:

```text
REBASELINE → UX-01 → WORKSPACE-API-01
  → { SCS lane || FEISHU lane || EVAL lane }
  → serialized authoritative integration
  → SCS PROD CONNECT + Lumen prerequisite
  → UNIFIED PROD
```

### 5.2 `BUSOS-R2-UX-01 — Product IA Rebaseline`

**In scope**

- scalable navigation/router structure;
- define and render the `RuntimeIdentityView` UI contract for Mode, Build SHA and
  connection summary;
- existing Overview/Projects/Reviews/Runs behavior preserved;
- route and navigation tests;
- responsive navigation verification.

**Out of scope**

- empty Customers/Service Agent/Evaluation/Integrations pages;
- canonical server runtime-identity implementation, server APIs, real Feishu reads,
  Agent calls or deployment;
- broad visual redesign unrelated to IA.

**Exit gates**

- ENGINEERING PASS: typecheck, route/navigation unit tests, build and smoke.
- DEMO PRODUCT PASS: existing 17-step DEMO acceptance remains usable.
- CONNECTED/LIVE: NOT APPLICABLE.

### 5.3 `BUSOS-R2-WORKSPACE-API-01 — Runtime/Data Source Boundary`

**In scope**

- Workspace Data Source contract;
- explicit Demo and Server implementations;
- canonical API envelopes with mode/build/status;
- real Server implementation that supplies `RuntimeIdentityView` without changing its
  UI-facing contract;
- migrate existing Project/Review/Run reads and review decisions;
- fail-closed error handling and browser secret/bundle checks.

**Out of scope**

- new business entities;
- Service Agent conversation surface;
- Evaluation UI;
- production deployment.

**Exit gates**

- DEMO adapter reproduces current product behavior.
- Server adapter passes contract tests with real application services and stubbed transport.
- Missing Connected configuration yields `BLOCKED`, not fake data.
- Existing trace sanitization and readback rules remain unchanged.

### 5.4 `BUSOS-R2-SCS-RUNTIME-01 — Service Agent Runtime`

**In scope**

- consultation command and conversation read contracts;
- session/conversation store port;
- local-real bridge adapter retained;
- production adapter contract plus a controlled executable probe;
- server endpoints for run/list/read;
- canonical Run/Trace projection and idempotency;
- one R0 success and one R2 human-required local-real E2E.

**Out of scope**

- generic chatbot behavior;
- direct canonical Lead/Project writes;
- changing the frozen Service Agent implementation;
- changing/redeploying the already verified SCS production service;
- binding BUSOS to the real production endpoint.

**Exit gates**

- ENGINEERING PASS and LOCAL CONNECTED PASS.
- Production adapter contract and controlled probe PASS; binding the real endpoint is
  explicitly NOT APPLICABLE until `BUSOS-R2-SCS-PROD-CONNECT-01`.
- No prompt/customer-message/provider dump enters Trace.

### 5.5 `BUSOS-R2-SCS-UI-01 — Service Agent Surface`

**In scope**

- conversation list and detail;
- new consultation;
- Customer/Project/Memory context;
- answer, intent, risk, route, evidence, handoff and latency;
- links to canonical Run Detail;
- transfer-to-human and generate-candidate actions;
- candidate action enters Governance/Review before persistence.

**Out of scope**

- direct fact creation;
- agent-builder UI;
- prompt editing;
- production deployment.

**Exit gates**

- DEMO PRODUCT PASS for the full surface.
- LOCAL CONNECTED PASS through the real frozen Agent.
- R2/R3 and handoff flags display as human-required, never ordinary success.

### 5.6 `BUSOS-R2-FEISHU-CONNECT-01 — Connected Data Plane`

**In scope**

- server-side RealFeishuAdapter construction;
- canonical Customers/Leads/Projects/Tasks/Assets reads;
- review/candidate business writes through BusinessRepository;
- readback verification and sanitized integration health;
- explicit Connected mode with no browser credential path.

**Out of scope**

- Feishu administration UI;
- raw Base record editing;
- Lumen repair;
- silent Connected-to-Demo fallback.

**Exit gates**

- CONNECTED PASS: at least one real Project aggregate read.
- CONNECTED PASS: at least one owner-authorized business write plus critical-field readback.
- Browser bundle secret scan PASS.
- Failed/missing credentials produce `CONNECTED BLOCKED`.

### 5.7 `BUSOS-R2-BUSINESS-DATA-UI-01 — Customers, Leads and Integrations`

**In scope**

- Customers list/detail;
- nested Leads view;
- Customer links to conversations, projects, reviews and embedded Memory;
- Connected Project workspace reads;
- sanitized Feishu/Service Agent/Lumen integration health;
- cross-surface links that preserve canonical IDs.

**Out of scope**

- full CRM, scheduling, finance or invoicing;
- connector credential editing;
- top-level Memory or Lumen navigation.

**Exit gates**

- DEMO and CONNECTED product journeys use the same domain view models.
- UI clearly distinguishes demo and real business data.
- Integration errors are actionable but contain no secrets/raw payloads.

### 5.8 `BUSOS-R2-EVAL-UI-01 — Evaluation Center`

**In scope**

- evaluation application service;
- report store port and first local implementation;
- run/list/read/download endpoints;
- latest/recent report UI;
- case, metric and gate detail;
- deterministic harness remains the only evaluator.

**Out of scope**

- prompt/model/version comparison;
- online judge marketplace;
- automatic production rollout decisions;
- turning `NOT_EVALUABLE` into PASS.

**Exit gates**

- report JSON and UI summary are field-consistent.
- baseline Golden Set result is recomputed, not hard-coded.
- malformed dataset, hard-gate failure and successful run remain distinguishable.

### 5.9 Production prerequisites

#### Completed external prerequisite — `SCS-R2-CLOUDBASE-REDEPLOY-02`

- repair SHA `ab2b03bc3f1f6ac0c3c7481de33eb1e6a1d753f8`;
- CloudBase Deploy `046`;
- evidence review verdict `PRODUCTION_REDEPLOY_PASS / PRODUCTION_CLOSED`;
- this prerequisite must not be repeated or folded into BUSOS implementation.

#### `BUSOS-R2-SCS-PROD-CONNECT-01`

- bind the BUSOS server-side production adapter to the verified SCS endpoint;
- run request/response contract tests against that endpoint;
- verify timeout, error, handoff and evidence mapping;
- project the real call into canonical BUSOS Run/Trace;
- match SCS source/deployment identity and BUSOS build identity to the evidence;
- fail closed on endpoint/configuration drift and never fall back to Demo;
- do not modify or redeploy SCS and do not claim Unified OS production closure.

#### `LUMEN-WRITE-PATH-FIX-01` (`picture-edit` repository)

- reproduce the deployed recordFailure-shape write with the same SDK and credential shape;
- identify the exact failing runtime link;
- add a regression test;
- deploy only with separate owner authorization;
- verify `/api/auth` no longer runs to the 90-second timeout;
- rerun BL-018 live gates only after the repair deployment is matched to its SHA.

### 5.10 `BUSOS-R2-PROD-01 — Unified Production Closure`

This task starts only after the required product lanes are integrated, BUSOS production
binding to SCS is complete, and the Lumen repair prerequisite is complete.

Required release identity gate:

1. Open the exact production URL.
2. Verify Mode, BUSOS Build SHA and connection summary.

Required **Acquisition Journey**:

1. Start an anonymous or identified Prospect consultation.
2. Inspect intent/risk/route/evidence/handoff and the corresponding Run/Trace.
3. Generate `LeadCandidateV1` and route it through Governance and Human Review.
4. Verify rejection causes zero canonical writes; or approve and verify the canonical
   Lead write/readback.
5. Verify an anonymous Lead may remain anonymous.
6. Convert to Customer only through the frozen conversion rules.
7. Create/open a Project only after conversion.

Required **Existing Business Journey**:

1. Read a real Customer/Project through the Connected data plane.
2. Run a contextual Service Agent consultation with governed Memory references.
3. Inspect the resulting canonical Run/Trace.
4. Read the related Task/Asset state.
5. Run the Project-bound Lumen action and verify the resulting Asset/readback.

Required **Evaluation operator loop**:

1. An operator starts the approved Golden Set.
2. The deterministic harness produces a stored Report.
3. Evaluation UI cases, metrics and gates match that Report.
4. No assertion implies that ordinary business runs automatically invoke Evaluation.

Record owner acceptance separately; the agent cannot self-assign it. No partial
journey, fake adapter, stub transport or old deployment can satisfy LIVE PASS.

---

## 6. Anti-drift operating contract

### 6.1 Authority

Before every task:

1. Fetch the remote.
2. Verify `git ls-remote origin refs/heads/main`.
3. Record the full baseline SHA in the task card and Audit Packet.
4. Create an isolated `codex/<task-id>` branch/worktree from that SHA.
5. Confirm the worktree is clean before setup or implementation.

Conversation history, local stale branches and agent memory are not code authority.

### 6.2 Parallel lanes with serialized authoritative integration

- There is at most one active task **per isolated lane/worktree**, not one active task
  for the whole program.
- `02-CURRENT-STATE.md` may list multiple explicitly owner-authorized development lanes,
  each with task ID, branch/worktree, baseline SHA, file ownership and status.
- There is at most one authoritative Integration Coordinator / merge task at a time.
  Only that serialized task may integrate lane results into main and reconcile shared
  control state.
- Shared contracts or overlapping file ownership must be frozen before parallel work or
  routed through the Integration Coordinator; a lane may not silently take another
  lane's files.
- A roadmap row is never authorization. Each lane/task still requires explicit owner
  authorization, exact scope, commands, gates, Audit Packet and STOP.
- A completed lane stops and does not self-merge. New lane work and each integration task
  require owner authorization.

### 6.3 Change isolation

- Preserve all pre-existing dirty changes.
- Stage exact task-owned file paths; never use `git add -A` in a dirty repository.
- No incidental cleanup, dependency upgrades or refactors.
- Cross-repository fixes use separate repositories, branches and Audit Packets.
- Push, PR, merge and production deployment are separate permissions.

### 6.4 Evidence levels

Every task records each level independently:

| Level | Required meaning |
|---|---|
| ENGINEERING | Typecheck/tests/build/smoke for the task scope |
| DEMO | User-visible product path with clearly labelled fake/in-memory data |
| CONNECTED | Real server integration boundary; missing dependency is BLOCKED |
| LIVE | Real external call + persistence + readback + visible business output |
| OWNER | Explicit manual owner acceptance only |

No evidence level inherits another level's PASS.

### 6.5 Completion packet

Every task ends with:

- baseline remote SHA;
- exact changeset and unexpected-file count;
- commands, counts and exit states;
- local and remote CI status;
- product URL/mode/build where applicable;
- Demo/Connected/Live verdicts;
- security and secret-boundary evidence;
- blockers and deferred findings;
- completion report path;
- final remote branch/main SHA verified externally;
- owner acceptance state;
- `NEXT AUTHORIZED WORK: NONE` unless the owner has explicitly authorized another task.

---

## 7. Planning task acceptance

This planning task changes control documents only.

### 7.1 Required file set

- Create `project-control/BUSOS-R2-UNIFIED-OS-REBASELINE-01.md`.
- Update `project-control/01-MASTER-PLAN.md`.
- Update `project-control/02-CURRENT-STATE.md`.
- Update `project-control/03-DECISIONS.md` with post-H1 proposed decisions.
- Update `project-control/06-BACKLOG.md` to correct BL-018 classification.
- Mark `project-control/R2-LONG-TERM-ROADMAP.md` historical for post-H1 sequencing.
- Update `project-control/R2-AUDIT-INDEX.md`.
- Add the planned Unified OS journey to `project-control/R2-ACCEPTANCE-CHECKLIST.md`.
- Record repository-review corrections in
  `project-control/BUSOS-R2-UNIFIED-OS-REBASELINE-CORR-01.md`.

### 7.2 Planning verification

- no product/source/package/deployment file is changed;
- no placeholder, conflicting authorization or stale BL-018 classification remains in
  the current-control sections;
- existing D001–D020 remain intact;
- every roadmap task has dependency, scope and exit gates;
- `NEXT AUTHORIZED IMPLEMENTATION WORK` remains NONE pending owner repository review;
- branch is pushed without PR, merge or deployment.

---

## 8. Audit Packet

### VERDICT

`PLANNING PACKET READY FOR OWNER REPOSITORY REVIEW` after commit/push verification.
No implementation, merge or deployment is authorized by this packet.

### AUTHORITY

- Baseline: `origin/main@8f9ad4a830cfb8217bed2227269c570cc1237fb8`.
- Final planning branch SHA: established externally after push; never self-recorded here.

### CHANGESET

- Control/planning Markdown only.
- Product code: none.
- Deployment configuration: none.
- Secrets/credentials: none.

### BASELINE ENGINEERING EVIDENCE

- Initial `npm test` on Windows without explicit Python UTF-8 exposed four existing
  Service Agent bridge failures caused by GBK stdout corruption.
- Explicit UTF-8 rerun passed affected packages:
  - `@busos/service-agent-candidate`: 53 passed;
  - `@busos/service-agent-port`: 16 passed;
  - `@busos/workspace-run`: 17 passed.
- Planning completion verification must run the repository gates with explicit Python
  UTF-8 and report the fresh final result.

### PRODUCT / INTEGRATION

- Product change: NOT APPLICABLE.
- DEMO / CONNECTED / LIVE: NOT APPLICABLE.
- OWNER repository review: PENDING.

### STOP

After the corrected planning branch is pushed, stop and request owner re-review of this
written file plus `BUSOS-R2-UNIFIED-OS-REBASELINE-CORR-01.md`. Do not create
`BUSOS-R2-UX-01` code or an implementation plan until that review is approved.
