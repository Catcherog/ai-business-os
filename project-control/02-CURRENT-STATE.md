# Current State

PROJECT: AI Business OS

BASELINE:
R1 technical / business core complete (P0–P6). See `01-MASTER-PLAN.md` (R1
history preserved) and completion reports (09/10/11-Px-01-COMPLETION.md,
BUSOS-P5-X03-STATUS.md, BUSOS-P6-01-PLAN.md). Detailed evidence for P1–P6 is
preserved in those completion reports and git history — not duplicated here.

CURRENT PHASE:
R2 — Unified AI Business OS Productization Rebaseline

CURRENT TASK:
FEISHU-V3-TASK-13 — Cutover Verification and Closure
[ENGINEERING COMPLETE — LIVE MIGRATION BLOCKED — NO LIVE FEISHU WRITES]
- Authority baseline (frozen): `origin/main@729108d8059e3e143194a05f43e510af3587d385`.
- Branch/worktree: `codex/busos-feishu-v3` at
  `C:\Users\Catcher\AppData\Local\Temp\codex-busos-feishu-v3`.
- Scope packet: `project-control/FEISHU-V3-GOAL.md` defines the Feishu v3 migration
  Goal, source inventory scope, lane ownership, write authority, canary rule, and
  STOP conditions for the new Base migration + OS cutover.
- Target Base API endpoint: `https://open.feishu.cn`. The deployment-specific NEW
  test Base identifier is provided only at live migration time through
  `FEISHU_TARGET_BASE_TOKEN`; no instance URL is present in the repository to
  record or guess. Table IDs are likewise environment-only and are never recorded
  in Git, reports, manifests, tests, or logs.
- Safety boundary: old Base, source spreadsheets, Drive, and Wiki stay read-only.
  No delete/move/rename of source systems or destructive conversion/deletion in the
  new Base is authorized. No real message sending, permission changes, or production
  deployment is in scope.
- Live-write boundary: only lane `L2 Feishu Schema/Live Migration` may perform real
  writes to the NEW test Base, and only after additive schema bootstrap plus a
  successful per-table canary (max 5 records/table, readback-verified).
- Implementation checkpoint: `b410bce` adds the connected Business Data and
  Scheduling surfaces, server-only target-Base reads, deterministic proposals,
  copyable outreach drafts, and a browser secret-boundary smoke.
- Live-gate attempt: `npm run migrate:plan` and the bootstrap/apply/verify
  configuration gates stopped with `Missing required environment variable:
  FEISHU_APP_ID`; no Feishu HTTP request or write occurred. See
  `project-control/FEISHU-V3-MIGRATION-REPORT.md`.
- Closure status: `project-control/FEISHU-V3-CLOSURE.md` records engineering
  completion but does not claim live migration, connected counts, or production
  readiness. The next action requires authorized live environment configuration.

PRIOR TASK (closed):
BUSOS-R2-BATCH1-PRODUCT-INTEGRATION-CORR-01 — Product Integration Correction
[ENGINEERING PASS — PRODUCT INTEGRATION COMPLETE — PUSHED — OWNER ACCEPTED / MERGED TO MAIN]
- **MERGE CLOSURE (BUSOS-R2-BATCH1-MERGE-CLOSE-01, 2026-08-24)**: `main` fast-forwarded
  `1b58f42` → `2ca001e` (`MERGED_MAIN_SHA`); operator + root `npm run verify` GREEN
  (operator 30 tests = 16 UI + 14 API; root ~573 passed / ~7 skipped / 0 failed);
  docs-only governance closure commit applied (`FINAL_MAIN_SHA` recorded externally via
  `git ls-remote`, non-self-referential per protocol §4). **PRODUCTION CONNECTIVITY ≠
  COMPLETE; PRODUCTION DEPLOYMENT ≠ COMPLETE** — explicitly deferred (no SCS production
  connect, no CloudBase redeploy, no real Feishu binding; BL-018 / H3 / H4 untouched).
- Authority baseline (frozen): `origin/main@1b58f42e0339447ce1dc7cd06fc3540b4ad5b79e`
  (re-queried via `git ls-remote`; unchanged).
- Branch: `codex/busos-r2-batch1-product-integration-corr-01`; isolated worktree
  `D:/360Downloads/Trae 项目/busos-corr01`; dependency isolation via `npm ci`
  (lockfile/manifests UNCHANGED).
- Root cause corrected: Batch 1's Service Agent / Business Data / Evaluation
  feature modules reached `main` without Router / Navigation / UI / server
  wiring — the product now exposes all seven surfaces: Overview / Projects /
  Reviews / Runs / **Service Agent** / **Business Data** / **Evaluation**
  (typed routes `#/service-agent`, `#/business-data`, `#/business-data/:id`,
  `#/evaluation`).
- Implementation commit: `f1a351643a5797a001881c774db3d11c722406a4`
  (`f1a3516`); report commit pushed; branch tip externally verified via
  `git ls-remote` after push (protocol §4, non-self-referential).
- **OWNER-REVIEW-FIX-01 (erratum)**: Service Agent server fail-closed adapter
  unsafe double cast (`as unknown as ServiceAgentPort`) removed → typed adapter;
  Business Data seeded DEMO data relabelled `DEMO / READY / connected=false`
  (was wrongly `CONNECTED / READY / connected=true`); presentation contract
  `mode: 'DEMO' | 'CONNECTED'` while the Connected transport still requires
  `CONNECTED` (fail-closed, no DEMO fallback); server seam stays
  `CONNECTED / BLOCKED`. Fix implementation `86bd4b5`; dedicated identity suite
  + Journey C smoke identity closure (DEMO · READY in browser, CONNECTED/BLOCKED
  on server).
- Browser product-integration smoke `smoke-product-integration.mjs` drives the
  REAL router/navigation/UI (Journeys A–E) + the built CONNECTED server seams:
  static SPA 200, `/api/evaluation/report` SUCCESS 42/28/14,
  `/api/business-data/customers` CONNECTED/BLOCKED, `/api/service-agent/*`
  READY fail-closed. Bundled-server path defects repaired (esbuild
  `import.meta.url` rewrite → cwd-anchored paths + `pathToFileURL`).
- Gates: operator typecheck + vitest (27 + 7) + service-agent-port 21
  (incl. 3 REAL E2E) + evaluation 86 + full root `npm run verify` GREEN +
  `git diff --check` clean + browser bundle secret scan clean.
- Next authorized work (Owner choice): Owner product review/acceptance of this
  correction → or the previously deferred `BUSOS-R2-SCS-PROD-DEPLOY-01` / Lumen
  write-path repair / Golden Set / Memory durability — each requires explicit
  authorization; nothing auto-starts.

PRIOR TASK (closed):
BUSOS-R2-SCS-INTEGRATION-01 — Service Agent → Business OS 真实集成
[ENGINEERING COMPLETE — `@busos/service-agent-port` + orchestrator 窄入口
`runServiceAgentConsultation` + Run Detail；SCS frozen tests 687 passed；已收敛进 main]
BUSOS-R2-H2-03 — Evaluation Harness + Golden Set
[ENGINEERING COMPLETE — REMOTE CI PASS — PUSHED / REMOTE VERIFIED —
OWNER ACCEPTANCE NOT APPLICABLE (backend evaluation harness)]
- Evaluation Harness (`@busos/evaluation`): deterministic Tier-1 judges — MEMORY
  (real `MemoryService` + `assembleMemoryContext`) and GOVERNANCE (real `govern`);
  RETRIEVAL / GENERATION honestly `NOT_EVALUABLE` (no production surface in BUSOS,
  KB-SNAPSHOT F-01), never faked.
- Canonical Golden Set: **42 cases → 28 PASS / 0 FAIL / 0 ERROR / 14 NOT_EVALUABLE**.
- CORR-01 (`a9b81a5`): MEM-17 production bearer-secret redaction defect repaired in
  `packages/memory/src/memory-context.ts`; golden-set expectation NOT weakened;
  no whitelist / known-gap used to fake PASS.
- Remote CI: **PASS** (run `32590688601`, `verify` job) on implementation SHA `eea166f`.
- Implementation SHA: **eea166f** (H2-03 tip).
- H2-03 ≠ Full Evaluation Center — see `BUSOS-R2-H2-03.md`.
- BL-018 live closure attempts (`c8b4577` / `0d417af`): owner-authorized re-verification —
  CloudBase read recovered-but-slow, **WRITE path still hangs** (504 Task timed out); verdict
  BLOCKED, BL-018 stays OPEN; evidence docs + backlog note only, no production code.
- See `BUSOS-R2-H2-03.md` (Completion / Audit Packet) + `R2-AUDIT-INDEX.md`.

PRIOR TASK (closed):
BUSOS-R2-X01-CLOSE — Stable Preview + CI Green Closure
[COMPLETE — REMOTE CI PASS — STABLE PUBLIC DEMO LIVE at
`https://ai-business-os-demo-ochre.vercel.app` (Build `c7a25d8`, DEMO) — OWNER ACCEPTANCE PENDING]
BUSOS-R2-GOV-01 — Verification, Preview & Audit Protocol
[CONTROL / GOVERNANCE COMPLETE — PUSHED / REMOTE VERIFIED]

CURRENT ENGINEERING STATUS:
H1-01 COMPLETE — Operator Workspace shell (Overview / Projects / Reviews / Runs)
shipped with the read-only Projects list + Project Detail (Project + Customer +
Tasks + Assets) surface on top of the R1 core. See `BUSOS-R2-H1-01-COMPLETION.md`.

H1-02 COMPLETE — the placeholder **Reviews** navigation is now a real, usable
Human Review surface. A new minimal `@busos/workspace-review`
`WorkspaceReviewService` delegates every review decision (APPROVE / EDIT+APPROVE
/ REJECT) to the existing `@busos/human-review` `HumanReviewService` (which
reuses the P2 golden-path commit path + readback verification + fail-closed).
The Operator Workspace (`apps/operator-workspace`) renders a deterministic
Reviews list (pending-first), a Review Detail (original AI candidate /
governance / AI evidence / original snapshot), and the three human decisions
with terminal-outcome display and repeat-decision guard. Deterministic demo
review cases seed the in-memory `FakeFeishuAdapter`; no Feishu credential reaches
the browser. Gates H1-02-A..H1-02-J all PASS. See
`BUSOS-R2-H1-02-COMPLETION.md`.

H1-03 COMPLETE — the placeholder **Runs** navigation is now a real, read-only Run
Detail / Trace surface. A new minimal `@busos/workspace-run` `WorkspaceRunService`
reads process executions from the existing `@busos/orchestrator`
`ProcessRegistryReadPort` (additive; `InMemoryProcessRegistry` already implements
both `ProcessRegistry` and `ProcessRegistryReadPort`) and maps each canonical
`BusinessProcessResult` into a presentation-safe `RunView` / `RunStageView` /
`RunTraceEventView` (no second state machine). It reuses the P6 contract directly
(`BusinessProcessStatus` / `BusinessProcessStage` / `ProcessError` /
`ProcessRejection` / `ProcessTraceEvent`) and the P6 `sanitizeTraceMetadata` /
`sanitizeMessage` allowlist so no secret / token / prompt / raw third-party
payload reaches the view models or the browser. The Operator Workspace
(`apps/operator-workspace`) renders a deterministic Runs list (updated_at desc;
RUNNING shown honestly as registry-only with empty trace / null output / null
duration) and a Run Detail (status pill, per-stage structured trace, sanitized
error, safe output refs). Deterministic demo executions seed the shared
`InMemoryProcessRegistry`: A SUCCEEDED / B FAILED (system fault) / C RUNNING
(honest) / D HUMAN_REQUIRED (normal pause, never a system error). Gates
H1-03-A..H1-03-J all PASS. See `BUSOS-R2-H1-03-COMPLETION.md`.

H1-04 ENGINEERING COMPLETE — the first **real AI action** vertical slice.
`Generate Visual Reference` now lives on the Project Detail view: an existing
Project runs through the real Creative Production + Lumen + Asset path via a NEW
narrow `@busos/orchestrator` entry `runCreativeProjectAction` (CREATIVE_PRODUCTION
only; it does NOT call `runBusinessProcess`, adds no second state machine, reuses the
P6 status / trace / registry / sanitizer / error-classification). The Operator
Workspace exposes two explicit modes: **DEMO** (in-browser `FakeFeishuAdapter` +
`FakeLumenAdapter`, same shared `InMemoryProcessRegistry` as the Runs surface, so the
new run + Task + Asset appear there) and **CONNECTED** (server-only
`server/workspace-action.ts` building `RealFeishuAdapter` / `RealLumenAdapter` from
env; secrets never reach the browser bundle). Idempotency (`idempotencyKey`) replay
the recorded outcome on a double-click with zero new Task/Asset. Trace carries NO
prompt / source_image / secret (P6 allowlist). The browser smoke
(`smoke-action.mjs`) drives the real DEMO action end-to-end and asserts
`SUCCEEDED` + `assetId`/`assetUri` + a real Task/Asset written + the run recorded in
the shared registry + no secret leak. The server probe (`smoke-server.mjs`) asserts
the CONNECTED boundary returns `BLOCKED` with no credentials — honest, never a faked
LIVE result.

**LIVE GATE STATUS: BLOCKED (BL-018).** The real Feishu Project + real Lumen
generation + real Asset write + readback VERIFIED + UI Run/Asset view could NOT be
executed because `LUMEN_*` + `FEISHU_*` live credentials / CloudBase quota are not
available in this environment. Per requirement #7 this task is reported as
**ENGINEERING COMPLETE / LIVE GATE BLOCKED** — it does NOT claim H1-04 LIVE PASS and
does NOT auto-start H1-05/H2/H3/H4. Gates H1-04-A..H1-04-J defined in
`05-TEST-GATES.md`; see `BUSOS-R2-H1-04.md` for the full completion report.

H1-05 COMPLETE — **Real Usage Closure / MVP Review** (product walkthrough + usability
audit + smallest genuine defect repair + backlog capture). The full H1-01 → H1-04
user journey was exercised end-to-end in the in-browser **DEMO** mode and the
server-only **CONNECTED** boundary probe. All H1 success checkpoints H1-S1..H1-S7
PASS on engineering / DEMO evidence (orchestrator **43/43**, workspace-read **5/5**,
workspace-review **7/7**, workspace-run **12/12** recorded + `RUN_SMOKE_OK ×5`, all
five app smokes green). One genuine **P1** product defect was found and **fixed**: the
Projects / Reviews / Runs nav entries were mislabelled `LIVE` (contradicting the honest
`IN-MEMORY` / `DEMO` footer + GVR badge) — corrected to `DEMO` in
`apps/operator-workspace/src/ui.ts` (the only code change). P2/P3 UI papercuts
(BL-021 manual refresh after GVR, BL-022 Overview placeholder, BL-023 raw DEMO
assetUri) are captured in the backlog as non-blocking. **Final verdict B:**
`H1 ENGINEERING COMPLETE / MVP LIVE CLOSURE BLOCKED — BL-018`. The LIVE gate remains
BLOCKED (BL-018); the MVP is NOT claimed LIVE-COMPLETE. See `BUSOS-R2-H1-05.md` for the
full 12-section closure report.

H2-01 COMPLETE — **Canonical Memory Foundation**, the first H2 task. A new
`MemoryRecordV1` contract (`packages/contracts/src/memory-record.ts` +
`contracts/memory_record.v1.schema.json`, `CONTRACT_VERSIONS.MEMORY_RECORD_V1`) and a
new `@busos/memory` package establish a typed, auditable **intelligence layer over
canonical entities** — every memory is ANCHORED to an existing Customer or Project,
carries MANDATORY provenance (`source_type` + `source_ref` + ≥1 canonical
`evidence_refs`), and has an explicit lifecycle (`ACTIVE` → `SUPERSEDED` /
`INVALIDATED`) so knowledge changes **without destructive deletion**. `MemoryService`
is the only write path (CREATE / READ / SUPERSEDE / INVALIDATE — no delete method
exists); provenance is fail-closed (a payload / prompt / blob / credential can never be
stored as evidence) and idempotency is **structural** (`memory_id` = `mem_` + FNV-1a64
of subject+type+source+content, so identical reprocessing returns the existing record
and can never duplicate). Extraction is deterministic and rule-based only — approved
human review → `DECISION`, successful process run → `OUTCOME` — both duck-typed and
fail-closed; **no LLM extraction, no embeddings, no vector index, no semantic
retrieval**. Persistence is `InMemoryMemoryRepository` behind a `MemoryRepository` port
(the seam for a durable backend later); no new physical store was introduced. The
Operator Workspace gained a **read-only** 项目上下文 / Memory section on Project Detail
(`listForContext(project_id, customer_id)`, ACTIVE only, with provenance) verified
headlessly by `smoke-memory.mjs` → `MEMORY_SMOKE_OK`. Suites: contracts **120**, memory
**18**, business-repository **37/1 skipped**, workspace-read **5**, workspace-review
**7**, workspace-run **15**, orchestrator **44/1 skipped**; all app smokes green; no
existing test weakened. Gates H2-01-A..H2-01-J all PASS. See `BUSOS-R2-H2-01.md`.

H2-02 COMPLETE — **Governed Memory Context Consumption**, the second H2 task and the
first real **Memory → Context Assembly → AI execution** link. A new
`packages/memory/src/memory-context.ts` adds `assembleMemoryContext` /
`toMemoryContextSummary` / `redactSecretContent`: it reads **ACTIVE-only** memory scoped
to `(project_id, customer_id)`, sorts deterministically, clamps to bounded
`maxRecords`/`maxContentLength`/`maxTotalContentLength`, redacts obvious credential
material, and — on non-canonical provenance — **fails closed** (`ContractValidationError`).
The single consumer is the existing **Generate Visual Reference** vertical slice:
`runCreativeProjectAction` assembles the context (when `deps.memory` + `input.customerId`
are wired) and hands a **content-free** `MemoryContextSummary` to `executeCreativeProduction`
as a SEPARATE input — the user `prompt` is never concatenated with governed memory and
Lumen receives it untouched. The summary is echoed on `BusinessProcessOutput.governedMemory`
and carried into the trace only via 5 allowlisted stable-ref keys (`memory_context_used` /
`count` / `refs` / `types` / `truncated`); no content / secret / prompt / asset-uri ever
enters the trace. The Operator Workspace GVR panel shows light context visibility
("Context: N governed memories will be used" / "Memory context: N record(s)") — no
console, editor, search, dashboard, or new nav. End-to-end in the browser bundle
(`smoke-action.mjs`): a seeded CUSTOMER PREFERENCE is consumed (`output.governedMemory.count ≥ 1`,
`memory_context_used` in trace) with a real Task/Asset written and the run recorded; the
CONNECTED boundary still returns honest `BLOCKED` without credentials. Suites: contracts
**120**, memory **29** (+11), creative-production **21 passed / 1 skipped** (+2),
orchestrator **49 passed / 1 skipped** (+5), workspace-read **5**, workspace-review **7**,
workspace-run **15**; all seven app smokes green; no existing test weakened. Gates
H2-02-A..H2-02-J all PASS. See `BUSOS-R2-H2-02.md`.

H2-03 COMPLETE — **Evaluation Harness + Golden Set**, the third H2 task and the first
real **evaluation foundation** for BUSOS. A new `@busos/evaluation` package provides
deterministic Tier-1 judges (MEMORY via real `MemoryService` + `assembleMemoryContext`;
GOVERNANCE via real `govern`), metrics, regression gates (hard gate + baseline delta), a
machine-readable reporter, and a CLI (`npm run eval`) with contract exit codes
**0 (dataset PASS) / 1 (hard-gate FAIL) / 2 (malformed dataset)**. The Canonical Golden
Set (`datasets/golden-set.v0.json`) holds **42 cases → 28 PASS / 0 FAIL / 0 ERROR / 14
NOT_EVALUABLE**; RETRIEVAL / GENERATION cases are honestly `NOT_EVALUABLE` (no production
surface in BUSOS, KB-SNAPSHOT F-01) — never faked, never auto-passed. CORR-01
(`a9b81a5`) repaired the MEM-17 production bearer-secret redaction defect in
`packages/memory/src/memory-context.ts` without weakening any golden-set expectation and
without any whitelist / known-gap. Engineering evidence: Memory **36/36**, Evaluation **83/83**
(12 test files), Golden Set **28/0/0/14**, Hard Gate **PASS**, CLI **0/1/2**; Remote CI **PASS**
(run `32590688601`). **H2-03 is NOT the Full Evaluation Center** — UI comparison, prompt/model
version comparison, Memory durability, stronger LLM extraction, and multimodal ingestion
remain deferred. See `BUSOS-R2-H2-03.md` for the full completion / audit packet.

EXISTING CAPABILITIES (short list):
- Candidate / Governance (Service Agent → `LeadCandidateV1`, deterministic governance)
- Human Review (`@busos/human-review`: approve / edit+approve / reject)
- BusinessRepository / FeishuAdapter (write + readback verification, D019)
- Project / Task lifecycle (`@busos/project-lifecycle`)
- Creative / Asset (`@busos/creative-production` + `@busos/lumen-adapter`)
- Orchestrator / Trace (`@busos/orchestrator`: `runBusinessProcess`, process
  state, structured trace, error classification, idempotency, fail-closed)
- Memory (`@busos/memory` + `MemoryRecordV1`: anchored governed knowledge with
  mandatory provenance, structural idempotency, non-destructive auditable
  lifecycle, deterministic rule-based extraction, read-only workspace surface)

ACTIVE BLOCKERS:
- **BL-018 OPEN — Lumen application/SDK write-path defect suspected.** The latest
  diagnostic (`8f9ad4a`) rules out a CloudBase provider-wide write failure: admin
  writes/readback succeeded, while deployed Lumen writes did not reach the DB and
  timed out at the Vercel function boundary. Repair belongs to the separate
  `picture-edit` task `LUMEN-WRITE-PATH-FIX-01`; Unified LIVE closure remains blocked.
- External SCS production deployment prerequisite is complete based on the reviewed
  `SCS-R2-CLOUDBASE-REDEPLOY-02` evidence: repair SHA `ab2b03bc...`, Deploy `046`,
  `PRODUCTION_REDEPLOY_PASS`. BUSOS still lacks a production endpoint binding and
  contract/timeout/handoff/evidence → Run/Trace proof; that is the later
  `BUSOS-R2-SCS-PROD-CONNECT-01` gate, not another SCS deployment.

AUTHORIZED DEVELOPMENT LANES:
**ACTIVE FOR FEISHU V3 GOAL:** one bounded active task per isolated lane, with one
authoritative Integration Coordinator:
- `L0 Integration Coordinator` — baseline refresh, task state, serialized
  integration, final verification, and the only merge authority.
- `L1 Migration Tool` — manifest, source reads, normalization, dedupe, apply,
  and verification logic; may work in parallel with L3 on frozen fixtures only.
- `L2 Feishu Schema/Live Migration` — target schema bootstrap, canary, batch
  migration, and readback; this lane exclusively owns real writes to the NEW
  test Base.
- `L3 Contracts/Repository` — new contracts, repository adapter, fake client,
  and tests; no live writes.
- `L4 Workspace API/Scheduling` — server read APIs, scheduling, and outreach
  draft logic on top of L3 interfaces.
- `L5 Operator UI` — Business Data, scheduling advice, and draft surfaces on top
  of L4 contracts; fixture-first allowed.

Dependency and integration order are frozen as `L1 → L3 → L4 → L5 → L2 live
evidence → L0 closure`. Lane workers do not merge, do not write outside owned
paths, and must stop on the Feishu v3 Goal STOP conditions.

AUTHORITATIVE INTEGRATION TASK:
`L0 Integration Coordinator` is the sole authoritative merge/cutover owner for
the Feishu v3 Goal. No other lane may integrate, push to `main`, or perform live
schema/data writes outside the `L2` exclusive window. Batch 1 coordinator closure
remains historical and does not authorize self-merge for this Goal.

NEXT AUTHORIZED IMPLEMENTATION WORK:
`FEISHU-V3-TASK-1` may complete this control packet only. After that, the next
authorized implementation step is Task 2 (`Migration Package and Manifest
Contracts`) on a clean isolated lane from the same frozen baseline, provided
`origin/main` remains unchanged. Do not start live migration, SCS production
connection, Lumen repair, BL-018 closure, Unified Production Closure, H3, or H4
from this task.

IMPORTANT DEFERRED ITEMS:
- BL-018 — OPEN; live full-process E2E remains blocked pending a separate Lumen
  application/SDK write-path repair and later owner-authorized rerun.
- PUBLIC PREVIEW — LIVE at `https://ai-business-os-demo-ochre.vercel.app`
  (X01-CLOSE, Build `c7a25d8`, DEMO). Owner manual acceptance still PENDING
  (no new product work required).
- **SCS PRODUCTION — external deployment prerequisite CLOSED; BUSOS binding OPEN /
  NOT AUTHORIZED.** SCS-R2 production is evidenced at repair SHA `ab2b03bc...`,
  Deploy `046`. The future BUSOS gate is `BUSOS-R2-SCS-PROD-CONNECT-01`: bind BUSOS
  to that endpoint and prove contract/timeout/handoff/evidence/Run/Trace/build identity
  without modifying or redeploying SCS.
- BL-015 — P1-02 extraction gap ("新中式" alone); DEFERRED / NON-BLOCKING.
- BL-016 — CLOSED (P5 owner override).
- BL-017 — Feishu Lead DateTime write; DEFERRED / NON-BLOCKING maintenance item.
- BL-019 — CLOSED (BUSOS-P6-03 golden-path simulator regression repaired).
- H2 (beyond H2-03) / H3 / H4 horizons — deferred per `R2-LONG-TERM-ROADMAP.md`;
  cannot be auto-started. H2-01 (Canonical Memory Foundation), H2-02 (Governed Memory
  Context Consumption), and H2-03 (Evaluation Harness + Golden Set) are the H2 tasks
  authorized and completed so far; the Full Evaluation Center UI (H2-04+) is NOT started.
- Memory durability — H2-01 ships `InMemoryMemoryRepository` only; a durable backend
  behind the `MemoryRepository` port is deferred (non-blocking, by design).

NOTE ON STALE OBJECTIVES:
Prior P3/P4/P5 "PRIMARY OBJECTIVE" text described past task objectives and is
intentionally not retained as the current objective. This file now reflects only
the R2 planning state above. Historical objectives remain in the completion
reports and git history.

LATEST CONTROL DECISIONS:
R1 decisions D001–D020 are FROZEN (see `03-DECISIONS.md`). Proposed post-H1
decisions D021–D028 are recorded on the rebaseline branch and become frozen only
if that branch is owner-approved and merged. `BUSOS-R2-UNIFIED-OS-REBASELINE-01.md`
supersedes `R2-LONG-TERM-ROADMAP.md` only for post-H1 sequencing. No R1 frozen
decision is re-opened.

GOVERNANCE (BUSOS-R2-GOV-01, refined by BUSOS-R2-X01): all R2+ work is now bound by
`R2-VERIFICATION-AND-AUDIT-PROTOCOL.md` — `origin/main` real remote SHA is the sole code
authority; evidence levels (ENGINEERING / DEMO / CONNECTED / LIVE / OWNER) replace bare
`COMPLETE`/`PASS`; every task emits an Audit Packet and updates `R2-AUDIT-INDEX.md`; Owner
manual acceptance lives in `R2-ACCEPTANCE-CHECKLIST.md`. Cross-task audit index:
`R2-AUDIT-INDEX.md`. X01 froze the **closure-SHA rule** (protocol §4): a completion
report never records its own commit SHA — the closure tip is verified externally via
`git ls-remote origin refs/heads/main` after push and reported in handoff.

ON TASK COMPLETION:
Update this file with: task status, next authorized work, evidence location,
lane ownership/authority changes, and any new blocker/deferred item.
