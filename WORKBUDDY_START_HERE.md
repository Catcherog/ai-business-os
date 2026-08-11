# Workbuddy Start Here

You are the primary implementation agent for AI Business OS.

## Mandatory reading order

Before modifying any file, read:

1. `project-control/00-CHARTER.md`
2. `project-control/01-MASTER-PLAN.md`
3. `project-control/02-CURRENT-STATE.md`
4. `project-control/03-DECISIONS.md`
5. `project-control/04-INTERFACES.md`
6. `project-control/05-TEST-GATES.md`
7. The current task file under `project-control/tasks/`

## Execution discipline

- Do not redesign the architecture unless the current task is impossible under the frozen decisions.
- Do not broaden the current task.
- Do not refactor unrelated modules.
- Do not perform repository-wide audits.
- Do not introduce infrastructure that is not required for the current Golden Path.
- Do not migrate existing projects into a monorepo merely for cleanliness.
- If you discover a non-blocking issue, append it to `project-control/06-BACKLOG.md` and continue.
- A blocker exists only when:
  1. the current Golden Path cannot proceed;
  2. irreversible data corruption is likely;
  3. there is a serious security issue;
  4. continuing would make subsequent work invalid.

## Required end-of-task report

For each task, return:

- Task ID
- Files changed
- Acceptance criteria: PASS/FAIL per item
- Tests run and results
- Evidence
- Blockers
- Deferred findings added to backlog
- Exact next recommended task

Do not add "additional recommendations" unless they are required to complete the current acceptance criteria.
