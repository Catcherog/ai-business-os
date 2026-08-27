# Plan: BUSOS V1 Unified Operational Product Closure

## Goal

Deliver a single usable photography-business operating product in `apps/operator-workspace`: the owner can move from an Overview risk to a project, confirm a proposed shoot slot with canonical-style readback, govern a Service Agent candidate, run a Creative capability, inspect an Automation trace, and see truthful integration state. The final closure evidence is recorded in `project-control/BUSOS-V1-UNIFIED-OPERATIONAL-PRODUCT-CLOSURE.md`.

## Architecture

- Preserve the current workspace contracts and services for projects, reviews, runs, memory, evaluation, and GVR.
- Port the validated Feishu V3 operations and deterministic scheduling capabilities selectively behind typed browser/server seams.
- Use one grouped router and shell with concrete routes for Overview, Customers, Orders, Projects, Scheduling, Service Agent, Creative, Reviews, Automations, Evaluation, and Integrations.
- Keep all external writes server-side. DEMO uses deterministic adapters and an explicit local canonical-like store; CONNECTED/LIVE reports `BLOCKED` when authorization, mapping, credentials, or readback is absent.
- Keep Service Agent behind `ServiceAgentPort` and Creative behind a capability registry/adapter. Reuse existing `WorkspaceRunService` and human-review contracts rather than creating parallel engines.

## Tech Stack

- TypeScript, Zod contracts, Vitest, Vite, vanilla DOM rendering in `apps/operator-workspace`.
- Node HTTP server in `apps/operator-workspace/server`.
- Python bridge for the existing Service Agent candidate classifier.
- Feishu V3 server adapter and deterministic scheduling package from reviewed candidate commits.
- Existing package workspaces and npm scripts from the repository root.

## Global Constraints

- Work only on `codex/busos-v1-unified-operational-product-closure` in `D:\360Downloads\busos-v1-unified-operational-product-closure`; preserve the dirty source checkout.
- Treat local `origin/main` at the inspected SHA as the baseline. Remote `main`, push, CI, owner acceptance, and production/LIVE output are unverified until independently evidenced.
- Do not expose or persist secrets. Do not place Feishu, Service Agent, or provider credentials in browser code or test fixtures.
- Do not label fake or local output as `CONNECTED` or `LIVE`; do not silently downgrade a blocked external action to DEMO.
- Keep legacy routes used by existing smoke tests functional while adding the final grouped IA.
- Use TDD for new behavior: add a focused failing test, implement the smallest change, then refactor and run the relevant suite.
- No destructive Git operation, shared-object repair, force-push, main merge, deployment, or external write.

## Tasks

### 1. Lock the baseline and test harness

1. Confirm the dedicated worktree branch, HEAD, local `origin/main`, worktree cleanliness, and the existing root scripts.
2. Keep the UTF-8 regression in `packages/service-agent-candidate/tests/service-agent-bridge.test.ts` and its matching bridge fix in `packages/service-agent-candidate/bridge/service_agent_context.py`.
3. Run the targeted candidate bridge suite and record the pass result in the closure evidence notes.
4. After any candidate import, rerun package typecheck and tests before changing the UI.

### 2. Import only the validated capability ports

1. Inspect the reviewed Feishu V3 commits and import only the contracts, scheduling package, operations repository/API/client, and relevant demo fixtures into the closure branch.
2. Inspect the reviewed Service Agent production-binding commit and import its server-only config, transport, adapter, and tests; resolve it against the current `ServiceAgentPort` boundary rather than accepting stale server/UI wiring.
3. Inspect the reviewed Creative/RunningHub adapter commit and import the capability types, server action, adapter, and focused tests; keep the browser action independent of provider credentials.
4. Do not import migration-only packages, stale control reports, duplicate navigation, or historical claims that are not required by the unified product.
5. Verify `git diff --check`, package manifests, and import paths after the selective integration.

### 3. Make runtime identity and integration health truthful

1. Extend `apps/operator-workspace/src/runtime-identity.ts` and `apps/operator-workspace/src/workspace-data-source.ts` with first-class `BLOCKED` handling and consistent badge/footer rendering.
2. Add a typed sanitized integration-health model for Feishu, Service Agent, and Creative in `apps/operator-workspace/src/features/integrations/`.
3. Add server health/readiness projection in `apps/operator-workspace/server/` that reports configured/blocked state without returning credentials or raw upstream errors.
4. Add tests for missing configuration, invalid URLs, blocked writes, and the absence of secret-like strings from serialized browser models.

### 4. Implement scheduling as a complete P0 loop

1. Add `SchedulingPort`/demo state types under `packages/scheduling` or the existing operations feature, with proposal, confirmation, idempotency, and readback result types.
2. Use `proposeShootSlots` as the deterministic suggestion engine. Add tests for stable ordering, resource conflicts, invalid availability, and repeat proposals.
3. Add DEMO scheduling fixtures aligned to an existing seeded project and implement explicit confirmation that writes to the demo canonical-like assignment store, then reads it back.
4. Add connected server endpoints for proposals and confirmation. Return `BLOCKED`/`NOT_AUTHORIZED` when the canonical assignment mapping or write authority is not verified; never fall back to DEMO.
5. Replace the current scheduling stub with a usable screen showing project requirement, candidate slots, warnings, confirmation control, idempotency result, and readback state.
6. Add route and API tests for proposal, successful DEMO confirmation, duplicate confirmation, and blocked connected confirmation.

### 5. Build the unified Business OS shell and Overview

1. Extend `apps/operator-workspace/src/router.ts` with grouped navigation and concrete routes for Customers, Orders, Scheduling, Creative, Automations, and Integrations while preserving legacy aliases.
2. Refactor the shell in `apps/operator-workspace/src/ui.ts` into shared header/sidebar/content/action patterns without breaking the existing project, review, run, Service Agent, business-data, and evaluation renderers.
3. Add a typed Overview model that aggregates current workspace facts, operations facts, scheduling facts, review queue state, and run state.
4. Render actionable KPI cards and Needs Attention items for pending review, unscheduled/conflicting projects, overdue delivery, and failed/human-required runs. Each item must navigate or execute a scoped next action.
5. Add DOM/smoke assertions for the final IA, KPI links, and at least one attention path.

### 6. Complete Business data and governed Service Agent workflow

1. Make Customers, Orders, Projects, and Scheduling usable in DEMO with seeded records and clear provenance; make connected data read-only unless a capability explicitly proves write/readback.
2. Keep the existing Service Agent DEMO consultation deterministic and connect its candidate action to the governed review queue.
3. Render candidate provenance, governance status, approve/reject control, and resulting business-fact projection without direct chat-to-fact mutation.
4. Wire server production resolution through `resolveServiceAgentPort(loadServiceAgentProductionConfig())`, yielding `BLOCKED` when config or transport is unavailable.
5. Add tests for candidate creation, review decision, blocked production config, sanitized transport errors, and no silent DEMO fallback.

### 7. Complete Creative workspace and project context

1. Add `apps/operator-workspace/src/features/creative/` models/view/client code for capability registry, Recent Jobs, project/brief/reference inputs, status, output, and history.
2. Add project-context entry actions from project detail to Creative and back, preserving the project ID and selected capability.
3. Implement deterministic DEMO jobs with visibly synthetic status/output metadata. Render `BLOCKED` for missing connected/LIVE provider authority.
4. Add server routes for the real adapter with server-only provider configuration and sanitized errors; never claim RunningHub LIVE from a fake adapter.
5. Add unit and UI smoke tests for DEMO job completion, blocked provider state, history rendering, and browser bundle secret scan.

### 8. Add Automations, Reviews aggregation, Evaluation, and Integrations surfaces

1. Add `apps/operator-workspace/src/features/automations/` that projects definitions, recent runs, trace links, failure state, and human-required state from existing run services.
2. Make a DEMO run action explicit and local; link its trace to the existing Runs surface and do not imply an external side effect.
3. Add the governed Service Agent/operations review aggregation to the existing Reviews surface with provenance and one decision boundary.
4. Preserve Evaluation as a System/admin destination and ensure it remains subordinate to product workflows.
5. Add `apps/operator-workspace/src/features/integrations/` for sanitized Feishu, Service Agent, and Creative readiness/readback health.
6. Add route, model, and smoke tests for all four surfaces.

### 9. Verify the five owner journeys

1. Extend `apps/operator-workspace/smoke/smoke-product-integration.mjs` or its current equivalent with deterministic Journey A–E assertions.
2. Verify Journey A project → requirement → proposal → confirm → readback.
3. Verify Journey B consultation → candidate → human review → decision → governed fact.
4. Verify Journey C project → capability → brief/reference → job → output/history.
5. Verify Journey D automation → run → trace → failure/human-required.
6. Verify Journey E overview attention → detail → actionable next step.
7. Add negative assertions for blocked connected actions, absent browser secrets, and the absence of silent fallback.

### 10. Run final verification and produce closure evidence

1. Run targeted tests after each task and then fresh root `npm test`, `npm run typecheck`, `npm run build`, product smoke, server smoke, `git diff --check`, and browser bundle secret scan.
2. Start the local server only as needed for server smoke; capture status, endpoint, and shutdown evidence without treating preview as production proof.
3. Recheck branch, HEAD, local `origin/main`, worktree status, commit list, and any remote/CI availability.
4. Write `project-control/BUSOS-V1-UNIFIED-OPERATIONAL-PRODUCT-CLOSURE.md` with sections A–T from the pasted brief, exact evidence, known limitations, five-journey results, runtime matrix, and one allowed verdict.
5. Perform a final self-review for stale claims, secrets, duplicate engines, fake LIVE labels, and unverified owner/remote/production assertions. Request a code review if a reviewer capability is available; do not merge or push without explicit authorization.
