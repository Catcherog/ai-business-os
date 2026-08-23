# BUSOS-R2-UNIFIED-OS-REBASELINE-01 — Unified AI Business OS Product Rebaseline

## 0. Document status

| Field | Value |
|---|---|
| Document type | Product design, roadmap, governance and audit baseline |
| Task type | Planning / control documents only |
| Design direction | Owner-approved in conversation on 2026-08-23 |
| Repository review | Pending owner review of this written branch artifact |
| Authority baseline | `origin/main@8f9ad4a830cfb8217bed2227269c570cc1237fb8` |
| Planning branch | `codex/busos-r2-unified-os-rebaseline` |
| Product code changes | None |
| Deployment / production mutation | None |
| Implementation authorization | None; every implementation unit requires a new explicit owner authorization |

This document supersedes `R2-LONG-TERM-ROADMAP.md` **only for post-H1 product
sequencing and information architecture**. It does not rewrite R1 history, reopen
D001–D020, or retroactively change prior task evidence.

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
| Service Agent | `ServiceAgentPort`, real local bridge, orchestrator run, evidence/risk/handoff projection, Run Detail | No conversation store/read model, product API, conversation workspace or proven production runtime adapter |
| Feishu | `BusinessRepository` + real/fake `FeishuAdapter`, canonical mapping, write readback | Current Connected server boundary covers a narrow GVR action, not all business reads/writes |
| Memory | Governed records and bounded context consumption | Embedded/read-only product surface; no durable repository |
| Evaluation | Deterministic harness, Golden Set, gates, JSON/Markdown reports and CLI | No server application boundary, report store or Evaluation Center UI |
| Lumen | Adapter and project business action exist | BL-018 is blocked at deployed Lumen auth/write path |
| Production | Stable public DEMO exists | Service Agent is not deployed; Unified Connected/LIVE journey is not proven |

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

---

## 3. Target product definition

### 3.1 Product success statement

A user can open one AI Business OS address and complete this bounded business journey:

```text
Customer / Lead
  → Service Agent consultation
  → Intent / Risk / Route / Evidence / Handoff
  → LeadCandidateV1
  → GovernanceResultV1
  → Human Review
  → canonical Feishu business fact + readback
  → Customer / Project / Task / Asset
  → Project-bound Lumen action
  → Run / Trace
  → governed Memory context
  → Evaluation result
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
| 1 | `BUSOS-R2-UX-01` | Rebaseline merged | Scalable IA shell and explicit runtime identity |
| 2 | `BUSOS-R2-WORKSPACE-API-01` | UX-01 | Browser/server data-source boundary |
| 3 | `BUSOS-R2-SCS-RUNTIME-01` | Workspace API | Service Agent application/runtime boundary |
| 4 | `BUSOS-R2-SCS-UI-01` | SCS runtime | Productized Service Agent workspace |
| 5 | `BUSOS-R2-FEISHU-CONNECT-01` | Workspace API | Real Workspace-wide Feishu data plane |
| 6 | `BUSOS-R2-BUSINESS-DATA-UI-01` | Feishu connect + SCS UI | Customers/Leads and Integrations surfaces |
| 7 | `BUSOS-R2-EVAL-UI-01` | Workspace API | Minimal Evaluation Center |
| 8a | `BUSOS-R2-SCS-PROD-DEPLOY-01` | SCS runtime + SCS UI | Independently verified SCS production runtime |
| 8b | `LUMEN-WRITE-PATH-FIX-01` in `picture-edit` | Separate owner authorization | Repair deployed Lumen write path and unblock BL-018 |
| 9 | `BUSOS-R2-PROD-01` | Tasks 1–8 complete | Unified production closure and owner journey |

Tasks 3–4 and 5–6 may be developed as separate branches after the shared Workspace API
is merged, but authoritative integration and acceptance remain sequential. Task 8b is a
cross-repository prerequisite and must never be folded into a BUSOS product commit.

### 5.2 `BUSOS-R2-UX-01 — Product IA Rebaseline`

**In scope**

- scalable navigation/router structure;
- runtime identity area showing Mode, Build SHA and connection summary;
- existing Overview/Projects/Reviews/Runs behavior preserved;
- route and navigation tests;
- responsive navigation verification.

**Out of scope**

- empty Customers/Service Agent/Evaluation/Integrations pages;
- server APIs, real Feishu reads, Agent calls or deployment;
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
- production adapter decision plus executable probe;
- server endpoints for run/list/read;
- canonical Run/Trace projection and idempotency;
- one R0 success and one R2 human-required local-real E2E.

**Out of scope**

- generic chatbot behavior;
- direct canonical Lead/Project writes;
- changing the frozen Service Agent implementation;
- production deployment itself.

**Exit gates**

- ENGINEERING PASS and LOCAL CONNECTED PASS.
- Production adapter is either proven or explicitly `CONNECTED BLOCKED` with evidence.
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

#### `BUSOS-R2-SCS-PROD-DEPLOY-01`

- package or connect the approved production Agent adapter;
- verify model/vector/runtime dependencies;
- verify timeout, error and handoff behavior;
- match deployment metadata to the exact commit;
- do not claim Unified OS production closure.

#### `LUMEN-WRITE-PATH-FIX-01` (`picture-edit` repository)

- reproduce the deployed recordFailure-shape write with the same SDK and credential shape;
- identify the exact failing runtime link;
- add a regression test;
- deploy only with separate owner authorization;
- verify `/api/auth` no longer runs to the 90-second timeout;
- rerun BL-018 live gates only after the repair deployment is matched to its SHA.

### 5.10 `BUSOS-R2-PROD-01 — Unified Production Closure`

This task starts only after the product slices, SCS deployment and Lumen repair are complete.

Required LIVE journey:

1. Open the exact production URL and verify Mode + Build SHA.
2. Read a real Customer/Lead from the Connected data plane.
3. Run a real Service Agent consultation.
4. Inspect intent/risk/route/evidence/handoff and the corresponding Run/Trace.
5. Generate a LeadCandidate and route it through Governance and Human Review.
6. Commit the approved business fact to Feishu and verify readback.
7. Open the resulting Customer/Project/Task/Asset context.
8. Run the Project-bound Lumen action and verify the resulting Asset.
9. Inspect governed Memory context and Evaluation evidence.
10. Record owner acceptance separately; the agent cannot self-assign it.

No partial journey, fake adapter, stub transport or old deployment can satisfy LIVE PASS.

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

### 6.2 One active task

- `02-CURRENT-STATE.md` names at most one authorized implementation task.
- A roadmap row is never authorization.
- Each task has exact In Scope, Out of Scope, interfaces, files, commands and gates.
- A completed task stops. The next task requires new owner authorization.

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

### 7.2 Planning verification

- no product/source/package/deployment file is changed;
- no placeholder, conflicting authorization or stale BL-018 classification remains in
  the current-control sections;
- existing D001–D020 remain intact;
- every roadmap task has dependency, scope and exit gates;
- `NEXT AUTHORIZED WORK` remains NONE pending owner repository review;
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

After the planning branch is pushed, stop and request owner review of this written file.
Do not create `BUSOS-R2-UX-01` code or an implementation plan until that review is approved.
