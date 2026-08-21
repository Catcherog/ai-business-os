# BUSOS-R2-X01-CLOSE - Stable Preview + CI Green Closure

**Task:** X01-CLOSE - 修复 `undici` CI 缺口恢复 GREEN + 真实部署 Operator Workspace 公网 DEMO + 远程产品验证 + 审计收尾
**Status:** COMPLETE - ENGINEERING PASS - REMOTE CI PASS - STABLE PUBLIC DEMO AVAILABLE - DEMO PRODUCT VERIFIED - PUSHED / REMOTE VERIFIED
**Date:** 2026-08-21
**Baseline:** `e78eb0f05ed28a538f542e513eddd9b84cc08f52` (X01-CLOSE task baseline; re-queried via `git ls-remote` at closure start = `aba746a`, CI-repair already green, no rework)
**CI-Repair SHA:** `aba746a6bd28a2b8c6c6983da256cdcc43c70d6b` (undici devDependency + lockfile registry resolution; run `32447350665` = success)
**Deployed Implementation SHA:** `c7a25d89363bdab220c567bf16449dad310dca24` (final `vercel.json` SPA-fallback routing + `.gitignore` `.vercel`; run `32450422601` = success)
**Closure SHA:** external remote tip after final push (per §4 non-self-referential rule; see handoff)

---

## VERDICT

```
BUSOS-R2-X01-CLOSE
ENGINEERING COMPLETE
REMOTE CI PASS
STABLE PUBLIC DEMO AVAILABLE
PUBLIC DEMO VERIFIED (deployed-bundle execution, 21/21)
PUSHED / REMOTE VERIFIED
OWNER ACCEPTANCE PENDING
```

---

## AUTHORITY

- **BASELINE SHA:** `e78eb0f05ed28a538f542e513eddd9b84cc08f52` — X01-CLOSE task baseline. At closure start `git ls-remote origin refs/heads/main` = `aba746a…` (CI-repair already green; no concurrent advance to absorb).
- **CI-REPAIR SHA:** `aba746a6bd28a2b8c6c6983da256cdcc43c70d6b` — undici devDependency + lockfile registry resolution. GitHub Actions run `32447350665` (2026-08-21T04:33:12Z): `completed success`. First green `main` CI since H2-02.
- **DEPLOYED IMPLEMENTATION SHA:** `c7a25d89363bdab220c567bf16449dad310dca24` — final reproducible public preview routing: `vercel.json` SPA-fallback rewrite (`/((?!index\.html$|bundle\.js$|styles\.css$).*)` → `/`) + `.gitignore` `.vercel`. Committed on top of `aba746a`, pushed fast-forward (`aba746a..c7a25d8`), remote main = `c7a25d8…` verified via `git ls-remote`.
- **REMOTE CLOSURE TIP:** external handoff only — reported via `git ls-remote origin refs/heads/main` after the closure-docs push (protocol §4 non-self-referential rule; no recursive doc commit).

---

## CI REPAIR

**Root cause (verified, not guessed):** `packages/creative-production/tests/live-e2e.test.ts:93` performs a real dynamic `import('undici')` (ProxyAgent egress-proxy support for LIVE runs). `undici` was never declared in any package manifest nor in the root lockfile; local environments had a manually-installed copy under `packages/business-repository/node_modules/undici`, which is why local verify passed while clean GitHub Actions (`npm install` from lockfile) failed with `TS2307: Cannot find module 'undici'`.

**Fix (Case A - the test genuinely needs undici):**
- `packages/creative-production/package.json`: added `"undici": "8.10.0"` to `devDependencies` (the package that actually imports it).
- Root `package-lock.json`: removed the stale manually-installed local-link entries, re-resolved from registry -> `node_modules/undici@8.10.0` with a proper tarball URL.
- **TEST WEAKENING: NONE.** No test was skipped, excluded, weakened, or rewritten. The dynamic import now resolves; the ProxyAgent path is exercised when a proxy env var is set (unchanged behavior).

**Also shipped (deployment-side):**
- `vercel.json` (final, in `c7a25d8`): SPA fallback rewrite. The original `{ "source": "/(.*)", "destination": "/index.html" }` interacted with `cleanUrls: true` (which strips `.html`), leaving deep paths 404 (verified live: `/projects` -> 404 platform NOT_FOUND). Final rule excludes the three real static files and rewrites everything else to `/`: `"/((?!index\\.html$|bundle\\.js$|styles\\.css$).*)" -> "/"`. Verified live after redeploy: `/`, `/projects`, `/some/deep/path` all 200.
- `.gitignore`: `.vercel` added (Vercel local project metadata never committed). The Vercel-CLI auto-appended `.env*` catch-all was **removed** — the repo's existing precise rules (`.env` / `.env.local` / `.env.*.local` / `!.env.example`) already cover local env files without ever swallowing a future `.env.example`. No unrelated global ignores added.

## LOCAL VERIFY

- Clean-ish `npm install` (registry-resolved, no manual copies): PASS.
- Root `npm run verify`: **PASS** end-to-end. Tests: **418 passed / 7 skipped** (identical counts to the X01 baseline - no regression, no weakened tests). Typecheck: PASS (creative-production TS2307 gone). Build: PASS. Smoke: all green incl. `PREVIEW_SMOKE_OK` (X01-A..E).
- Note: the previously documented local-only `@types/node` manual copies are no longer needed for CI; root hoisted `@types/node@22.10.2` satisfies clean installs.

## REMOTE CI

- **CI-REPAIR (aba746a): PASS.** GitHub Actions run `32447350665` (commit `aba746a`, `main`, 2026-08-21T04:33:12Z): `completed success`.
- **DEPLOYABLE (c7a25d8): PASS.** GitHub Actions run `32450422601` (commit `c7a25d8`, `main`, 2026-08-21T05:24:23Z): `completed success`. Both the implementation and the final routing commit are green; no `implementation green / current main red` state.

---

## VERCEL

- Auth: `vercel whoami` -> `catcherog` (team `catcher1`). No new credential required.
- PROJECT: `ai-business-os-demo` (project `catcher1/ai-business-os-demo`; `.vercel/` local only, gitignored).
- DEPLOYMENT: Vercel GitHub integration auto-deployed from the **committed** `c7a25d8` (production, created 2026-08-21T13:24:23+08:00). No dirty-worktree upload: the live deployment corresponds exactly to the repository tree at `c7a25d8`.
- DEPLOYMENT URL: `https://ai-business-os-demo-dp57gof9f-catcher1.vercel.app` (deployment id `dpl_89YegButvDQLcSWheCZe5GV9aM5n`, target=production, Ready).
- STABLE PRODUCTION URL: **`https://ai-business-os-demo-ochre.vercel.app`** — project production alias; `vercel inspect` resolves it to the same deployment `dpl_89YegButvDQLcSWheCZe5GV9aM5n`; public HTTP 200 without authentication.
- Observed (recorded, not guessed): the raw deployment URL and the `ai-business-os-demo-catcher1.vercel.app` / `ai-business-os-demo-git-main-catcher1.vercel.app` aliases answer `302 -> vercel.com/sso-api` (Vercel per-host SSO protection), while the `-ochre` alias serves 200 publicly. The bare `ai-business-os-demo.vercel.app` name belongs to an unrelated third party (307 to an external site) — **never documented as a BUSOS URL**.
- MODE: DEMO (FakeFeishuAdapter + FakeLumenAdapter + InMemoryProcessRegistry; sidebar `IN-MEMORY · DEMO · Build c7a25d8 · BUSOS-R2-X01`).
- BUILD SHA SHOWN: `c7a25d8` — the deployed implementation commit short SHA (not the CI-repair `aba746a`).

## PRODUCT (public acceptance evidence)

- **HTTP:** PASS — `/` 200 (930B html, references `./bundle.js` + `./styles.css`), `/bundle.js` 200 (277,628B), `/styles.css` 200 (13,174B), deep paths `/projects`, `/some/deep/path` -> 200.
- **SPA FALLBACK:** PASS — deep paths are served by the app, **not** a Vercel platform `404 NOT_FOUND`.
- **STATIC ASSETS:** PASS — bundle.js + styles.css served 200 with stable byte sizes.
- **BUILD IDENTITY:** PASS — downloaded production bundle contains `c7a25d8` + `BUSOS-R2-X01` + `DEMO`; **does NOT contain stale `aba746a`**.
- **PUBLIC DEPLOYED BUNDLE JOURNEY: 21/21 PASS** — deployed bundle downloaded from the stable URL and executed under the same DOM shim as the repo smokes (same method as the previous 20/20 run, refreshed for the new SHA): workspace boot + render, Projects surface, Project create, governed memory record (provenance-valid), **Generate Visual Reference -> mode DEMO -> status SUCCEEDED -> assetId + `lumen-stub://` assetUri**, governed memory context consumed (`governedMemory.count >= 1`), trace `memory_context_used`, real Task (DONE) + Asset written and read back, Run recorded SUCCEEDED in the shared registry, idempotent replay deduplicated with no duplicate side effects, Reviews/workspace surfaces ready, no secret/credential tokens in deployed html/bundle/css.
- Evidence boundary: headless-DOM execution of the *deployed* bundle (not a pixel screenshot); the Owner's visual pass remains part of manual acceptance.

## SECURITY

- Deployed artifacts scanned (P7 of the public journey, plus repo smoke boundary): no `FEISHU_*` secrets/ids, no `LUMEN_*`, no `open-apis`/`app_token`, no real credential, no `.env` content. The words `authorization`/`password` etc. appear only inside the P6 redaction whitelist regex (the safety mechanism itself). `SECRET SCAN: PASS`.
- `.env.local` present on disk only; ignored by `.gitignore` (`.env.local` precise rule); never committed. `.vercel/` local metadata ignored.

## OWNER ACCEPTANCE

**PENDING** - WorkBuddy does not fill OWNER VERIFIED. Owner: open `https://ai-business-os-demo-ochre.vercel.app`, confirm sidebar shows `IN-MEMORY · DEMO · Build c7a25d8 · BUSOS-R2-X01`, then walk the R2-ACCEPTANCE-CHECKLIST journey (Overview -> Projects -> Project Detail -> Customer/Tasks/Assets/Memory -> GVR Generate -> Run/Trace -> Asset -> Reviews).

## BL-018

UNCHANGED - OPEN / NON-ENGINEERING LIVE DEPENDENCY. Public preview is DEMO only; LIVE E2E remains blocked on credentials/quota. Not remediated by this task (out of scope).

## AUDIT DOC UPDATES

- `R2-AUDIT-INDEX.md`: X01 row updated; new X01-CLOSE row (CI repair + deployed implementation).
- `02-CURRENT-STATE.md`: X01-CLOSE COMPLETE block with stable URL / deployed SHA / CI.
- `R2-ACCEPTANCE-CHECKLIST.md` §0: stable URL + Expected Build SHA prerequisites (17 steps DEMO VERIFIED, OWNER VERIFIED = PENDING).

## NEXT RECOMMENDED TASK (owner choice; NOT AUTHORIZED until picked)

- Golden Set + minimal Evaluation (H2-03 direction)
- Memory durability
- BL-018 LIVE closure (needs `LUMEN_*` + `FEISHU_*` + CloudBase quota)
- H3 planning

**H2-03: NOT STARTED / NOT AUTHORIZED.**

## GATES

| Gate | Result |
|---|---|
| X01-CLOSE-A authority baseline verified | PASS |
| X01-CLOSE-B undici/CI root cause repaired, no test weakening | PASS |
| X01-CLOSE-C clean local `npm run verify` PASS | PASS (418/7) |
| X01-CLOSE-D Vercel auth confirmed | PASS (`catcherog`) |
| X01-CLOSE-E deployed implementation commit pushed + remote verified | PASS (`c7a25d8`) |
| X01-CLOSE-F CI PASS on deployed implementation SHA | PASS (run 32450422601) |
| X01-CLOSE-G stable public URL exists + maps to deployed SHA | PASS (`ai-business-os-demo-ochre.vercel.app` -> dpl_89YegButvDQLcSWheCZe5GV9aM5n) |
| X01-CLOSE-H public HTTP + SPA fallback + static assets | PASS (all 200) |
| X01-CLOSE-I public DEMO shows correct Build SHA/mode | PASS (`c7a25d8` / DEMO) |
| X01-CLOSE-J public product journey works | PASS (21/21 deployed-bundle checks) |
| X01-CLOSE-K remote GitHub Actions CI PASS (repair + deployable) | PASS (32447350665, 32450422601) |
| X01-CLOSE-L audit docs pushed + remote verified | PASS (see handoff tip) |
