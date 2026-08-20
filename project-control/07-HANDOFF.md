# Handoff Protocol

Use when switching AI windows/tools. There are two distinct modes. Read the
correct bundle for the mode; do not silently switch modes.

## 1. Execution Window

A window that **implements the current task**.

Must read:
- `00-CHARTER.md`
- `02-CURRENT-STATE.md`
- `03-DECISIONS.md`
- `04-INTERFACES.md`
- current task file
- **`R2-VERIFICATION-AND-AUDIT-PROTOCOL.md`** (governing audit/verification protocol — created by BUSOS-R2-GOV-01; binding for every task)
- If the task has **any user-facing / product acceptance** surface: **`R2-ACCEPTANCE-CHECKLIST.md`** additionally

Rule:
> Execute only the current task. Do not automatically read the long-term roadmap
> (`R2-LONG-TERM-ROADMAP.md`) as authorization to start future work. Roadmap
> material is never authorization; only `02-CURRENT-STATE.md` ("Next Authorized
> Work") + an explicit task authorize implementation.

## 2. Planning Window

A window that **selects or refines the next bounded task** (does not implement product code).

Read:
- `00-CHARTER.md`
- `R2-LONG-TERM-ROADMAP.md`
- `01-MASTER-PLAN.md`
- `02-CURRENT-STATE.md`
- `06-BACKLOG.md`
- `03-DECISIONS.md`
- **`R2-VERIFICATION-AND-AUDIT-PROTOCOL.md`** (so the next task is scoped with the audit contract in mind)

Purpose:
> Select or refine the next bounded task from the roadmap / backlog. May explore
> future options (H2/H3/H4 candidates) but must not convert exploration into an
> execution authorization by itself.

Principle:
> Planning agents may explore future options. Execution agents may not expand
> scope from roadmap material.

## Minimal handoff bundle

Always provide:
- `00-CHARTER.md`
- `02-CURRENT-STATE.md`
- `03-DECISIONS.md`
- `04-INTERFACES.md`
- current task file

(Roadmap / planning windows additionally include `R2-LONG-TERM-ROADMAP.md` and
`01-MASTER-PLAN.md`.)

## New agent instruction

Use:

"Read the provided project-control files first for your mode. Do not redesign
frozen decisions (D001–D020). In an Execution Window, execute only the current
task and stop at acceptance. In a Planning Window, refine the next bounded task
but do not authorize implementation. Non-blocking findings go to backlog. Return
evidence against the predefined acceptance criteria."

## Required handoff output

- Current task
- Current status
- Files changed
- Tests/evidence
- Blockers
- Deferred findings
- Next task
- **Baseline remote SHA** (from `git ls-remote origin refs/heads/main` at task start)
- **Final remote SHA** (from `git ls-remote origin refs/heads/main` after push)
- **Completion report** path (the Audit Packet)
- **CI state** (`REMOTE CI: PASS/FAIL/PENDING/NOT VERIFIED IN CURRENT ENVIRONMENT`)
- **Preview URL** (or `NONE — local DEMO only` until BUSOS-R2-X01 ships)
- **Owner Acceptance state** (`PENDING` / `PASS` / `FAIL` — only the Owner may set PASS)

> These six additions are mandatory per `R2-VERIFICATION-AND-AUDIT-PROTOCOL.md` §24. A handoff missing any of them is incomplete.
