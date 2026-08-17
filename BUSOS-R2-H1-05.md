# BUSOS-R2-H1-05 — Real Usage Closure / MVP Review

**Final Verdict: B — `H1 ENGINEERING COMPLETE / MVP LIVE CLOSURE BLOCKED — BL-018`**
**Date: 2026-08-17**
**Baseline: `origin/main` = `f78e75068232c39ff1fee9ef7a715663433e3591`** (verified equal)
**Pushed: `H1-05-SHA` → `origin/main`** (fast-forward; remote HEAD verified = `H1-05-SHA`)

This task is the **MVP review / closure** of the R2 H1 Operator Workspace — NOT a new
feature task. It exercises the full H1-01 → H1-04 user journey, identifies real product
gaps, records them in the backlog, and assesses the H1 Success Definition. Per
requirement #3 / §3, the live-dependency condition is **never falsified**: DEMO /
CONNECTED / LIVE are kept distinct, and the MVP is **not** reported LIVE-COMPLETE on
DEMO evidence.

---

## §1 Baseline & Authority

- **Repository:** `Catcherog/ai-business-os`, branch `main`.
- **Required baseline SHA:** `f78e75068232c39ff1fee9ef7a715663433e3591`.
- **Verification performed before any work:**
  - `git ls-remote origin main` → `f78e75068232c39ff1fee9ef7a715663433e3591` (authoritative).
  - Local `HEAD` resolved to the same SHA. Baseline CONFIRMED; no mismatch → work proceeded.
- **Authoritative control set read first (§0 of task):** `project-control/00-CHARTER.md`,
  `01-MASTER-PLAN.md`, `02-CURRENT-STATE.md`, `03-DECISIONS.md`, `04-INTERFACES.md`,
  `05-TEST-GATES.md`, `06-BACKLOG.md`, `07-HANDOFF.md`, `08-WORKBUDDY-OPERATING-RULES.md`,
  `R2-LONG-TERM-ROADMAP.md`, and the four H1 completion reports
  (`BUSOS-R2-H1-01-COMPLETION.md`, `BUSOS-R2-H1-02-COMPLETION.md`,
  `BUSOS-R2-H1-03-COMPLETION.md`, `BUSOS-R2-H1-04.md`).
- **Frozen context respected:** R1 decisions D001–D020 frozen; BL-018 = OPEN / NON-ENGINEERING
  LIVE DEPENDENCY (not an engineering blocker).
- **STOP rule honored:** after closure, H2 / H3 / H4 / BL-018 remediation are NOT auto-started.

---

## §2 H1 Product Inventory

The H1 Operator Workspace MVP is a desktop-first, responsive SPA (`apps/operator-workspace`,
vanilla TS + DOM, bundled by esbuild to `dist/bundle.js`; typechecks clean, no React/framework).

| Capability | Surface / Package | Mode | Status |
|---|---|---|---|
| Workspace shell, 4-nav | `src/ui.ts`, `src/main.ts` | both | shipped |
| Project Read | `@busos/workspace-read` + `@busos/business-repository` | DEMO + CONNECTED | H1-01 COMPLETE |
| Human Review | `@busos/workspace-review` (delegates to `@busos/human-review`) | DEMO | H1-02 COMPLETE |
| Run / Trace | `@busos/workspace-run` (over `@busos/orchestrator` `ProcessRegistryReadPort`) | DEMO | H1-03 COMPLETE |
| First AI Action (Generate Visual Reference) | `runCreativeProjectAction` (`@busos/orchestrator`) + `src/action.ts` (DEMO) + `server/` (CONNECTED) | DEMO + CONNECTED boundary | H1-04 ENGINEERING COMPLETE / LIVE GATE BLOCKED |

**DEMO mode:** in-browser `FakeFeishuAdapter` + `createFakeLumenAdapter()` + the SAME
shared in-memory `InMemoryProcessRegistry` that the Runs surface reads. A `Generate Visual
Reference` action therefore propagates its new Task / Asset / Run to Projects Detail and Runs
automatically. No Feishu/Lumen credential reaches the browser.

**CONNECTED mode:** server-only `server/workspace-action.ts` builds `RealFeishuAdapter` /
`RealLumenAdapter` from `FEISHU_*` / `LUMEN_*` env. Secrets never enter the browser bundle
(static scan clean of `FEISHU_*` / `LUMEN_AUTH_PASSWORD` / `open-apis` / `app_token`).

---

## §3 End-to-End Walkthrough (as exercised in DEMO)

The full H1 journey was driven through the real UI module graph (`src/ui.ts`) via the
headless DOM-shimmed smokes:

1. **Overview** (bounded placeholder) → **Projects** list renders canonical seeded
   Projects (title / type / customer_id / status), loading + empty + error states.
2. **Project Detail** (`getProjectWorkspace`) renders Project + Customer + Tasks table +
   Assets table — the canonical aggregate resolved through the shared repository.
3. **Reviews** list (pending-first) → **Review Detail** (original candidate / governance /
   AI evidence / retained snapshot) → **APPROVE** → UI reflects terminal `COMMITTED` state
   (`REVIEW_SMOKE_OK`). Identical paths for EDIT+APPROVE and REJECT verified by
   `@busos/workspace-review` unit suite (7/7).
4. **Project Detail → Generate Visual Reference**: prompt + single source image (MIME-validated,
   ≤5 MB) + stable `idempotencyKey` → `runGenerateVisualReference` (DEMO) →
   `SUCCEEDED` with `assetId` / `assetUri` (`lumen-stub://…`) + a real Task (DONE) + Asset
   written + the Run recorded in the shared registry. The Run appears on **Runs**; the Task /
   Asset appear on **Project Detail** (manual "刷新项目详情" refresh — see BL-021).
5. **Runs** list → **Run Detail** shows status pill, per-stage structured trace, sanitized
   error, and safe output refs across all four demo outcomes: A `SUCCEEDED`, B `FAILED`
   (system fault), C `RUNNING` (honest, registry-only, empty trace / null output / null
   duration), D `HUMAN_REQUIRED` (normal pause, never a system error). A forbidden-token
   injection is stripped while legitimate refs are preserved (`RUN_SMOKE_OK` ×5).

All four surfaces read from the **same** in-memory `BusinessRepository` + `InMemoryProcessRegistry`,
so a single GVR action is visible consistently across Projects / Runs.

---

## §4 H1 Success Matrix (H1-S1 .. H1-S7)

| Checkpoint | Definition | Result | Evidence |
|---|---|---|---|
| H1-S1 | Four nav surfaces (Overview / Projects / Reviews / Runs) exist & render | **PASS** | shell + 4-nav constraint preserved; all smokes load bundle without throwing |
| H1-S2 | Project Detail shows Project / Customer / Tasks / Assets | **PASS** | `workspace-read` 5/5 (fake + real-adapter simulator) |
| H1-S3 | Reviews: approve / edit+approve / reject all work | **PASS** | `workspace-review` 7/7; `REVIEW_SMOKE_OK` |
| H1-S4 | Generate Visual Reference bounded action works | **PASS** | `SMOKE_ACTION_OK`: `mode=DEMO`, `status=SUCCEEDED`, `assetId`/`assetUri`, Task DONE + Asset + Run recorded |
| H1-S5 | Run visibility + sanitized trace | **PASS** | `RUN_SMOKE_OK` ×5; `workspace-run` 12/12 (recorded) |
| H1-S6 | Business output visible in UI via shared registry | **PASS** | DEMO: GVR Task/Asset/Run propagate to Projects Detail + Runs |
| H1-S7 | No source-code / terminal / Feishu / Lumen needed for ordinary use | **PASS** | DEMO is fully in-browser; ordinary use needs no credential or terminal |

All seven checkpoints **PASS** on engineering / DEMO evidence. The **LIVE** execution of
H1-S4/S6 (real Feishu + real Lumen + real Asset + readback VERIFIED + UI) is **NOT** executed
in this environment and is not substituted by the DEMO PASS.

---

## §5 Product Findings (by severity, §6 of task)

| ID | Sev | Finding | Disposition |
|---|---|---|---|
| — | P0 | None. No crash, data-loss, or security defect found. | — |
| BL-020 | **P1** | Nav entries (Projects / Reviews / Runs) mislabelled `LIVE`, contradicting the honest `IN-MEMORY` / `DEMO` footer + GVR `DEMO` badge. Violates the DEMO/CONNECTED/LIVE honesty rule (§7 / requirement #6). | **FIXED in this task** (`ui.ts` LIVE→DEMO). |
| BL-021 | P2 | Project Detail Tasks/Assets panels do not auto-refresh after a successful GVR action; operator must click "刷新项目详情". Data integrity correct (shared registry); view-refresh timing only. | Backlog (H2 polish). |
| BL-022 | P2 | Overview surface is a bounded placeholder (no aggregate KPIs: project counts / pending reviews / recent runs). Acceptable for MVP (H1-S1 only requires the surface to exist). | Backlog (H2 polish). |
| BL-023 | P3 | DEMO `assetUri` (`lumen-stub://…`) shown raw; harmless but reads better as a masked "DEMO 资源（模拟）" label. | Backlog (lowest priority). |

Severity method (§6 of task): **P0** = crash / data-loss / security; **P1** = correctness or
honesty defect affecting trust (repaired if smallest genuine fix exists); **P2** = UX papercut
non-blocking; **P3** = cosmetic. Only the P1 was repaired (one-line `ui.ts` tag change). The
P2/P3 items are captured in the backlog and explicitly NOT escalated to H2 within this task
(STOP rule + scope lock).

---

## §6 Changes Made

- **`apps/operator-workspace/src/ui.ts`** — the `NAV` array tagged `Projects` / `Reviews` /
  `Runs` as `LIVE`; changed all three to `DEMO` (BL-020 fix). This is the **only** code change.
  No service wiring, registry, contract, or security boundary was touched. Re-verified:
  `tsc --noEmit` clean and all smokes still green after the change.
- No other code change was warranted. The H1-01 → H1-04 engineering was already complete and
  verified; this task is a closure/review, not a feature extension.

---

## §7 Validation Matrix (re-verified this run, 2026-08-17)

| Suite | Command / artifact | Result |
|---|---|---|
| Orchestrator | `vitest run --pool=threads` (local bin) | **43 passed / 0 failed** (37 P6-02 + 6 H1-04) |
| Workspace Read | `vitest run --pool=threads` | **5 passed / 0 failed** |
| Workspace Review | `vitest run --pool=threads` | **7 passed / 0 failed** |
| Workspace Run | recorded 12/12 (H1-03); local `node_modules` broken (`@vitest/utils` missing) — runtime re-proven instead | **RUN_SMOKE_OK ×5** (re-verified) |
| App base smoke | `smoke.mjs` | `SMOKE_OK` |
| App action smoke | `smoke-action.mjs` | `SMOKE_ACTION_OK` (DEMO SUCCEEDED) |
| App server smoke | `smoke-server.mjs` | `SMOKE_SERVER_OK` (BLOCKED, no creds) |
| App run smoke | `smoke-run.mjs` | `RUN_SMOKE_OK ×5` |
| App review smoke | `smoke-review.mjs` | `REVIEW_SMOKE_OK` |
| Type safety | `tsc --noEmit` (app `src` + `server`, all `@busos/*`) | clean |

**Action smoke payload (DEMO, verbatim):**
`{"mode":"DEMO","status":"SUCCEEDED","processId":"proc_6c9e372a-eb16-4207-bbbe-52854e1b7862","assetId":"asset_edffb41f22092382","assetUri":"lumen-stub://generated/lumen_proj_22fsej32/asset.png","taskStatus":"DONE"}`

**Server boundary probe (verbatim):**
`{"mode":"BLOCKED","reason":"Missing Feishu/Lumen credentials (FEISHU_* / LUMEN_*). Real action cannot run."}`

---

## §8 DEMO / CONNECTED / LIVE Evidence

| Layer | What it is | How proven (this run) | Claimed? |
|---|---|---|---|
| **DEMO** | In-browser `FakeFeishuAdapter` + `FakeLumenAdapter` + shared in-memory registry. All ordinary operator use. | `SMOKE_OK` + `SMOKE_ACTION_OK` (SUCCEEDED + assetId/assetUri + real Task DONE + Asset + Run) + `RUN_SMOKE_OK ×5` + `REVIEW_SMOKE_OK` + suites 43/5/7/12. | **PASS** (engineering) |
| **CONNECTED** | Server-only `RealFeishuAdapter` / `RealLumenAdapter` built from env; secrets never in browser. | `SMOKE_SERVER_OK` → returns `BLOCKED` with empty env (honest short-circuit, no faked success); static bundle scan clean. | **BOUNDARY VERIFIED** (honest BLOCKED) |
| **LIVE** | Real Feishu Project write + real Lumen generation + real Asset write + readback VERIFIED + UI Run/Asset view. | **NOT EXECUTED** — `LUMEN_*` + `FEISHU_*` credentials and CloudBase quota unavailable (BL-018). | **NOT CLAIMED** — never substituted by DEMO/CONNECTED |

The distinction is enforced by code: the browser graph imports only `src/action.ts` (DEMO
fakes); the `Real*` adapters live solely under `server/` and are never bundled to the browser.

---

## §9 BL-018 Status

**BL-018 = OPEN / NON-ENGINEERING LIVE DEPENDENCY.** Unchanged by this task.

- Tracks: CloudBase NoSQL read quota availability + `LUMEN_BASE_URL` + `LUMEN_AUTH_PASSWORD` +
  `FEISHU_*` + `FEISHU_ASSET_TABLE_ID`.
- Nature: **not an engineering defect and not an engineering blocker**. No code change is pending.
- Impact on H1: the H1-04 / H1-05 **LIVE gate** is exactly this dependency. The engineering
  slice is complete and verified by DEMO + the CONNECTED boundary probe; the live execution is
  deferred and is **not** substituted by a fake PASS.
- Closure path: when quota + both credential sets are supplied, run
  `runConnectedGenerateVisualReference` once (or POST the server endpoint) through the same
  `runCreativeProjectAction` entry to claim the LIVE gate. Sanitized evidence only; cleanup by
  exact `record_id`.

---

## §10 Harness Engineering Mapping

| Task | Gates | Status (carried from completion reports; H1-04 re-verified this run) |
|---|---|---|
| H1-01 | H1-01-A..J | PASS (shell + 4-nav + Project Read; `workspace-read` 5/5) |
| H1-02 | H1-02-A..J | PASS (Reviews; `workspace-review` 7/7; `REVIEW_SMOKE_OK`) |
| H1-03 | H1-03-A..J | PASS (Runs/Trace; recorded 12/12; `RUN_SMOKE_OK ×5` re-verified this run) |
| H1-04 | H1-04-A..J | PASS (orchestrator **43/43** this run; `SMOKE_ACTION_OK` + `SMOKE_SERVER_OK`) |
| H1-04 LIVE GATE | — | **BLOCKED** (BL-018) |
| **H1-05** | closure / review only | **Verdict B** — no new engineering gates; re-validated the chain above end-to-end. |

H1-05 is a product-closure review; it does not add harness gates of its own beyond the
re-verification recorded in §7.

---

## §11 Backlog Updates

- **BL-018** — appended an H1-05 MVP-closure note (engineering walkthrough complete; LIVE gate
  still BLOCKED; verdict B). Status remains OPEN / NON-ENGINEERING LIVE DEPENDENCY.
- **BL-020** (NEW, P1) — nav `LIVE`→`DEMO` mislabel. **FIXED in this task**; recorded as
  resolved at closure.
- **BL-021** (NEW, P2) — Project Detail panels don't auto-refresh after GVR; manual refresh
  required.
- **BL-022** (NEW, P2) — Overview placeholder (no aggregate KPIs).
- **BL-023** (NEW, P3) — raw DEMO `assetUri` shown.
- No item is escalated to H2/H3/H4 within this task (STOP rule + scope lock). All new items are
  explicitly non-blocking.

---

## §12 Final H1 Verdict — B

> **`H1 ENGINEERING COMPLETE / MVP LIVE CLOSURE BLOCKED — BL-018`**

- The Operator Workspace MVP (H1-01 → H1-04) is **engineering-complete** and its full user
  journey **passes end-to-end in DEMO** (all H1-S1..S7 PASS; suites 43/5/7/12; all five app
  smokes green; one P1 honesty defect found and fixed).
- The **LIVE gate is BLOCKED** under **BL-018** (no `LUMEN_*` / `FEISHU_*` credentials or
  CloudBase quota in this environment). This is an external, non-engineering dependency and is
  reported honestly — the MVP is **not** claimed LIVE-COMPLETE.
- Because the product-engineering walkthrough passes but the external live gate remains
  unavailable, the only allowed verdict class **B** applies.
- **STOP:** per the STOP rule, H2 / H3 / H4 and any BL-018 remediation are **not** auto-started.
  The task STOPS after commit + push + clean tree (with the live gate recorded as BLOCKED).
- **DONE:** committed `H1-05-SHA`, pushed to `origin/main`, remote HEAD verified = `H1-05-SHA`
  (2026-08-17). Await explicit owner authorization before any further H1/R2 work.
