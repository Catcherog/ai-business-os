# BUSOS-R2-H2-01 — Canonical Memory Foundation

**Status: COMPLETE**
**Date: 2026-08-17**
**Baseline: `origin/main` = `a40d2416058c0541732ab316df1d977b2df1f1c7`** (verified equal before any work)
**Pushed: see §11 (implementation commit → `origin/main`, remote HEAD verified)**

This is the **first H2 task** after R2/H1 productization closure. It establishes a
**canonical, typed, auditable Memory foundation** for BUSOS: a governed *intelligence
layer over canonical business entities*.

What it is deliberately **not**:

- not a second business database (it never owns Customers / Projects / Tasks / Assets);
- not a workflow engine or a second state machine (it never runs a process);
- not LLM chat history, not a prompt store, not a transcript;
- not embeddings / vector search / semantic retrieval (explicitly out of H2-01 scope);
- not autonomous LLM extraction (all extraction here is deterministic and rule-based).

BL-018 remains **OPEN** — this task neither touches nor closes it (no live dependency).

---

## 1. Canonical memory model — `MemoryRecordV1`

`packages/contracts/src/memory-record.ts` (269 lines) + language-neutral
`contracts/memory_record.v1.schema.json` (259 lines), registered as
`CONTRACT_VERSIONS.MEMORY_RECORD_V1 = 'memory_record.v1'`.

| Field | Meaning |
|---|---|
| `version` | literal `memory_record.v1` |
| `memory_id` | `mem_<fnv1a64>` — **derived**, not random (see §3) |
| `scope` | retrieval partition `CUSTOMER` \| `PROJECT` |
| `subject_type` / `subject_id` | the canonical anchor (a Customer or Project that already exists) |
| `memory_type` | `PREFERENCE` \| `FACT` \| `DECISION` \| `OUTCOME` |
| `content` | operator-readable statement, 1–500 chars |
| `source_type` | `HUMAN_REVIEW` \| `PROJECT` \| `TASK` \| `ASSET` \| `PROCESS_RUN` |
| `source_ref` | canonical id of the originating record |
| `evidence_refs` | 1–16 `{ kind, ref }` canonical references — **mandatory** |
| `confidence` | `[0,1]`, always stated explicitly (never a fabricated default) |
| `status` | `ACTIVE` → `SUPERSEDED` \| `INVALIDATED` |
| `supersedes_memory_id` / `superseded_by_memory_id` | audit chain, `null` when N/A |
| `invalidation_reason` | required iff `INVALIDATED`, else `null` |
| `created_at` / `updated_at` | ISO-8601 |

Field naming follows the **existing repository convention** (snake_case canonical
records, `*_id` references, explicit `null` for unknown values — as in `domain.ts`),
not an external memory-platform vocabulary.

### 1.1 Contract-level invariants (fail closed, `.strict()` + `superRefine`)

An inconsistent lifecycle **cannot be persisted**:

1. `scope` must equal `subject_type` — a memory can never claim customer-wide
   applicability while being anchored to a single project;
2. `ACTIVE` ⇒ not superseded **and** not invalidated;
3. `SUPERSEDED` ⇒ `superseded_by_memory_id` present;
4. `INVALIDATED` ⇒ `invalidation_reason` present.

Two helpers keep the semantics in **one** place so no caller (UI, service, or a later
durable backend) can invent a weaker notion: `isActiveMemory(record)` and
`scopeForSubjectType(subjectType)`.

---

## 2. `@busos/memory` — the governed service boundary

New package (`packages/memory`), depending on **`@busos/contracts` only**.

- `src/memory-repository.ts` (46) — `MemoryRepository` port (`get` / `save` /
  `listBySubject`) + `InMemoryMemoryRepository` (Map-backed, `updated_at` desc, JSON
  clone on read so callers cannot mutate stored state). The port is the seam a durable
  backend plugs into later without touching business logic.
- `src/memory-service.ts` (343) — `MemoryService`, the only write path:
  - CREATE → `recordMemory`
  - READ → `getMemory` / `listMemoriesForSubject` / `listForContext`
  - CHANGE → `supersedeMemory` / `invalidateMemory`
  - **No destructive delete exists anywhere in the API.**
- `src/id.ts` (53) — isomorphic `fnv1a64` (BigInt, no `node:crypto` → safe in the
  browser bundle), `deriveMemoryId`, `isCanonicalRef`.
- `src/seed.ts` (60) — deterministic canonical seed (林晚晴 PREFERENCE anchored to
  `case_0001`, plus a second customer preference); idempotent by construction.
- `src/index.ts` (29) — barrel.

Business logic lives **in the service**, never in the UI. The UI is read-only.

---

## 3. Provenance is mandatory, idempotency is structural

**Provenance (fail closed).** `requireProvenance` rejects a write when `source_ref` is
absent or non-canonical, when `evidence_refs` is empty, or when *any* evidence ref is
not canonical — raising `ContractValidationError('memory.provenance', …)`. A canonical
ref is `^[a-z][a-z0-9_]*_[A-Za-z0-9]+$` or a stable URI (`lumen://`, `lumen-stub://`,
`feishu-drive://`). Consequence: a payload, a prompt, a base64 blob, or a credential can
**never** be stored as "evidence" — the write fails instead of degrading silently.

**Idempotency (structural, not a dedupe pass).** `memory_id` is *derived* from
`subject_type | subject_id | memory_type | source_type | source_ref | content`.
Reprocessing the identical source therefore produces the **identical id**, and
`recordMemory` returns the existing record instead of creating a duplicate. Different
content yields a different id — never a silent duplicate of the same id. Correcting
knowledge is an **explicit** `supersedeMemory` call, not an implicit overwrite.

**Change without loss.** `supersedeMemory` marks the old record `SUPERSEDED` (setting
`superseded_by_memory_id`) and creates the replacement `ACTIVE` with
`supersedes_memory_id` pointing back; a byte-identical "replacement" is recognised and
returns the existing record. `invalidateMemory` requires a non-empty reason. Both refuse
to act on a non-active record. The superseded record stays fetchable by id, and
`listMemoriesForSubject(..., { activeOnly: false })` exposes the full audit chain.

---

## 4. Deterministic extraction from existing canonical surfaces

No LLM, no semantic parsing — a fixed statement built from fields the source already
exposes. Both helpers are **duck-typed** (`ReviewCaseLike` / `ProcessRunLike`), so
`@busos/memory` stays decoupled from `@busos/human-review` and `@busos/orchestrator`:

- `extractMemoriesFromReviewCase(case, customerId)` → a `DECISION` memory anchored to
  the CUSTOMER, cited by `REVIEW_CASE` + `CUSTOMER`;
- `extractMemoriesFromProcessRun(run)` → an `OUTCOME` memory anchored to the PROJECT,
  cited by `PROCESS_RUN` + `ASSET`, only for a `SUCCEEDED` run carrying both ids.

Both **fail closed** (return `[]`) when the provenance they would have to cite cannot be
resolved — they never invent a reference.

---

## 5. Operator Workspace integration (read-only)

- `apps/operator-workspace/src/api.ts` — one `MemoryService` +
  `InMemoryMemoryRepository` instance per workspace init, seeded via
  `seedCanonicalMemory` against the **same** seeded customers the rest of the workspace
  uses; exposed through `getMemoryService()`.
- `apps/operator-workspace/src/ui.ts` — a new **项目上下文 / Memory** section in Project
  Detail, rendered from `listForContext(projectId, customerId)`. It shows only ACTIVE
  memories with their type pill and provenance; superseded/invalidated knowledge simply
  disappears from the operator's view while remaining in the audit chain. Read-only:
  no write control is exposed in the UI.
- `build.mjs` aliases `@busos/memory` for both browser and server bundles; `main.ts` /
  `smoke-driver.ts` re-export `getMemoryService` for headless driving.

---

## 6. Security boundary (unchanged, re-verified)

`@busos/memory` stores canonical **references**, never payloads or secrets, and uses no
`node:crypto` (isomorphic FNV-1a) so it bundles cleanly for the browser. The bundle scan
in `smoke.mjs` continues to assert the absence of `FEISHU_*` / `LUMEN_AUTH_PASSWORD` /
`LUMEN_BASE_URL` / `open-apis` / `app_token`, and `smoke-server.mjs` still reports an
honest `BLOCKED` without credentials. §4 status semantics are untouched.

---

## 7. Tests

| Suite | Result |
|---|---|
| `@busos/contracts` | **120 passed** (6 files) — incl. 15 new `memory-record` tests; `json-schema-parity` 44 (extended for `memory_record.v1`) |
| `@busos/memory` | **18 passed** (1 file) |
| `@busos/business-repository` | 37 passed / 1 skipped |
| `@busos/workspace-read` | 5 passed |
| `@busos/workspace-review` | 7 passed |
| `@busos/workspace-run` | 15 passed |
| `@busos/orchestrator` | 44 passed / 1 skipped (skip = H1-X01 live probe, needs creds) |
| `operator-workspace` typecheck | clean (`tsc --noEmit`) |

Browser/headless smokes — all green:
`SMOKE_OK`, `SMOKE_ACTION_OK`, `SMOKE_SERVER_OK` (honest `BLOCKED`),
`MEMORY_SMOKE_OK` (×2), `REVIEW_SMOKE_OK`, `RUN_SMOKE_OK` (×4).

`smoke-memory.mjs` (144 lines) drives the real SPA headlessly: Projects → 林晚晴 project
→ asserts the Memory section renders the seeded preference, then asserts
`listForContext` returns it as ACTIVE with provenance intact.

**No existing test was weakened, skipped, or relaxed.** During the work an earlier local
edit had replaced `packages/workspace-run/vitest.config.ts` with a narrower offline
variant (dropping the pinned `root`, `test.include`, and 7 aliases); that file was
**restored byte-identically to the baseline** and the suite re-verified at 15/15, so
`workspace-run` carries **zero** change in this task. `packages/memory/vitest.config.ts`
follows the established sibling convention (pinned `root` + `test.include`), verified
runnable from the repository root.

---

## 8. Gates A–J

All ten **PASS** — see `project-control/05-TEST-GATES.md` for the per-gate evidence.

---

## 9. Files

**New**
```
contracts/memory_record.v1.schema.json
packages/contracts/src/memory-record.ts
packages/contracts/tests/memory-record.test.ts
packages/memory/package.json
packages/memory/tsconfig.json
packages/memory/vitest.config.ts
packages/memory/src/{id,index,memory-repository,memory-service,seed}.ts
packages/memory/tests/memory-service.test.ts
apps/operator-workspace/smoke-memory.mjs
BUSOS-R2-H2-01.md
```

**Modified**
```
packages/contracts/src/{common,index}.ts
packages/contracts/tests/{fixtures,json-schema-parity.test}.ts
apps/operator-workspace/{build.mjs,package.json,smoke.mjs}
apps/operator-workspace/src/{api,main,smoke-driver,ui}.ts
project-control/{02-CURRENT-STATE,04-INTERFACES,05-TEST-GATES}.md
```

---

## 10. Limitations / deliberate non-goals

1. **Persistence is in-memory.** `InMemoryMemoryRepository` is the only implementation;
   the `MemoryRepository` port is the seam for a durable backend later. No new physical
   store was introduced in H2-01.
2. **Retrieval is exact and structural** (subject + scope + status). No embeddings, no
   vector index, no semantic similarity — out of scope by instruction.
3. **Extraction is rule-based** and covers exactly two proven surfaces (approved review
   → `DECISION`; successful run → `OUTCOME`). No autonomous LLM extraction.
4. **Subjects are narrow** (`CUSTOMER`, `PROJECT`) — only anchors H2-01 actually reads.
   No speculative subject types.
5. **UI is read-only.** No operator write/edit/supersede control is exposed yet.
6. **No Evaluation Center**, no memory scoring/decay, no cross-customer aggregation.
7. **BL-018 stays OPEN** — unrelated to this task and not touched.

---

## 11. Delivery

- Baseline `origin/main` = `a40d2416058c0541732ab316df1d977b2df1f1c7` (verified equal
  before any change).
- Implementation commit: recorded in the follow-up commit below (a commit cannot contain
  its own hash) → pushed to `origin/main`; remote HEAD verified via
  `git ls-remote origin refs/heads/main` and per-file
  `git cat-file -e <remote-sha>:<path>`.
- Narrow commit: only the H2-01 files in §9. Pre-existing unrelated working-tree drift
  and local-only artifacts (`node_modules` symlinks, `dist/`, vitest timestamp files,
  `.vite/`, `.stagidx`, `hi.txt`) were **not** committed.

**STOP rule honored.** H2-02, the Evaluation Center, H3, H4, and BL-018 remediation are
**not** started and cannot be auto-started without explicit owner authorization.
