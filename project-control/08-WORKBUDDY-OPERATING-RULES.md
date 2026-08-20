# Workbuddy Operating Rules

## Role

Workbuddy is the primary **execution agent**, not the product owner or architecture owner.

## Governing protocol

All R2+ work is governed by **`R2-VERIFICATION-AND-AUDIT-PROTOCOL.md`** (created by BUSOS-R2-GOV-01). Read it at the start of every task. It is the binding contract for authority, evidence levels, audit packets, preview, acceptance, and the STOP rule. Where this file and the protocol differ, **the protocol wins**.

Authority order (protocol §30): `origin/main` → frozen decisions/contracts → CURRENT-STATE → current task → protocol → completion reports → WorkBuddy memory → conversation history.

## Before work

1. **Verify real remote authority** — `git fetch origin && git ls-remote origin refs/heads/main`. Never trust a remembered SHA.
2. **Read the audit protocol** (`R2-VERIFICATION-AND-AUDIT-PROTOCOL.md`) and the current task file.
3. **Inspect the dirty worktree** — classify every change as task-owned / pre-existing / generated / unknown. Commit only task-owned files (protocol §3).
4. Identify current task + explicit authorized scope from `02-CURRENT-STATE.md` ("Next Authorized Work").
5. Do not ask for redesign permission unless a frozen decision (D001–D020) makes the task impossible.

## During work

- Make the smallest change that satisfies acceptance.
- Keep changes local to the task.
- Prefer working code over generalized frameworks.
- Reuse existing proven modules when practical.
- **Clearly distinguish mock/fake/test paths from real integrations.** Never present a partial/mock write as real E2E success.
- **Never weaken tests** to make a task pass (protocol §7).
- **Capture evidence continuously** — record SHAs, test counts, smoke artifacts as you go.
- If a non-blocking issue appears, log it to `06-BACKLOG.md` and continue.

## Before completion

1. **Run verify** — `npm run verify` (typecheck → tests → build → smoke) locally; record `LOCAL VERIFY: PASS/FAIL/NOT RUN`.
2. **Review the exact diff** — `git status --short`, `git diff --stat`, `git diff`. Confirm only task-owned files; no product-code leakage for governance tasks.
3. **Commit** only the scoped files (explicit paths, never `git add -A` on a dirty tree).
4. **Push** to `origin main` (no `--force`).
5. **Remote verify** — `git ls-remote origin refs/heads/main`; record `FINAL REMOTE SHA`.
6. **CI status** — record `REMOTE CI: PASS/FAIL/PENDING/NOT VERIFIED IN CURRENT ENVIRONMENT`.
7. **Product acceptance instructions** — for user-facing tasks, give URL/startup command, precondition, actions, expected UI/run result, known limitation (protocol §13).
8. **Audit packet** — emit the unified packet (protocol §17) in the completion report.

## After completion

1. **Update `R2-AUDIT-INDEX.md`** — baseline SHA, final SHA, status columns, completion report path.
2. **Update `02-CURRENT-STATE.md`** — task status, next authorized work, evidence location, new blocker/deferred item. Keep it a status panel, not a history novel (protocol §23).
3. **Update concise durable memory** — short index only (repo, phase, last-known remote SHA, current task, protocol paths, blockers). No secrets, no history dump (protocol §30).
4. **STOP.** Do not auto-start the next phase (H1-05 / H2-02 / Evaluation Center / H3 / H4 / BL-018 remediation) without explicit Owner authorization.

## When to use Codex

Codex budget is limited.

Use Codex only when one of these is true:
- a bounded implementation requires substantial multi-file coding;
- a difficult bug remains after Workbuddy has narrowed the root cause;
- a code review of a critical diff will save significant risk;
- a repository-scale mechanical change is clearly required by the current task.

Do not use Codex for:
- planning
- broad audits
- architecture brainstorming
- minor edits
- documentation cleanup
- speculative refactors

## Codex handoff

Send only:
- relevant control docs
- exact task contract
- exact files/modules
- acceptance criteria
- known failure evidence

Ask Codex for one bounded deliverable.

## Stop condition

When acceptance passes, stop.
Do not continue improving adjacent code.
