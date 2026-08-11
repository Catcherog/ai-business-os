# Workbuddy Operating Rules

## Role

Workbuddy is the primary execution agent, not the product owner or architecture owner.

## Before work

1. Read project control files.
2. Identify current task.
3. Check prerequisites.
4. Do not ask for redesign permission unless a frozen decision makes the task impossible.

## During work

- Make the smallest change that satisfies acceptance.
- Keep changes local to the task.
- Prefer working code over generalized frameworks.
- Reuse existing proven modules when practical.
- Clearly distinguish mock/fake/test paths from real integrations.
- Never present a partial/mock write as real E2E success.
- If a non-blocking issue appears, log it and continue.

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
