# AI Business OS — R2 Long-Term Roadmap

Created by: BUSOS-R2-00 — R1→R2 Planning Baseline (2026-08-15)
Document type: **planning direction, not execution authorization**

## 0. How to read this file

- This file describes **horizons**, not active work.
- Only `02-CURRENT-STATE.md` + the current task file authorize work.
- **Planning windows** may read this file to select or refine the next bounded task.
- **Execution windows** must NOT treat any horizon, candidate area or roadmap unit
  in this file as permission to start work. See `07-HANDOFF.md`.

R2 is an **extension of R1**, not a replacement, not a restart, and not a redesign
of frozen R1 architecture (`03-DECISIONS.md` D001–D020 remain authoritative).

---

## 1. R2 Product Direction — FROZEN

R2 is **not** a new photography ERP and **not** a restart of R1.

R1 is the **completed technical / business-process baseline**.
R2 **productizes the existing R1 core** into a lightweight operator-facing workspace.

First validated real scenario:

> Photography studio operator managing real customer projects.

Product concept:

> A simplified WorkBuddy-like business workspace where the operator can see
> projects, pending human decisions, AI executions and business outputs.

AI positioning:

> AI appears primarily as **bounded Business Actions inside business context**,
> not as one generic chatbot.

---

## 2. R1 Baseline Preserved (already-built platform assets)

These are treated as **existing platform assets**. R2 H1 must **reuse**, not rebuild:

- canonical contracts
- Service Agent → `LeadCandidateV1`
- deterministic governance
- Human Review
- `BusinessRepository`
- `FeishuAdapter`
- write + readback verification (D019)
- Lead / Customer
- Project / Task lifecycle
- Lumen creative production
- Asset
- `runBusinessProcess()`
- Process State
- structured Trace
- error classification
- fail-closed propagation
- basic idempotency

Outstanding **live full-process evidence** (P6-C) remains tracked separately by
**BL-018 (OPEN / NON-ENGINEERING LIVE DEPENDENCY)**. It is an external live
dependency (third-party quota + credentials) and is **not an R2 engineering
blocker**.

---

## 3. Horizons

### H0 — R1 Business Core

Status: **COMPLETE BASELINE**

Represents the existing R1 implementation (P0–P6): contracts, candidate
extraction, governance, human review, business persistence + readback, project /
task lifecycle, creative production, orchestrator process state + trace.

Nothing in H0 is re-opened by R2 unless a real usage defect is found and enters
the backlog first.

---

### H1 — Operator Workspace MVP

Status: **NEXT**

Goal:

> Expose the existing R1 core as a small usable product.

Initial navigation is limited to **exactly four surfaces**:

- Overview
- Projects
- Reviews
- Runs

No other top-level navigation is authorized in H1.

#### 3.1 Overview

Only basic operational information:

- active / recent projects
- pending reviews
- recent / running / failed AI runs

**Do not build a BI platform.** No metric warehouse, no custom chart builder,
no funnel/cohort analytics.

#### 3.2 Projects

Expose existing R1 business data:

- Project
- Customer reference
- Task
- Asset

Project Detail should become the **primary business workspace** — the place where
the operator sees business context and triggers business actions.

**Do not introduce a large new photography domain in H1.**

#### 3.3 Reviews

Productize the **existing** Human Review capability (`@busos/human-review`):

- inspect proposed business fact
- inspect evidence / reason
- approve
- edit + approve
- reject

Governance semantics stay unchanged: AI proposes candidates, governance +
human decision create business facts (D015 / D016).

#### 3.4 Runs

Productize the **existing** P6 execution visibility:

- process status
- stages
- duration
- outputs
- sanitized error
- trace detail

Trace metadata sanitization stays as delivered in P6-02 (allowlisted, no
secrets / prompts / raw third-party payloads).

#### 3.5 First Real AI Action

At least **one real action** must be executable from business context.

Preferred first action:

> `Generate Visual Reference`

Reuse the existing **Creative Production + Lumen + Asset** path wherever
possible. The action must be a bounded Business Action attached to a Project,
not a free-form chat surface.

---

### H2 — Intelligence Improvement

Status: **DEFERRED** until real H1 usage exposes need.

Candidate areas only:

- stronger LLM structured extraction
- multimodal ingestion
- Memory
- Golden Set
- Evaluation Center
- prompt / model / version evaluation

**Do not start automatically.**

---

### H3 — Operations & Reliability

Status: **DEFERRED** until measured operational need.

Candidate areas only:

- durable `ProcessRegistry`
- persistent Trace
- metrics
- cost / latency / error monitoring
- retry / recovery policy
- operational dashboard

**Do not add Redis / MQ / etc. merely for architecture completeness.**

---

### H4 — Scale / SaaS

Status: **NOT PLANNED FOR MVP.**

Potential future areas only:

- authentication expansion
- RBAC
- tenant isolation
- billing / quota
- storage migration
- distributed orchestration

---

## 4. H1 Explicit Non-Goals

H1 does **NOT** include:

- full photography ERP
- photographer / model / makeup scheduling
- finance / invoicing / contract management
- CRM rewrite
- generic plugin marketplace
- drag-and-drop workflow builder
- user-defined workflow nodes
- full Memory platform
- full Evaluation Center
- full observability platform
- multi-tenant SaaS
- complex RBAC
- Redis
- MQ
- Kafka
- Temporal-style orchestration
- database migration for cleanliness

New domains such as `ProjectParticipant` must be introduced **only after real
usage demonstrates the need**, and must enter `06-BACKLOG.md` first.

---

## 5. Modularity Principle

R2 must support future modular growth, but H1 must **NOT** build a universal
plugin framework.

Use:

> developer-defined modules + stable contracts

not:

> user-defined workflow platform

Current conceptual distinction:

### Business modules

- Service
- Project
- Creative

### Platform capabilities

- Human Review
- Runs / Trace
- future Memory
- future Evaluation

A generalized plugin SDK may only be considered **after at least two
independently useful modules expose the same proven extension pattern.**

---

## 6. Harness Learning Principle

R2 development principle:

> Every meaningful AI feature should be developed as a **real product execution
> that can also be used to learn Harness engineering**.

For each AI vertical slice, it must be possible to explain:

`User Action`
→ `Request / Command`
→ `Context Assembly`
→ `State`
→ `Node / Stage`
→ `Tool / Port`
→ `Observation`
→ `State Transition / Edge`
→ `Governance / Human Review`
→ `Persistence`
→ `Trace`
→ `UI Result`

During later implementation tasks, completion reports should briefly map the
implemented slice to:

- Prompt
- Context
- State
- Node / Stage
- Edge / Transition
- Tool
- Observation
- Guardrail
- Trace
- Idempotency / Recovery where applicable

This is a **learning / evidence requirement only**, tied to real executions.
**Do NOT create a separate tutorial framework**, teaching abstraction layer, or
parallel "learning mode" codebase.

---

## 7. H1 Success Definition

Product-level success criterion (exact):

> A user can open AI Business OS, inspect an existing real project, see its Tasks
> and Assets, trigger one real AI-assisted business action, observe the Run
> status, and inspect the resulting business output without leaving the Business
> OS product surface.

The **first vertical slice outranks**:

- page count
- visual polish
- framework abstraction
- platform completeness

---

## 8. H1 Roadmap Units (planning decomposition only)

These are **roadmap units**, not authorized tasks. Each requires a separate
bounded task authorization before implementation, and only one is active at a time.

1. **H1-01 — Workspace Shell + Project Read Surface**
   Minimal shell with the four navigation entries; Projects list + Project Detail
   reading existing R1 business data (Project / Customer ref / Task / Asset).

2. **H1-02 — Review Surface Integration**
   Surface the existing Human Review capability (inspect → approve / edit+approve
   / reject) inside the workspace.

3. **H1-03 — Run Detail / Trace Surface**
   Surface process status, stages, duration, outputs, sanitized error and trace
   detail from the existing orchestrator contract.

4. **H1-04 — First Real AI Action Vertical Slice**
   `Generate Visual Reference` triggered from Project context through the
   existing Creative Production + Lumen + Asset path; Run + Asset visible in the
   product.

5. **H1-05 — Real Usage Closure / MVP Review**
   Operator uses the workspace on a real project; findings enter backlog;
   H1 success definition assessed.

Ordering is a **suggestion**, not a contract. Later units may be re-scoped by a
planning window based on H1-01..H1-03 findings.

---

## 9. Authorization Rules

- Roadmap material is **never** authorization. Only `02-CURRENT-STATE.md`
  ("Next Authorized Work") + an explicit task authorize implementation.
- H2 / H3 / H4 **cannot be auto-started**. Each requires explicit owner
  authorization plus a demonstrated real need (usage evidence or measurement).
- H1 units are executed one at a time; an execution window may not pull the next
  unit forward.
- New photography-specific requirements discovered through real workspace usage
  enter `06-BACKLOG.md` first — they do not silently change the active task.
- Frozen R1 decisions (D001–D020) are not re-opened by R2 planning.

---

## 10. Traceability

- R1 history: `01-MASTER-PLAN.md` (P0–P6), completion reports
  (`09-P3-01-COMPLETION.md`, `10-P4-01-COMPLETION.md`, `11-P5-01-COMPLETION.md`,
  `BUSOS-P5-X03-STATUS.md`, `BUSOS-P6-01-PLAN.md`), `05-TEST-GATES.md`, git history.
- Deferred items: `06-BACKLOG.md` (BL-018 = live evidence dependency; BL-015 and
  BL-017 = non-blocking maintenance items; BL-001/BL-003 = Memory / Evaluation
  Center, now mapped to H2).
- Contracts / interfaces authoritative source: `contracts/*.schema.json` +
  `04-INTERFACES.md`.
