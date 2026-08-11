# TASK_PLAN — BUSOS-P1-02

## task_id
BUSOS-P1-02 — Service Agent Candidate Builder

## phase
P1 — Foundation Implementation

## outcome
PASS. All 8 P1-02 acceptance gates satisfied. No blockers. No Codex usage (bounded, single bounded package + a dev bridge harness; does not meet any 08-WORKBUDDY-OPERATING-RULES trigger). STOP after pass — P1-03 not started.

## scope_enforced
ONLY P1-02. The existing Service Agent now produces `LeadCandidateV1`. Did NOT: start P1-03, implement Governance Engine, implement BusinessRepository, call Feishu, create Lead/Customer, refactor the whole Agent, migrate the old project, or create a new agent framework / orchestrator / event bus.

## existing_service_agent
- Location: `D:\360Downloads\Trae 项目\Monorepo\service agent` (Python + LangGraph; git submodule @ `386f21f6`; branches through W48; live source newer than the stale `service-agent-w37` handoff pack which contained only `.pyc`).
- Consumed interfaces (read-only, no modification): `src/langgraph/types/state.py::create_initial_state` (generates `run_id=run_<16hex>`, `conversation_id=conv_<12hex>`, `customer_id=None`, `created_at` ISO UTC) and `src/langgraph/types/intent.py::classify_intent` (keyword-based I00–I12, no LLM).
- Canonical message → `classify_intent` returns `("I02", 1.0)` (price intent, keyword "预算").

## integration_choice
Prefer existing module + minimal Candidate Builder adapter (D006 / D014 / D015).
- The Python Service Agent is unchanged. It emits a frozen JSON payload `ConsultationContextV1` (conversation_id, run_id, message, intent, intent_confidence) via `bridge/service_agent_context.py`.
- `packages/service-agent-candidate` (TS) consumes that context, runs rule-based extraction (D012: every extracted field carries `source_text` evidence), and assembles + validates `LeadCandidateV1` from `@busos/contracts` (`assertLeadCandidateV1`).
- This keeps a clean cross-language boundary: Python agent output → frozen JSON → TS candidate, no shared runtime, no Feishu/api in the path.

## files_changed
新增 `packages/service-agent-candidate/`:
- `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- `src/consultation-context.ts` — `ConsultationContextV1Schema` + `AGENT_INTENT_TO_CANDIDATE_INTENT` + `assertConsultationContextV1`
- `src/extract.ts` — rule-based extractors: `extractServiceType`, `extractBudget`, `extractPreferredDateText`, `extractIdentity`, `extractRequirement` (each returns `{value, source_text}`)
- `src/candidate-builder.ts` — `buildLeadCandidate(input, options?)`; `generateCandidateId`; initial governance `PENDING_REVIEW`/`R0`/`missing_fields:[]`
- `src/index.ts` — public API re-exports
- `bridge/service_agent_context.py` — dev harness: imports only `langgraph.types.*` (stdlib-only), prints `ConsultationContextV1` JSON
- `scripts/print-candidate.ts` — deterministic canonical-output printer (vite-node)
- `tests/fixtures.ts` — `CANONICAL_MESSAGE`, `CANONICAL_CONTEXT`, `FIXED_NOW`, `FIXED_CANDIDATE_ID`
- `tests/extract.test.ts` (21), `tests/p1-02-gate.test.ts` (27), `tests/service-agent-bridge.test.ts` (4), `tests/canonical-golden.test.ts` (1)

修改控制文件:
- `project-control/02-CURRENT-STATE.md` — P1-02 状态 / 证据 / next task
- `project-control/06-BACKLOG.md` — BL-010 / BL-011 / BL-012
- `TASK_PLAN.md` — 本文件（P1-02 关闭证据）

未改动: 任何 `contracts/*.schema.json`、P1-01 契约源码、其他控制文档、P1-03 任务书、Service Agent Python 源码、无架构重构、无 Feishu / Lead / Customer / Repository / Governance 实现。

## canonical_input
```
我想下个月拍一套新中式写真，预算大概4000。
```

## exact_candidate_output (full JSON, deterministic via FIXED_NOW/FIXED_CANDIDATE_ID)
```json
{
  "version": "lead_candidate.v1",
  "candidate_id": "cand_0123456789abcdef",
  "session_id": "conv_6f42baebac98",
  "agent_run_id": "run_e3cb2ca839a543cb",
  "intent": {
    "type": "price_consultation",
    "confidence": 1
  },
  "customer_candidate": {
    "name": null,
    "phone": null,
    "wechat": null
  },
  "requirement": {
    "service_type": "新中式写真",
    "budget_min": null,
    "budget_max": 4000,
    "preferred_date_text": "下个月",
    "notes": null
  },
  "evidence": [
    { "field": "requirement.service_type", "source_text": "新中式写真" },
    { "field": "requirement.budget_max", "source_text": "预算大概4000" },
    { "field": "requirement.preferred_date_text", "source_text": "下个月" }
  ],
  "governance": {
    "status": "PENDING_REVIEW",
    "risk_level": "R0",
    "missing_fields": []
  },
  "created_at": "2026-08-11T15:00:00.000Z"
}
```
判定符合：service_type="新中式写真"（非 "写真"）、budget_max=4000（非 3500/4500）、budget_min=null（"大概" 仅出上限）、preferred_date_text="下个月"（保留原文）、客户身份全 null、evidence 覆盖 service_type 与 budget、governance.status="PENDING_REVIEW"。

## acceptance (gates 1-8)
| # | 判据 (P1-02 Gate) | 结果 |
|---|---|---|
| 1 | 现有 Service Agent 已定位（bounded search，非 blocker） | PASS |
| 2 | 产出 LeadCandidateV1 且 `assertLeadCandidateV1` 通过 | PASS |
| 3 | canonical 用例逐字通过（service_type/budget/date/identity/evidence/status） | PASS |
| 4 | 提取为规则驱动且有 evidence（D012），非整句匹配 | PASS |
| 5 | 仅新增 Candidate Builder 适配层，未重构 Agent / 未新建框架（D014/D015） | PASS |
| 6 | 不调用 Feishu / 不创建 Lead / Customer（边界隔离） | PASS |
| 7 | 测试覆盖：提取规则 + gate + 真实 Agent 桥接（防硬编码守卫） | PASS |
| 8 | tsc --noEmit 零错误；Feishu 边界静态证明（无 feishu/lark/网络 IO） | PASS |

附加守卫（tests/p1-02-gate.test.ts）：源码不含 canonical 整句字面量；换用不同措辞（如 "预约日系写真" / "报价约3000" / "下周三"）仍能正确提取，证明非硬编码。

## tests
命令（在 `packages/service-agent-candidate`）：
```
npm test        # = tsc --noEmit && vitest run
npm run verify  # 同 npm test
```
结果：
- `tsc --noEmit` → exit 0，无类型错误
- `vitest run` → 4 test files / **53 tests passed**
  - `extract.test.ts` 21 · `p1-02-gate.test.ts` 27 · `service-agent-bridge.test.ts` 4 · `canonical-golden.test.ts` 1
- `service-agent-bridge.test.ts` 真实调用 `Monorepo/service agent/src` 的 `classify_intent` + `create_initial_state` → ConsultationContextV1 → buildLeadCandidate → `assertLeadCandidateV1`，4 条全部通过（intent I02 / conf 1.0 / service_type 新中式写真 / budget_max 4000 / date 下个月 / identity 全 null / status PENDING_REVIEW）。

## contract_validation
- 消费 `@busos/contracts` 的 `LeadCandidateV1Schema` / `assertLeadCandidateV1`（BL-009：源码消费，无 dist）。
- 桥接测试与 golden 测试均用 `assertLeadCandidateV1` 二次校验，确保协议未被静默破坏。
- `ConsultationContextV1` 本身也为严格 zod schema（`assertConsultationContextV1`），跨语言边界有契约约束。

## feishu_boundary_proof
- `bridge/service_agent_context.py` 仅 `import` `langgraph.types.*`（标准库依赖），无 `feishu` / `lark` / `http` / `requests` / 网络 IO；仅向 stdout 打印 JSON。
- Candidate Builder（`src/*`）纯函数，无任何 I/O。
- `tests/p1-02-gate.test.ts` 静态扫描 `src/**` 与 `bridge/**` 源码，断言不含 `feishu|lark|fetch|axios|requests|writeFile|createLead|createCustomer`，全部通过。
- 结论：P1-02 全程不触碰 Feishu、不创建 Lead/Customer，符合 D015「Service Agent 只产出候选」。

## blockers
无。非阻塞发现写入 06-BACKLOG.md：BL-005、BL-008、BL-009、BL-010、BL-011、BL-012。

## backlog_items (non-blocking, written to 06-BACKLOG.md)
- BL-010 现有 Agent intent 分类器为关键词规则（无 LLM），歧义语料可能误路由（P2）
- BL-011 service_type 提取依赖策划名词表 + 风格修饰 heuristics，新垂直需维护词表（P2 / 新垂直接入）
- BL-012 初始 risk_level=R0 / missing_fields=[] 为占位，真实治理规则（含 BL-005 的 service_type 非空约束）推迟到 P1-03/P2

## git_info
- branch: main
- baseline HEAD (pre-P1-02): `0ef847da115c5f21ec7a6befc03433858540e45b`
- working tree: clean before change; new untracked `packages/service-agent-candidate/` + modified `project-control/02-CURRENT-STATE.md`, `project-control/06-BACKLOG.md`, `TASK_PLAN.md`
- commit: P1-02 提交于 main（见 closing_evidence.commit_sha）；`git status --short` 仅含本次新增/修改文件；`git diff --stat` 仅含控制文件改动 + 新包。

## nextActor
BUSOS-P1-03 — Business Repository + Feishu Adapter Skeleton（`project-control/tasks/BUSOS-P1-03-*.md`，若已存在）。前置已就绪：P1-01 契约冻结可用、P1-02 已产出真实 `LeadCandidateV1`。P1-03 应消费本任务产出的候选，并实现 Governance 评估与 Feishu 适配骨架。

## closing_evidence (for audit)
- branch: main
- baseline_commit: 0ef847da115c5f21ec7a6befc03433858540e45b
- commit_sha: 4f687211eb12dd79c058041307dec84851c47f44
- closed_by: WorkBuddy (Craft mode)
- stopped_after_pass: true (未启动 BUSOS-P1-03)
