# R2 Verification & Audit Protocol

> **Status:** ACTIVE — governing protocol for all R2+ work in `Catcherog/ai-business-os`.
> **Authorized by:** BUSOS-R2-GOV-01 (Owner-authorized governance task).
> **Authority source of truth:** `origin/main` real remote commit SHA (re-query on every task start / end / audit).
> **Scope of this protocol:** CONTROL / GOVERNANCE ONLY. It adds no product capability. It constrains how every future task is verified, reported, previewed, accepted, and audited.

---

## 0. Why this protocol exists

R2 work has produced many vertical slices (H1-01 … H2-02) with honest DEMO / CONNECTED / LIVE status separation and a frozen STOP rule. This protocol makes that discipline **permanent and machine-checkable** so that:

- No future task can silently claim `COMPLETE` / `PASS` / `LIVE` without evidence.
- Authority is always the real remote, never local memory or a hand-written SHA.
- Every task leaves a verifiable Audit Packet that an independent reviewer (Owner, ChatGPT, another WorkBuddy window, or GitHub inspection) can re-check.
- Product acceptance is a first-class requirement, not an afterthought.

---

## 1. Repository authority (permanent)

> **GitHub `origin/main` real remote commit SHA is the final code authority.**

The following are **NOT** authoritative by themselves and may be stale:
- local `main`
- local `HEAD`
- local `origin/main` tracking ref
- WorkBuddy memory / conversation history
- completion-report hand-written SHAs

**Mandatory re-query** at the start, end, and during any audit of a task:

```bash
git fetch origin
git ls-remote origin refs/heads/main
```

Use the returned SHA as the binding baseline. Never trust a remembered SHA.

---

## 2. Authority snapshot — required at every task start

Every formal task MUST open by recording an authority snapshot block (file it in the task file / completion report):

```
TASK:              <id>
DATE:              <YYYY-MM-DD>
REMOTE BASELINE SHA: <git ls-remote origin refs/heads/main>
LOCAL HEAD:          <git log -1 --oneline>
WORKTREE STATUS:     <git status --short>
CURRENT PHASE:       <R2 H? / current>
AUTHORIZED SCOPE:    <explicit bounded scope, quoted from control docs>
KNOWN BLOCKERS:      <BL-xxx list>
```

Standard commands:

```bash
git fetch origin
git ls-remote origin refs/heads/main
git status --short
git log -1 --oneline
```

**If remote differs from last-known SHA:** do NOT mechanically STOP. Inspect the new commits; determine whether a semantic conflict with the current task's scope/architecture exists. Only a *real* scope or architectural conflict is grounds to STOP. Otherwise proceed.

---

## 3. Dirty worktree rule

**Forbidden:** `git reset --hard`, `git clean -fd`, `git checkout -- .`, `git restore .` on unknown-origin changes, `git push --force`.

If the worktree is dirty, classify every changed file into exactly one bucket:

1. **current task-owned** — belongs to this task.
2. **pre-existing user changes** — user's own, not this task's.
3. **unrelated generated files** — vitest timestamps, `.vite/`, `.stagidx`, `dist/`, `hi.txt`, `node_modules`, etc.
4. **unknown changes** — cannot attribute.

**Commit only bucket 1.** No unrelated / unknown file may leak into the commit.

Final report MUST record:

```
Expected changed files: <list>
Actual committed files: <list>
Unexpected files:        NONE / <list>
```

---

## 4. GitHub commit audit rule (full chain)

A task is not "done" because `tests pass locally`. The fixed end-to-end chain:

```
implementation
→ tests
→ diff review
→ commit
→ push
→ remote SHA verification
→ CI verification (where available)
→ completion evidence
```

After push, you MUST re-run:

```bash
git ls-remote origin refs/heads/main
```

and record `FINAL REMOTE SHA`.

**Completion report MUST distinguish (four-part SHA model, clarified by BUSOS-R2-X01):**

```
BASELINE SHA:                  <remote origin/main SHA at task start>
IMPLEMENTATION SHA:            <commit containing the product / engineering changes>
CLOSURE / REPORT SHA:          <commit containing the completion report + index update>
REMOTE TIP VERIFIED EXTERNALLY: <git ls-remote origin refs/heads/main after push>
```

If implementation + report are the same commit, say so explicitly. Forbidden: saying `pushed successfully` without a SHA.

### Closure-SHA self-reference rule (X01)

A completion report **cannot and must not** try to record its own commit SHA inside
its own file. Doing so creates an infinite self-reference:

```
report → commit A → write SHA A into report → commit B → SHA changed → …
```

Therefore:

- The **CLOSURE / REPORT SHA is established ONLY externally** — `git ls-remote
  origin refs/heads/main` after push — and is reported in the task handoff / the
  next authority snapshot. The closure commit is **not required to contain its own
  SHA** anywhere in its own file contents.
- The Audit Packet may record `IMPLEMENTATION SHA` (known at write time) and write
  `CLOSURE SHA: externally verified after push; see task handoff / next authority snapshot.`
- **Never** create a recursive documentation commit purely to "fill in the final SHA".
- GOV-01 used `IMPLEMENTATION SHA` + a documentation follow-up. **X01 clarifies and
  freezes the non-self-referential closure-SHA rule going forward.** Historical SHAs
  are preserved as recorded.

---

## 5. Remote file verification

For key tasks, do not confirm only the branch SHA — spot-check that critical paths exist in the remote tree:

```
production implementation
contract
test
control doc
completion report
```

For high-risk / milestone tasks, verify the actual remote object:

```bash
git show <FINAL_SHA>:<path>
# or GitHub remote API equivalent
```

Goal: prevent "local passes, report written, but remote actually missing files."

---

## 6. CI is part of the audit chain

This repo has GitHub Actions on `push`/`pull_request` to `main` running `npm run verify` (root): `typecheck → tests → build → smoke`.

Every completion report MUST state:

```
LOCAL VERIFY: PASS / FAIL / NOT RUN
REMOTE CI:    PASS / FAIL / PENDING / NOT AVAILABLE
```

Wait for the current commit's CI to reach a clear result before marking engineering complete **where CI is queryable in the environment**. If CI cannot be queried here, write:

```
REMOTE CI STATUS: NOT VERIFIED IN CURRENT ENVIRONMENT
```

Never fabricate `PASS`.

---

## 7. Never weaken tests to pass a task

Permanently forbidden:

- skip previously-passing tests
- delete regression tests
- lower assertion strength
- turn an expected failure into success without root-cause
- hide a failing package from `verify`
- disable smoke
- remove the CI gate

If an old test genuinely must change, the completion report MUST explain:

```
OLD BEHAVIOR:      <what it asserted>
NEW CONTRACT:      <why it is now invalid>
WHY THE OLD TEST IS INVALID: <root cause>
```

Otherwise it is an audit failure.

---

## 8. Standard evidence levels

Stop using ambiguous `COMPLETE` / `PASS` / `LIVE`. Use these independent statuses per task scope:

### A. ENGINEERING
`ENGINEERING PASS` / `ENGINEERING FAIL` — contract, typecheck, unit/integration, smoke, regression.

### B. PRODUCT / DEMO
`DEMO PRODUCT PASS` / `DEMO PRODUCT FAIL` / `NOT APPLICABLE` — user can drive real product behavior through the frontend. Fake / in-memory backend is allowed for DEMO, **but the UI must clearly show `DEMO`** and must never impersonate LIVE.

### C. CONNECTED
`CONNECTED PASS` / `CONNECTED BLOCKED` / `CONNECTED FAIL` / `NOT APPLICABLE` — real server integration boundary. **Missing credentials ⇒ `BLOCKED`**, never a silent fallback to fake.

### D. LIVE E2E
`LIVE E2E PASS` / `LIVE E2E BLOCKED` / `LIVE E2E FAIL` / `NOT APPLICABLE`. LIVE PASS requires real external call + persistence + readback + business output evidence. Mock / stub / fake can NEVER be LIVE PASS.

### E. OWNER ACCEPTANCE
`OWNER ACCEPTANCE PASS` / `OWNER ACCEPTANCE PENDING` / `OWNER ACCEPTANCE FAIL` / `NOT APPLICABLE`. This is the user's own experience. **WorkBuddy MUST NOT self-assign `OWNER ACCEPTANCE PASS`.** Only the Owner's explicit confirmation changes it.

---

## 9. Product preview is a first-class requirement

AI Business OS is no longer a backend-only project. Any task touching:

```
Operator Workspace
user workflow
business action
Review / Runs / Project / Asset / Memory visibility
```

MUST provide a product experience entry point. Priority order:

1. Stable public DEMO Preview URL
2. Local browser DEMO
3. Headless smoke only

Headless smoke **cannot** substitute for human product acceptance.

---

## 10. Public DEMO preview target

This repo already has `apps/operator-workspace`. The next Owner-authorized ops/product task should prioritize:

> **BUSOS-R2-X01 — Stable Operator Workspace DEMO Preview**

Goal: a stable public preview (e.g. `https://<busos-demo>.vercel.app`) or a suitable existing platform.

**GOV-01 only records this requirement + readiness.** It does **not** create external deployments, and must not, unless a deployment config already exists that needs no new credential / external-account mutation. After GOV-01: STOP.

---

## 11. Preview version identity

Future Preview MUST answer: *"Which version of the code am I looking at?"*

Recommended non-sensitive placement in the UI:

```
Mode:        DEMO / CONNECTED
Build SHA:   <short git sha>
Build / release identifier
R2 task identifier (optional)
```

Never expose: secret, environment values, internal credentials.

If the current UI has no Build SHA, record that gap in `R2-AUDIT-INDEX.md` as an acceptance requirement for the Preview task.

---

## 12. Owner manual acceptance journey

See `R2-ACCEPTANCE-CHECKLIST.md`. Minimum covered journey:

```
Open Operator Workspace → Overview → Projects → Project Detail → Customer
→ Tasks → Assets → Memory → Generate Visual Reference → observe Memory Context
→ Generate → observe Run → Runs Detail / Trace → resulting Asset
→ Reviews → inspect Review → approve / edit+approve / reject
```

Each step carries a status:

```
AVAILABLE | DEMO VERIFIED | LIVE VERIFIED | OWNER VERIFIED | BLOCKED | NOT APPLICABLE
```

WorkBuddy may set `DEMO VERIFIED` / `LIVE VERIFIED` from evidence. `OWNER VERIFIED` is Owner-only.

---

## 13. User-facing task acceptance rule

If a task changes observable user behavior but provides no manual acceptance path, the completion report is incomplete.

Every user-facing task MUST give:

```
URL / startup command
PRECONDITION
ACTION 1 / ACTION 2 / ACTION 3
EXPECTED UI RESULT
EXPECTED RUN / DATA RESULT
KNOWN LIMITATION
```

The Owner should reproduce in minutes without reading test code.

---

## 14. Backend-only tasks

Pure backend / infra / contract tasks may have no UI change, but the completion report MUST state:

```
USER-VISIBLE CHANGE: NONE
```

and provide observable evidence (test / trace / API / contract / readback / fixture). Do not force a meaningless page just to satisfy a UI gate.

---

## 15. Current product acceptance baseline

Completed capabilities (per `02-CURRENT-STATE.md`, authoritative):

```
Overview
Projects
Project Detail
Customer
Tasks
Assets
Reviews
Runs / Trace
Generate Visual Reference
Project Memory
Governed Memory Context Consumption
```

Current state: H1 engineering closed; H2-01 COMPLETE; H2-02 COMPLETE; BL-018 OPEN as a non-engineering live dependency. Do not copy full implementation history into GOV files — reference the completion reports.

---

## 16. Audit index

`R2-AUDIT-INDEX.md` is the primary joint-audit index. Required table columns:

```
Task | Scope | Baseline | Final SHA | Engineering | Demo | Connected | Live | Owner Acceptance | Completion Report
```

At minimum, populate: H1-01, H1-02, H1-03, H1-04, H1-05, H2-01, H2-02, GOV-01 (and H1-X01 if included). Historical values come from git history + completion reports + CURRENT-STATE. Unknown fields ⇒ `UNKNOWN / NOT RECORDED`. Never guess.

---

## 17. Audit packet — every future task

Every task's final output MUST be a unified Audit Packet:

```
TASK
VERDICT
AUTHORITY            (Baseline remote SHA, Final remote SHA)
CHANGESET            (Files modified, Files added, Unexpected files)
ENGINEERING          (Tests, Counts, Typecheck, Build, Smoke)
CI                   (Local verify, Remote GitHub Actions)
PRODUCT              (User-visible change, Acceptance path, Preview URL, Mode, Build SHA)
INTEGRATION          (DEMO, CONNECTED, LIVE)
SECURITY             (Secret scan, Trace safety, Browser bundle safety if applicable)
DATA                 (Writes, Readback, Idempotency, Persistence)
BLOCKERS
DEFERRED FINDINGS
OWNER ACCEPTANCE     (PENDING / PASS / FAIL)
COMPLETION REPORT PATH
NEXT RECOMMENDED TASK / NOT AUTHORIZED
```

---

## 18. Completion claim language

Never emit bare `COMPLETE`. Use fact-composed claims:

```
ENGINEERING COMPLETE
DEMO PRODUCT VERIFIED
CONNECTED BLOCKED
LIVE E2E BLOCKED
OWNER ACCEPTANCE PENDING
PUSHED
REMOTE VERIFIED
CI PASS
```

Example:

```
H2-XX
ENGINEERING COMPLETE
DEMO PRODUCT PASS
LIVE E2E BLOCKED — BL-018
OWNER ACCEPTANCE PENDING
PUSHED / REMOTE VERIFIED
```

---

## 19. Live evidence standard

Any LIVE PASS MUST at least answer:

```
WHAT real external system was called?
WHAT canonical object was written?
WHAT ID was returned?
HOW was readback performed?
WHAT fields were verified?
WHAT output was produced?
WHAT SHA contains the implementation?
```

For files / Assets, persist `id`, `uri/reference`, and `sha256` where applicable. **Never persist a secret.**

---

## 20. Idempotency / replay

Any side-effecting Business Action MUST specify:

```
idempotency behavior
duplicate-click behavior
replay behavior
```

Existing mechanisms MUST NOT regress. Completion report states:

```
FIRST EXECUTION: <writes>
REPLAY:          <writes>
NUMBER OF WRITES: <count>
```

---

## 21. Trace / observability

Agent / AI execution tasks SHOULD trace:

```
User Action → Request → Context → State → Stage/Node → Tool
→ Observation → Transition → Guardrail → Persistence → Trace → UI Result
```

Trace MUST NOT store: credential, raw prohibited prompt, source image blob, raw provider payload, secret. Audit evidence should prove the sanitizer / allowlist is still effective.

---

## 22. Security / secret hygiene

Permanently forbidden to commit:

```
.env  password  token  API key  session credential
real auth header  provider secret
```

Before completion:

```bash
git diff
git status
```

and run the project's secret-leak / browser-bundle smoke. If a credential ever entered git: **HARD STOP and report.** Do not re-copy the secret into report / memory / backlog.

---

## 23. Current-state hygiene

`02-CURRENT-STATE.md` is a status panel, not a history novel. This protocol permits safe compression: keep `CURRENT PHASE`, `CURRENT / LAST TASK`, major completed capabilities, active blockers, next authorized work, key deferred items, latest decisions. Detailed history stays in completion reports. **Never delete the only evidence.** When unsure whether a section is the sole source, keep it.

---

## 24. Handoff protocol

`07-HANDOFF.md` is updated to require: every new Execution / Planning window reads `R2-VERIFICATION-AND-AUDIT-PROTOCOL.md`; when product acceptance is in scope, also read `R2-ACCEPTANCE-CHECKLIST.md`. Task-end handoff MUST include: baseline SHA, final SHA (closure tip verified externally via `git ls-remote` — never the closure commit's own self-recorded SHA), completion report, CI state, Preview URL, Owner Acceptance state.

---

## 25. WorkBuddy operating rules

`08-WORKBUDDY-OPERATING-RULES.md` is updated with durable lifecycle rules:

- **Before work:** verify real remote authority; read audit protocol; inspect dirty worktree.
- **During work:** bounded scope; real/fake separation; no test weakening; capture evidence continuously.
- **Before completion:** run verify; review exact diff; commit; push; remote verify; CI status; product acceptance instructions; audit packet.
- **After completion:** update Audit Index; update Current State; update concise durable memory; STOP.

---

## 26. Independent audit compatibility

All evidence MUST be re-verifiable by an independent auditor (ChatGPT, Owner, another WorkBuddy window, GitHub inspection). Forbidden: "I checked it", "seems good", "all tests passed". Provide: `SHA`, `path`, `command`, `test count`, `gate`, `status`, `evidence location`. The auditor should not need to trust the agent — only to verify the evidence.

---

## 27. Three-party responsibility model

**WorkBuddy (execution agent):** implementation, tests, repository control, evidence collection, commit, push, remote verification.

**ChatGPT / Independent reviewer:** GitHub remote audit, scope audit, architecture consistency, progress comparison, completion-claim audit, recommend next task.

**Owner:** business priority, task authorization, manual product acceptance, external credentials, LIVE execution authorization where required.

Do not blur roles. WorkBuddy MUST NOT mark Owner manual acceptance as passed on the Owner's behalf.

---

## 28. Progress = product capability, not file count

R2 progress review must first answer:

```
What can the user do now?
What can the user see now?
What real business flow works?
What still requires fake/demo?
What is blocked only by external dependency?
What has no product value yet?
```

Not merely: files changed, LOC, number of packages.

---

## 29. Preview / product review before deeper platform work

Owner preference for R2 execution: capabilities that already have a UI should gain a repeatable manual experience entry point soon. Before large H2/H3 platform capability work, ensure:

```
Operator Workspace can be easily opened
latest build can be identified
manual acceptance can be repeated
```

This is not "every backend task needs a UI" — it is "the whole product must keep a continuously acceptable entry point."

---

## 30. Memory rule (authority order)

WorkBuddy chat context, built-in memory, and `MEMORY.md` are **NOT** the project's final authority. Fixed authority order:

```
1. actual origin/main
2. frozen decisions / contracts
3. CURRENT-STATE
4. current task
5. VERIFICATION-AND-AUDIT-PROTOCOL
6. completion reports / evidence
7. WorkBuddy memory
8. conversation history
```

WorkBuddy memory should tell a new window only:

```
repo
current phase
current remote SHA (marked last-known)
current task
important protocol file paths
known blockers
```

and require the new window to re-query GitHub.

**Never** write into memory: password, token, API key, app secret, auth cookie, provider credential, raw secret-bearing payload. Only environment variable *names* may be saved.

Keep memory short and sustainable. Do not endlessly append full history.

---

## 31. STOP rule (carried forward)

After a task's acceptance gates PASS, STOP. Do NOT auto-start the next phase (H1-05 / H2-02 / Evaluation Center / H3 / H4 / BL-018 remediation) without explicit Owner authorization. Each task closes independently.

---

## 32. GOV-01 acceptance gates (reference)

| Gate | Requirement | Status |
|------|-------------|--------|
| GOV-01-A | Real `origin/main` baseline verified | PASS |
| GOV-01-B | `R2-VERIFICATION-AND-AUDIT-PROTOCOL.md` created | PASS |
| GOV-01-C | `R2-AUDIT-INDEX.md` created, historical entries grounded, unknowns not guessed | PASS |
| GOV-01-D | `R2-ACCEPTANCE-CHECKLIST.md` created | PASS |
| GOV-01-E | `08-WORKBUDDY-OPERATING-RULES.md` references the protocol | PASS |
| GOV-01-F | `07-HANDOFF.md` references protocol + acceptance | PASS |
| GOV-01-G | Current State accurately reflects H2-02 COMPLETE and no H2-03 authorization | PASS |
| GOV-01-H | Durable WorkBuddy memory updated concisely; no secrets / history dump | PASS |
| GOV-01-I | Diff contains control/governance files only; no product-code leakage | PASS |
| GOV-01-J | Commit pushed and final remote SHA independently re-queried | PASS |

---

*This protocol is itself governed by §1: any future edit to it MUST be committed, pushed, and the new remote SHA recorded in `R2-AUDIT-INDEX.md`.*
