# BUSOS-R2-H2-02 — Governed Memory Context Consumption

**VERDICT: `COMPLETE / PUSHED / REMOTE VERIFIED` — all gates A–J PASS.**

Second H2 increment. A minimal but *real* **Memory → Context Assembly → AI execution** link: a governed,
provenance-carrying **ACTIVE** Project/Customer Memory is consumed as *controlled business context* by the
existing real AI Business Action **Generate Visual Reference** — without a chatbot, vector DB, embedding
platform, or second state machine.

---

## Authority & Baseline

- Baseline `origin/main` = `9f64dd77abeccd3e54c56fce1221faf3518b4b21`, confirmed equal via `git ls-remote` before any change. No STOP triggered.
- Local index is corrupted by the known git-watcher lock (lags at H1-05), so the change set was computed against the **remote** SHA via a fresh external index (`GIT_INDEX_FILE` + `read-tree 9f64dd77` + explicit `git add` of only H2-02 files + `commit-tree -p 9f64dd77`), never against stale local `HEAD`. No `reset --hard`, no `clean -fd`, no force-push, no mixing of unrelated dirty files.

## What Shipped

- **`packages/memory/src/memory-context.ts` (NEW)** — `MemoryContext`, `MemoryContextRecord`, `MemoryContextSummary`, `MemoryContextLimits`, `assembleMemoryContext`, `toMemoryContextSummary`, `redactSecretContent`, provenance fail-closed `validateProvenance`. Deterministic sort, bounded clamp + `truncated`, content-free summary.
- **`packages/memory/src/index.ts`** — exports the new context API.
- **`packages/orchestrator/src/run-creative-project-action.ts`** — when `deps.memory` + `input.customerId` wired: assembles context (fail-closed on error), passes `governedMemoryContext` (a `MemoryContextSummary`, **separate** from `prompt`) into `executeCreativeProduction`; echoes it on `output.governedMemory`; `memoryTraceMeta` adds allowlisted refs.
- **`packages/orchestrator/src/trace.ts`** — allowlist +5 keys (`memory_context_used/count/refs/types/truncated`).
- **`packages/orchestrator/src/process-contract.ts`** — `BusinessProcessOutput.governedMemory?: MemoryContextSummary`.
- **`packages/creative-production/src/{types,execute}.ts`** — `CreativeProductionInput.governedMemoryContext?` → echoed as `result.governedContext`; never merged into the Lumen `prompt`.
- **`apps/operator-workspace/src/{action,ui}.ts`** — `runGenerateVisualReference` passes `memory: getMemoryService()` + `customerId`; GVR panel shows light "Context: N governed memories will be used" / result shows "Memory context: N record(s)". No memory console/editor/search/dashboard/new nav.
- **Tests** — `packages/memory/tests/memory-context.test.ts` (11), `packages/orchestrator/tests/creative-action-memory.test.ts` (5), `packages/creative-production/tests/governed-context.test.ts` (2). Rebuilt `apps/operator-workspace/dist/bundle.js`.

## Real Vertical Slice (Prompt → Trace → UI)

| Question | Answer |
|---|---|
| **User Action → Request** | `runGenerateVisualReference({projectId, prompt, sourceImageBase64, customerId}, key)` in DEMO mode (Fake adapters). |
| **Context Assembly** | In `runCreativeProjectAction`, after the idempotency guard: `assembleMemoryContext(deps.memory, {projectId, customerId})` → ACTIVE-only, project+customer scoped, provenance-checked, deterministically sorted, bounded. |
| **Memory — where / how carried** | As a **content-free** `MemoryContextSummary` (`{count, types[], refs[], truncated}`) — never raw `MemoryContext` records, never content. |
| **State — how carried** | Into `executeCreativeProduction` as `input.governedMemoryContext`; writtent to `result.governedContext`; surfaced on `BusinessProcessOutput.governedMemory`. NOT in `prompt`. |
| **Node / Consumer** | `executeCreativeProduction` (slice) → `LumenPort.generate({prompt, …})`. The summary is observability-only; `prompt` is passed verbatim. |
| **Tool got** | `FakeLumenAdapter` (demo) / `RealLumenAdapter` (connected) receives the **user `prompt` untouched**; the governed context is NOT in the call. |
| **Trace recorded** | `memory_context_used`, `memory_count`, `memory_refs` (pipe-joined ids), `memory_types` (pipe-joined), `memory_truncated` — all stable refs, allowlisted. |
| **Trace NOT recorded** | memory content, `prompt`, `source_image`, secret/credential/token, raw third-party payload, `lumen-stub://` asset uri, `password/api_key/Bearer`. |

## Tests — H2-02-A..J

| Gate | Coverage | Result |
|---|---|---|
| A — authority / scope boundary | prompt vs context strictly separate; GVR consumer test | PASS |
| B — deterministic assembly | reverse-insertion order → identical `records` | PASS |
| C — scope isolation | no cross-project/customer leak; project-only w/o customer | PASS |
| D — lifecycle | superseded hidden / replacement present; invalidated excluded | PASS |
| E — provenance fail-closed | non-canonical → `ContractValidationError`; consumer FAILED w/ 0 writes | PASS |
| F — bounded | maxRecords + per-record clamp + `truncated`; secret redaction; content-free summary | PASS |
| G — real consumer integration | GVR consumes `governedMemory`; `SMOKE_ACTION_OK` | PASS |
| H — trace safety | allowlisted refs only; forbidden set (content/secret/prompt/asset uri) absent | PASS |
| I — idempotency regression | duplicate key replays w/ identical governed context, 0 new Task/Asset | PASS |
| J — regression / boundary | full suite green; bundle secret scan clean; no test weakened | PASS |

## Regression (all green)

contracts **120** · memory **29** (+11) · creative-production **21 passed / 1 skipped** (+2) · orchestrator **49 passed / 1 skipped** (+5) · workspace-read **5** · workspace-review **7** · workspace-run **15**. App smokes: `SMOKE_OK`, `SMOKE_ACTION_OK`, `SMOKE_SERVER_OK` (honest BLOCKED), `MEMORY_SMOKE_OK`, `REVIEW_SMOKE_OK`, `RUN_SMOKE_OK`, `H1_05_CLOSURE_OK`.

## Defects

None. One test-wiring bug found and fixed in `memory-context.test.ts` (limits passed as the `scope` arg instead of `options`); implementation was correct. No production defect.

## Live Status

**LIVE GATE BLOCKED (BL-018)** — unchanged. The vertical slice is exercised end-to-end via the in-browser **DEMO** path + the server **CONNECTED** boundary probe (honest `BLOCKED` without credentials). Real Feishu Project + real Lumen generation + real Asset write + readback VERIFIED is NOT executed (no `LUMEN_*` / `FEISHU_*` live credentials / CloudBase quota). Reported honestly — **not** claimed LIVE PASS.

## Product State

Generate Visual Reference now consumes a governed memory context as a separate, auditable, content-free business input; the Project Detail GVR panel shows light context visibility ("Context: N governed memories will be used" / "Memory context: N record(s)"). The canonical Memory read-only section (H2-01) is unchanged. No new navigation, console, editor, or dashboard added.

## Next Recommended Task

Per STOP rule, H2-02 does NOT auto-start the next step. Owner should choose one authorized increment:

- **A. Golden Set + minimal Evaluation** — persist a small curated "golden" memory set + a read-only Evaluation surface over memory quality/coverage (non-LLM scoring). Lowest-risk next value on top of H2-01+H2-02.
- **B. Memory durability** — replace `InMemoryMemoryRepository` with a durable backend behind the existing `MemoryRepository` port (no API change).
- **C. Stronger deterministic extraction** — extend `extractMemoriesFromReviewCase` / `extractMemoriesFromProcessRun` coverage (still rule-based, fail-closed).
- **D. BL-018 LIVE closure** — owner-supplied `LUMEN_BASE_URL` + `LUMEN_AUTH_PASSWORD` + `FEISHU_*` + `FEISHU_ASSET_TABLE_ID` + CloudBase quota, then one live re-run of `runConnectedGenerateVisualReference`.

## Final Remote SHA

Recorded after push + `git ls-remote` verification — see completion message.
