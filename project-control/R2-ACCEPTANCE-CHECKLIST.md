# R2 Acceptance Checklist (Owner Manual Product Acceptance)

> **Owner:** This is your manual product acceptance entry point. WorkBuddy fills `DEMO VERIFIED` / `LIVE VERIFIED` from evidence; **only you** can set `OWNER VERIFIED`.
> **Companion protocol:** `R2-VERIFICATION-AND-AUDIT-PROTOCOL.md` §12.
> **Scope:** Operator Workspace product journey. Status values per step:

| Status | Meaning |
|--------|---------|
| AVAILABLE | code path exists, not yet exercised |
| PLANNED | approved product target; code path does not yet exist |
| DEMO VERIFIED | WorkBuddy drove it in-browser with fake/in-memory backend |
| LIVE VERIFIED | driven against real external system with readback evidence |
| OWNER VERIFIED | **you** personally confirmed the experience |
| BLOCKED | cannot run (missing credential / external dependency, e.g. BL-018) |
| NOT APPLICABLE | not part of current capability set |

---

## 0. How to open the product (acceptance prerequisite)

**PRIMARY OWNER ENTRY — stable public preview (BUSOS-R2-X01-CLOSE):**

```text
URL: https://ai-business-os-demo-ochre.vercel.app
Expected Mode: DEMO
Expected Build: c7a25d8
```

Open the URL in a browser. The sidebar footer must show **IN-MEMORY · DEMO ·
Build c7a25d8 · BUSOS-R2-X01**. No local install, no login needed.

The static site is served from `apps/operator-workspace/dist` (self-contained:
`index.html` + `bundle.js` + `styles.css`), and every path falls back to the app
(no 404). The deployment corresponds exactly to repository commit `c7a25d8`
(deployed implementation SHA; Vercel GitHub integration auto-deploy).

**Local browser DEMO (fallback path):**

```bash
cd apps/operator-workspace
node build.mjs                 # builds dist/bundle.js + dist/index.html + dist/styles.css
# open dist/index.html OR serve the dist/ directory, then open the served URL
```

**Preconditions (both paths):**
- Uses `FakeFeishuAdapter` + `FakeLumenAdapter` + shared in-memory `InMemoryProcessRegistry`. No Feishu/Lumen credential reaches the browser.
- The UI footer shows `DEMO` badge + `Build SHA` + `BUSOS-R2-X01`. Treat all data as seeded demo data.

---

## 1. Product journey checklist

| # | Step | Status (as of X01-CLOSE) | Evidence |
|---|------|------------------------|----------|
| 1 | Open Operator Workspace | DEMO VERIFIED | `smoke.mjs` → `SMOKE_OK` (bundle loads) |
| 2 | Overview (real KPIs + activity) | DEMO VERIFIED | `H1_05_CLOSURE_OK` (projects=2, pendingReviews=3, runs=4 from live read models) |
| 3 | Projects (canonical list) | DEMO VERIFIED | H1-01 `SMOKE`/unit; `workspace-read` 5/5 |
| 4 | Project Detail (Project + Customer + Tasks + Assets) | DEMO VERIFIED | H1-01 / H1-05 suites |
| 5 | Customer reference visible | DEMO VERIFIED | ui.ts render path |
| 6 | Tasks list | DEMO VERIFIED | `workspace-read` 5/5 |
| 7 | Assets list | DEMO VERIFIED | `workspace-read` 5/5 |
| 8 | Memory (项目上下文 / Memory section, ACTIVE only) | DEMO VERIFIED | `MEMORY_SMOKE_OK` ×2 (H2-01) |
| 9 | Generate Visual Reference — open panel | DEMO VERIFIED | `SMOKE_ACTION_OK` |
| 10 | Generate Visual Reference — observe Memory Context used | DEMO VERIFIED | H2-02: `output.governedMemory.count ≥ 1` + `memory_context_used` in trace |
| 11 | Generate — observe Run created (status + trace) | DEMO VERIFIED | `SMOKE_ACTION_OK` (SUCCEEDED + assetId/assetUri + run recorded) |
| 12 | Runs Detail / Trace (per-stage, sanitized) | DEMO VERIFIED | `RUN_SMOKE_OK` ×5; `workspace-run` 15/15 |
| 13 | Resulting Asset visible on Project Detail | DEMO VERIFIED | `H1_05_CLOSURE_OK` (Asset + Related Runs = 1) |
| 14 | Reviews — inspect Review | DEMO VERIFIED | `REVIEW_SMOKE_OK` |
| 15 | Reviews — Approve | DEMO VERIFIED | `workspace-review` 7/7 |
| 16 | Reviews — Edit+Approve | DEMO VERIFIED | `workspace-review` 7/7 (allowlisted edit) |
| 17 | Reviews — Reject | DEMO VERIFIED | `workspace-review` 7/7 (zero writes) |

> **All 17 steps are `DEMO VERIFIED` from engineering evidence. None is `OWNER VERIFIED` yet — that requires your manual pass.**
> **CONNECTED / LIVE columns:** the Generate Visual Reference CONNECTED boundary returns honest `BLOCKED` without credentials. No step is `LIVE VERIFIED`; BL-018 now requires a separate Lumen application/SDK write-path repair plus a later real Feishu/Lumen readback journey.

---

## 1A. Unified OS target journey — planned, not yet available

These rows are acceptance targets from `BUSOS-R2-UNIFIED-OS-REBASELINE-01.md`.
`PLANNED` is not engineering, product, Connected, LIVE or owner evidence.

| # | Target step | Current status | Required future evidence |
|---|---|---|---|
| U1 | Open one Unified OS URL; verify Mode and Build SHA | PLANNED | Deployment metadata matched to commit + browser check |
| U2 | Read a real Customer/Lead through the Connected data plane | PLANNED | Real server read with sanitized provenance |
| U3 | Run a real Service Agent consultation | PLANNED | Production runtime call + Run/Trace |
| U4 | Inspect intent, risk, route, evidence and handoff | PLANNED | Product UI + structured output/trace consistency |
| U5 | Generate `LeadCandidateV1`; route through Governance and Review | PLANNED | Candidate/governance/review E2E; no direct fact write |
| U6 | Commit approved fact to Feishu and verify critical-field readback | PLANNED | Real record IDs + readback PASS, secrets redacted |
| U7 | Inspect Customer/Project/Task/Asset in the same OS | PLANNED | Connected canonical read models |
| U8 | Run Project-bound Lumen action and inspect resulting Asset | PLANNED | Repaired Lumen LIVE call + Feishu Asset readback |
| U9 | Inspect governed Memory and Evaluation evidence | PLANNED | Memory context refs + harness/report/UI parity |
| U10 | Complete owner manual acceptance | PLANNED | Explicit owner verdict only |

No implementing task may promote a row directly from PLANNED to OWNER VERIFIED.

---

## 2. Owner sign-off block

Copy this block into your acceptance decision. WorkBuddy cannot fill `OWNER VERIFIED`.

```
TASK / RELEASE:        <e.g. BUSOS-R2-X01-CLOSE public DEMO>
PREVIEW / BUILD SHA:   https://ai-business-os-demo-ochre.vercel.app · Build c7a25d8
DATE:                  <YYYY-MM-DD>
STEPS OWNER-VERIFIED:  <list #s, or "all 17">
STEPS DEFERRED:        <list #s>
OWNER VERDICT:         ACCEPTED / REJECTED / PARTIAL
NOTES:                 <any UX papercut, blocker, or limitation observed>
```

---

## 3. What "OWNER VERIFIED" is NOT

- Not a `DEMO VERIFIED` auto-promotion.
- Not a `LIVE VERIFIED` claim (that needs real external readback).
- Not something WorkBuddy may self-assign under any circumstance (protocol §8-E, §27).

---

## 4. Updating this checklist

When a new capability ships, the implementing task MUST:
1. Add/extend the relevant step row(s).
2. Set `DEMO VERIFIED` only with a cited smoke/test artifact.
3. Leave `OWNER VERIFIED` for the Owner.
4. Record the change in `R2-AUDIT-INDEX.md` + the completion report's Audit Packet.
