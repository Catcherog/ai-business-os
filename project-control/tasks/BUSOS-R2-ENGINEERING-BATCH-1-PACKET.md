# BUSOS R2 Engineering Batch 1 — Task Packet

## Authority and execution order

- Remote baseline: `origin/main@b3a059d84d0b612387d465077799af6e1fe2fa94`.
- Orchestration branch/worktree: `codex/busos-r2-engineering-batch-1` at
  `C:\Users\Catcher\AppData\Local\Temp\codex-ai-business-os-r2-engineering-batch-1`.
- The source checkout is dirty and is not an implementation workspace.
- `git fetch origin` refreshed refs but reported the known shared-object
  `bad tree object` / `geometric-repack` environment warning; the required
  baseline ref resolves to the exact SHA above.
- Sequence: UX-01 → Workspace API-01 → `{SCS lane || Feishu lane || Evaluation lane}`
  → one serialized authoritative integration.
- No production deployment, real external write, SCS production binding, Lumen
  repair, secret access, force push or shared-object cleanup is authorized.

## Shared contract frozen before lanes

`WorkspaceDataSource` is the only browser-facing data boundary after API-01:

```ts
type WorkspaceMode = 'DEMO' | 'CONNECTED' | 'LIVE';
type WorkspaceStatus = 'READY' | 'BLOCKED' | 'ERROR';

interface RuntimeIdentityView {
  mode: WorkspaceMode;
  buildSha: string;
  connectionSummary: string;
}

interface WorkspaceEnvelope<T> {
  mode: WorkspaceMode;
  buildSha: string;
  status: WorkspaceStatus;
  data?: T;
  error?: { code: string; message: string };
}

interface WorkspaceDataSource {
  runtime: Promise<WorkspaceEnvelope<RuntimeIdentityView>>;
  listProjects(): Promise<WorkspaceEnvelope<ProjectWorkspace[]>>;
  getProject(projectId: string): Promise<WorkspaceEnvelope<ProjectWorkspace | null>>;
  listReviews(): Promise<WorkspaceEnvelope<ReviewCase[]>>;
  getReview(caseId: string): Promise<WorkspaceEnvelope<ReviewCase | null>>;
  decideReview(input: ReviewDecisionInput): Promise<WorkspaceEnvelope<ReviewCase>>;
  listRuns(): Promise<WorkspaceEnvelope<RunSummary[]>>;
  getRun(processId: string): Promise<WorkspaceEnvelope<RunDetail | null>>;
}
```

The DEMO implementation wraps the existing fake/in-memory services. The Server
implementation owns real application services and returns `BLOCKED` when its
required Connected dependencies are absent; it never substitutes DEMO data.
Envelopes contain only canonical view models and sanitized errors. No browser
credential, raw provider record, prompt, or unrestricted trace metadata crosses
the boundary.

## Task packets and file ownership

### BUSOS-R2-UX-01 — scalable IA and Runtime Identity

- Depends on: baseline only.
- Owns: `apps/operator-workspace/src/router.ts`,
  `apps/operator-workspace/src/runtime-identity.ts`, the existing UI shell and
  responsive CSS, plus route/navigation tests and the task Audit Packet.
- Must preserve: Overview, Projects, Reviews, Runs, all existing detail views and
  the current 17-step DEMO path.
- Must add: typed route definitions, detail-route parsing/selection, responsive
  navigation, and a visible `RuntimeIdentityView` for the current DEMO build.
- Must not add: empty Customers, Service Agent, Evaluation or Integrations pages;
  Workspace API/server work; real Feishu/SCS/Lumen connections; unrelated visual
  redesign.
- Gates: route/navigation tests, app typecheck, build, smoke, `npm run verify`,
  `git diff --check`; DEMO is applicable, CONNECTED/LIVE are not applicable.
- Audit Packet: `project-control/tasks/BUSOS-R2-UX-01.md`.

### BUSOS-R2-WORKSPACE-API-01 — runtime/data-source boundary

- Depends on: merged UX-01.
- Owns: `apps/operator-workspace/src/workspace-data-source.ts`, the API wiring
  and action seam, server Workspace endpoints/transport tests, and the task Audit
  Packet. It may update the root lockfile because baseline package manifests are
  not lockfile-synchronised.
- Must migrate existing Project/Review/Run reads and review decisions through the
  shared data source, preserve the current DEMO behavior, expose canonical
  `mode/build/status` envelopes, and keep the Server boundary fail-closed.
- Must not add new business entities, Service Agent UI, Evaluation UI or deploy.
- Gates: contract tests with DEMO and stubbed Server transport, missing Connected
  configuration → `BLOCKED`, browser bundle secret scan, app typecheck/build/smoke,
  root verify and diff check.
- Audit Packet: `project-control/tasks/BUSOS-R2-WORKSPACE-API-01.md`.

### SCS lane — runtime then UI

- Baseline: the verified post-API integration SHA; one active task at a time.
- Runtime owns `packages/service-agent-port/**`, Service Agent bridge encoding/
  adapter tests, the bounded conversation/run application service and its server
  endpoints. It may fix the baseline Windows UTF-8 bridge failure because it is
  inside the frozen Service Agent boundary.
- UI then owns only Service Agent feature modules and their tests under
  `apps/operator-workspace/src/features/service-agent/**`; integration wiring is
  coordinator-owned. The UI must show consultation, evidence, risk, route,
  handoff and candidate-through-review actions, never direct canonical writes.
- No production endpoint binding or SCS redeployment.
- Audit Packets: `project-control/tasks/BUSOS-R2-SCS-RUNTIME-01.md` and
  `project-control/tasks/BUSOS-R2-SCS-UI-01.md`.

### Feishu lane — connected data plane then business-data UI

- Baseline: the verified post-API integration SHA; one active task at a time.
- Runtime owns new server-only Connected Feishu data-source construction,
  canonical aggregate reads/writes/readback health and tests under
  `apps/operator-workspace/server/features/feishu/**`.
- UI owns only `apps/operator-workspace/src/features/business-data/**` and tests.
  It uses the shared data-source view models and displays sanitized health; no raw
  Base records or credential editing.
- No silent Connected→DEMO fallback and no real write without a separate live
  credential/owner gate; this batch uses fakes/stubs only.
- Audit Packets: `project-control/tasks/BUSOS-R2-FEISHU-CONNECT-01.md` and
  `project-control/tasks/BUSOS-R2-BUSINESS-DATA-UI-01.md`.

### Evaluation lane

- Baseline: the verified post-API integration SHA; one active task.
- Owns the evaluation application/report-store adapter and server endpoints under
  `packages/evaluation/**` and `apps/operator-workspace/server/features/evaluation/**`,
  plus `apps/operator-workspace/src/features/evaluation/**` and tests.
- The existing deterministic harness remains authoritative. Reports recompute the
  Golden Set, preserve `NOT_EVALUABLE`, and distinguish malformed dataset,
  hard-gate failure and success. No prompt/model comparison or online judging.
- Audit Packet: `project-control/tasks/BUSOS-R2-EVAL-UI-01.md`.

## Integration Coordinator gates

Only the coordinator may modify shared route/data-source registration, reconcile
`02-CURRENT-STATE.md` and `R2-AUDIT-INDEX.md`, merge lane branches, or push the
integrated result to `origin/main`. For every task record:

1. baseline remote SHA and worktree/branch;
2. exact owned files and unexpected-file count;
3. task-specific tests, `npm run verify`, `git diff --check` and build identity;
4. implementation commit SHA, pushed branch and post-merge `git ls-remote` SHA;
5. `ENGINEERING`, `DEMO`, `CONNECTED`, `LIVE`, CI and owner-acceptance statuses;
6. blockers/deferred findings and the next explicitly authorized task.

Ordinary test/type/build failures are repaired and re-run in scope. HARD STOP only
applies to the owner-listed authority, secret/login, deployment, real-write,
baseline/isolation, frozen-architecture/scope, destructive-operation or repeated
external-blocker conditions.
