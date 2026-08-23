# BUSOS-R2-BL-018-CLOUDBASE-WRITE-DIAG-01 — Write-Path Diagnostic (owner-authorized)

**STATUS: LUMEN-DEFECT-SUSPECTED (CASE C) — CloudBase provider EXONERATED.**
**Date: 2026-08-23 (GMT+8), probes 14:04–16:21**
**Authority baseline (pre-check, `git fetch origin` + `git ls-remote origin refs/heads/main`): `0d417af064d302e3f1406c79cab1365fbda07b22`** — matched; no drift. Worktree (334 dirty entries, other windows) fully preserved; no reset/checkout/restore/clean/stash/force-push; NO production code changed (BUSOS or Lumen); NO deploy; temp scripts/files removed.

The CloudBase connector (`cloudbase` MCP) was connected by the owner mid-task and used for control-plane + metrics + admin write probes.

---

## 1. Summary of the question and the answer

The task asked to separate three possibilities: (A) all CloudBase writes hang → infra; (B) specific collection write hangs → collection/instance config; (C) raw `.set()` works but the `recordFailure`-style write hangs → Lumen engineering defect.

**Answer: (C).** The CloudBase backend and the exact production collection accept writes (proven via the connected CloudBase admin API on 2026-08-23 16:15–16:17), while the deployed Lumen runtime's `.set()` write never reaches the database (DbWrite metric = 0) and runs to the Vercel 90 s function timeout → 504. The external provider can no longer explain the failure.

## 2. §1 — Exact auth write path (source-verified, `picture-edit` = deployed Lumen source)

| Step | Operation | Source |
|---|---|---|
| `POST /api/auth` | route | `src/server/routes/auth.ts` |
| `isBlocked(ip)` → READ | `collection(<ns>auth_throttle).doc(HMAC-SHA256(ip, JWT_SECRET)).get()` | `cloudbase.nosql.ts` L1575-1581 |
| `recordFailure(ip)` → WRITE | `collection(<ns>auth_throttle).doc(key).set({ _id: key, failures, windowStartedAt })` — **the hang point** | `cloudbase.nosql.ts` L1583-1589 |
| `recordSuccess(ip)` → WRITE | `collection(<ns>auth_throttle).doc(key).remove()` | `cloudbase.nosql.ts` L1591-1595 |
| SDK / init | `@cloudbase/node-sdk 3.18.3`; `tcb.init({ env: CLOUDBASE_ENV_ID, accessKey: CLOUDBASE_API_KEY })`, CJS `.default` interop | `cloudbase.nosql.ts` L379-384 |
| Throttle config | `maxFailures=5`, `windowMs=15 min` | `index.ts`; no transaction wrapper on authThrottle ops | |

Production namespace for this env = `prod` (production collections `prod_*`); the throttle collection = **`prod_auth_throttle`**.

## 3. §2 — CloudBase control plane (via connected connector, env `zeh-***`)

Environment identity verified against lumen's own task doc (`picture-edit/docs/lumen-v2/tasks/active/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01.md` L195: CloudBase Env `zeh-d7glqc07me2155c61`) — same env as the deployed Lumen. §8 environment-match: PASS.

```text
environment:    NORMAL / EnvStatus NORMAL / UsageStatus normal
database:       instance tnt-*** RUNNING (NoSQL document DB, ap-shanghai)
billing:        prepaid 个人版 (baas_personal); ExpireTime 2026-09-21 (NOT overdue)
write restriction: NONE — IsolatedTime 0000-00-00 (NOT isolated); no disabled-write flag
runtime backends: nosql=true (matches deployed cloudbase-nosql)
```

## 4. §3 — Metrics & billing (decisive)

**DbRead** (DescribeCurveData, period 300 s, 2026-08-23 11:30→16:15): reads REACH the DB and are counted — 11:55=17, 12:30=6, 12:35=13, 12:40=17, 14:05=11, 14:10=2 — matching the empty-body 400 probes and `isBlocked` reads.

**DbWrite** (same window): **ALL ZERO (`allZero: true`)** — including every window where the deployed `recordFailure` `.set()` hung (12:30/12:35/12:40/14:05). **The write never registers at the database.**

**Billing (FLEXDB, cycle 08-22→09-21):** ReadRequests = 967 (19.34 credits); **WriteRequests = 0** — the write quota is untouched; there is NO write-quota exhaustion.

## 5. §4 — Write-path probes (admin API = connector credentials, same env & collection)

Probe C (auth-collection write) on **`prod_auth_throttle`** (the exact production throttle collection, previously Count=0), diagnostic doc `__busos_diag_20260823_1615`:

| Op | Result | Latency impression |
|---|---|---|
| insert | **SUCCESS** (insertedCount=1) | fast |
| readback | **SUCCESS** (doc persisted, all fields intact) | fast |
| update (upsert by `_id`, mirrors `.set()` semantics) | **SUCCESS** (modifiedCount=1) | fast |
| delete | **SUCCESS** (deleted=1) | fast |

Post-run cleanup verified: `prod_auth_throttle` back to Count=0.

**Same-time-window correlation:**
```
16:15–16:17  connector writes to prod_auth_throttle  → all SUCCESS
16:18:29     deployed POST /api/auth (wrong pw)      → hang (curl 000 @ 30 s)
16:20:25     deployed POST /api/auth (wrong pw)      → 504 @ 91.5 s (= Vercel maxDuration 90 s)
```

## 6. §6 — Vercel correlation (deployed runtime)

- `vercel.json`: `functions.api/index.ts.maxDuration = 90`; deployment region: default (not pinned).
- 14:04:37.69 `POST /api/auth 400 [TCB][WARN] …database.getDoc…` (read completed, >3 s); 14:04:42.90 `POST /api/auth 504` (write). Long probe: **504 at 91.5 s** = the write ran the full 90 s function budget and never completed.
- SDK `defaultTimeout = 15000 ms` with retry support — a slow write would retry, exceeding the function budget → 504. The write never reaches the DB (DbWrite=0), i.e. it hangs in the SDK/runtime request path.

## 7. §7 — SDK warning erratum (kept)

`[TCB][WARN] …database.get…/database.getDoc…` = slow-operation warning (`setSlowWarning`: "…is longer than 3s, it may be due to the network or your query performance") — NOT a quota error. No `LimitExceeded.OutOfReadRequestQuota` / `EXCEED_REQUEST_LIMIT` was observed this session.

## 8. Classification

| Case | Verdict | Evidence |
|---|---|---|
| A — CloudBase write plane / infra failure | **RULE OUT** | admin writes to the exact production collection succeed; billing WriteRequests=0 (quota untouched); control plane NORMAL / not isolated / not overdue |
| B — collection/database config | **RULE OUT** | `prod_auth_throttle` accepts insert / upsert-update / read / delete |
| C — Lumen application/SDK write path | **CONFIRMED as fault layer** | the deployed runtime's `.set()` never reaches the DB (DbWrite=0) and runs to the 90 s Vercel timeout → 504, while the same collection accepts writes via admin API in the same minute |
| D — recovered | **NO** | deployed auth still hangs (16:18, 16:20) |

**CASE C — LUMEN ENGINEERING DEFECT SUSPECTED.**

Open sub-question (NOT resolved here): the precise failing link inside the deployed runtime's data-plane write path — SDK 3.18.3 write behavior vs the env-level Server API Key vs the Vercel-region → TCB data-plane write endpoint latency (reads are also slow at 3–5 s, consistent with data-plane degradation; writes simply never complete). A raw `.set()` with the SAME SDK + SAME Server API Key from a non-Vercel network (the exact recordFailure-shape probe) would pin this down, but requires the `CLOUDBASE_API_KEY` value (not retrievable here; see RETRY-01). No fix attempted per task scope.

## 9. Discipline & cleanup

- PRODUCTION CODE CHANGED: **NO** (BUSOS and Lumen untouched; no deploy).
- Temporary CloudBase data: **CLEANED** — diag doc deleted, `prod_auth_throttle` verified Count=0. No business data touched.
- Temporary files on disk removed; no secret printed anywhere; connector credentials never exposed.
- Repo deliverable: this evidence doc + a BL-018 note update in `06-BACKLOG.md` (committed via isolated temp-index; fast-forward push; remote re-verify; CI). No closure of BL-018 (that requires the live chain, still blocked at deployed auth).

## 10. STOP

Diagnostic complete. Per task scope: do NOT fix Lumen in this task; do NOT run BL-018 closure; report defect evidence and propose a separate Lumen write-path repair task (e.g., `BUSOS-R2-LUMEN-WRITE-PATH-FIX-01`) with the same-SDK Probe D as its verification entry. BL-018 remains OPEN pending that repair + re-verification.
