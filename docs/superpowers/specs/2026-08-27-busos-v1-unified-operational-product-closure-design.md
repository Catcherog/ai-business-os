# BUSOS V1 Unified Operational Product Closure

## Status

Approved execution design for the Goal-level closure task on 2026-08-27. The pasted product brief is the owner-approved product direction; this document translates it into an implementable boundary without reopening the frozen P1–P8 decisions.

## Goal and outcome

Deliver one usable photography-business operating product in the Business OS. The primary experience is a single operator shell with Overview, Business, AI, and System surfaces. Feishu remains the data and collaboration plane; the browser consumes canonical ports and truthful runtime envelopes. The five owner journeys must be executable in deterministic DEMO mode, while CONNECTED and LIVE are reported only when the corresponding external capability is actually available and read back successfully.

## Product boundaries

### Frozen principles

- The Business OS is the primary UI. Existing projects, reviews, runs, memory, and evaluation capabilities remain available through the same shell.
- Feishu is the collaboration and canonical business-data plane. Legacy sources are read-only; any mapping or authorization uncertainty fails closed.
- Scheduling is P0: a requirement can become a deterministic slot proposal, then an explicit operator confirmation, then a canonical assignment readback.
- Service Agent follows consultation → candidate → governed review → human decision → business fact. It never writes a business fact directly from a chat response.
- Project detail is the execution center. Creative actions and scheduling actions receive project context and return to the same project workspace.
- Creative is capability-first. A registry describes supported capabilities and each adapter declares DEMO, CONNECTED, LIVE, or BLOCKED truth. A fake renderer must never be labeled LIVE.
- Automations are the product-facing layer above existing runs and traces. Evaluation remains a System/admin surface and does not become a competing workflow engine.
- No browser bundle contains service credentials, Feishu app secrets, provider keys, or raw upstream error payloads.

### Final information architecture

The router exposes these concrete destinations, retaining legacy aliases where existing smoke tests depend on them:

- Overview
- Business: Customers, Orders, Projects, Scheduling
- AI: Service Agent, Creative, Reviews
- System: Automations, Evaluation, Integrations

Group labels are navigation structure, not empty pages. Every concrete destination has an actionable DEMO state and an honest empty or blocked state when data or authority is missing.

## Architecture

### Shared shell and state

Keep the current workspace services as the source for project, review, run, memory, and evaluation data. Extend the router and UI shell with grouped navigation, a shared page header, runtime identity, breadcrumbs, project context, and a consistent action/result pattern. New screens are pure renderers over typed client models; no screen invents a second persistence or approval engine.

The Overview model aggregates existing workspace facts with operations and scheduling facts. Its KPI cards are clickable. Needs Attention contains at least pending human review, unscheduled or conflicting projects, overdue delivery, and failed or human-required runs, each with a route or project action.

### Business data and scheduling

Use the operations repository/client seam from the validated Feishu V3 work as a selective port, not as a mechanical branch merge. Provide DEMO data and a connected adapter behind the same typed contract. The connected adapter performs server-side reads and exposes sanitized `BLOCKED` or `NOT_AUTHORIZED` results when a writable canonical assignment mapping is unavailable.

Add a scheduling port with these responsibilities:

1. Read project requirements, resources, availability, and existing assignments.
2. Call the deterministic `proposeShootSlots` engine; proposal order and IDs are stable for identical inputs.
3. Require an explicit operator confirmation with an idempotency key.
4. Write through the authorized canonical adapter only when its mapping is verified.
5. Read the assignment back and return `CONFIRMED` only when the canonical record matches the request.

DEMO confirmation uses the same port and an in-memory canonical-like store, so Journey A exercises the complete state transition. The connected path never silently falls back to DEMO; without a verified write mapping it is visibly BLOCKED.

### Service Agent

The browser uses the existing `ServiceAgentPort` contract. The server resolves a production binding from server-only configuration and returns a typed blocked result when the URL/key or transport contract is unavailable. DEMO consultation uses the real local candidate/classifier path already covered by tests. Candidate creation and review navigation remain separate from the conversational answer, preserving the governed human-review boundary.

### Creative

Expose a capability registry for product shot, background swap, local retouch, style variation, and outpaint. The Creative workspace shows Recent Jobs, project/brief/reference inputs, status, output, and history. DEMO actions use deterministic local output metadata and clearly say DEMO. A server-only adapter may call the real provider when credentials and the capability contract are present; otherwise the UI says BLOCKED. `RunningHub` credentials and provider errors never cross the browser boundary.

### Automations, Reviews, Evaluation, and Integrations

- Automations project existing process/run registry data into definitions, recent runs, trace links, failure state, and human-required state. A DEMO “run” must be explicit and must not imply an external side effect.
- Reviews aggregate governed human-review items from Service Agent and operations projections, with provenance and a single decision boundary. Synthetic DEMO review data is labeled as such.
- Evaluation remains the admin view for scorecards, gates, and evidence. It does not own customer, order, schedule, or review writes.
- Integrations is a sanitized health/control plane for Feishu, Service Agent, and Creative. It reports mode, last read/write/readback outcome, and a concise remediation reason; it never exposes secrets or upstream payloads.

## Runtime truth and failure behavior

All external-capability cards use `DEMO`, `CONNECTED`, `LIVE`, or `BLOCKED`. `BLOCKED` is a first-class state, not an exception hidden behind a DEMO result. A missing credential, invalid URL, unavailable provider, unknown Feishu mapping, failed readback, or unauthorized write returns the typed blocked/error envelope and leaves the requested business state unchanged.

Every write-like action records an idempotency key and displays the resulting state. Retries must not create duplicate assignments or duplicate review decisions. Local DEMO state is explicitly described as non-production and must not be counted as production evidence.

## Owner journeys and evidence

The implementation must support these deterministic DEMO paths:

- Journey A: project → schedule requirement → slot proposal → explicit confirm → confirmed/readback state.
- Journey B: Service Agent consultation → candidate → human review queue → approve or reject → governed business fact.
- Journey C: project → creative capability → brief/reference input → job status → output/history.
- Journey D: automation definition → run → trace → failure or human-required result.
- Journey E: Overview risk card → project/customer/order/schedule detail → actionable next step.

The minimum smoke suite proves the five DEMO paths, grouped navigation, blocked-state honesty, browser secret absence, and legacy surface compatibility. LIVE evidence is a separate artifact and is never inferred from a build, local test, preview, or Git push.

## Alternatives considered

### Mechanical merge of every historical branch

Rejected. It would import migration and product-surface assumptions together, duplicate routes and state stores, and make the current main baseline and evidence boundary unclear.

### Rebuild the product from scratch

Rejected. It would discard already-tested repository, review, run, Service Agent, and evaluation contracts and increase regression risk.

### Selective capability ports with one new shell

Chosen. It preserves tested contracts, brings in the scheduling and Feishu operations seams that directly satisfy P0, adapts SCS and Creative behind server-only ports, and makes the unified product boundary explicit in the router, demo smoke, and closure report.

## Verification and release boundary

Before the closure verdict, run targeted unit tests for each new port and state transition, the full workspace test suite, typecheck, build, product smoke, server smoke, and a browser bundle secret scan. Record the clean worktree branch, local `origin/main` baseline, commits, test/build results, and any unavailable remote or LIVE evidence in `project-control/BUSOS-V1-UNIFIED-OPERATIONAL-PRODUCT-CLOSURE.md`. Never claim owner acceptance, remote CI, production deployment, or LIVE output without evidence.
