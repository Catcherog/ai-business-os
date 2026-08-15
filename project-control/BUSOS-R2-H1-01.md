# BUSOS-R2-H1-01 — Workspace Shell + Project Read Surface

## Task name
BUSOS-R2-H01-01 — Workspace Shell + Project Read Surface

## Starting SHA
`4b5ca9c7eaba3c9571b3dfb1d50d3119a75a9aa9`
(Remote `main` verified equal to the authorized baseline. Local working tree was
at `8e712332...`; the remote advanced exactly one control-doc-only commit
`4b5ca9c BUSOS-R2-00 — R1→R2 Planning Baseline`. Working tree aligned to the
baseline before implementation. No unrelated local work destroyed — stale
P6-03 control-doc edits were backed up to `/tmp/h1-backup` first.)

## Objective
Build the first usable AI Business OS product surface on top of the completed R1
core: an Operator Workspace shell with exactly four top-level navigation entries
(Overview, Projects, Reviews, Runs), where **Projects** is the only real
functional domain in H1-01 — a read-only vertical slice that lists canonical
Projects and opens a Project Detail showing the Project, its Customer reference,
Tasks, and Assets.

## Authorized scope
- Operator Workspace shell (desktop-first, responsive-friendly).
- Exactly four nav entries: Overview / Projects / Reviews / Runs.
- Projects list (canonical data, deterministic ordering, loading/empty/error states).
- Project Detail (Project + Customer + Tasks + Assets), read-only.
- Overview / Reviews / Runs: bounded placeholder surfaces only (no live integration).
- Additive repository collection reads: `listProjects`, `listTasksByProject`,
  `listAssetsByProject` (BusinessRepository + Real + Fake adapters).
- A `WorkspaceReadService` application boundary (no Feishu leakage).
- Deterministic fake/in-memory data path + env-driven real path (RealFeishuAdapter).
- Mandatory tests: H1-01-G fake product E2E, H1-01-H real-adapter simulator, H1-01-I regression, H1-01-F read-only evidence.

## Explicit non-goals
- No business mutation UI/API (create/update/delete Project/Task/Asset).
- No Human Review actions, no Creative Production, no Lumen, no Orchestrator execution.
- No H1-02 (Reviews integration), H1-03 (Runs detail), H1-04 (AI action), H1-05.
- No Overview/Reviews/Runs real functionality.
- No new photography domain (Participant/scheduling/finance/CRM rewrite).
- No Redis/MQ/Kafka/RBAC/tenant isolation/billing/SaaS/migration.
- No CQRS/GraphQL/event-sourcing/caching/generalized query framework.
- No design-system / component-library / microfrontend / SSR-architecture exercise.

## Acceptance gates (from task instruction)
- H1-01-A Baseline/authority
- H1-01-B Workspace Shell
- H1-01-C Canonical Project List
- H1-01-D Project Detail
- H1-01-E Repository Read Boundary
- H1-01-F Read-Only Enforcement
- H1-01-G Fake Product E2E / Integration
- H1-01-H Real-Adapter Simulator Regression
- H1-01-I Existing Regression
- H1-01-J Build / Type Safety

## STOP rule
Implement only H1-01. On mandatory gate failure, diagnose minimally and fix only
inside H1-01 scope; otherwise record blocker and stop. After closure, STOP — do
not start H1-02 without explicit owner authorization.
