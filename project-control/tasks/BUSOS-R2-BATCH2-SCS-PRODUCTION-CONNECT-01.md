# BUSOS-R2-BATCH2-SCS-PRODUCTION-CONNECT-01 — Audit Packet

**Task**: Complete the real server-side connection between AI Business OS (BUSOS) and the
deployed Production Service Agent (SCS) on CloudBase, via the existing BUSOS server seam.
**Branch**: `codex/busos-r2-batch2-scs-production-connect-01`
**Impl commit**: `bda42651efe0966f89f6889a13998b76cdcded47`
**Authority base SHA**: `729108d8059e3e143194a05f43e510af3587d385`
**Date**: 2026-08-25

---

## 1. Authority Gates

| Gate | Expected | Actual | Verdict |
|------|----------|--------|---------|
| BUSOS `origin/main` SHA | `729108d…` | `729108d…` (git ls-remote, re-checked) | **PASS** |
| SCS deployed `SOURCE_REVISION` | `ab2b03bc3f1f6ac0c3c7481de33eb1e6a1d753f8` (v046, from prior handoff `SCS-R2-CLOUDBASE-REDEPLOY-02`, `PRODUCTION_REDEPLOY_PASS`) | **NOT VERIFIABLE** — CloudBase MCP unauthenticated; SCS credentials absent | **BLOCKED** (environmental) |

> The BUSOS authority gate was verified three times (start, mid, end). The SCS authority gate
> **could not be completed** in this environment — see §5. This is the exact environmental limit
> the spec anticipates in §28; it does **not** constitute a code/engineering failure.

---

## 2. Scope & Invariants (preserved)

- ✅ `ServiceAgentPort`, `ServiceAgentProductionAdapter` (reused, **not modified**), `ServiceAgentRuntime`, bridge-adapter, and all API routes (`POST /api/service-agent/consultations`, etc.) untouched.
- ✅ Fail-closed preserved: no config → fail closed; production error → fail closed; **NO DEMO fallback**.
- ✅ Browser/`src/` unchanged — UI stays DEMO; only `apps/operator-workspace/server/**` (server-only) implemented.
- ✅ No contract weakening (spec §19): omitted required SCS fields stay `undefined` → closed-enum schema rejects loudly.
- ✅ Secret-free config via env vars (`BUSOS_SCS_BASE_URL`, `SCS_AGENT_API_KEY`); never logged, never echoed.

---

## 3. Delivered Files (change set = exactly 5)

| File | Status | Purpose |
|------|--------|---------|
| `apps/operator-workspace/server/server.ts` | MODIFIED | Conditional binding: `resolveServiceAgentPort(loadServiceAgentProductionConfig())`; endpoint + conversation/run persistence unchanged. |
| `apps/operator-workspace/server/features/service-agent/service-agent-production-config.ts` | NEW | `loadServiceAgentProductionConfig(env)` → `null` when `BUSOS_SCS_BASE_URL`/`SCS_AGENT_API_KEY` absent/malformed (requires `^https?://`, trims trailing slash). Never logs secret. |
| `apps/operator-workspace/server/features/service-agent/service-agent-production-transport.ts` | NEW | `POST /api/agent/chat` Bearer transport; `AbortController` bounded timeout (30s); explicit response mapping at server boundary; sanitized errors (no URL/token/Bearer leak). |
| `apps/operator-workspace/server/features/service-agent/service-agent-production-binding.ts` | NEW | `resolveServiceAgentPort(config)` → adapter when configured, else `failClosedServiceAgentPort` (`SERVICE_AGENT_NOT_CONFIGURED`). No DEMO fallback. |
| `apps/operator-workspace/tests-workspace-api/service-agent-production-transport.test.ts` | NEW | Tests A–E (success+body forwarding, invalid-response fail-closed, network failure fail-closed, missing-config fail-closed, secret-leak prevention). 18 cases. |

---

## 4. SCS HTTP Contract (discovered from real deployed source)

Source of truth: `D:\360Downloads\Trae 项目\Monorepo\service agent\src\api_server.py` + `auth.py`.

- **Route**: `POST /api/agent/chat` (`@require_role("agent")`)
- **Auth**: `Authorization: Bearer <AGENT_API_KEY>` (HMAC-compared; 401/403 on failure)
- **Request body**: `{ message, top_k (default 3, 1..MAX), conversation_id?, customer_id?, operator_id?, channel? }`
- **Response (local-freeze public subset, 11 fields)**:
  `{ run_id, request_id, conversation_id, suggested_reply, source_modules[], retrieval_score, confidence, confidence_semantics, needs_human_confirm, review_reasons[], results[] }`
  (`results[]` stripped of content → `doc_ref/category/section_title/distance`).

> **Critical mapping note**: The local-freeze public HTTP body **lacks** `intent` / `risk_level` /
> `route_path` / handoff booleans that the BUSOS closed-enum schema requires. The deployed
> `ab2b03bc` revision **must** supply these (per the prior handoff's `PRODUCTION_REDEPLOY_PASS`)
> for a lossless map. The transport maps defensively and lets the closed-enum validation **fail
> loudly** if the live SCS omits them — never weakening the BUSOS contract. This is unverified
> live because the probe was blocked (§5).

---

## 5. Verification Evidence

| Check | Command | Result |
|-------|---------|--------|
| `service-agent-port` tests | `npm test --workspace=@busos/service-agent-port` | **21 passed** |
| `operator-workspace` tests | `npm test --workspace=@busos/operator-workspace` | **48 passed** (16 UI + 32 API; incl. 18 A–E) |
| operator-workspace build | `npm run build --workspace=@busos/operator-workspace` | **OK** (esbuild; `server.js` 325kb) |
| Batch1 regression smoke | `npm run smoke --workspace=@busos/operator-workspace` | **PASS** (Journey A–E, KB+handoff, Business Data honest DEMO, Evaluation 42/28/14, server seam fail-closed, no secret in bundle) |
| Authority re-check | `git ls-remote origin refs/heads/main` | `729108d…` (unchanged) |
| Push target | `git push origin <sha>:refs/heads/codex/…` | `bda42651…` (new branch; **main untouched**) |

**Test discipline fixes applied during the run** (real issues, not test-padding):
1. Transport originally defaulted omitted required fields to `''`/`0` → corrected to `undefined` so the closed-enum schema fails closed (spec §19).
2. Test D asserted a rejection that the runtime intentionally converts to a `FAILED` run (`UPSTREAM_TEMPORARY_FAILURE`, "Service Agent is not configured on this server boundary.") → corrected the assertion to match the designed fail-closed runtime contract.

---

## 6. Blockers (environmental, NOT engineering)

| ID | Blocker | Evidence | Impact |
|----|---------|----------|--------|
| **BL-SCS-CONN-01** | SCS credentials absent | `BUSOS_SCS_BASE_URL` = **MISSING**, `SCS_AGENT_API_KEY` = **MISSING** (checked `.env.local`: only `VERCEL_OIDC_TOKEN` present) | Real Connected probe (Task #5) cannot run. |
| **BL-SCS-CONN-02** | CloudBase MCP unauthenticated | `mcp__cloudbase__queryApps` → "当前未登录" | SCS authority re-verification (Task #4) cannot complete. |

> Per spec §28, these yield `CONNECTED = BLOCKED` and `LIVE NOT CLAIMED`. No SCS was redeployed, no secret was fabricated, no DEMO was presented as LIVE.

---

## 7. Verdict (honest, per spec §28–§31)

| Dimension | Verdict |
|-----------|---------|
| **ENGINEERING** | **PASS** — server-only production transport + fail-closed binding implemented, all tests green, build + Batch1 regression smoke PASS, no contract weakening, browser unchanged. |
| **CONNECTED** | **BLOCKED** — cannot prove `BUSOS SERVER ↔ REAL SCS` end-to-end; SCS credentials + CloudBase auth unavailable in this environment. |
| **LIVE** | **NOT CLAIMED** — no real probe executed; no LIVE success asserted. |

**Overall**: `ENGINEERING=PASS / CONNECTED=BLOCKED / LIVE NOT CLAIMED`.

---

## 8. Decisions & Next Steps (Owner)

1. **To flip `CONNECTED` → PASS**: provide `BUSOS_SCS_BASE_URL` + `SCS_AGENT_API_KEY` (PRESENT) and CloudBase auth, then run the controlled real probe (3 categories: R0/KB, risk/handoff, OOD) proving `POST /api/service-agent/consultations → SCS → persisted conversation + run`. No code change required — the seam is ready.
2. **SCS authority re-verify** before any LIVE claim: confirm deployed `SOURCE_REVISION=ab2b03bc…`, version 046; if drift → `BLOCKED_SCS_AUTHORITY_DRIFT`, STOP.
3. **Owner Review** of `bda42651…` on `codex/busos-r2-batch2-scs-production-connect-01`; merge to `main` only after CONNECTED PASS (or explicit owner waiver).

---

## 9. Environment Hygiene

- Isolated **detached** worktree at `busos-scs-prod-connect-01` (HEAD = `729108d`); user's dirty `main` tree untouched.
- A stale `node_modules/@busos/service-agent-port` symlink (pointing to a deleted prior worktree) was removed and replaced with a canonical junction to `packages/service-agent-port`, leaving `main`'s `node_modules` in a consistent state.
- No `main` ref, file, or secret was modified or leaked.
