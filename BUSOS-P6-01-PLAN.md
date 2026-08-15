# BUSOS-P6-01 — Orchestrator MVP (Composition Only)

Status: IN PROGRESS — first implementation task COMPLETE (2026-08-15)
Phase: P6 — Orchestrator
Authorized: 2026-08-15 (owner override; P5 closed as FUNCTIONAL PASS with live CREATIVE_SUCCESS rerun deferred on CloudBase quota — non-code)

## 1. Goal

Compose the existing, individually-verified vertical slices into ONE runnable
business process behind a single entrypoint:

```text
Consultation
 → Golden Path        (Lead + Customer)        @busos/golden-path
 → Project Lifecycle  (Project + Task)         @busos/project-lifecycle
 → Creative Production(Asset + Task DONE)      @busos/creative-production
 → ProcessResult (with structured execution trace)
```

No existing package is modified. No new infrastructure (no Redis / MQ /
orchestration engine / workflow DSL). Pure composition + a structured
`TraceCollector` for observability.

Bonus: the deferred live CREATIVE_SUCCESS rerun (BL-016) becomes ONE inspectable
`runBusinessProcess(input, realDeps)` call instead of three separate manual runs.

## 2. Scope (enforced)

ONLY BUSOS-P6-01. Build one thin composition layer (`packages/orchestrator`)
that wires the existing P1–P5 slices into a deterministic chain. Do NOT:
- modify any existing `@busos/*` package (golden-path / project-lifecycle /
  creative-production / business-repository / lumen-adapter / contracts / …).
- redesign governance, candidate builder, human-review, or any slice.
- add transaction / saga / retry / CQRS / event-sourcing / queue infra.
- implement Memory / HITL policy automation / Evaluation center / dashboard /
  portfolio packaging (those remain P6+ deferred).
- change any contract schema/type.

## 3. New package

`packages/orchestrator/` (@busos/orchestrator)
- `src/types.ts` — `OrchestratorDeps` (shared `BusinessRepository` + `LumenPort`
  + optional `candidateBuilder`/`governance` overrides), `OrchestratorInput`,
  `ProcessStage` (`GOLDEN_PATH|PROJECT_LIFECYCLE|CREATIVE_PRODUCTION`),
  `ProcessStatus` (`SUCCESS|BLOCKED|FAILED`), `ProcessStageEvent`,
  `ProcessTrace`, `ProcessResult`.
- `src/trace.ts` — `TraceCollector` with async `stage(name, fn, ok)` recording
  start/end/duration + OK/FAILED; `snapshot()` returns `ProcessTrace`.
- `src/run-business-process.ts` — `runBusinessProcess(input, deps)`: composes the
  3 slices via `trace.stage(...)`, early-exits on non-success at each stage.
- `src/index.ts` — public surface (re-exports + `runBusinessProcess`,
  `TraceCollector`, types).
- `tests/fake-e2e.test.ts` — 2 tests (full happy path SUCCESS through fakes;
  Lumen-failure path → FAILED / CREATIVE_PRODUCTION stage in trace).

## 4. Architecture

- A single injected `BusinessRepository` satisfies the GoldenPath /
  ProjectLifecycle / CreativeProduction repository ports (duck-typed); a single
  injected `LumenPort` drives creative generation.
- `runBusinessProcess` imports ONLY from `@busos/golden-path`,
  `@busos/project-lifecycle`, `@busos/creative-production`, `@busos/contracts`,
  `@busos/business-repository`, `@busos/lumen-adapter`. It never imports Feishu
  tokens / table ids / SDK types, Lumen secrets, or `/api/auth`.
- Secrets stay behind the injected adapters (per D017/D018/D019); the
  orchestrator holds none.

## 5. Tests

command (in `packages/orchestrator`):
```
npm run verify      # tsc --noEmit && vitest run --pool=forks
```
- typecheck: PASS (tsc --noEmit exit 0)
- vitest: **2 passed | 0 failed** (13ms, 1 file)
  - fake-e2e.test.ts (2): full happy-path SUCCESS (asset id/uri defined, 3 OK
    stages in order) · Lumen-failure → FAILED at CREATIVE_PRODUCTION (3 stages
    recorded, last FAILED).
- The skipped/live path is a re-run of the SAME `runBusinessProcess` with real
  adapters, gated on `FEISHU_*` + `FEISHU_ASSET_TABLE_ID` and
  `LUMEN_BASE_URL` + `LUMEN_AUTH_PASSWORD`; deferred on CloudBase quota (BL-016).

## 6. Live gates

### P6-A — Composition fake E2E
PASS — `runBusinessProcess` with `FakeFeishuAdapter` + `createFakeLumenAdapter`
runs Consultation → Lead/Customer → Project/Task → Asset end to end and returns
`SUCCESS` with a 3-stage OK trace. Verified (2/2 tests).

### P6-B — Failure observability
PASS — on a Lumen generation failure the trace marks CREATIVE_PRODUCTION FAILED
and `result.failedStage === 'CREATIVE_PRODUCTION'`; zero partial Asset on
upstream slices already verified by P4/P5 compensation gates. Verified.

### P6-C — Live full-process E2E (deferred — BL-016)
Run the SAME `runBusinessProcess` with REAL `BusinessRepository`
(`RealFeishuAdapter`) + REAL `LumenPort` (`RealLumenAdapter`) through:
```text
Consultation → Real Feishu Lead/Customer write+readback
             → Real Feishu Project/Task write+readback
             → Real Vercel Lumen generate
             → Real Feishu Asset write+readback → VERIFIED
```
Requirements: no credential print; sanitized evidence only; cleanup by exact
`record_id`; gated on `FEISHU_*`+`FEISHU_ASSET_TABLE_ID` and
`LUMEN_BASE_URL`+`LUMEN_AUTH_PASSWORD`.
**Status: DEFERRED (CloudBase NoSQL read-quota exhaustion, non-code). Do NOT
substitute Fake PASS for Live PASS.** The orchestrator makes this a single
re-runnable call once quota is restored.

## 7. STOP rules

- STOP at commit + push + clean tree when P6-A / P6-B pass (they do).
- Do NOT start P6+ items (Memory / HITL / Eval / dashboard / portfolio) without a
  new authorized task.
- Do NOT expand scope to fix upstream slice bugs discovered here (log to backlog,
  e.g. BL-017). P6 is composition only.
- Do NOT claim P6-C LIVE PASS unless genuinely re-run this session with real
  secrets; otherwise report DEFERRED.
