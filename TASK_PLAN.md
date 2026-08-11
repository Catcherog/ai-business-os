# TASK_PLAN — BUSOS-P1-03

## task_id
BUSOS-P1-03 — Business Repository + Feishu Adapter Skeleton

## phase
P1 — Foundation Implementation

## outcome
PARTIAL / BLOCKED ON REAL FEISHU E2E.
- Skeleton + domain logic + Fake adapter + Real adapter production code-path (exercised via in-memory Feishu simulator) = PASS. All 7 P1-03 gates satisfied at the skeleton level.
- Live Feishu create→readback E2E against a real Feishu Base is BLOCKED (BL-013): no `FEISHU_*` credentials / Base app token / table IDs present in this environment. Real adapter is fully implemented and env-driven; only the live network round-trip is unverified.
- Per spec §19: Fake PASS is NOT reported as P1-03 real E2E PASS. Outcome is accurately PARTIAL.
- STOP after recording this evidence — P2 NOT started.

## scope_enforced
ONLY P1-03. Implemented the minimal persistence boundary: canonical Lead/Customer → BusinessRepository → FeishuAdapter → Feishu Base → Readback → canonical domain object / CommitResultV1.
Did NOT: connect P1-02 Candidate, implement Governance Engine, run GP-001 full chain, review UI, Project/Task, Lumen, multimodal, Memory, observability, full DB migration, refactor old Feishu Collator, redesign 飞书 data platform, modify frozen contracts, touch BOOTSTRAP.md.

## existing_feishu_implementation
Located via bounded search (reused as reference for field conventions ONLY; NOT re-audited per spec):
- `D:\360Downloads\Trae 项目\lark\src\scripts\temp\crud-probe.mjs` — validated `tenant_access_token` via `POST /open-apis/auth/v3/tenant_access_token/internal` (FEISHU_APP_ID / FEISHU_APP_SECRET) + bitable CRUD `POST/GET /open-apis/bitable/v1/apps/{appToken}/tables/{tableId}/records`.
- `D:\360Downloads\Trae 项目\collator-clean-clone\src\data-cleaning\agent\execution\bitable-writer.js` — real bitable client (shells to `lark-cli`).
- `D:\360Downloads\Trae 项目\lark\src\scripts\temp\customer-fields.json` — real Base field names (客户姓名 / 联系方式 / 微信 / 状态 / 拍摄类型 / 预算区间 …).
- `D:\360Downloads\Trae 项目\lark\src\scripts\temp\project-customer-link.json` — link field `客户关联` → `tblfaiObU76um03h`.
- Stack: TypeScript / Node, Feishu OpenAPI.

## integration_choice
- Reuse the validated Feishu OpenAPI bitable CRUD pattern (tenant_access_token + bitable records API). No new Feishu SDK introduced.
- `RealFeishuAdapter` is env-driven (`FEISHU_APP_ID` / `FEISHU_APP_SECRET` / `FEISHU_BASE_APP_TOKEN` / `FEISHU_LEAD_TABLE_ID` / `FEISHU_CUSTOMER_TABLE_ID`); no secrets hard-coded.
- Cross-language/transport injection: `RealFeishuAdapter` accepts `fetchImpl`, so the REAL production code path (auth → create → readback → verify → commit) is exercised end-to-end by an in-memory Feishu bitable simulator (`makeFeishuStub()`) with NO live credentials. This is the real adapter class under test — not a Fake, not a mock-into-PASS.
- Live E2E (real `FEISHU_*` env) gated behind `describeLive` and SKIPPED when creds absent.

## repository_interface (6 methods, all implemented)
| # | 方法 | 状态 |
|---|---|---|
| 1 | `createLead(lead: LeadCreateInput): Promise<CommitResultV1<Lead>>` | PASS |
| 2 | `getLead(leadId: string): Promise<Lead \| null>` | PASS |
| 3 | `createCustomer(customer: CustomerCreateInput): Promise<CommitResultV1<Customer>>` | PASS |
| 4 | `getCustomer(customerId: string): Promise<Customer \| null>` | PASS |
| 5 | `findCustomerByIdentity(query: CustomerIdentityQuery): Promise<Customer \| null>` | IMPLEMENTED (exact phone / exact WeChat; no fuzzy merge) |
| 6 | `linkLeadCustomer(leadId: string, customerId: string): Promise<CommitResultV1<void>>` | PASS |

- No ORM / DAO / event bus / repository framework. `BusinessRepository` (D017) depends only on the `FeishuAdapter` port (D018).
- `createLead` accepts canonical Lead; anonymous `customer_id=null` allowed. FAILS CLOSED on contract violation (BL-005) — empty `service_type` throws `ContractValidationError` before any Feishu write.
- `createCustomer`: canonical Customer → mapping → create → readback → canonical Customer; unknown phone/wechat stay `null` (no fabrication).
- `findCustomerByIdentity`: V1 only exact phone / exact WeChat; returns `null` if no usable identity. Feasible with current adapter → implemented, NOT deferred.
- `linkLeadCustomer`: minimal canonical relationship update (leadId + customerId); adapter sets BOTH text `Customer ID` and link `客户关联`.

## adapter_mapping (canonical → Feishu, no secrets)
`DEFAULT_FIELD_MAP` (Feishu field names owned solely by adapter):
- Lead: `lead_id` → "Lead ID"; `customer_id` → "Customer ID" (text) **and** "客户关联" (link `record_ids`); `service_type` → "拍摄类型"; `budget_min` → "预算下限"; `budget_max` → "预算上限"; `preferred_date_text` → "期望日期"; `status` → "状态".
- Customer: `customer_id` → "Customer ID"; `display_name` → "客户姓名"; `phone` → "联系方式"; `wechat` → "微信"; `status` → "状态".
- Nullable budget/date OMITTED when `null` so round-trip yields `null` (not `0`/`''`).
- `boundary.test.ts` proves `BusinessRepository` / `types` / `business-repository` source contain NO Feishu specifics (`open.feishu.cn` / `tenant_access_token` / `客户姓名` / `客户关联` etc.); adapter owns URL + token, mapping owns field names.

## real_vs_fake
- **Fake**: `FakeFeishuAdapter` — explicit in-memory Maps, opt-in corruption hooks (`corruptReadbackLead` / `corruptReadbackCustomer`). Executed in repository/mapping/readback tests. Result: PASS (lead→VERIFIED, customer→VERIFIED, lookup, link, fail-closed).
- **Real**: `RealFeishuAdapter` driven by `makeFeishuStub()` (in-memory Feishu simulator injected as `fetchImpl`) in `feishu-real.test.ts`. Executed: createLead / getLead / createCustomer + findCustomerByIdentity / linkLeadCustomer through REAL adapter logic. Result: PASS (real code path, stub transport).
- **Live E2E**: `describeLive` (real `FEISHU_*` env). Result: SKIPPED — no credentials (1 skipped).
- Honest reporting: Fake + stub-driven real path PASS ≠ live Feishu E2E PASS. Live E2E is the only unverified piece (BL-013).

## readback_evidence (D019)
Hard readback condition: write → record id → re-read → map back → verify critical fields → VERIFIED.
- `LEAD_CRITICAL_FIELDS`: lead_id, customer_id, service_type, budget_min, budget_max, preferred_date_text, status.
- `CUSTOMER_CRITICAL_FIELDS`: customer_id, display_name, phone, wechat, status.
- Normal path (`feishu-real.test.ts` via stub + `readback.test.ts` via fake): SAMPLE_LEAD_INPUT (service_type=`新中式写真`, budget 3500/4000, date=`下个月`, customer_id=null) → write → record id `rec_lead_…` → re-read → `fromFeishuLeadRecord` → `verifyLeadCriticalFields` equal → `readback_status=VERIFIED`, `write_status=SUCCESS`, `status=COMMITTED`.
- Negative path: `FakeFeishuAdapter` with `corruptReadbackLead` → critical-field mismatch → `readback_status=FAILED` → `isBusinessCommitSuccess=false` (proven in readback.test.ts).
- Secrets masked: appToken / table ids are test fixtures, never logged; production reads env vars — no hard-coded secrets.

## acceptance (gates 1-7)
| # | 判据 (P1-03 Gate) | 结果 |
|---|---|---|
| 1 | Lead 经 repo 创建（create→readback→VERIFIED） | PASS |
| 2 | Customer 经 repo 创建（create→readback→VERIFIED） | PASS |
| 3 | Feishu 字段映射隔离在 adapter（上层无 Feishu 细节） | PASS |
| 4 | 提交写后跟随 readback | PASS |
| 5 | readback 校验关键字段 | PASS |
| 6 | repo 返回 canonical 领域对象，非 raw Feishu | PASS |
| 7 | 精确 phone/WeChat 查找已实现（可执行，非 defer） | IMPLEMENTED |

Overall: skeleton 7/7 PASS; REAL Feishu E2E BLOCKED (BL-013) → outcome PARTIAL.

## tests
命令（在 `packages/business-repository`）：
```
npm test        # = tsc --noEmit && vitest run
npm run verify  # 同 npm test
```
结果：
- `tsc --noEmit` → exit 0，无类型错误
- `vitest run` → 5 test files / **36 passed | 1 skipped (37 total)**
  - `repository.test.ts` 13 · `mapping.test.ts` 7 · `readback.test.ts` 8 · `feishu-real.test.ts` 5 (1 skipped live E2E) · `boundary.test.ts` 4

## contract_validation
- 消费 `@busos/contracts`（源码消费，BL-009）：`LeadSchema` / `CustomerSchema` / `CommitResultV1Schema` / `isBusinessCommitSuccess` / `assertCommitResultV1` / `assertWith` / `validateWith`。
- 仓库在 Feishu 写前 `assertWith(LeadSchema|CustomerSchema, …)`（FAIL CLOSED，BL-005）。
- 所有 `CommitResultV1` 经 `assertCommitResultV1` 二次校验；`status=COMMITTED` 仅当 `write_status=SUCCESS` 且 `readback_status=VERIFIED`。
- 冻结契约未被修改（未触碰 `contracts/*.schema.json`）。

## blockers
- **BL-013** — Real Feishu E2E BLOCKED: 本环境缺失 `FEISHU_APP_ID` / `FEISHU_APP_SECRET` / `FEISHU_BASE_APP_TOKEN` / `FEISHU_LEAD_TABLE_ID` / `FEISHU_CUSTOMER_TABLE_ID`。`RealFeishuAdapter` 已完整实现且 env 驱动，仅真实网络往返未验证。提供凭据/Base 后即可跑通 live E2E（或用户显式豁免）。

## backlog_items (written to 06-BACKLOG.md)
- BL-013 真实 Feishu E2E 阻塞 — 缺失 FEISHU_* 凭据（本任务）
- BL-014 需开通真实 Feishu Base（含独立 Lead 表）；Lead 需同时具备 `Customer ID` 文本字段与 `客户关联` 链接字段（本任务）
- （继承）BL-005 service_type 非空约束（已在本任务 fail-closed 落实）、BL-008 npm proxy、BL-009 契约源码消费、BL-010/011/012（P1-02 决策遗留）

## git_info
- branch: main
- baseline HEAD (pre-P1-03): `6dfe651e8ed9f1b663d8dafc75698c5ae06fefd1` (P1-02 closing)
- impl_commit_sha: `cca176310c632343c3071eeeabe8f97bb3af355d`
- closing_commit_sha: (见 closing_evidence)
- working tree: clean before change; new untracked `packages/business-repository/` + modified `02-CURRENT-STATE.md`, `06-BACKLOG.md`, `TASK_PLAN.md`
- remote main (pre-push): `6dfe651e8ed9f1b663d8dafc75698c5ae06fefd1`

## nextActor
**BLOCKED ON REAL FEISHU E2E (BL-013) — 不启动 P2。**
P2 — GP-001 Integration 的前置条件：提供 `FEISHU_*` 凭据并开通真实 Feishu Base（含独立 Lead 表，Lead 需 `Customer ID` 文本 + `客户关联` 链接字段，见 BL-014），跑通 live E2E 后 P1-03 方可正式 PASS；届时再启动 P2。除非用户显式豁免真实 Feishu E2E，否则不应视为完整 PASS。

## closing_evidence (for audit)
- branch: main
- baseline_commit: 6dfe651e8ed9f1b663d8dafc75698c5ae06fefd1
- impl_commit_sha: cca176310c632343c3071eeeabe8f97bb3af355d
- closed_by: WorkBuddy (Craft mode)
- stopped_after_partial: true (REAL Feishu E2E BLOCKED; 未启动 BUSOS-P2 / GP-001)
