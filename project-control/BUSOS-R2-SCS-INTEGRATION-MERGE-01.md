# BUSOS-R2-SCS-INTEGRATION-MERGE-01 — Service Agent Integration → Authoritative Main

## Verdict

| Gate | 状态 |
|------|------|
| ENGINEERING / MERGE | **COMPLETE** |
| 静态合同 Gate A–F | **ALL PASS**（Port 边界 / Input / Output / Closed Enums / HUMAN_REQUIRED / Evidence） |
| Targeted Tests | **ALL PASS**（service-agent-port 16 · orchestrator 58/1skip · workspace-run 17 · contracts 120 · operator-workspace typecheck ✓） |
| BUSOS Full Verify | **PASS** — typecheck ✓ / **535 passed · 8 skipped · 0 failed**（15 包）/ build ✓ / smoke ✓（SMOKE_OK · X01 A–D 21 项 · PREVIEW_SMOKE_OK） |
| SCS Freeze Regression | **687 passed, 8 warnings**（冻结 worktree 实测重跑，FREEZE_SHA 未变） |
| Real Local E2E ×2 | **PASS**（canonical SUCCEEDED + R2 HUMAN_REQUIRED，见 §E） |
| PUSH | **PASS**（authority 未漂移，无 force push） |
| LIVE GATE / 生产部署 | **N/A — 不属本任务。生产部署 = 下一独立 Gate `BUSOS-R2-SCS-PROD-DEPLOY-01`，需 owner 另行授权** |

本任务**未**声称：PRODUCTION DEPLOYED / NORMAL LIVE / CloudBase production validated。

## Authority

- 任务：`BUSOS-R2-SCS-INTEGRATION-MERGE-01`（Integration / Authority Merge，High）
- PREVIOUS_MAIN_SHA（执行时 `git ls-remote origin refs/heads/main` 实测）：`0d417af064d302e3f1406c79cab1365fbda07b22`
- INTEGRATION_SHA（已验收 frozen integration 提交）：`617b983963fe47a5273721e6124899fad05340b9`
- SCS FREEZE_SHA（Service Agent 冻结）：`ebb85686de8315bbdb6d8f5d6cd3cb70cf02bb10`
- Merge 提交：`450541c351e73e164c47266e216e899df9756503`（parents = PREVIOUS_MAIN_SHA + INTEGRATION_SHA）
- Final main SHA：push 后 `git ls-remote origin refs/heads/main` 外部核验（closure-SHA 非自引用规则，协议 §4）

## Git Graph / 收敛策略

```text
main:      ... eea166f (merge-base, H2-03) → 4e5f77f (H2-03-GOV-CLOSE) → c8b4577 (BL-018 CLOSE) → 0d417af (BL-018 RETRY-01) [PREVIOUS_MAIN_SHA]
integration: eea166f → 617b983 [INTEGRATION_SHA]

策略：情况 B（分叉、文件集合零重叠）→ 干净 worktree 上 `git merge --no-ff 617b983`
Merge commit 450541c，parents = (0d417af, 617b983)。零冲突，无 ours/theirs 机械选择。
main 侧 3 个提交（control-doc / evidence / backlog only，无生产代码）完整保留；
integration 侧 617b983 提交身份原样保留（未重写、未 rebase）。
```

- Worktree 安全门：独立 detached worktree（`D:\360Downloads\busos-scs-merge-wt-01`）基于 PREVIOUS_MAIN_SHA 创建，`git status --short` 为空、`git rev-parse HEAD` = PREVIOUS_MAIN_SHA。未在脏主工作树执行任何危险 Git 操作。
- 未使用：reset --hard / checkout . / restore . / clean / stash / gc / prune / force push / --force-with-lease。

## Changed Files（相对 PREVIOUS_MAIN_SHA = 0d417af）

Merge 提交引入（= 617b983 相对 merge-base 的完整变更集，21 文件）：

**production code**
- `packages/service-agent-port/**`（新增包：port.ts / schema.ts / bridge-adapter.ts / index.ts / bridge/run_service_agent.py / tsconfig.json / vitest.config.ts / package.json）
- `packages/orchestrator/src/run-service-agent-consultation.ts`（新增，368 行）
- `packages/orchestrator/src/process-contract.ts`（SERVICE_AGENT stage + ServiceAgentOutputSummary）
- `packages/orchestrator/src/trace.ts`（allowlist +15 个 serviceAgent* keys）
- `packages/orchestrator/src/index.ts`（导出窄入口）
- `packages/orchestrator/package.json`（+`@busos/service-agent-port` file: 依赖）
- `packages/workspace-run/src/map.ts`（SERVICE_AGENT stage view 追加渲染）
- `packages/workspace-run/package.json`（+devDep `@busos/service-agent-port`）
- `apps/operator-workspace/src/ui.ts`（Run Detail 展示 Service Agent 结果）

**tests**
- `packages/orchestrator/tests/service-agent-consultation.test.ts`（9 条）
- `packages/service-agent-port/tests/schema.test.ts`（12 条）+ `real-e2e.test.ts`（4 条真实 E2E）
- `packages/workspace-run/tests/service-agent-real-e2e.test.ts`（2 条真实 E2E）

**control docs**
- `project-control/BUSOS-R2-SCS-INTEGRATION-01.md`（integration 完成包）

本任务 closure commit 追加（control docs only）：
- `project-control/BUSOS-R2-SCS-INTEGRATION-MERGE-01.md`（本文件）
- `project-control/R2-AUDIT-INDEX.md`（+SCS-INTEGRATION-01 / SCS-INTEGRATION-MERGE-01 行）
- `project-control/02-CURRENT-STATE.md`（CURRENT TASK / NEXT AUTHORIZED WORK / deferred）

## 静态合同 Gate 验证（merge 后 worktree 实测）

- **Gate A Port Boundary** — BUSOS core（orchestrator / workspace-run / operator-workspace）零直接导入 agent 内部实现（无 graph.py / LangGraph node / AgentState import）；仅经 `@busos/service-agent-port` 接口。✓
- **Gate B Input** — `query / conversationId / customerId / conversation（≤20 turns）/ topK（1..10）` schema 透传。✓
- **Gate C Output** — `output.serviceAgent.answer` + 结构化字段（intent/risk/route/handoff/evidence/trace）。✓
- **Gate D Closed Enums** — `I00..I12` / `R0..R3` / `KB_PATH|HUMAN_PATH` zod enum，未知值 fail-loud，无字符串猜测。✓
- **Gate E HUMAN_REQUIRED** — `mustHandoff || needsClarification || needsHumanConfirm` → HUMAN_REQUIRED（reasonCode 区分 SERVICE_AGENT_HANDOFF / _NEEDS_CLARIFICATION / _NEEDS_HUMAN_CONFIRM），绝不标为 SUCCEEDED；R2/R3 由 agent 自身路由 HUMAN_PATH + handoff 标志。✓
- **Gate F Evidence** — `sourceModules / retrievalScore / canonicalAnswerId / sourceBlockId / runId` 全链路 allowlist 写入（trace 仅稳定引用，无 customer 消息 / answer 全文 / prompt / secret）。✓

## Verification

```text
targeted tests:  service-agent-port 16/16（含 4 真实 E2E）· orchestrator 58 pass / 1 skip（含 9 新）
                 workspace-run 17/17（含 2 真实 E2E）· contracts 120/120 · operator-workspace typecheck ✓
full verify:     npm run verify（typecheck + test + build + smoke）PASS
lint:            N/A（仓库 canonical verify 无独立 lint 步骤）
typecheck:       ALL workspaces PASS（含新包 service-agent-port）
tests passed:    535
tests skipped:   8
tests failed:    0
build:           operator-workspace dist/bundle.js 274.0kb（DEMO · build 450541c · BUSOS-R2-X01）+ server build ✓
smoke:           SMOKE_OK · SMOKE_ACTION_OK · SMOKE_SERVER_OK · MEMORY_SMOKE_OK · X01 A/B/C/D 21 项 PASS · PREVIEW_SMOKE_OK
```

## SCS Regression

```text
FREEZE_SHA unchanged: YES — 冻结 worktree HEAD = ebb85686de8315bbdb6d8f5d6cd3cb70cf02bb10
                      （BUSOS merge 不触碰该 repo/tree；bridge 仅 import，不改 agent 任何文件）
frozen tests:        687 passed, 8 warnings in 40.06s（冻结 worktree 实测重跑，与 SCS-R2 记录一致）
                       （venv Python 3.11.15 + pytest 9.1.1；冻结树仅未跟踪 probe*.py，不影响冻结提交）
未宣称新 SCS freeze SHA。
```

## Real Local E2E（merge 后真实 frozen agent 实测，run id 实时生成）

### E2E-1 Canonical — query「我有点胖，适合拍写真吗？」

```text
query=我有点胖，适合拍写真吗？
run id=run_482953798445486f
intent=I01
risk=R0
path=KB_PATH
BUSOS status=SUCCEEDED
sourceBlockId=🎯 三、接客话术（面向客户）
canonicalAnswerId=CA-001
hasRetrievalEvidence=true
```

### E2E-2 Human Required — query「你好，我想咨询新中式写真的价格，预算4000左右，下个月拍」

```text
query=你好，我想咨询新中式写真的价格，预算4000左右，下个月拍
run id=run_763da07146a64fcd
intent=I02
risk=R2
path=HUMAN_PATH
BUSOS status=HUMAN_REQUIRED（非 SUCCEEDED）
handoff reason=SERVICE_AGENT_HANDOFF（mustHandoff=true · needsHumanConfirm=true · needsClarification=false）
```

## Remote Verification

```text
origin/main（push 前）= 0d417af…（= PREVIOUS_MAIN_SHA，authority 未漂移）
origin/main（push 后）= 外部 ls-remote 核验（见 §Authority Final main SHA）
remote tree readable = YES
authority drift during push gate = NO
```

## Next（不在本任务范围，需 owner 授权）

- **`BUSOS-R2-SCS-PROD-DEPLOY-01`** — SCS 生产部署（CloudBase / Vercel）＝下一独立 Gate，本任务未触碰。
- Owner 公网验收（ochre DEMO preview）+ 既有 R2 acceptance checklist。
- LLM 可用环境下 `llm_used=true` Live E2E；project 级上下文 / memory 联动（integration 已知限制，见 `BUSOS-R2-SCS-INTEGRATION-01.md`）。
- BL-018（CloudBase 写路径挂起）保持 OPEN，非本任务范围。

## 完成包文件

- 本文件：`project-control/BUSOS-R2-SCS-INTEGRATION-MERGE-01.md`
- 集成实现：merge commit `450541c`（parents 0d417af + 617b983；内容 = 617b983 完整变更集）
- 配套：`project-control/BUSOS-R2-SCS-INTEGRATION-01.md`（integration 完成包，原样保留）
- SHA 纪律：本 closure 不记录自身 commit SHA（协议 §4），closure tip 以 push 后 `git ls-remote` 外部确认。
