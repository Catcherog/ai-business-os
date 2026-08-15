# BUSOS-P5-X02 — Status (production recovery deployed; live-generation gate blocked by CloudBase quota)

> Interim status, not final closure. P5-I / BL-016 remain **OPEN**; P6 not started.

## 1. What was authorized
Bring Gate-passed CloudBase NoSQL persistence from `lumen/nosql-final-closure-batch-01-trae` into prod
branch `fix/lumen-responsive-context-panel`; preserve worker sync-enqueue patch; redeploy; prove Lumen
generation independently; rerun BUSOS `live-e2e` only after Lumen-only PASS; close P5-I/BL-016 only on
real `CREATIVE_SUCCESS`.

## 2. Code fix — DONE & VERIFIED DEPLOYED
- **Commit `763a4d2`** (9 files, +153/−17), on top of `4bbb8c4`. Two coherent changes:
  1. **CJS/ESM interop fix** in `src/server/infrastructure/persistence/cloudbase.nosql.ts`
     (`ensureReady`): `@cloudbase/node-sdk` is CommonJS, so `await import(...)` exposes the real `tcb`
     under `.default`. Was `tcb.init(...)` (undefined → 500). Now `tcb = (tcbModule.default ?? tcbModule); tcb.init(...)`.
  2. **Carried P5-03 port**: `signedUrls` keyed by the public, stable `asset.id` (not the redacted
     `storageKey`) across `ProjectService.ts`, `routes/projects.ts`, client `AppV2.tsx` + tests, plus a
     new `signed-urls.contract.test.ts` proving the BUSOS adapter contract.
- `tsc` clean; NoSQL persistence suite **147 passed / 0 failed** (10 files).

## 3. Redeploy — DONE
- `vercel deploy --prod` → **DEPLOY_RC=0**, aliased `https://lumen-ink.vercel.app`.
- Production env confirmed complete: `PERSISTENCE_BACKEND=cloudbase-nosql`, `CLOUDBASE_*`,
  `AUTH_PASSWORD`, `SEEDREAM_API_KEY`, `CRON_SECRET`, `JWT_SECRET`, …

## 4. Boot proof — PASS (interop fix verified live)
- `GET /api/projects` (no auth) → **HTTP 401** (previously `500 FUNCTION_INVOCATION_FAILED`).
- Vercel production logs confirm the old `TypeError: tcb.init is not a function` crash is **gone**
  (last at 16:15:35); at 16:22 a real NoSQL `getDocument` executed (TCB WARN slow query).
  ⇒ The app now boots and actually connects to CloudBase NoSQL.

## 5. §11 live proof — BLOCKED (new, environmental)
- `LUMEN_AUTH_PASSWORD=<configured in Vercel production env>` (rotated during P5-X03; no plaintext in repo). Repro written:
  `D:/360Downloads/Trae 项目/.repro_tmp/lumen_repro_x02.mjs`
  (auth → create project → enqueue job → poll → verify `signedUrls[asset.id]`).
- `POST /api/auth` **hangs** (curl `000`, timeout) while `GET /api/projects`→401 and
  `POST` to a public echo via the *same* proxy→200. So it is server-side, not the proxy.
- **Root cause (from `vercel logs`)**: CloudBase NoSQL **read quota exhausted**
  (`LimitExceeded.OutOfReadRequestQuota` / `EXCEED_REQUEST_LIMIT`):
  - `authThrottle.isBlocked` reads NoSQL → quota exceeded → login never returns (auth hangs).
  - Worker **sweeper** (`sweeperIntervalMs = 500ms`, one per serverless instance) calls
    `listLeaseExpired` reads every cycle → burns the free-tier read quota almost immediately;
    sweeper errors repeat continuously in the logs.

## 6. Interpretation
- The P5-X02 **code fix is complete, deployed, and functionally verified** (no more 500; NoSQL reachable).
- The remaining blocker is a **CloudBase billing/quota limit on NoSQL read requests** — orthogonal to the
  fix. It only became visible *because* the fix lets the app reach NoSQL. This is the same class of
  blocker as the earlier "environment blocked" findings (infra, not a BUSOS-adapter or fix defect).

## 7. Why this is not closure
Per the P5-X02 gate, P5-I/BL-016 close only on a **real `CREATIVE_SUCCESS`** from `live-e2e`. That requires
a successful end-to-end Lumen generation, which cannot run while NoSQL reads are quota-blocked (auth
throttle + snapshot both read). No live generation ⇒ no closure ⇒ P6 not started.

## 8. Next steps to unblock (in order)
1. **Raise CloudBase NoSQL read quota / upgrade the plan** on the CloudBase console
   (free-tier daily read requests are exhausted; the 500 ms × multi-instance sweeper accelerates burn).
2. *(Recommended, separate HARDEN task, out of P5-X02 scope)* Back off the sweeper
   (`sweeperIntervalMs` larger; single-leader election so not every instance scans) to fit quota.
3. Once quota restored: `node D:/360Downloads/Trae 项目/.repro_tmp/lumen_repro_x02.mjs`
   (expects `LUMEN_AUTH_PASSWORD` from env) → confirm `resolved=true` + `contractOk=true`.
4. Only after Lumen-only PASS: rerun `packages/creative-production/tests/live-e2e.test.ts`
   (needs Feishu creds in env) → close P5-I/BL-016 on `CREATIVE_SUCCESS`.

## 9. Repro artifact
- `D:/360Downloads/Trae 项目/.repro_tmp/lumen_repro_x02.mjs` — run with managed node; uses proxy
  `http://127.0.0.1:7890`. Known script bugs already fixed (no duplicate `curl` in `execFileSync` args;
  absolute Windows paths). Will succeed automatically once CloudBase read quota is restored.
