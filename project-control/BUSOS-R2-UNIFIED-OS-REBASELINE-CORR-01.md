# REBASELINE-CORR-01 — Unified OS Control Patch

## 0. Status and authority

| Field | Value |
|---|---|
| Review verdict | `PLAN DIRECTION APPROVED / CONTROL PATCH REQUIRED / IMPLEMENTATION NOT YET AUTHORIZED` |
| Task type | Docs-only correction |
| Correction baseline | `19499b28ad3572bd6c3e707d55660e2f5a437bb9` |
| Main authority at correction start | `8f9ad4a830cfb8217bed2227269c570cc1237fb8` |
| Planning branch | `codex/busos-r2-unified-os-rebaseline` |
| Product code / deployment | None |
| Implementation authorization | `NONE` |

This correction does not replace the approved Unified OS direction or rewrite the
rebaseline plan. It narrows five control ambiguities found during repository review.
The planning branch remains unmerged and requires owner re-review after this patch.

---

## 1. Audit confirmation

| Finding | Confirmation | Control correction |
|---|---|---|
| Global one-task rule conflicts with parallel WorkBuddy lanes | CONFIRMED | One active task per isolated lane/worktree; one authoritative Integration Coordinator task at a time |
| SCS production state is stale | CONFIRMED | External SCS deployment is a completed prerequisite; future BUSOS task is production connection, not redeployment |
| One Unified Journey mixes acquisition and existing-business lifecycles | CONFIRMED | Split into Acquisition Journey and Existing Business Journey |
| Evaluation appears downstream of every business run | CONFIRMED | Separate business execution loop from the operator-triggered Golden Set loop |
| UX-01 and Workspace API overlap on Runtime Identity | CONFIRMED | UX owns `RuntimeIdentityView`; Workspace API owns the canonical Server implementation |

No open-ended architecture audit or product-code change is authorized by these findings.

---

## 2. Parallel lane governance

After `BUSOS-R2-WORKSPACE-API-01` is merged, the owner may explicitly authorize these
development lanes concurrently:

```text
SCS lane:     BUSOS-R2-SCS-RUNTIME-01 → BUSOS-R2-SCS-UI-01
FEISHU lane:  BUSOS-R2-FEISHU-CONNECT-01 → BUSOS-R2-BUSINESS-DATA-UI-01
EVAL lane:    BUSOS-R2-EVAL-UI-01
```

Each active lane must have:

- one bounded active task in one isolated branch/worktree;
- a full baseline SHA and remote authority check;
- declared file ownership and shared-contract constraints;
- its own tests, Audit Packet and STOP;
- no self-merge and no implicit authorization of the next lane task.

Program-wide integration remains serialized:

- at most one authoritative Integration Coordinator / merge task is active;
- that task rebases or merges only already-reviewed lane output;
- it owns shared control-state reconciliation and full-repository verification;
- push, PR, merge and deployment remain separate permissions.

`02-CURRENT-STATE.md` therefore carries two ledgers: zero or more explicitly authorized
development lanes, and at most one authoritative integration task. Both are `NONE` at
this correction baseline.

---

## 3. SCS production prerequisite and remaining BUSOS gate

The reviewed `SCS-R2-CLOUDBASE-REDEPLOY-02` evidence records:

```text
Repair SHA:       ab2b03bc3f1f6ac0c3c7481de33eb1e6a1d753f8
Remote ref:       refs/heads/scs/rag-phase-ab-01 = Repair SHA
Production:       CloudBase Deploy 046
Readiness:        PASS
Smoke matrix:     PASS
Evidence verdict: PRODUCTION_REDEPLOY_PASS / PRODUCTION_CLOSED
```

The correction independently rechecked that the remote ref resolves to the repair SHA.
The production readiness/smoke verdict remains evidence-reviewed rather than independently
rerun here. This closes **SCS production deployment as an external prerequisite**, but
does not prove that BUSOS is bound to that endpoint.

The former roadmap task `BUSOS-R2-SCS-PROD-DEPLOY-01` is replaced by:

```text
BUSOS-R2-SCS-PROD-CONNECT-01
```

Its future scope is limited to BUSOS:

- bind the server-side adapter to the verified production endpoint;
- execute request/response contract tests;
- verify timeout, error, handoff and evidence mapping;
- persist/project canonical Run/Trace evidence;
- bind SCS source/deployment identity to BUSOS build identity;
- fail closed on configuration or source drift;
- do not change or redeploy SCS.

---

## 4. Product journey correction

### 4.1 Acquisition Journey

```text
Prospect
  → Service Agent
  → LeadCandidateV1
  → Governance
  → Human Review
  → canonical Lead + readback
  → optional Customer conversion
  → Project only after conversion
```

`Prospect` is a UI entry state, not a new canonical entity. Anonymous Lead is valid.
Service Agent cannot write a Lead, Customer or Project directly.

### 4.2 Existing Business Journey

```text
Customer / Project
  → contextual Service Agent + governed Memory
  → Task / Asset / Project-bound Lumen
  → Run / Trace
```

Unified Production Closure may verify both journeys in one release session, but it must
not reinterpret them as one domain lifecycle.

---

## 5. Evaluation correction

Business execution and Evaluation are separate loops:

```text
Business execution → Run / Trace

Evaluation operator → Golden Set → deterministic Harness
  → stored Report → Cases / Metrics / Gates
```

The first Evaluation Center is operator-triggered and report-oriented. Automatic online
or per-production-run evaluation is outside this roadmap slice.

---

## 6. Runtime Identity ownership

`BUSOS-R2-UX-01` owns the stable UI-facing contract and rendering:

```text
RuntimeIdentityView
  mode
  buildSha
  connectionSummary
```

`BUSOS-R2-WORKSPACE-API-01` owns the canonical `mode/build/status` envelope and the real
Server implementation that supplies this view. UX-01 must not invent a second server
state model; Workspace API must not redesign the already-frozen UI contract.

---

## 7. Corrected dependency shape

```text
REBASELINE-CORR-01
  → BUSOS-R2-UX-01
  → BUSOS-R2-WORKSPACE-API-01
  → { SCS lane || FEISHU lane || EVAL lane }
  → serialized authoritative integration
  → BUSOS-R2-SCS-PROD-CONNECT-01 + LUMEN-WRITE-PATH-FIX-01 prerequisite
  → BUSOS-R2-PROD-01
```

This is sequencing, not authorization.

---

## 8. STOP and acceptance

`NEXT AUTHORIZED IMPLEMENTATION WORK = NONE`.

Stop after committing and pushing this docs-only correction to the existing planning
branch. Do not create an implementation plan, modify product code, open/merge a PR or
deploy. Owner re-review is required before any implementation task is authorized.

The final correction commit SHA is verified externally after push and is not
self-recorded in this file.
