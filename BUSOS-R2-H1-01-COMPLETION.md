# BUSOS-R2-H1-01 — Workspace Shell + Project Read Surface · Completion Evidence

**Date:** 2026-08-15
**Baseline:** `4b5ca9c7eaba3c9571b3dfb1d50d3119a75a9aa9`
**Final status:** `COMPLETE — H1-01-A..H1-01-J PASS`
*(Self-contained, read-only product surface. No live environment was required;
the read path is validated against the in-memory `FakeFeishuAdapter` and against
the `RealFeishuAdapter` simulator (stubbed transport). Per the STOP rule the task
ends at commit + push + clean tree — no automatic H1-02.)*

---

## 1. Objective met

Built the first usable AI Business OS product surface on top of the completed R1
core: an **Operator Workspace shell** with exactly four top-level navigation
entries (Overview / Projects / Reviews / Runs), where **Projects** is the only
real functional domain in H1-01 — a **read-only vertical slice** that lists
canonical Projects and opens a Project Detail showing the Project, its Customer
reference, Tasks, and Assets.

```
BusinessRepository (R1 persistence boundary, D017)
  └─ FakeFeishuAdapter | RealFeishuAdapter   (Feishu knowledge isolated, D018)
       └─ WorkspaceReadService  (H1-01 app boundary, no Feishu leakage)
            └─ apps/operator-workspace  (client-only; fake adapter; no creds)
```

No business mutation was authorized or implemented. Frozen decisions D001–D020
preserved. The only additive contract surface is three collection-read methods
plus one new package boundary.

---

## 2. Files changed

### Modified package `@busos/business-repository`
- `src/types.ts` — added `listProjects` / `listTasksByProject` / `listAssetsByProject`
  to the `FeishuAdapter` port interface (read-only, canonical return types).
- `src/business-repository.ts` — added three delegating read methods
  (`listProjects` / `listTasksByProject` / `listAssetsByProject`); +17 lines.
- `src/feishu-adapter-fake.ts` — added deterministic ordering helpers
  (`cmpUpdatedDesc`, `cmpCreatedAsc`) + three in-memory implementations; +46 lines.
- `src/feishu-adapter.ts` — added private `listRecords` (empty-filter
  `/records/search`, reuses the live-Base-safe search path) + three real-adapter
  implementations mapping with the same `fromFeishu*Record` logic; +52 lines.

### New package `@busos/workspace-read` (`packages/workspace-read/`)
- `package.json`, `tsconfig.json`, `vitest.config.ts` (paths/alias to contracts +
  business-repository; mirrors other packages).
- `src/types.ts` — `ProjectWorkspace { project; customer; tasks; assets }`.
- `src/workspace-read-service.ts` — `WorkspaceReadService` (constructor takes a
  `BusinessRepository`; `listProjects` + `getProjectWorkspace`, read-only).
- `src/seed.ts` — `seedFakeWorkspace(repo)` deterministic demo data: 2 Customers,
  2 Leads, 2 Projects (IN_PROGRESS + CONFIRMED), 5 Tasks, 2 Assets (IMAGE/LUMEN).
- `src/index.ts` — public barrel.
- `tests/fake-e2e.test.ts` — **H1-01-G**, 3 tests.
- `tests/real-adapter-simulator.test.ts` — **H1-01-H**, 2 tests (reuses the
  `makeFeishuStub`/`createFeishuAdapter({fetchImpl})` simulator pattern).

### New app `apps/operator-workspace`
- `index.html`, `src/styles.css`, `src/api.ts`, `src/ui.ts`, `src/main.ts`
  (vanilla TS + DOM; 4-nav shell, Projects list, Project Detail, placeholders).
- `shims/node-crypto.mjs` (browser shim for `node:crypto` used by the id
  generator), `build.mjs` (esbuild build), `smoke.mjs` (headless bundle test).
- `dist/bundle.js` — built static artifact (no Feishu secret).

### Control docs
- `project-control/BUSOS-R2-H1-01.md` — task materialization (authored earlier).
- `project-control/02-CURRENT-STATE.md` — CURRENT TASK → `[COMPLETE]`.
- `project-control/04-INTERFACES.md` — §8 additive H1-01 read-surface interface.
- `project-control/05-TEST-GATES.md` — `R2-H1-01 Gate` (H1-01-A..J).

---

## 3. WorkspaceReadService (application boundary)

```ts
interface ProjectWorkspace { project: Project; customer: Customer | null; tasks: Task[]; assets: Asset[]; }

class WorkspaceReadService {
  constructor(repo: BusinessRepository);
  listProjects(opts?: { limit?: number }): Promise<Project[]>;
  getProjectWorkspace(projectId: string): Promise<ProjectWorkspace | null>;
}
```

- Every method delegates to a repository *read*; it never calls a
  create/update/delete path → cannot mutate storage (H1-01-F).
- Only canonical domain types leave the boundary; Feishu record ids / table ids
  / field names never appear in `ProjectWorkspace` (D018).

---

## 4. Repository read API (additive, behind R1 boundary)

| Method | FakeFeishuAdapter | RealFeishuAdapter |
| --- | --- | --- |
| `listProjects(opts?)` | in-memory map, `updated_at` desc | `/records/search` empty filter → `fromFeishuProjectRecord` |
| `listTasksByProject(pid)` | filter by `project_id`, `created_at` asc | field-scoped `/records/search` on `taskProjectId` |
| `listAssetsByProject(pid)` | filter by `project_id`, `updated_at` desc | field-scoped `/records/search` on `assetProjectId` |

No existing method, contract, or decision was modified. Business-repository
test count unchanged at **37 passed | 1 skipped**.

---

## 5. Frontend `apps/operator-workspace`

- Desktop-first, responsive shell with the four required nav entries; Projects is
  the live surface, the other three are bounded placeholders.
- Runs entirely client-side against `FakeFeishuAdapter` (seeded via
  `seedFakeWorkspace`); **no Feishu credential reaches the browser**.
- Bundled with esbuild (`@busos/*` aliases + `node:crypto` shim + `process` shim)
  to `dist/bundle.js`. Headless smoke test (`smoke.mjs`) confirms the bundle
  loads, seeds the workspace, and renders without throwing (`SMOKE_OK`).

---

## 6. Tests & evidence (H1-01-A..J)

| Gate | What it proves | Evidence | Status |
| --- | --- | --- | --- |
| H1-01-A | Baseline/authority | `git reset --hard 4b5ca9c7`; remote `main` == baseline; R2 AUTHORITY CONFIRMED | **PASS** |
| H1-01-B | Workspace Shell | 4-nav TS app; built + headless smoke `SMOKE_OK` | **PASS** |
| H1-01-C | Canonical Project List | `listProjects()` → canonical `Project[]` over both adapters; UI renders | **PASS** |
| H1-01-D | Project Detail | `getProjectWorkspace()` → `{project,customer,tasks,assets}`; UI detail renders | **PASS** |
| H1-01-E | Repository Read Boundary | 3 collection reads in both adapters; no Feishu leakage | **PASS** |
| H1-01-F | Read-Only Enforcement | service + new repo methods are reads only; no new write surface; no creds in bundle | **PASS** |
| H1-01-G | Fake Product E2E | `packages/workspace-read/tests/fake-e2e.test.ts` **3 passed / 0 failed** | **PASS** |
| H1-01-H | Real-Adapter Simulator | `packages/workspace-read/tests/real-adapter-simulator.test.ts` **2 passed / 0 failed** | **PASS** |
| H1-01-I | Existing Regression | all `@busos/*` packages + workspace-read green; only LIVE cred-gated SKIPs | **PASS** |
| H1-01-J | Build / Type Safety | workspace-read `tsc` clean; bundle builds + smoke PASS; all packages typecheck clean | **PASS** |

Regression counts (verified green at closure; only LIVE credential-gated SKIPs
non-passing):
contracts 85 · service-agent-candidate 53 · business-repository 37+1skip ·
golden-path 11+1skip · human-review 42+2skip · project-lifecycle 20+1skip ·
lumen-adapter 9 · creative-production 19+1skip · orchestrator 37 ·
**workspace-read 5 (new)**.

---

## 7. Frozen-decision compliance

- **D008** (storage abstraction): read API flows through `BusinessRepository` →
  `FeishuAdapter` port; no storage specifics leak.
- **D014** (contract-based interaction): all returns are canonical `@busos/contracts`
  types; `@busos/workspace-read` imports only the contracts + repository surface.
- **D017** (`BusinessRepository` is the persistence boundary): `WorkspaceReadService`
  sits above it and never touches adapters directly.
- **D018** (`FeishuAdapter` owns Feishu knowledge): table ids / field names /
  record ids stay inside the adapters; `ProjectWorkspace` carries none.
- **D019** (write != success until readback VERIFIED): untouched — H1-01 adds no
  writes; `seedFakeWorkspace` reuses the already-verified write pipeline.
- D001–D020 remain unmodified. No R1 decision reopened.

---

## 8. Harness mapping

| Concern | Harness |
| --- | --- |
| Unit / E2E (workspace-read) | `packages/workspace-read` `vitest run --no-cache` (vitest 2.1.8) |
| Type safety | `packages/workspace-read` `tsc --noEmit` (via sibling `@types`) |
| Real-adapter simulator | `createFeishuAdapter({ fetchImpl })` + in-memory Feishu stub (no creds) |
| Frontend build | `apps/operator-workspace/build.mjs` → esbuild (aliases + shims) |
| Frontend smoke | `apps/operator-workspace/smoke.mjs` (Node + DOM stub) |
| Monorepo regression | per-package `tsc --noEmit` + `vitest run --pool=threads` |

Note: in this sandbox `npx vitest` terminates the process group, so the direct
vitest binary (`./node_modules/.bin/vitest`) is used; `orchestrator`'s own
`--pool=forks` script must be run via the direct binary too.

---

## 9. Git state

- Working tree aligned to baseline `4b5ca9c7`, then H1-01 changes layered on top.
- Only H1-01 files are committed; stale `vitest.config.ts.timestamp-*.mjs`
  artifacts and `hi.txt` junk are **not** staged.
- No secrets / credentials committed. No force-push.
- After push, remote `main` SHA is verified equal to the new H1-01 commit.

---

## 10. Deferred findings / non-goals

- **Non-goals (explicit):** no business mutation UI/API, no Human Review, no
  Creative Production, no Lumen, no Orchestrator execution, no H1-02/H1-03/H1-04/H1-05.
- **BL-018** (live full-process E2E) remains OPEN / NON-ENGINEERING LIVE
  DEPENDENCY; not part of H1-01 scope.
- The production `RealFeishuAdapter` LIVE read path (real Base) is simulator-validated
  only; a LIVE read smoke would require `FEISHU_*` + `FEISHU_PROJECT/TASK/ASSET_TABLE_ID`
  and is deferred (no code change pending). Do not substitute Simulator PASS for
  Live PASS.

---

## 11. Next state

H1-01 is **COMPLETE**. Per the STOP rule, STOP — do not start H1-02 (Reviews),
H1-03 (Runs), H1-04 (AI action), or H1-05 without explicit owner authorization.
The task ends at commit + push + clean tree.
