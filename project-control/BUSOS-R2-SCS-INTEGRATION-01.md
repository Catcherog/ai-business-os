# BUSOS-R2-SCS-INTEGRATION-01 — Service Agent → Business OS 真实集成

## Verdict

| Gate | 状态 |
|------|------|
| ENGINEERING | **COMPLETE** |
| 真实本地 E2E | **PASS**（AC-11 全链路：BUSOS → Service Agent → retrieval → answer → Run Detail） |
| Service Agent R2 frozen tests | **687 passed**（AC-09，冻结 SHA worktree 实测） |
| BUSOS 原有测试 | **全部通过**（AC-10） |
| LIVE GATE | **N/A** — 本任务 AC-12 明确不部署生产 |
| 集成验收 | **READY_FOR_OWNER_REVIEW** |

## Authority

- 任务卡：`BUSOS-R2-SCS-INTEGRATION-01`（BUSOS-R2，Medium）
- 执行者：Trae / WorkBuddy（Recommended Route: R2 — GPT 规划 → Trae 执行 → GPT Evidence Review）
- 集成基线：Service Agent `FREEZE_SHA = ebb85686de8315bbdb6d8f5d6cd3cb70cf02bb10`（`SCS-R2 evidence freeze`）
- BUSOS 基线：`eea166f93f448bc4e049bb5e7a8c487314a305db`（`BUSOS-R2-H2-03`，origin/main tip）
- 集成分支：`busos-r2-scs-integration-01`

## Scope 对照

| # | In Scope 项 | 状态 |
|---|-------------|------|
| 1 | 复核 BUSOS 已有 Service Agent candidate / adapter contract | DONE — `@busos/service-agent-candidate`（P1-02）仅回收 intent 层（ConsultationContextV1 5 字段），明确不含 answer/risk/handoff/evidence；与冻结 SHA 的 `ConsultationContextV1` schema 一致（I00..I12 / run_id / conversation_id 形状未变） |
| 2 | 冻结版为 integration baseline | DONE — 冻结 SHA 已 fetch + worktree 检出，工作树内容与其一致（仅 CRLF） |
| 3 | 建立 ServiceAgentPort | DONE — 新包 `@busos/service-agent-port`（port 接口 + zod schema + bridge adapter） |
| 4 | BUSOS → Service Agent request mapping | DONE — `ServiceAgentRunInputSchema`（query/conversationId/customerId/conversation/topK） |
| 5 | Service Agent → BUSOS result mapping | DONE — `ServiceAgentRunResultSchema`（answer/intent/risk/route/handoff/evidence/trace） |
| 6 | 传递 customer/project/conversation/query 上下文 | DONE — query + conversation history + customer_id 透传（AgentState 无 project_id 字段，project 上下文留待后续业务层） |
| 7 | 回收 answer/intent/risk/handoff/evidence/trace | DONE — 全字段结构化回收 |
| 8 | BUSOS Run Detail 可见 | DONE — `runServiceAgentConsultation` → registry → `WorkspaceRunService.getRun` + UI `outputRows` 渲染 |
| 9 | 至少一条本地真实 E2E | DONE — 2 条（canonical SUCCEEDED + R2 HUMAN_REQUIRED） |

## 实现内容

### 新包 `@busos/service-agent-port`

| 文件 | 职责 |
|------|------|
| `src/port.ts` | `ServiceAgentPort` 接口（同步调用 + 结构化返回） |
| `src/schema.ts` | 输入/输出 zod schema（closed-enum，AC-05 无字符串猜测） |
| `src/bridge-adapter.ts` | `ServiceAgentBridgeAdapter` — spawnSync 调 Python bridge，JSON 解析 + schema 校验 |
| `bridge/run_service_agent.py` | 调用冻结 SHA 真实 LangGraph（`build_graph` + `compiled.invoke`，与 api_server 同链路），输出结构化 JSON |
| `tests/schema.test.ts` | schema 边界测试（12 个） |
| `tests/real-e2e.test.ts` | 真实 E2E（3 条：canonical / R2 / I00） |

### orchestrator 窄入口 `runServiceAgentConsultation`

- `STAGE = 'SERVICE_AGENT'` 新增至 `BusinessProcessStage` 联合类型，**不加入** `PROCESS_STAGE_ORDER`（保护 workspace-run 3-stage 渲染断言）
- 复用 P6 原语：`TraceCollector` / `classifyFailure` / `ProcessRegistry` / `BusinessProcessResult`
- **AC-07 映射**：`must_handoff || needs_clarification || needs_human_confirm` → `HUMAN_REQUIRED`（reasonCode 区分三类），绝不标记为普通 SUCCEEDED
- **AC-08**：`idempotencyKey` + registry 幂等重放（重复调用不重跑 agent）；agent 的 `run_id/request_id` 透传至 output 供 provenance
- **AC-06**：`sourceModules / retrievalScore / canonicalAnswerId / sourceBlockId / hasRetrievalEvidence` 进入 output + trace（allowlist 扩展 `serviceAgent*` keys）
- trace metadata 只含 allowlisted 稳定引用；customer 消息 / answer 全文 / prompt / secret 不进 trace

### workspace-run / UI

- `map.ts`：`SERVICE_AGENT` stage 追加渲染（仅当 completed/current 含它时），`summarizeOutput` 支持
- `ui.ts` `outputRows`：Run Detail 展示 Service Agent 回答 / intent / risk / handoff / evidence / run id
- `tests/service-agent-real-e2e.test.ts`：AC-11 全链路（真实 bridge → orchestrator → registry → Run Detail）

## 证据

### AC-09 — Service Agent R2 frozen tests 无回归

在冻结 SHA 独立 worktree（`D:\tmp\scs-freeze-ebb85686`）用项目自带 `.venv`（Python 3.11.15）运行：

```
687 passed, 8 warnings in 32.67s
```

### AC-10 — BUSOS 原有测试保持通过

全量 `npm run test`（含本任务新增）：

```
contracts 120 · memory 36 · business-repository 37/1 skip · golden-path 11/1 skip
creative-production 21/1 skip · human-review 42/2 skip · lumen-adapter 9
orchestrator 58/1 skip (+9 新增) · project-lifecycle 20/1 skip · service-agent-candidate 53
service-agent-port 16 (新增) · workspace-read 5 · workspace-review 7 · workspace-run 17 (+2 新增)
evaluation 83
```

全部 Pass；typecheck（新包/orchestrator/workspace-run/operator-workspace）与 build + smoke（`PREVIEW_SMOKE_OK`）均绿。

### AC-11 — 真实本地 E2E（provenance）

- **E2E-1 canonical**：query「我有点胖，适合拍写真吗？」→ intent `I01` / risk `R0` / route `KB_PATH` / `hasRetrievalEvidence=true` / `canonicalAnswerId=CA-001` / `sourceBlockId=🎯 三、接客话术（面向客户）` → BUSOS `SUCCEEDED`，Run Detail `completed`，幂等重放 `deduplicated=true` 且 agent 仅执行一次。
- **E2E-2 R2**：query「你好，我想咨询新中式写真的价格，预算4000左右，下个月拍」→ intent `I02` / risk `R2` / route `HUMAN_PATH` / `mustHandoff=true` → BUSOS `HUMAN_REQUIRED`（reasonCode `SERVICE_AGENT_HANDOFF`），Run Detail 以 `human_required` 呈现，**非** system_error。

测试输出中的真实 run id（E2E 运行生成，每次不同）：
`run_<16hex>`（AgentState.run_id）—— 由 bridge 透传至 `output.serviceAgent.trace.runId`。

## 已知限制 / 说明

- **LLM 外部依赖**：冻结版 LLM 指向火山引擎外部 API（`ark.cn-beijing.volces.com`）。本机网络不可达时 N05 **fail-closed**（canonical answer / DEFAULT_RESPONSE + handoff 标志）——这是冻结版设计行为，E2E 用 canonical 路径（确定性、不依赖 LLM）证明 retrieval → answer 真实链路。LLM 可用环境下结果将走 `llm_used=true`。
- **project_id**：AgentState 无 project_id 字段，未强行塞入；customer_id / conversation_id / query / conversation_history 已完整透传。project 维度上下文可作为后续业务层扩展。
- **未改冻结 SHA**：未修改 Service Agent 任何文件；bridge 仅 import 其模块。冻结 worktree 的 `VECTOR_STORE_DIR / EMBEDDING_MODEL_PATH` 指向工作树真实本地数据（git 树不含运行时向量库/模型缓存）。
- **package-lock.json**：root 存在其他并行工作未提交改动，本任务**未提交**该文件（root `ci` 用 `npm install`，workspace `file:` 链接 install 时自动解析，不依赖 lockfile 一致性）。

## Blockers / Decisions

- **BLOCKER**：无 engineering blocker。LLM 外部可达性属运行环境依赖（与 BL-018 同类外部依赖），不影响本地集成验收。
- **DECISION**：`SERVICE_AGENT` 不进 `PROCESS_STAGE_ORDER`（避免破坏既有 3-stage 渲染测试），以窄入口 + 追加 stage view 呈现。
- **DECISION**：同步调用 + 结构化返回（任务建议的第一形态），未引入异步队列。

## Next（不在本任务范围，需 owner 授权）

- 生产部署（AC-12 已排除）
- project 级上下文传递与 memory 联动
- LLM 可用环境下的 `llm_used=true` Live E2E
- Service Agent 29/32 指标提升（明确 Out of Scope）

## 完成包文件

- 本文件：`project-control/BUSOS-R2-SCS-INTEGRATION-01.md`
- 代码：`packages/service-agent-port/**`（新）、`packages/orchestrator/src/run-service-agent-consultation.ts`（新）、`packages/orchestrator/src/{process-contract,trace,index}.ts`、`packages/workspace-run/src/map.ts`、`apps/operator-workspace/src/ui.ts`、各包测试
- SHA：Service Agent `ebb85686`；BUSOS 集成分支 HEAD（commit 后由 `git log` 记录，closure SHA 规则：完成报告不记录自身 commit SHA，push 后经 `git ls-remote` 外部核验）
