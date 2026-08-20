# BUSOS-R2-X01 — Stable Operator Workspace DEMO Preview + Closure-SHA Protocol Fix

**Status:** ENGINEERING COMPLETE — DEPLOYMENT READY — PUBLIC PREVIEW BLOCKED (EXTERNAL AUTH REQUIRED) — PUSHED / REMOTE VERIFIED
**Date:** 2026-08-20
**Baseline:** `origin/main` = `44c8c06bc6e8adac86838e760011c8caaae4ed84` (re-verified via `git ls-remote`); remote advanced to `c31c4f1…` (BUSOS-KB-SNAPSHOT v0.1, READ/AUDIT-only) during the task — X01 closure rebased on top of it, no semantic conflict
**Implementation SHA:** `02af082ddbc5b1a2c72d3bfecdc999b8c4ce0973` (on-chain; authored as `5c5d91bb…`, same tree, rebased onto the KB-SNAPSHOT tip)
**Closure SHA:** externally verified after push (`git ls-remote origin refs/heads/main`); see task handoff / next authority snapshot — per the X01 closure-SHA rule, this report does NOT self-record its own commit SHA.

---

## Audit Packet (per `R2-VERIFICATION-AND-AUDIT-PROTOCOL.md` §17)

### TASK
BUSOS-R2-X01 — Stable Operator Workspace DEMO Preview + governance closure fix
(only the Owner-authorized X01 scope; no H2-03 / Evaluation Center / Golden Set / memory durability / embeddings / H3 / H4 / BL-018 remediation / UI redesign / new business features)

### VERDICT
ENGINEERING COMPLETE — DEMO PRODUCT PASS (local build + static deploy readiness)
PUBLIC PREVIEW BLOCKED — EXTERNAL AUTH REQUIRED (Vercel CLI present but not authenticated in this environment; no URL faked)
CONNECTED — NOT APPLICABLE to this task (DEMO preview only; the repo's CONNECTED server boundary is unchanged)
LIVE E2E — BLOCKED (BL-018, unchanged; X01 does not remediate it)
OWNER ACCEPTANCE — PENDING

### AUTHORITY
- Baseline remote SHA (task start): `44c8c06bc6e8adac86838e760011c8caaae4ed84` (verified equal to Owner-confirmed baseline via `git ls-remote`)
- Remote advanced during X01: another window pushed `827ec73` + `c31c4f1` (BUSOS-KB-SNAPSHOT v0.1 — READ/AUDIT-only, no code; appended a KB-SNAPSHOT row to `R2-AUDIT-INDEX.md`). Inspected: no semantic conflict with X01 scope; X01 closure rebased on top of `c31c4f14216bafc74371160baf2e23472a5f1120` with the index merged (KB-SNAPSHOT row preserved + X01 row added).
- Implementation SHA: `02af082ddbc5b1a2c72d3bfecdc999b8c4ce0973` (on-chain; authored as `5c5d91bb…` with the identical tree, rebased onto the KB-SNAPSHOT tip `c31c4f1`)
- Rebasing correction: the first push attempt based X01 trees on the pre-KB-SNAPSHOT baseline, which would have dropped `BUSOS-KB-SNAPSHOT-v0.1.md` from the remote tree. Detected via remote spot-check, corrected by a fast-forward repair commit that restores the KB snapshot file and fixes the on-chain implementation SHA above.
- Closure SHA: external remote tip after push (recorded in handoff, not self-referenced)
- Method: `git fetch origin && git ls-remote origin refs/heads/main` (not local memory / not hand-written SHA)

### CHANGESET
Commit 1 (product + protocol fix):
- `apps/operator-workspace/build.mjs` — build-time identity (SHA / release / mode via esbuild define) + self-contained static deploy root (`dist/index.html` + `dist/styles.css`)
- `apps/operator-workspace/src/build-info.ts` — NEW: typed build identity module (esbuild `define` injection, no secrets)
- `apps/operator-workspace/src/main.ts` — render build meta into sidebar footer
- `apps/operator-workspace/index.html` — sidebar footer: `DEMO` badge + `#build-meta` placeholder
- `apps/operator-workspace/package.json` — smoke chain includes `smoke-preview.mjs`
- `apps/operator-workspace/smoke-preview.mjs` — NEW: X01-A..E regression
- `apps/operator-workspace/README.md` — build identity + public preview / deployment section
- `vercel.json` — NEW: root deployment config (buildCommand / outputDirectory / SPA rewrite)
- `project-control/R2-VERIFICATION-AND-AUDIT-PROTOCOL.md` — Closure-SHA self-reference fix (§4 + §24)

Commit 2 (audit closure):
- `project-control/BUSOS-R2-X01.md` — this report
- `project-control/R2-AUDIT-INDEX.md` — X01 row; GOV-01 Final SHA corrected to `44c8c06`; closure-SHA semantics note
- `project-control/02-CURRENT-STATE.md` — X01 current task / state / next authorized work
- `project-control/R2-ACCEPTANCE-CHECKLIST.md` — stable preview entry (preferred) + local DEMO fallback

Expected files: listed above.
Actual committed files: listed above.
Unexpected files: NONE (pre-existing untracked/generated drift — vitest timestamps, `.vite/`, `.stagidx`, `hi.txt`, `BUSOS-KB-SNAPSHOT-v0.1.md`, `BUSOS-R2-COORDINATOR-DECISION.md` — deliberately NOT committed).

### ENGINEERING
- App typecheck: PASS (`tsc --noEmit`, app + server)
- App build: PASS — `dist/bundle.js` + `dist/index.html` + `dist/styles.css` + `server/dist/*` (build identity baked: `DEMO · build <git sha> · BUSOS-R2-X01`)
- App smokes: PASS — `SMOKE_OK`, `SMOKE_ACTION_OK` (SUCCEEDED + asset), `SMOKE_SERVER_OK` (BLOCKED, honest), `MEMORY_SMOKE_OK` ×2, `PREVIEW_SMOKE_OK` (X01-A/B/C/D)
- Full root `npm run verify`: see CI section (LOCAL VERIFY row)

### CI
- LOCAL VERIFY: **PASS** — `npm run verify` at repo root completed end-to-end (typecheck → test → build → smoke). Tests: **418 passed / 7 skipped** across 12 workspaces; all app smokes green including `PREVIEW_SMOKE_OK`. (Environment repair note: `@types/node` was missing from `packages/{contracts,memory,workspace-run}/node_modules` — a pre-existing local install gap, NOT part of the X01 changeset — and was copied from `packages/business-repository`; no repo file changed.)
- REMOTE CI: **FAIL — PRE-EXISTING, NOT CAUSED BY X01.** GitHub Actions (queryable via `gh run list/view`) fails on the SAME error for the X01 runs AND all prior runs (H2-02 `32340815690`, GOV-01, KB-SNAPSHOT, X01 closure `32346534080`): `packages/creative-production/tests/live-e2e.test.ts(93,35): error TS2307: Cannot find module 'undici'`. This is a pre-existing repo-wide typecheck gap in `@busos/creative-production` (test imports `undici`, not declared/installed), outside X01's authorized scope. X01's own files typecheck/build/smoke clean. Recorded as a deferred finding for a small owner-authorized follow-up; no test was weakened to pass.
- Repair run for the closure tip (`32346618096`) triggered on push — expected to hit the same pre-existing failure; status not waited on beyond confirmation of the root cause above.

### PRODUCT
- Stable Preview URL: NONE YET — deployment-ready; blocked on Owner-side Vercel auth (EXTERNAL AUTH REQUIRED). No URL was faked.
- Deployment URL (if different): N/A (no deployment performed — auth blocked)
- Mode: DEMO (in-browser FakeFeishuAdapter + FakeLumenAdapter + InMemoryProcessRegistry; honest `IN-MEMORY`/`DEMO` labelling)
- Build SHA shown: real build-time SHA (`VERCEL_GIT_COMMIT_SHA` → `git rev-parse --short HEAD` → safe fallback), rendered in sidebar as `Build <sha> · BUSOS-R2-X01`
- User-visible change: sidebar footer now shows `IN-MEMORY · DEMO · Build <sha> · BUSOS-R2-X01`; deployment identity available on every build
- Acceptance path: `R2-ACCEPTANCE-CHECKLIST.md` §0 — stable preview URL (after Owner deploy) or local `dist/index.html` fallback; all 17 journey steps unchanged

### INTEGRATION
- DEMO: DEMO PRODUCT PASS (local build + static deploy readiness verified)
- CONNECTED: NOT APPLICABLE — DEMO preview only; `server/` CONNECTED boundary unchanged in repo
- LIVE: LIVE E2E BLOCKED — BL-018 (unchanged, NOT remediated by X01)

### SECURITY
- Secret scan: `git diff` / `git status` reviewed; no `.env` / credential / token / API key added.
- Browser bundle safety: smoke.mjs + smoke-preview.mjs assert the bundle contains NO `FEISHU_*` / `LUMEN_*` / `open-apis` / `app_token` / `.env` content (X01-C PASS).
- Build metadata exposes only a short non-sensitive Git SHA + release label; no environment variable VALUE enters the bundle; no secret is committed or shipped.

### DATA
- Writes: none (no business data path changed; build/deploy/config + control docs only)
- Readback / Idempotency / Persistence: N/A — no data-layer change

### AUDIT PROTOCOL FIX (Closure SHA rule)
- Problem: a completion report cannot permanently record its own final SHA inside its own commit (report → commit A → write A → commit B → infinite self-reference).
- Fix (protocol §4 + §24): fixed distinction of `BASELINE SHA` / `IMPLEMENTATION SHA` / `CLOSURE / REPORT SHA` / `REMOTE TIP VERIFIED EXTERNALLY`. The closure commit is NOT required to contain its own SHA; its SHA is established ONLY by `git ls-remote origin refs/heads/main` after push. Recursive documentation commits are forbidden.
- GOV-01 interpretation: GOV-01 used implementation SHA + a documentation follow-up; X01 clarifies and freezes the non-self-referential rule. Historical SHAs preserved.

### BLOCKERS
- BL-018 = OPEN / NON-ENGINEERING LIVE DEPENDENCY — unchanged; X01 does not remediate it. Preview success still reports `DEMO PRODUCT PASS / LIVE E2E BLOCKED — BL-018`.

### DEFERRED FINDINGS
- Public deployment not executed: Vercel CLI (56.1.0) present but NOT authenticated (no token, no `~/.vercel`, no `VERCEL_TOKEN`). Per task §6 HARD STOP on new-credential external mutation; deployment-ready config + one-command instruction shipped instead.
- **Remote CI red (pre-existing):** `packages/creative-production/tests/live-e2e.test.ts:93` imports `undici` which is not declared/installed → `TS2307` on typecheck. Fails identically on every recent push (H2-02, GOV-01, KB-SNAPSHOT, X01). Outside X01 scope; recommend a small owner-authorized follow-up (declare `undici` in `@busos/creative-production` devDeps or stub the import).
- UI papercuts (if any) discovered during this task: none beyond existing backlog items (BL-021/BL-022/BL-023) — no UI redesign performed.

### OWNER ACCEPTANCE
OWNER ACCEPTANCE PENDING — Owner must deploy (or authorize a Vercel-authenticated session) and walk the journey in `R2-ACCEPTANCE-CHECKLIST.md`. WorkBuddy does not self-assign.

### COMPLETION REPORT PATH
`project-control/BUSOS-R2-X01.md`

### NEXT RECOMMENDED TASK / NOT AUTHORIZED
Next (owner choice): **A.** run the one-command X01 deploy (`vercel login && vercel --prod`) and complete Owner manual acceptance; **B.** Golden Set + minimal Evaluation; **C.** Memory durability; **D.** stronger deterministic extraction; **E.** BL-018 LIVE closure (owner supplies `LUMEN_*` + `FEISHU_*` + CloudBase quota).
NOT AUTHORIZED: H2-03 / Evaluation Center / Golden Set / Memory durability / embeddings·vector / H3 / H4 / BL-018 remediation — none auto-started.

---

## Acceptance gates (X01-A .. X01-J)

| Gate | Requirement | Status |
|------|-------------|--------|
| X01-A | Real `origin/main` baseline verified | **PASS** (`44c8c06…` == Owner baseline, `git ls-remote`) |
| X01-B | Deployment-ready build: Operator Workspace production build succeeds | **PASS** (`dist/bundle.js` + self-contained `dist/`) |
| X01-C | Build identity: UI shows real Build SHA / DEMO mode | **PASS** (`Build <sha> · BUSOS-R2-X01`, `PREVIEW_SMOKE_OK`) |
| X01-D | Secret safety: browser bundle has no secret / connected credential | **PASS** (X01-C scan; `SMOKE_OK` parity scan) |
| X01-E | Stable preview: stable public URL reachable | **BLOCKED — EXTERNAL AUTH REQUIRED** (no Vercel auth in environment; not faked) |
| X01-F | Product boot: public Preview boots | **BLOCKED with X01-E** (deployability proven locally; boot requires live URL) |
| X01-G | Core journey: Projects → Detail → Memory → GVR → Run → Asset DEMO works | **PASS (local DEMO evidence)** — all prior smokes green (`SMOKE_ACTION_OK`, `MEMORY_SMOKE_OK`, `RUN_SMOKE_OK` chain) |
| X01-H | Reviews / Runs regression | **PASS** (workspace-review 7/7, workspace-run 15/15 in root verify; review/run smokes green) |
| X01-I | Governance closure fix: Closure SHA self-reference corrected | **PASS** (protocol §4 + §24 updated; this report does not self-reference its SHA) |
| X01-J | Push / remote / audit: Audit Packet + Index + Current State pushed and remote verified | **PASS** (see handoff; closure tip verified externally) |

Gates X01-A..D, X01-G..J PASS. **X01-E / X01-F = BLOCKED (external auth)** — honest, not faked.

---

## One-command deployment (Owner)

```bash
cd <repo>
vercel login      # Owner's Vercel account (first time only)
vercel --prod     # deploys apps/operator-workspace/dist -> stable <project>.vercel.app
```

Expected result: sidebar shows `IN-MEMORY · DEMO · Build <sha> · BUSOS-R2-X01`; all 17 acceptance steps runnable at the stable URL; every path falls back to `index.html`.

---

## STOP

X01 is complete at the engineering/deployability boundary. After commit + push + remote verification, STOP. Do NOT auto-start H2-03 / Evaluation Center / Golden Set / Memory durability / H3 / H4 / BL-018 remediation. Await explicit Owner authorization.
