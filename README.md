# AI Business OS — Project Control Pack

This package is the execution baseline for the AI Business OS project.

Target local project directory:

`D:\360Downloads\Trae 项目\AI Business OS`

## How to use

1. Copy the contents of this package into the project root.
2. Open `WORKBUDDY_START_HERE.md`.
3. Workbuddy must read the control files in order before modifying code.
4. Execute only the current task(s) listed in `project-control/02-CURRENT-STATE.md`.
5. Do not expand scope. New findings go to `project-control/06-BACKLOG.md` unless they are blockers under the blocker rules.
6. Codex should only be used for high-leverage coding work when Workbuddy is blocked or when a bounded code task is large enough to justify it.

## Current goal

Get GP-001 running as quickly as possible:

`Consultation -> LeadCandidate -> Governance -> Lead / optional Customer -> BusinessRepository -> Feishu -> Readback`

This package intentionally does not define later modules such as Creative Agent, Memory, Eval Platform, RBAC, multi-tenant architecture, or full observability.

## Feishu v3 status

The Feishu v3 engineering slice is implemented on the isolated
`codex/busos-feishu-v3` branch: server-only Business Data reads, deterministic
Scheduling proposals, and copyable outreach drafts. These surfaces use
`CONNECTED TEST BASE` when the target Base is configured and show `BLOCKED`
without credentials; they never present seeded demo data as connected success.

The live migration and cutover remain **BLOCKED** because this environment has
no authorized Feishu configuration. No Base records were changed. See
[`project-control/FEISHU-V3-MIGRATION-REPORT.md`](project-control/FEISHU-V3-MIGRATION-REPORT.md)
and [`project-control/FEISHU-V3-CLOSURE.md`](project-control/FEISHU-V3-CLOSURE.md).
