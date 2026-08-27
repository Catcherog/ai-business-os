# BUSOS V1 Unified Operational Product Closure

- Closure ID: `BUSOS-V1-UNIFIED-OPERATIONAL-PRODUCT-CLOSURE`
- Date: 2026-08-27
- Branch: `codex/busos-v1-unified-operational-product-closure`
- Final implementation commit: `ca34086`
- Verdict: `ENGINEERING_COMPLETE_LIVE_BLOCKED`

## A. Verdict and scope

The V1 closure work converges the existing capabilities into one photography-business operating product: a shared Business OS shell, owner-facing business/project/scheduling surfaces, governed Service Agent acquisition, a Creative workspace, Automations above Runs/Trace, Reviews, Evaluation, and sanitized Integrations.

The five owner journeys are executable in the deterministic DEMO product path, and the connected server seams fail closed. External LIVE evidence is not claimed. The current verdict is therefore `ENGINEERING_COMPLETE_LIVE_BLOCKED`, not `V1_PRODUCT_COMPLETE`.

## B. Authority, baseline, and isolation

- The isolated worktree is `D:\360Downloads\busos-v1-unified-operational-product-closure`.
- The branch was created from the locally available `origin/main@729108d8059e3e143194a05f43e510af3587d385`.
- The original dirty checkout on `busos-r2-scs-integration-01` was not modified; all implementation changes were made in the isolated worktree.
- `git fetch origin --prune` was attempted but could not write the shared `.git/FETCH_HEAD`.
- `git ls-remote origin refs/heads/main` was attempted but failed because the host had no GitHub credential (`SEC_E_NO_CREDENTIALS`). The local `origin/main` ref is therefore recorded as the baseline, not as freshly verified remote state.
- No push, main merge, force-push, deployment, or external write was performed.

## C. Product model

BUSOS V1 is one coherent operating product for a photography business. The Business OS is the primary UI and the Feishu plane is an external data/collaboration boundary. The product model is:

`lead -> governed candidate -> human review -> customer/order/project facts -> scheduling -> shoot execution -> creative output -> review/automation trace`

Scheduling is P0. Service Agent handles acquisition and routing, but does not silently write business facts. Project execution is the owner context for tasks, assets, memory, scheduling, and related runs. Creative is an adapter-backed workspace. Automations are the product layer above Runs/Trace. Evaluation remains a subordinate system capability.

## D. Architecture and boundaries

- `apps/operator-workspace` owns the shared shell, router, navigation groups, Overview, owner journeys, and runtime badges.
- Domain packages retain the contracts and ports for business repository access, scheduling, Service Agent, creative production, human review, evaluation, memory, and workspace runs.
- Server-only adapters resolve Feishu, SCS/Service Agent, and RunningHub configuration. Browser code receives sanitized envelopes and never receives credentials or raw provider configuration.
- `DEMO`, `CONNECTED`, `LIVE`, and `BLOCKED` are explicit runtime identities. Missing configuration, missing authority, failed writes, failed readback, or unreachable providers surface as `BLOCKED`; they do not downgrade to fake DEMO success.
- The unified UI preserves legacy routes for compatibility, but the final navigation groups the product by owner intent.

## E. Navigation and Overview

Final information architecture:

- Overview
- Business: Customers, Orders, Projects, Scheduling
- AI: Service Agent, Creative, Reviews
- System: Automations, Evaluation, Integrations

Overview is actionable rather than decorative. It includes Owner pulse KPI cards linked to Customers, Orders, Projects, and Scheduling, plus a `Needs Attention / 需要你处理` list linking to scheduling confirmation, human review, integration configuration, and failed or human-required runs. Project detail exposes direct `Schedule shoot` and `Open Creative` actions.

## F. Business data and Project execution center

- Customers, Orders, Projects, and Scheduling are first-class routes in the final shell.
- Project detail is the execution context for the customer, project brief, tasks, assets, memory, related runs, and next actions.
- Local seeded owner-facing data is explicitly DEMO. Connected Business Data reads use the server envelope and remain `BLOCKED` without an authorized Feishu configuration; there is no silent browser fallback.
- The former Business Data route remains available for compatibility and is covered by the blocked/no-fallback smoke assertion.

## G. Scheduling P0

- `packages/scheduling` provides deterministic slot proposal and outreach logic from project requirements, resource capabilities, and availability intervals.
- The unified Scheduling view shows the project context, requirements, resources, proposed slots, explicit `Confirm slot`, outreach drafting, and the resulting canonical-shaped assignment/readback state.
- Confirmation is port-based and idempotent. The DEMO port performs a local canonical-shaped write/readback and reports `VERIFIED`; repeated confirmation reports `ALREADY_CONFIRMED`; overlap reports `CONFLICT`.
- The server exposes `POST /api/scheduling/proposals` and `POST /api/scheduling/confirm`. Without an injected authorized mapping/repository, confirmation returns `BLOCKED` and performs no write.
- A write is not represented as successful until the canonical assignment readback is verified.

## H. Service Agent acquisition and governance

- Production binding resolves through `ServiceAgentPort` on the server and fails closed when production configuration is absent.
- Browser DEMO conversations are deterministic and safe for the owner journey. They show intent, risk, route, evidence, handoff, and run linkage without exposing secrets or raw internal context.
- The candidate path is explicit: capture a candidate, open Reviews, inspect the governed review detail, and make a human decision. The candidate surface states that it does not directly write a business fact.
- The Python bridge now configures UTF-8 stdout before JSON output, preventing Windows `cp936` mojibake from corrupting Chinese candidate extraction. The regression is covered by the Service Agent bridge tests.

## I. Creative workspace

- Creative is registry-backed and presents the existing five capability cards through the unified surface.
- The workspace includes Recent Jobs, project context, brief, reference assets, capability/status, selected output, and history/trace.
- `Run DEMO` creates a visibly synthetic local result (`lumen-demo://...`) with job identity and history.
- `Check connected provider` uses the server boundary. Missing or unreachable RunningHub configuration is shown as `BLOCKED` with no fabricated provider output.
- The surface does not claim RunningHub `LIVE` evidence.

## J. Automations, Runs, and Trace

- Automations presents definitions for lead follow-up, shoot-day pack, and the creative review gate.
- Each definition shows its status and human gate. The deterministic DEMO action shows definition -> run -> trace reference; the existing Runs route remains available for run detail and trace inspection.
- The creative review gate is explicitly `HUMAN_REQUIRED` rather than an automatic outbound action.
- DEMO automation actions do not send messages, create external records, or dispatch provider work.

## K. Reviews, Evaluation, and Integrations

- Reviews is a governed human-review surface for Service Agent candidates and other reviewable outcomes, with queue -> detail -> decision evidence.
- Evaluation renders the canonical Golden Set summary: `42 total / 28 PASS / 14 NOT_EVALUABLE`; `NOT_EVALUABLE` remains visible and is not converted into success.
- Integrations provides sanitized capability health for Feishu data, Service Agent, and Creative provider. It exposes mode, capability, and safe reason text only; it does not expose tokens, raw config, or provider payloads.

## L. Runtime truth matrix

| Mode | Meaning in V1 | Evidence posture |
| --- | --- | --- |
| `DEMO` | Deterministic browser-safe or local synthetic path | Useful for owner journeys; no external write or LIVE claim |
| `CONNECTED` | Authorized server transport or connected read path | Must be separately verified against the configured target |
| `LIVE` | Real provider execution | Reserved for separately evidenced production output; not claimed here |
| `BLOCKED` | Missing/invalid config, authority, write mapping, readback, or provider availability | Visible failure; no silent fallback |

With the current environment, the browser owner path is DEMO, while Feishu/SCS/Creative integration health is visibly BLOCKED without authorized configuration. Scheduling DEMO confirmation is local and does not write Feishu.

## M. Owner journeys A-E

| Journey | Owner path | Closure evidence |
| --- | --- | --- |
| A | Project -> Scheduling -> deterministic proposal -> explicit Confirm slot -> `VERIFIED` readback | Product smoke passes proposal, confirmation, and readback assertions |
| B | Service Agent -> candidate -> Reviews queue -> review detail -> human decision | Product smoke passes capture-without-fact-write and governed decision assertions |
| C | Project -> Creative -> brief/reference assets -> DEMO job -> output/history | Product smoke passes DEMO job identity, output, and history assertions |
| D | Automations -> definition -> DEMO run -> trace reference / `HUMAN_REQUIRED` creative gate | Product smoke passes definition-to-trace assertions |
| E | Overview `Needs Attention` -> scheduling next step | Product smoke passes action routing to Scheduling |

The minimum DEMO smoke also covers final navigation, legacy compatibility routes, Evaluation, server seams, static host behavior, build identity, and browser secret scanning.

## N. Verification gates

All final checks below passed on final implementation commit `ca34086` unless noted as a source-tree check:

| Gate | Result |
| --- | --- |
| Root `npm test` | PASS; all workspace suites, including new scheduling and unified-surface tests |
| `apps/operator-workspace` `npm run typecheck` | PASS |
| `apps/operator-workspace` `npm run build` | PASS; `Build ca34086`, release `BUSOS-V1-UNIFIED-OPERATIONAL-PRODUCT-CLOSURE` |
| `apps/operator-workspace` `npm run smoke` | PASS; `SMOKE_PRODUCT_INTEGRATION_OK` and `SMOKE_FEISHU_V3_OK` |
| `git diff --check` | PASS; only normal CRLF conversion warnings were emitted |
| Browser bundle secret scan | PASS; no `FEISHU_`/`LUMEN_` credential tokens or `.env` content |
| Connected server smoke | PASS for explicit server registration and BLOCKED boundaries |

## O. Security and secret boundary

- No secret value was read into this report, committed, or placed in browser assets.
- Browser code has no Feishu, SCS, RunningHub, or provider credential source.
- `/api/integrations/health` returns sanitized booleans, modes, capabilities, and reasons only.
- DEMO has no outbound writes. Scheduling confirmation is local in DEMO; connected confirmation is blocked until an authorized canonical mapping/repository exists.
- The server keeps external provider binding and credential resolution behind the server-only adapters.

## P. Git, remote, and CI evidence

- Final local branch: `codex/busos-v1-unified-operational-product-closure`.
- Final local HEAD: `ca34086`.
- Local baseline used: `origin/main@729108d8059e3e143194a05f43e510af3587d385`.
- Fresh remote ref verification was unavailable because fetch could not write the shared Git metadata and `ls-remote` lacked host credentials.
- No claim is made about remote CI, PR state, remote branch state, production deployment, or owner acceptance.

## Q. Known limitations and blocks

1. Authorized external credentials, target mappings, and production authority were not available, so Feishu writes, real SCS Service Agent execution, and real RunningHub output remain BLOCKED.
2. DEMO Creative jobs and DEMO automation runs are local synthetic evidence; they are not production provider or durable external execution evidence.
3. Owner visual/product acceptance and production canary/readback evidence remain outstanding.
4. The shared Git repository repeatedly emitted `bad tree object 232e4d4e0e341fc1e64d0056984d9e4dc89a5c02` and `failed to perform geometric repack`. This was recorded as an environment warning; no repair, repack, or object rewrite was attempted.
5. Remote baseline freshness and CI status require a host with working GitHub credentials and shared Git metadata write access.

## R. Candidate integration and change set

- The branch selectively integrated the candidate scheduling, Feishu operations, connected server, SCS binding, and Lumen/RunningHub work needed for this closure, resolving the Lumen/router/server conflicts while preserving both operations and Creative boundaries.
- The Service Agent UTF-8 bridge regression was fixed as part of the closure.
- The final implementation is recorded in `ca34086`; the earlier closure design and execution plan are preserved in `docs/superpowers/specs/2026-08-27-busos-v1-unified-operational-product-closure-design.md` and `docs/superpowers/plans/2026-08-27-busos-v1-unified-operational-product-closure.md`.
- The stale `BUSOS-R2-FEISHU-V3-OS-PRODUCT-INTEGRATION-01-COMPLETION.md` report was intentionally removed from this V1 branch so the closure record is not duplicated or misleading.

## S. Rollback and recovery

- The original dirty checkout remains the recovery baseline and was not touched.
- The V1 work is isolated to the dedicated branch/worktree; `main` was not changed.
- Recovery can be performed by reviewing or reverting the dedicated branch commits after explicit authorization. No destructive reset, force-push, or shared-object repair was performed.
- Ignored build output is reproducible from the final commit with `npm run build`.

## T. Closure decision and next gates

Final decision: `ENGINEERING_COMPLETE_LIVE_BLOCKED`.

Before changing the verdict to a LIVE or production-complete status, the owner should gate the following in order:

1. Complete visual/product acceptance of the unified owner journeys.
2. Restore remote Git authentication and refresh/verify the authoritative main ref and CI state.
3. Provide or authorize server-only Feishu, SCS Service Agent, Creative provider, and canonical scheduling mappings.
4. Run controlled canary, write/readback, idempotency, and failure-path checks for each external boundary.
5. Capture real provider output and production deployment evidence, then re-evaluate the closure verdict.

No external LIVE claim is made until those gates have independent evidence.

## Remote Evidence Closure — 2026-08-27

The original closure report was authored before remote authentication was restored. Its historical statements that remote verification was unavailable, that no push had been performed, and that remote branch state was not yet verified describe the state at report-authoring time and are intentionally preserved as historical evidence.

Subsequent independent GitHub verification supersedes those statements for the current remote state:

```text
REMOTE_MAIN_SHA = 729108d8059e3e143194a05f43e510af3587d385
REMOTE_BRANCH_SHA = 87b27d9607417990c08141a7fa73287faa62bd25
IMPLEMENTATION_SHA = ca340863eace6aee36aa611a76314abbe5dc888e
REPORT_SHA = 87b27d9607417990c08141a7fa73287faa62bd25

remote implementation commit: PASS
remote report commit: PASS
remote report file: PASS
main unchanged by closure push: PASS

Remote verdict:
REMOTE_EVIDENCE_PASS
```

The implementation commit is `ca340863eace6aee36aa611a76314abbe5dc888e`; the closure/report commit and branch tip are `87b27d9607417990c08141a7fa73287faa62bd25`. The product runtime verdict remains `ENGINEERING_COMPLETE_LIVE_BLOCKED`.
