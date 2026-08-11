# TASK_PLAN — BUSOS-P1-01

## task_id
BUSOS-P1-01 — Contract Package

## phase
P1 — Foundation Implementation

## outcome
PASS. All 6 P1-01 acceptance criteria satisfied. No blockers. No Codex usage (single-bounded package implementation; does not meet any of the four 08-WORKBUDDY-OPERATING-RULES usage triggers).

## acceptance (05-TEST-GATES.md → P1-01 Gate)
| # | 判据 | 结果 |
|---|---|---|
| 1 | LeadCandidateV1 存在且校验通过 canonical example | PASS |
| 2 | GovernanceResultV1 存在且校验通过 | PASS |
| 3 | CommitResultV1 存在且校验通过 | PASS |
| 4 | Session / AgentRun / Lead / Customer / Project 领域类型存在 | PASS |
| 5 | 契约 version 字段存在 | PASS |
| 6 | 测试覆盖 valid 与明显 invalid 样本 | PASS |

任务书附加要求：运行时校验(zod) ✅ · 静态类型(tsc --noEmit 零错误) ✅ · 版本显式(CONTRACT_VERSIONS + z.literal) ✅ · 未知可空业务值用 null 而非编造默认值 ✅。

## evidence
- 实现提交（commit_sha）: f2529f5b5691465d5493cb39db2432299755ab63
- 包: `packages/contracts`（包名 `@busos/contracts`）
- 验证命令: `cd packages/contracts && npm run verify`
  - `tsc --noEmit` → exit 0，无类型错误
  - `vitest run` → 5 files / 82 tests passed
  - 分布: lead-candidate 17 · governance-result 13 · commit-result 14 · domain 14 · json-schema-parity 24
- 防漂移对拍（`tests/json-schema-parity.test.ts`，24 条）: 用 Ajv(2020) 直接编译 `contracts/*.schema.json`，对同一批样本断言 **Ajv 结果 === Zod 结果**（canonical / 全 null / 错版本 / 缺字段 / 多余字段 / 越界 confidence / 负预算 / 非法枚举 / 非 ISO 时间）。任一侧被静默改动即失败。
- 契约语义锁定: 预算 4000 精确保留、`preferred_date_text` 保留原文「下个月」、缺失客户身份保持 null、`Lead` 拒绝 `feishu_record_id` 之类存储字段（D008/D017/D018）、写入成功但 `readback_status != VERIFIED` 不算业务成功（D019，`isBusinessCommitSuccess`）。
- 控制文件更新: `project-control/02-CURRENT-STATE.md`（P1-01 状态与证据）、`project-control/06-BACKLOG.md`（BL-005~BL-009）。

## files_changed (declared BUSOS-P1-01 scope)
新增 `packages/contracts/`:
- `package.json`, `tsconfig.json`, `.gitignore`, `package-lock.json`
- `src/common.ts`, `src/lead-candidate.ts`, `src/governance-result.ts`, `src/commit-result.ts`, `src/domain.ts`, `src/index.ts`
- `tests/fixtures.ts`, `tests/lead-candidate.test.ts`, `tests/governance-result.test.ts`, `tests/commit-result.test.ts`, `tests/domain.test.ts`, `tests/json-schema-parity.test.ts`
修改控制文件: `project-control/02-CURRENT-STATE.md`, `project-control/06-BACKLOG.md`
未改动: 任何 `contracts/*.schema.json`、其他控制文档、P1-02/P1-03 任务书、无架构重构、无 Service Agent / Feishu / UI 实现。

## blockers
无。

## backlog_items (non-blocking, written to 06-BACKLOG.md)
- BL-005 `LeadCandidateV1.requirement.service_type` 可空 vs `Lead.service_type` 非空，规则待定（P1-03/P2）
- BL-006 `Project.scheduled_date` 未规定 date/date-time（P4）
- BL-007 `normalized_data` 未做类型约束（P2）
- BL-008 本机 npm 代理指向失效 7897，须用 `--proxy=http://127.0.0.1:7890` 绕过
- BL-009 契约包以 TS 源码消费，未产出 dist/，消费方需 TS-aware 运行时

## nextActor
BUSOS-P1-02 — Service Agent Candidate Builder（`project-control/tasks/BUSOS-P1-02-SERVICE-AGENT-CANDIDATE.md`）。
契约已冻结可用，BUSOS-P1-03（Repository + Feishu）亦已解锁，两者可并行；若串行建议先做 P1-02（产出 P1-01 契约的第一个真实生产者）。

## closing_evidence (for audit)
- branch: main
- commit_sha: f2529f5b5691465d5493cb39db2432299755ab63
- closed_by: WorkBuddy (Craft mode)
- stopped_after_pass: true (未启动 BUSOS-P1-02)
