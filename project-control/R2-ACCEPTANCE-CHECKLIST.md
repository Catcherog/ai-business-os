# R2 Acceptance Checklist (Owner Manual Product Acceptance)

> **Owner:** This is your manual product acceptance entry point. WorkBuddy fills `DEMO VERIFIED` / `LIVE VERIFIED` from evidence; **only you** can set `OWNER VERIFIED`.
> **Companion protocol:** `R2-VERIFICATION-AND-AUDIT-PROTOCOL.md` §12.
> **Scope:** Operator Workspace product journey. Status values per step:

| Status | Meaning |
|--------|---------|
| AVAILABLE | code path exists, not yet exercised |
| DEMO VERIFIED | WorkBuddy drove it in-browser with fake/in-memory backend |
| LIVE VERIFIED | driven against real external system with readback evidence |
| OWNER VERIFIED | **you** personally confirmed the experience |
| BLOCKED | cannot run (missing credential / external dependency, e.g. BL-018) |
| NOT APPLICABLE | not part of current capability set |

---

## 0. How to open the product (acceptance prerequisite)

**Local browser DEMO (current supported path):**

```bash
cd apps/operator-workspace
node build.mjs                 # builds dist/bundle.js (browser) + server/dist (node)
# open dist/index.html OR run the static server, then open the served URL
```

**Preconditions:**
- Uses `FakeFeishuAdapter` + `FakeLumenAdapter` + shared in-memory `InMemoryProcessRegistry`. No Feishu/Lumen credential reaches the browser.
- The UI footer/label shows `DEMO` / `IN-MEMORY`. Treat all data as seeded demo data.

**Known limitation today:** there is **no stable public Preview URL yet** (tracked as recommended task **BUSOS-R2-X01**). Until X01 ships, manual acceptance uses the local DEMO build above. The UI does not yet render a `Build SHA` badge — that is an X01 acceptance requirement (protocol §11).

---

## 1. Product journey checklist

| # | Step | Status (as of GOV-01) | Evidence |
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
> **CONNECTED / LIVE columns:** the Generate Visual Reference CONNECTED boundary returns honest `BLOCKED` without credentials (BL-018). No step is `LIVE VERIFIED` because BL-018 (live Feishu + Lumen + CloudBase) is OPEN.

---

## 2. Owner sign-off block

Copy this block into your acceptance decision. WorkBuddy cannot fill `OWNER VERIFIED`.

```
TASK / RELEASE:        <e.g. H2-02 demo build>
PREVIEW / BUILD SHA:   <fill when X01 ships; today: local DEMO>
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
