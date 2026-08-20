# BUSOS-KB-SNAPSHOT v0.1 — Feishu Knowledge Base Audit for H2-03

> **Mode:** READ / AUDIT / SNAPSHOT ONLY. No production code, no runtime, no schema, no Feishu content was modified.
> **Purpose:** give Owner (+ planning assistant) an anonymised, structured view of the *real* studio knowledge that exists today, so a **Golden Set** for the candidate task `BUSOS-R2-H2-03 — Golden Set + Minimal Memory Evaluation` can be designed from facts instead of guesses.
> **Status:** `SNAPSHOT COMPLETE / H2-03 NOT STARTED / NOT AUTHORIZED`.
> **Governing protocol:** `project-control/R2-VERIFICATION-AND-AUDIT-PROTOCOL.md` (GOV-01).

---

## 0. Authority snapshot

```
TASK:                BUSOS-KB-SNAPSHOT (audit / documentation only)
DATE:                2026-08-20
REMOTE BASELINE SHA: 44c8c06bc6e8adac86838e760011c8caaae4ed84   (git ls-remote origin refs/heads/main)
EXPECTED (per brief): 532234554eb0a7c8daf0422cd12f0c41be768a9c  (H2-02 era tip)
LOCAL HEAD:          532234554eb0a7c8daf0422cd12f0c41be768a9c   (behind remote — known git-watcher index lag)
CURRENT PHASE:       R2 / H2 (H2-01 + H2-02 COMPLETE, GOV-01 COMPLETE)
AUTHORIZED SCOPE:    read repo state; read existing business knowledge; anonymise; emit one documentation artifact
KNOWN BLOCKERS:      BL-018 OPEN (non-engineering live dependency: CloudBase quota + LUMEN_*/FEISHU_* credentials)
```

### 0.1 Remote moved — audit of the delta (no STOP)

Remote is **2 commits ahead** of the SHA quoted in the task brief. Both are authored `Catcherog` and touch **control documents only**:

| SHA | Subject | Files |
|---|---|---|
| `4e94a2f6290324b539e3b5d2383328919f26812e` | BUSOS-R2-GOV-01 — verification and audit protocol | +`R2-VERIFICATION-AND-AUDIT-PROTOCOL.md`, +`R2-AUDIT-INDEX.md`, +`R2-ACCEPTANCE-CHECKLIST.md`, +`BUSOS-R2-GOV-01.md`, M`02-CURRENT-STATE.md`, M`07-HANDOFF.md`, M`08-WORKBUDDY-OPERATING-RULES.md` |
| `44c8c06bc6e8adac86838e760011c8caaae4ed84` | BUSOS-R2-GOV-01 — record final remote SHA in completion report + audit index | same control docs |

Verdict: **owner-authorised governance work, zero product/source code, no semantic conflict with this snapshot.** Per protocol §2 this is *not* grounds to STOP. New binding authority for this task = `44c8c06…`. No `reset`, no `clean`, no force-push, no other window's work touched.

### 0.2 Working tree classification (protocol §3)

| Bucket | Files |
|---|---|
| 1 — this task | `project-control/BUSOS-KB-SNAPSHOT-v0.1.md` (new), one appended row in `project-control/R2-AUDIT-INDEX.md` |
| 2 — other window / pre-existing | `project-control/BUSOS-R2-COORDINATOR-DECISION.md` (untracked, **not** in remote → left alone); the 3 `M` control docs + 4 untracked GOV-01 docs are byte-identical to remote `44c8c06` content (local index lag artefact, not real edits) |
| 3 — generated junk | `.stagidx`, `.vite/`, `hi.txt`, `packages/lumen-adapter/hi.txt`, `packages/workspace-read/package-lock.json`, 9× `vitest.*.timestamp-*.mjs` |
| 4 — unknown | NONE |

Only bucket 1 is committed.

---

## 1. Data access result

```
LIVE FEISHU KB ACCESS      = UNAVAILABLE
OFFLINE REAL KB SNAPSHOT   = AVAILABLE (read-only, outside the BUSOS repo)
REPOSITORY KB ACCESS       = AVAILABLE (code-embedded business knowledge + fixtures)
CREDENTIALS REQUESTED      = NONE
```

**Why LIVE is unavailable (facts, not assumptions):**

1. No `.env` / `.env.*` file exists anywhere in the BUSOS working tree (`find -maxdepth 3 -name ".env*"` → 0 hits). `FEISHU_*` / `LUMEN_*` are therefore **MISSING**, consistent with BL-018.
2. BUSOS has **no Feishu wiki/doc reader at all**. `packages/business-repository` speaks only Bitable *records* (Lead / Customer / Project / Task / Asset). There is no `wiki`, `docx`, `space`, or knowledge-retrieval client in any BUSOS package.
3. Therefore even *with* credentials, BUSOS could not read the Feishu knowledge base today — this is a **capability gap, not only a credential gap**. Recorded as a finding (F-01), not fixed here.

**What IS readable — the real knowledge, offline.** The studio's Feishu knowledge base has already been synced to disk by the *existing* Service Agent (separate repo `Catcherog/service-agent`, referenced from `packages/service-agent-candidate/bridge/service_agent_context.py`). Its working copy sits next to this repo and was opened **read-only**:

| Property | Value |
|---|---|
| Location | `<service-agent-working-copy>/knowledge_base/` (outside BUSOS repo; nothing written) |
| Contents | 17 `.txt` documents + `knowledge_index.json`, ~98 KB total |
| Provenance metadata | every doc carries `source: "feishu"`, a wiki token, a doc token, a `section_title`, `synced_at: 2026-06-26` |
| KB self-declared version | `v3.0`, last updated `2026-06-11`; the 话术库 header declares `2.0 全库重构` (`2026-05-10`) |
| Sync discipline (from the KB itself) | "双轨制同步规则（本地 JSON + 飞书知识库同时更新）" |
| Feishu tokens | **REDACTED — deliberately not copied into this snapshot** |

Because the sync is dated `2026-06-26`, this snapshot describes the KB **as of that sync**, not necessarily today's live Feishu state. Any drift since then is unknown and is listed as an open question.

---

## 2. §5.1 Knowledge Base Inventory

| # | Source | Type | Real / Synthetic | Current usage | Confidence |
|---|---|---|---|---|---|
| S1 | Feishu-synced studio KB — 17 docs / 17 categories (`knowledge_base/`) | Business knowledge corpus (话术 + 规则 + 价格 + 流程) | **REAL BUSINESS KNOWLEDGE** | consumed by the external Service Agent's retrieval path; **not** reachable from BUSOS | HIGH (read directly, with provenance metadata) |
| S2 | Service Agent intent taxonomy `I00…I12` (mirrored in `packages/service-agent-candidate/src/consultation-context.ts`) | Closed business-intent enum + mapping to readable names | **REAL BUSINESS KNOWLEDGE** (mirror of the production classifier) | live in BUSOS candidate building | HIGH |
| S3 | Extraction lexicons in `packages/service-agent-candidate/src/extract.ts` — 26 shoot-type nouns, 7 budget cues, 21 date patterns, identity patterns | Domain vocabulary encoded as code | **REAL BUSINESS VOCABULARY** (knowledge-as-code) | live in BUSOS extraction | HIGH |
| S4 | Governance rules `packages/golden-path/src/governance.ts` (+ `contracts` issue codes) | Deterministic policy | **ENGINEERING FIXTURE encoding real policy** | live in golden path | HIGH |
| S5 | Human-review allowlist `packages/human-review/src/allowlist.ts` (8 editable fields) | Governance boundary | **ENGINEERING FIXTURE** | live in review surface | HIGH |
| S6 | Memory contract `packages/contracts/src/memory-record.ts` + `contracts/memory_record.v1.schema.json` | Canonical memory shape / lifecycle invariants | **ENGINEERING FIXTURE** | live (H2-01/H2-02) | HIGH |
| S7 | Memory demo seed `packages/memory/src/seed.ts` — 2 CUSTOMER PREFERENCE records | Demo memory | **SYNTHETIC TEST DATA** | Operator Workspace demo + H2-01 acceptance | HIGH |
| S8 | Workspace demo seed `packages/workspace-read/src/seed.ts` — 2 customers, 2 leads, 2 projects, 5 tasks, 2 assets (incl. placeholder phone numbers) | Demo dataset | **SYNTHETIC TEST DATA** | Operator Workspace DEMO mode | HIGH |
| S9 | Golden-path / orchestrator / review test fixtures (`packages/*/tests/**`) | Test inputs | **ENGINEERING FIXTURE** | CI only | HIGH |
| S10 | Real Feishu Bitable business tables (Lead / Customer / Project / Task / Asset) | Canonical business records | **REAL BUSINESS DATA** | reachable only via `RealFeishuAdapter` + credentials | MEDIUM (schema known from `mapping.ts`; live content not read — BL-018) |
| S11 | Service Agent `vector_store/` + `data/embedding_model` (external repo) | RAG index + embeddings | **REAL RAG ARTEFACT** | external agent only; **BUSOS never touches it** | MEDIUM (existence verified; contents not audited — out of scope) |

Machine-checked negative: `grep -niE "embedding|vector|retriev|\brag\b|semantic search"` over `packages/*/src`, `apps/*/src`, `apps/*/server` returns **only prose comments that say BUSOS deliberately has none**. There is **zero** retrieval implementation inside BUSOS today.

---

## 3. §5.2 Knowledge Taxonomy (as it actually exists)

The 17 real KB documents map to the requested checklist as follows. `GAP` = the topic is *not* covered by real knowledge; nothing was invented to fill it.

| Requested topic | Real coverage | Where |
|---|---|---|
| 服务类型 | **PARTIAL** — no service catalogue document; service types exist as (a) package rows (单人/双人), (b) the 26-noun lexicon in `extract.ts`, (c) `project_type` values in fixtures | S1 `pricing`, S3 |
| 产品 / 套餐 | **FULL** — 3 单人 + 3 双人 套餐 with 精修/底片/服装造型/拍立得/视频交付 columns | S1 `pricing` |
| 价格 | **FULL** — package prices, 定金 300, 精修加购 100/张 + 满四赠一 | S1 `pricing`, `faq`, `seasonal_marketing` |
| 摄影风格 | **FULL** — 新中式电影感定位、差异化（动作/情绪/光影）、非模板化 | S1 `brand`, `customer_service` |
| 服装 / 妆造 | **FULL** — 服装库（旗袍/汉服/新中式改良）、可自带私服、妆造要求（清透底妆、古典发型） | S1 `faq`, `resource_communication` |
| 场景 / 地点 | **FULL** — 室内影棚 + 7 个外景地 with 风格适配 + 最佳季节 | S1 `studio_info` |
| 拍摄流程 | **FULL** — 7 步流程 + 每环节时长 + 现场体验规范 | S1 `shooting_process` |
| 预约 / 档期 | **PARTIAL** — 定金锁档、改期规则、周末紧张等*规则*齐全；**GAP**: 没有任何实际可用档期/日历数据（属运营数据，不属知识） | S1 `pricing`, `sales_strategy` |
| 客户准备事项 | **FULL** — 6 条客户须知 + 3 条工作室准备 | S1 `shooting_process` |
| 成片 / 交付 | **FULL** — 6 类交付物各自时间窗与格式 + 修图标准 | S1 `shooting_process` |
| 售后 | **FULL** — 返修到满意、投诉处理框架、异常补救、生命周期回访 | S1 `complaint_handling`, `customer_lifecycle` |
| FAQ | **FULL** — 15 组真实 Q&A | S1 `faq` |
| 风险 / 禁止事项 | **FULL** — 安全兜底 5 条 + 隐私 4 条 + 新人 10 大禁忌 | S1 `safety`, `newcomer_guide` |
| 人工升级条件 | **FULL** — 退款/赔偿/法律责任/情绪激动/坚持退款 → 转人工 | S1 `safety`, `complaint_handling` |
| 特殊业务规则 | **FULL** — 先挖需后报价三问闸门、尾款 D+1/D+3/D+7 阶梯、互免模特与化妆师合作规则、朋友圈/季节营销 | S1 `sales_strategy`, `payment_collection`, `resource_communication`, `moments_operation`, `seasonal_marketing` |
| 门店地址 / 联系方式 | **GAP by design** — KB 自身写的是占位符（"具体地址以实际为准"、"以实际名片为准"） | S1 `studio_info` |
| 团购 / 学生优惠 | **GAP acknowledged inside the KB itself** — "暂时没有录入本店知识库" | S1 `faq` |

Additional real category not in the requested list: **`resource_communication`** — 面向合作方（模特互免创作、化妆师招募）的 B2B 沟通知识。这是与 C 端完全不同的受众，对后续任何检索层意味着**受众隔离**要求。

---

## 4. §5.3 Core Business Rules

Format per brief. `Deterministic? YES` = 可用纯规则判定，无需模型判断。

```
RULE-001
Source: S1 pricing
Rule: 单人套餐三档 — 基础款 1499 元 / 12 张精修 / 30 张底片 / 1 服 1 造 / 花絮视频；
      标准款 2499 元 / 18 / 50 / 2 服 1 造 / 4 张拍立得 / 花絮+电影原片；
      尊享款 3599 元 / 25 / 80 / 2 服 2 造 / 10 张拍立得 / 30s 电影精修+相册
Business meaning: 报价与套餐匹配的唯一权威表
Deterministic? YES
Potential use: RAG / Governance / Evaluation

RULE-002
Source: S1 pricing
Rule: 双人套餐三档 — 2399 / 3599 / 5299 元（精修 15/24/32，底片 40/70/100，各 1 服 1 造→各 2 服 2 造）
Business meaning: 双人场景独立定价，不能由单人价推导
Deterministic? YES
Potential use: RAG / Evaluation

RULE-003
Source: S1 pricing / faq
Rule: 定金 300 元，预约时支付、抵扣套餐费用、支付后不退
Business meaning: 锁档机制与不可退承诺
Deterministic? YES
Potential use: RAG / Governance / Human Review

RULE-004  ** CONFLICT — must be resolved by Owner **
Source: S1 pricing vs faq vs complaint_handling
Rule: 定金有效期三种互相冲突的表述 —— pricing:「定金支付后 3 个月内有效」；
      faq:「定金永久有效」；complaint_handling:「300 元锁定档期，一年有效」
Business meaning: 同一条商业承诺在真实知识库中存在三个版本
Deterministic? NO (数据缺陷，不是判断问题)
Potential use: Evaluation（作为"知识冲突"金标准用例）/ Governance / Human Review

RULE-005
Source: S1 pricing / faq / seasonal_marketing
Rule: 精修加购 100 元/张，满四赠一（等效八折）
Business meaning: 唯一常设优惠机制
Deterministic? YES
Potential use: RAG / Evaluation

RULE-006
Source: S1 faq / customer_service
Rule: 提前 3 天以上沟通可免费改期一次；临时改期需协调
Business meaning: 改期政策边界
Deterministic? YES
Potential use: RAG / Governance

RULE-007
Source: S1 shooting_process
Rule: 交付时间窗 —— 底片预览 3-5 天；精修成片 2-3 周；花絮视频 1-2 周；
      电影视频 3-4 周；相册（尊享款）4-6 周；拍立得当场领取
Business meaning: 交付承诺，直接影响客户期望管理
Deterministic? YES
Potential use: RAG / Evaluation

RULE-008
Source: S1 shooting_process
Rule: 单场流程与时长 —— 选服装 ~30min → 化妆造型 90-120min → 拍摄 120-180min → 现场选片 30-60min（合计约半天）
Business meaning: 排期与客户时间预期的基础
Deterministic? YES
Potential use: RAG / Workflow

RULE-009
Source: S1 faq / shooting_process
Rule: 平板现场选片、当天出片、无强制消费；底片全给（数量随套餐）
Business meaning: 与传统影楼的核心差异承诺
Deterministic? YES
Potential use: RAG / Evaluation

RULE-010
Source: S1 faq / shooting_process
Rule: 精修支持返修至客户满意；修图标准为「自然通融、不过度磨皮/液化」
Business meaning: 后期质量承诺；同时是最常见投诉的处理依据
Deterministic? YES（承诺存在）/ 判定"是否满意"为人工
Potential use: RAG / Memory / Human Review

RULE-011
Source: S1 faq
Rule: 无需自带服装（工作室服装库含旗袍/汉服/新中式改良），可自带私服与配饰
Business meaning: 降低决策门槛的标准答复
Deterministic? YES
Potential use: RAG

RULE-012
Source: S1 studio_info
Rule: 外景地 7 处及其风格适配/最佳季节 —— 西湖周边（古典江南·四季）、龙井茶园（茶文化·春秋）、
      小河直街（文艺复古·四季）、美院象山（建筑艺术·四季）、西溪湿地（自然意境·春夏秋）、
      法喜寺周边（禅意国风·四季）、南宋御街（古街市井·四季）
Business meaning: 场地推荐的唯一真实来源
Deterministic? YES
Potential use: RAG / Memory（客户地点偏好锚定到真实场地）/ Evaluation

RULE-013
Source: S1 seasonal_marketing
Rule: 季节主题 —— 春·采茶（3-4月）/ 夏·清荷（6-8月）/ 秋·枫叶银杏（10-11月，氛围最佳）/ 冬·雪景与暖调室内（12-2月）
Business meaning: 拍摄方案与营销节奏的季节约束
Deterministic? YES
Potential use: RAG / Workflow

RULE-014
Source: S1 sales_strategy / customer_service
Rule: **先挖需，后报价** —— 必须先取得三项明确回答（① 风格偏好 ② 时间段 ③ 场地倾向）才允许进入报价环节
Business meaning: 工作室最强的流程闸门，违反即视为丢单风险
Deterministic? YES（三项布尔前置条件）
Potential use: Governance / Evaluation / Human Review

RULE-015
Source: S1 customer_service
Rule: 沉默触达节奏 —— 当天 1 问句 → 24h 客片 → 3 天轻触达 → 7 天收尾，之后不再打扰
Business meaning: 反骚扰的自我约束节奏
Deterministic? YES
Potential use: Workflow / Governance

RULE-016
Source: S1 payment_collection
Rule: 尾款当天选片后结算；未结算则 D+1 温和提醒 → D+3 正式提醒 → D+7 最后通牒，逾期 7 天暂停后期流程
Business meaning: 现金流与生产排程的强规则
Deterministic? YES
Potential use: Workflow / Governance / Evaluation

RULE-017
Source: S1 safety
Rule: 知识库无答案 → 明确说明"暂未录入" + 记录 + 转人工；**绝不编造**；不确定信息标注"建议到店详询"
Business meaning: 与 BUSOS D012「不许幻觉」同源的兜底纪律
Deterministic? YES
Potential use: Governance / Evaluation / Human Review

RULE-018
Source: S1 safety / complaint_handling
Rule: 强制转人工触发条件 —— 退款 / 赔偿 / 法律责任 / 客户情绪激动 / 坚持退款
Business meaning: 人工升级的业务定义
Deterministic? YES
Potential use: Human Review / Governance / Evaluation

RULE-019
Source: S1 safety
Rule: 隐私红线 —— 不外泄客户姓名与联系方式、不公开讨论客户需求、成片发布需客户明确授权、内部讨论用代号不实名
Business meaning: 工作室自有的 PII 政策，与本快照的匿名化要求同源
Deterministic? YES
Potential use: Governance / Evaluation（redaction 用例的业务依据）

RULE-020
Source: S1 shooting_process
Rule: 客户准备事项 —— 提前确认时间地点、**特殊妆容偏好或过敏情况须提前告知**、当天穿开衫/宽松衣物、可自带配饰、拍前一周少熬夜、前一天少喝水
Business meaning: 拍摄成功率与安全（过敏）前置条件
Deterministic? YES
Potential use: Memory（过敏=敏感信息，须受限处理）/ Workflow

RULE-021
Source: S1 shooting_process
Rule: 异常处理矩阵 —— 客户迟到→顺延；外景天气→改期或转内景；设备故障→备用设备+必要补偿；
      客户身体不适→优先休息、改期、定金有效；成片不满意→返修，严重则协商重拍
Business meaning: 现场异常的确定性处置表
Deterministic? YES
Potential use: Workflow / Human Review / Evaluation

RULE-022
Source: S1 customer_lifecycle
Rule: 售后触达节奏 —— 拍摄后 3 天感谢 → 2 周回访（体验+转介绍）→ 1 个月新主题 → 3 个月节日 → 半年周年提醒
Business meaning: 老客复购与转介绍的运营节奏
Deterministic? YES
Potential use: Workflow / Memory

RULE-023
Source: S1 newcomer_guide / sales_strategy
Rule: 沟通规范 —— 统一称「老师」「您」；禁用「亲」「宝」「亲爱的」；每轮结尾必须是问句；不"孔雀开屏"；不编造
Business meaning: 品牌语气与对话结构的硬约束
Deterministic? YES
Potential use: Governance / Evaluation

RULE-024
Source: S1 resource_communication
Rule: 合作方规则 —— 模特为「互免创作」（工作室出拍摄/化妆/造型，双方均可用于个人作品展示）；
      化妆师合作先谈风格与能力匹配、必须试妆、结算方式可按场/按月/按项目
Business meaning: 供给侧知识，受众不是客户
Deterministic? YES
Potential use: RAG（须受众隔离）/ Governance

RULE-025
Source: S4 packages/golden-path/src/governance.ts
Rule: `requirement.service_type` 缺失 → `REJECT`（零写入副作用）；`intent.confidence < 0.6` → `REVIEW_REQUIRED`（只能把 APPROVE 降级，永不提升 REJECT）
Business meaning: BUSOS 侧唯一现存的确定性治理闸门
Deterministic? YES
Potential use: Governance / Human Review / Evaluation

RULE-026
Source: S3 packages/service-agent-candidate/src/extract.ts
Rule: 单一预算数字记为 `budget_max`（不虚构区间）；"大概"等模糊词只进 evidence 不改数值；日期保留客户原话不做日历换算；身份仅在显式陈述时提取，否则 `null`
Business meaning: D012「每个值都要有证据、不许默认值」的具体实现
Deterministic? YES
Potential use: Governance / Evaluation

RULE-027
Source: S6 packages/contracts/src/memory-record.ts + packages/memory/src/memory-context.ts
Rule: Memory 不变量 —— `scope` 必须等于 `subject_type`；仅 `ACTIVE` 进入上下文；provenance（`source_ref` + ≥1 `evidence_refs`，且必须是规范引用）缺失即 fail-closed 抛错；
      无物理删除，只能 `SUPERSEDE` / `INVALIDATE`；上下文上限 20 条 / 单条 500 字 / 合计 4000 字，超限置 `truncated`
Business meaning: 记忆层的治理契约
Deterministic? YES
Potential use: Evaluation（H2-03 的主评测面）/ Governance
```

**Rule count: 27**（真实业务知识 24 条 + BUSOS 侧确定性规则 3 组）。其中 `RULE-004` 是**真实知识缺陷**，非工程缺陷。

---

## 5. §5.4 Representative Knowledge Chunks

```
REAL REPRESENTATIVE CHUNKS = 34
SYNTHETIC / FABRICATED CHUNKS = 0
```

全部来自 S1（飞书同步 KB）与 BUSOS 源码，已匿名化（工作室品牌名 → `Studio-A`，客服人格名 → `Agent-CS`，飞书 token 全部剔除）。`Crit` = Business criticality。

| ID | Topic | Source (category / file) | Normalized knowledge | Applicable scenario | Possible retrieval query | Crit |
|---|---|---|---|---|---|---|
| KB-001 | 品牌定位 | `brand` | Studio-A 定位为新中式电影感写真工作室（杭州），非模板化、按气质定制 | 开场介绍 / 风格咨询 | "你们是什么风格的工作室" | HIGH |
| KB-002 | 差异化三要素 | `brand` | 动作自然引导（不摆僵硬 pose）/ 情绪真实捕捉 / 电影级布光 | 与影楼比较 | "你们和影楼有什么区别" | HIGH |
| KB-003 | 单人套餐表 | `pricing` | 1499 / 2499 / 3599 三档，精修 12/18/25，底片 30/50/80 | 报价 | "单人写真多少钱" | HIGH |
| KB-004 | 双人套餐表 | `pricing` | 2399 / 3599 / 5299 三档，精修 15/24/32，底片 40/70/100 | 闺蜜/情侣报价 | "两个人一起拍多少钱" | HIGH |
| KB-005 | 定金规则 | `pricing` | 300 元，预约时付、可抵扣、不退 | 催定金 / 退款咨询 | "定金多少能退吗" | HIGH |
| KB-006 | 定金有效期（冲突） | `pricing` vs `faq` vs `complaint_handling` | 三处表述互斥：3 个月内有效 / 永久有效 / 一年有效 | 改期与退款争议 | "定金有效期多久" | HIGH |
| KB-007 | 精修加购 | `pricing` `faq` | 100 元/张，满四赠一（≈八折） | 选片加购 | "精修不够可以加吗" | HIGH |
| KB-008 | 选片方式 | `pricing` `faq` | 平板现场选片、当天出片、无强制消费、选多少算多少 | 流程说明 | "选片怎么选" | HIGH |
| KB-009 | 底片口径 | `pricing` `faq` | 底片=拍摄原片全给；精修=从底片精选后的精细成品 | 交付答疑 | "底片全都给吗" | HIGH |
| KB-010 | 改期政策 | `faq` | 提前 3 天以上免费改期一次 | 档期变更 | "可以改期吗" | HIGH |
| KB-011 | 拍摄总时长 | `faq` `shooting_process` | 约半天：化妆 1.5-2h + 拍摄 2-3h，不赶 | 时间安排 | "拍摄要多久" | MEDIUM |
| KB-012 | 服装供给 | `faq` | 有服装库（旗袍/汉服/新中式改良），可自带私服 | 服装咨询 | "需要自己带衣服吗" | MEDIUM |
| KB-013 | 拍摄地点 | `faq` `studio_info` | 杭州室内影棚 + 合作外景（茶园/古镇/园林） | 场地咨询 | "在哪里拍" | HIGH |
| KB-014 | 不会摆姿势 | `faq` | 摄影师全程引导，无需拍摄经验 | 消除顾虑 | "我不会摆姿势怎么办" | MEDIUM |
| KB-015 | 返修承诺 | `faq` | 精修修到满意为止，肤色/比例/光影可调 | 售后 | "精修不满意能改吗" | HIGH |
| KB-016 | 成片周期 | `faq` `shooting_process` | 精修 2-3 周；底片预览拍后数天；视频类更久 | 期望管理 | "多久能拿到照片" | HIGH |
| KB-017 | 陪同人员 | `faq` | 可带朋友/家属；拍摄时休息区等候，选片可参与 | 现场安排 | "可以带朋友吗" | MEDIUM |
| KB-018 | 未录入业务 | `faq` | 团购/学生优惠"暂未录入知识库" → 转人工 | 知识缺口 | "有学生优惠吗" | MEDIUM |
| KB-019 | 六大销售原则 | `sales_strategy` | 不孔雀开屏 / 第一问让人开口 / 结尾加问句 / 稳住框架 / 适时社会认同 / 不卑不亢 / 只引用已知信息 | 对话质量 | "接客原则" | HIGH |
| KB-020 | 挖需三问闸门 | `customer_service` `sales_strategy` | 风格 + 时间 + 场地 三项明确后才报价 | 报价前置 | "客户一上来问价格怎么办" | HIGH |
| KB-021 | 价格异议应对 | `customer_service` | 拆解价值（一对一/无隐形消费/精修到满意）而非降价 | 异议处理 | "客户说太贵了" | HIGH |
| KB-022 | 沉默触达节奏 | `customer_service` | 当天问句 → 24h 客片 → 3 天轻触达 → 7 天收尾 | 跟进节奏 | "客户不回复怎么跟" | MEDIUM |
| KB-023 | 单场流程 7 步 | `shooting_process` | 到店签到→选服装→化妆造型→拍摄→现场选片→付尾款→结束 | 流程说明 / 排期 | "拍摄当天流程" | HIGH |
| KB-024 | 交付物时间窗 | `shooting_process` | 底片 3-5 天 / 精修 2-3 周 / 花絮 1-2 周 / 电影 3-4 周 / 相册 4-6 周 / 拍立得当场 | 交付承诺 | "各项交付时间" | HIGH |
| KB-025 | 修图标准 | `shooting_process` | 肤色自然不过度美白、比例优化不失真、保留电影感光影、支持返修 | 后期质量 | "你们修图风格" | HIGH |
| KB-026 | 客户准备事项 | `shooting_process` | 素颜/开衫、过敏与妆容偏好提前告知、前一周少熬夜、前一天少喝水 | 拍前提醒 | "拍摄前要准备什么" | MEDIUM |
| KB-027 | 现场异常矩阵 | `shooting_process` | 迟到顺延 / 天气改期或转内景 / 设备备用+补偿 / 不适改期定金有效 / 不满意返修或重拍 | 应急 | "下雨了怎么办" | HIGH |
| KB-028 | 外景地风格表 | `studio_info` | 7 处外景各自风格适配与最佳季节 | 场地推荐 | "推荐适合新中式的外景" | HIGH |
| KB-029 | 服务承诺清单 | `studio_info` | 一对一专属 / 无隐形消费 / 精修到满意 / 满四赠一 / 定金可改期 / 拍立得当场 / 电影级视频 | 卖点总结 | "你们有什么保障" | MEDIUM |
| KB-030 | 安全兜底五条 | `safety` | 无录入→说明+转人工；绝不编造；不确定→建议到店详询；退款/赔偿/法律→转人工；投诉→先安抚后转人工 | 兜底 | "不知道答案怎么回" | HIGH |
| KB-031 | 隐私红线 | `safety` | 不外泄客户信息、成片发布需授权、内部用代号 | 合规 | "能发客户照片吗" | HIGH |
| KB-032 | 投诉四步框架 | `complaint_handling` | 安抚 → 共情 → 提供方案 → 升级转人工；退款场景给改期/转让/升级抵扣三选项 | 投诉 | "客户说修图失真" | HIGH |
| KB-033 | 尾款催收阶梯 | `payment_collection` | 当天结算；D+1 温和 / D+3 正式 / D+7 最后通牒（逾期 7 天停后期） | 财务跟进 | "尾款没付怎么催" | HIGH |
| KB-034 | 季节主题表 | `seasonal_marketing` | 春采茶 / 夏清荷 / 秋枫叶银杏（最佳）/ 冬雪景暖调 | 方案与营销 | "秋天适合拍什么" | MEDIUM |

**SYNTHETIC EXPANSION CANDIDATES**（尚未撰写，仅列方向，供 H2-03 决定是否需要）：
`SEC-01` 罕见服务类型（孕妇/亲子/证件照）在真实 KB 中无套餐条目 → 应触发"未录入 + 转人工"；
`SEC-02` 超预算请求（如预算 800 元）→ 应触发价值拆解而非编造折扣；
`SEC-03` 跨季节矛盾请求（12 月要拍采茶风）→ 应触发季节约束说明；
`SEC-04` 敏感健康信息（化妆品过敏）→ 应验证受限存储路径；
`SEC-05` 恶意/骚扰输入 → 应触发礼貌终止 + 上报。

---

## 6. §5.5 Common Customer Intent / Need Patterns

以真实 KB 场景表 + 真实意图枚举 `I00…I12` 为依据（业务模式，非客户记录）。

| ID | Pattern | 真实依据 | 映射意图 | 典型首问 |
|---|---|---|---|---|
| NP-01 | 只说"你好"/沉默试探 | `newcomer_guide` 场景 4、`customer_service` 沉默节奏 | I00/I01 | "在吗" |
| NP-02 | 直接问价格 | `newcomer_guide` 场景 1、`faq` | I02 | "最便宜多少" |
| NP-03 | 问风格 / 要看作品 | `newcomer_guide` 场景 2、`brand` | I01 | "有没有客片看看" |
| NP-04 | 套餐内容比较（含双人） | `pricing`、`customer_service` 套餐推荐 | I02 | "标准款和尊享款差在哪" |
| NP-05 | 直接问档期 | `newcomer_guide` 场景 3 | I03 | "这周末有空档吗" |
| NP-06 | 带明确需求（风格+时间+场地） | `newcomer_guide` 场景 5 | I04 | "下个月想拍新中式旗袍" |
| NP-07 | 服装 / 妆造咨询 | `faq`、`resource_communication` | I01 | "要自己带衣服吗" |
| NP-08 | 拍摄地点 / 外景咨询 | `studio_info` | I01 | "外景能去茶园吗" |
| NP-09 | 交付周期咨询 | `faq`、`shooting_process` | I07 | "多久能拿到成片" |
| NP-10 | 能力顾虑（不会拍/怕不像） | `faq`、`customer_service` | I01 | "我很不会拍照" |
| NP-11 | 预算约束 / 要优惠 | `sales_strategy` 异议表 | I02 | "能不能打折" |
| NP-12 | 比价 / 再考虑 | `sales_strategy` | I02/I01 | "我再对比看看" |
| NP-13 | 改期 / 退定金 | `faq`、`complaint_handling` | I05/I06/I10 | "定金能退吗" |
| NP-14 | 修图不满意 / 投诉 | `complaint_handling` | I08/I09 | "修得太失真了" |
| NP-15 | 尾款与结算 | `payment_collection` | I07 | "尾款什么时候付" |
| NP-16 | 特殊需求（带人数多/过敏/纪念日赶时间） | `shooting_process`、`customer_service` | I01/I04 | "我对某些化妆品过敏" |
| NP-17 | 老客复购 / 转介绍 | `customer_lifecycle`、`newcomer_guide` 场景 6 | I01/I04 | "上次拍得不错想再拍" |
| NP-18 | 隐私 / 授权诉求 | `safety` | I11 | "照片不要发出去" |
| NP-19 | 明确要人工 | `safety`、`complaint_handling` | I12 | "让主管联系我" |
| NP-20 | 合作方询问（模特/化妆师） | `resource_communication` | 不属 C 端意图枚举 | "你们招化妆师吗" |

`NP-20` 是一个真实但**未被 C 端意图枚举覆盖**的模式 —— 记录为发现，不改代码。

---

## 7. §5.6 Knowledge vs Memory Boundary

判定原则：**Knowledge = 工作室对所有客户都成立的稳定事实；Memory = 系统关于某个 Customer / Project 记住的状态或偏好。**

| # | Information | Knowledge or Memory? | Reason |
|---|---|---|---|
| 1 | 基础款 1499 元含 12 张精修 | **Knowledge** | 对所有客户一致，改动源自工作室定价而非客户 |
| 2 | 精修加购 100 元/张、满四赠一 | **Knowledge** | 全店政策 |
| 3 | 定金 300 元不退 | **Knowledge** | 全店政策 |
| 4 | 精修成片 2-3 周交付 | **Knowledge** | 标准交付承诺 |
| 5 | 龙井茶园最佳季节为春秋 | **Knowledge** | 场地属性事实 |
| 6 | 提前 3 天以上可免费改期一次 | **Knowledge** | 全店规则 |
| 7 | 退款/赔偿类问题必须转人工 | **Knowledge**（治理规则） | 与具体客户无关的策略 |
| 8 | Customer-A 偏好新中式、偏深色影调 | **Memory**（`PREFERENCE` / scope=CUSTOMER） | 属于该客户，跨项目适用 |
| 9 | Customer-A 明确不要过度磨皮 | **Memory**（`PREFERENCE` / CUSTOMER） | 个体化后期约束 |
| 10 | Customer-B 预算约 4000 元 | **Memory**（`PREFERENCE` 或 `FACT` / CUSTOMER） | 客户自述约束，非全店事实 |
| 11 | Project-001 定档 2026-09-20 | **Memory? → 实为 canonical field** | `Project.scheduled_date` 已是权威业务字段；不应复制成 Memory（重复真相风险） |
| 12 | Project-001 采用茶园外景方案 | **Memory**（`DECISION` / scope=PROJECT） | 项目级决定，不跨项目适用 |
| 13 | 审阅人批准了某低置信度候选 | **Memory**（`DECISION` / 由 review case 派生） | 已有确定性派生规则 |
| 14 | 某次运行成功生成了 Asset-001 | **Memory**（`OUTCOME` / 由 process run 派生） | 执行结果，带 provenance |
| 15 | Customer-C 要求下个月拍摄 | **Memory**（`PREFERENCE`，原话保留） | 客户时间意向；一旦落档即由 canonical `scheduled_date` 接管 |
| 16 | Customer-D 对某化妆品过敏 | **Memory — RESTRICTED** | 是个体事实，但属健康敏感信息；须限定用途、不进入生成提示 |
| 17 | 客户希望成片不公开发布 | **Memory**（`PREFERENCE`）+ **Knowledge**（授权规则） | 客户意愿是 Memory；"发布需授权"是 Knowledge |
| 18 | "秋季枫叶银杏氛围最佳" | **Knowledge** | 季节事实 |
| 19 | "这位客户上次拍的是旗袍" | **AMBIGUOUS** | 既可由历史 Project/Asset **推导**（canonical 事实），也可作为 `FACT` Memory 缓存。建议：优先读 canonical，Memory 仅在需要跨项目摘要时保存，且必须带 evidence 指向该 Project |
| 20 | "客户属于价格敏感型" | **AMBIGUOUS** | 是**推断**而非陈述；当前 Memory 契约只接受确定性抽取（`confidence`=1 用于原话），推断类需要更低 confidence 与明确规则，否则易成幻觉入口 |
| 21 | "周末档期紧张" | **AMBIGUOUS** | 表述像 Knowledge（长期趋势），但真实值是**运营数据**（实时档期）。KB 中无档期数据 → 既不该当 Knowledge 也不该当 Memory，应来自业务系统 |
| 22 | "满四赠一活动正在进行" | **AMBIGUOUS** | Knowledge，但有时效性；若活动下线，旧回答即错误。需要知识层的有效期字段（当前 KB 无） |

**Clear Knowledge = 9 · Clear Memory = 9（含 1 条 RESTRICTED）· AMBIGUOUS = 4**（另 1 条为"应属 canonical field 而非 Memory"）。

---

## 8. §5.7 Candidate Memory Fields (analysis only — schema untouched)

以现有 `MemoryRecordV1` 为准（`memory_type ∈ {PREFERENCE, FACT, DECISION, OUTCOME}`，`scope = subject_type ∈ {CUSTOMER, PROJECT}`，`content` ≤ 500 字，`source_type ∈ {HUMAN_REVIEW, PROJECT, TASK, ASSET, PROCESS_RUN}`）。下表**不是 schema 变更提案**，而是"哪些真实业务语义可以装进现有 content 语句 + 现有类型"的分析。

| 候选语义 | 建议 memory_type | 建议 scope | 真实依据 | 可确定性抽取？ | 备注 |
|---|---|---|---|---|---|
| `style_preference`（新中式/古风/日系/清新文艺） | PREFERENCE | CUSTOMER | S3 风格修饰语 + KB-001/003 | YES（客户原话） | 已被 H2-01 seed 实证 |
| `color_avoidance`（不要艳红 / 偏深色影调） | PREFERENCE | CUSTOMER | seed 语句 + KB-025 | YES | 与生成动作最相关 |
| `retouch_preference`（不过度磨皮/自然质感） | PREFERENCE | CUSTOMER | KB-025 / KB-032 | YES | 售后争议高频源 |
| `budget_preference`（约 4000 / 4000 以内） | PREFERENCE | CUSTOMER | S3 budget 抽取 + RULE-026 | YES（不虚构区间） | 注意与 Lead.budget_* canonical 字段重复风险 |
| `package_interest`（倾向标准款） | FACT | CUSTOMER | KB-003/004 | YES | 一旦成单应由 canonical Project 承接 |
| `location_preference`（茶园/西湖/棚拍） | PREFERENCE | CUSTOMER 或 PROJECT | KB-028 | YES | 跨项目=CUSTOMER；单次方案=PROJECT |
| `timeline_constraint`（下个月 / 生日前） | PREFERENCE | CUSTOMER | S3 日期原文保留 | YES（保留原话） | 落档后由 `Project.scheduled_date` 接管 |
| `companion_arrangement`（带闺蜜/家属同行） | FACT | PROJECT | KB-017 | YES | 影响现场安排 |
| `delivery_preference`（希望优先拿底片预览） | PREFERENCE | PROJECT | KB-024 | YES | |
| `communication_preference`（只在晚间沟通 / 不要频繁触达） | PREFERENCE | CUSTOMER | KB-022 沉默节奏 | YES | 与反骚扰规则耦合 |
| `publication_consent`（不同意成片公开） | FACT | CUSTOMER | KB-031 | YES | 合规关键，建议高优先级 |
| `project_constraint`（外景仅限半天 / 需室内备选） | DECISION | PROJECT | KB-027 | YES | 常由人工审阅确定 |
| `review_decision`（审阅批准/驳回及理由） | DECISION | CUSTOMER/PROJECT | H2-01 既有派生规则 | YES | 已实现 |
| `run_outcome`（某次运行产出 Asset-001） | OUTCOME | PROJECT | H2-01 既有派生规则 | YES | 已实现 |
| `health_sensitivity`（化妆品过敏） | FACT — **RESTRICTED** | CUSTOMER | KB-026 / RULE-020 | YES | **建议**：不进入任何生成上下文；仅供人工与现场执行使用。当前契约没有敏感级字段 → 记为开放问题，不在本任务改 schema |

**明确不建议进入 Memory 的语义**：全店价格/套餐/交付时间窗（=Knowledge）、实时档期（=运营数据）、原始对话记录（契约已声明 Memory 不是 transcript）、推断型画像标签（无确定性抽取规则）。

---

## 9. §5.8 Candidate Synthetic Personas

```
SYNTHETIC — NOT REAL CUSTOMER (all six)
```

基于真实 KB 规则构造，用于 H2-03 Golden Set；不含任何真实身份信息（无姓名、电话、微信、地址）。

| customer_id | scenario | budget | style preference | avoidance | timeline | project constraints |
|---|---|---|---|---|---|---|
| `SP-01 Customer-A` | 首拍单人新中式，价格敏感但重质感 | ≈1500（基础款区间） | 新中式旗袍、深色影调 | 不要过度磨皮 | "下个月" | 室内棚拍；仅半天 |
| `SP-02 Customer-B` | 闺蜜双人，追求氛围与视频交付 | 3500-4000 | 古风汉服、暖调 | 不要艳红 | "这个周末" | 双人；需花絮+电影视频 |
| `SP-03 Customer-C` | 生日纪念日赶档期，愿意升级 | ≈5000（尊享/双人尊享区间） | 清新文艺、自然光 | 不接受重妆 | "生日前两周"（硬约束） | 外景优先（茶园）；雨天需室内备选 |
| `SP-04 Customer-D` | 老客复购，转介绍来源 | 2500 上下 | 沿用上次旗袍方向，想试自然感 | 不重复上次场景 | "秋季枫叶季" | 老客福利适用；同行朋友一人 |
| `SP-05 Customer-E` | 高敏感需求（健康+隐私） | 未表述（null） | 未表述（null） | 化妆品过敏（RESTRICTED）；成片不公开 | 未表述（null） | 需人工确认妆造；发布需显式授权 |
| `SP-06 Customer-F` | 超出知识库范围的诉求 | 800（远低于最低套餐） | 未表述（null） | — | "明天" | 询问学生优惠（KB 未录入）→ 应触发"未录入 + 转人工" |

设计意图：`SP-01/02` 覆盖主流；`SP-03` 覆盖硬时间约束；`SP-04` 覆盖跨项目 Memory 复用；`SP-05` 覆盖 RESTRICTED 与 redaction；`SP-06` 覆盖知识缺口与 fail-closed。所有"未表述"字段一律 `null`（遵循仓库约定：未知不猜）。

---

## 10. §5.9 Golden Set Candidate Scenarios (candidates only — nothing implemented)

`Today evaluable?` = 用**现有** BUSOS 能力（`assembleMemoryContext` / `MemoryService` / `runCreativeProjectAction` / trace / review）能否确定性判定。

| ID | 方向 | Scenario | Expected (deterministic) | Today evaluable? |
|---|---|---|---|---|
| GS-01 | Correct Memory Use | `SP-01` 有 ACTIVE 深色影调偏好，对其 Project 触发 Generate Visual Reference | 上下文含该 memory_id；`memory_context_used=true`；`memory_count=1` | YES |
| GS-02 | Correct Memory Use | `SP-04` 同时有 CUSTOMER 偏好与 PROJECT 决策 | 两条都在上下文，且按契约的确定性排序 | YES |
| GS-03 | Irrelevant Memory Exclusion | 同一客户在**另一个** Project 上的 PROJECT 级记忆 | 不进入当前 Project 上下文 | YES |
| GS-04 | Scope Isolation | Customer-A 与 Customer-B 各有偏好，对 A 的项目取上下文 | 仅 A 的记忆；B 的一条都不出现 | YES |
| GS-05 | Scope Isolation | 项目无 `customer_id`（匿名线索转化） | 仅 PROJECT 级记忆；不回退到任意客户 | YES |
| GS-06 | ACTIVE / INACTIVE | 偏好被 SUPERSEDE（旧"偏艳色"→新"偏深色"） | 仅新版本进入；旧版本可审计但不参与 | YES |
| GS-07 | ACTIVE / INACTIVE | 记忆被 INVALIDATED（客户改口） | 不进入上下文；`invalidation_reason` 保留 | YES |
| GS-08 | Provenance | 记录的 `source_ref` 非规范引用 | fail-closed 抛 `ContractValidationError`，消费方 FAILED，零写入 | YES |
| GS-09 | Provenance | `evidence_refs` 为空 | 写入阶段即拒绝 | YES |
| GS-10 | Redaction | content 内含 `api_key=...` / `password=...` | 进入上下文前被替换为 `[REDACTED]`；trace 中无原值 | YES |
| GS-11 | Redaction | RESTRICTED 语义（过敏）被写入 | **期望需 Owner 定义**：当前无敏感级字段 → 候选期望为"不得进入生成上下文" | NO（需先决策） |
| GS-12 | Bounded Context | 25 条 ACTIVE 记忆（超 `maxRecords=20`） | 截断为 20 条、`truncated=true`、排序确定性一致 | YES |
| GS-13 | Bounded Context | 单条 content 超 500 字 / 合计超 4000 字 | 按契约裁剪并置 `truncated` | YES |
| GS-14 | No Memory | 项目零 ACTIVE 记忆 | `count=0`，动作正常执行（不报错、不编造） | YES |
| GS-15 | Conflict | 同一主题两条 ACTIVE 且互斥（"偏深色" vs "偏明亮"） | **期望需 Owner 定义**（当前无冲突解析规则）：候选 = 两条都进上下文 + 标记冲突供人工 | NO（需先决策） |
| GS-16 | Knowledge + Memory | 客户偏好深色 + 全店交付承诺 2-3 周 | 偏好来自 Memory；交付时间**不得**出现在 Memory；两者不混淆 | PARTIAL（Memory 侧可判；Knowledge 侧当前无实现） |
| GS-17 | Knowledge + Memory | 客户问"我这个套餐几张精修" | 应由 Knowledge 回答（KB-003），不得由 Memory 编造 | NO（BUSOS 无知识层） |
| GS-18 | Governance | 低置信度候选（<0.6）走审阅 → 审阅决定派生 DECISION 记忆 | 派生记忆带 `REVIEW_CASE` evidence；决策可追溯 | YES |
| GS-19 | Idempotency | 同一幂等键重放已消费上下文的动作 | 相同上下文摘要；零新增 Task/Asset | YES |
| GS-20 | Trace Safety | 任意上述用例执行后检查 trace | 仅 allowlist 键（`memory_context_used/count/refs/types/truncated`）；无 content/prompt/asset uri/secret | YES |
| GS-21 | Knowledge Conflict | 真实 KB 中"定金有效期"三种表述（RULE-004） | **期望需 Owner 裁定唯一口径**后才能成为金标准 | NO（业务判断） |
| GS-22 | Knowledge Gap | 询问"学生优惠"（KB 明确未录入） | 应"如实未录入 + 转人工"，不得编造 | NO（BUSOS 无知识层） |

**统计：22 个候选场景；其中 16 个用今天的 BUSOS 能力即可确定性评测，6 个需要 Owner 先做业务/边界决策。**

---

## 11. §6 Critical Analysis — Knowledge Base / RAG vs Memory

### 11.1 职责划分（建议口径）

```
Knowledge  = "工作室知道什么"
             稳定、面向所有客户、由工作室维护、版本化、有生效范围
             例：套餐价格、交付时间窗、改期政策、外景地属性、兜底与转人工规则

Memory     = "系统关于这个客户 / 这个项目记住了什么"
             锚定到 canonical Customer / Project、带 provenance、有生命周期、可被取代或失效
             例：客户偏好深色影调、客户不要过度磨皮、项目采用茶园方案、某次运行产出了资产
```

两者的可判定分界线（可直接作为评测断言）：
1. **主语测试** —— 句子的主语是"工作室/所有客户"⇒ Knowledge；是"这位客户/这个项目"⇒ Memory。
2. **变更源测试** —— 由工作室改价/改政策才会变 ⇒ Knowledge；由客户说了新的话或人工做了新决定才会变 ⇒ Memory。
3. **重复真相测试** —— 如果 canonical 记录（`Project.scheduled_date`、`Lead.budget_max`）已经是权威，就**不要**再写一条 Memory 复制它。

### 11.2 当前代码的实际状况（事实核查）

| 编号 | 发现 | 证据 | 性质 |
|---|---|---|---|
| **F-01** | **BUSOS 完全没有知识层**。仓库内零 RAG / 向量 / 检索实现；工作室知识只存在于外部 Service Agent（`vector_store/` + `data/embedding_model`）。BUSOS 也没有飞书 wiki/doc 读取能力 | 全仓 grep 仅命中"我们故意没有这些"的注释；`business-repository` 只有 Bitable 记录 API | **缺层**，不是混用 |
| **F-02** | **Memory 目前不影响生成结果**。`runCreativeProjectAction` 只把**无内容**的 `MemoryContextSummary`（count/types/refs/truncated）传给 `executeCreativeProduction`，`prompt` 原样透传给 Lumen | `packages/creative-production/src/execute.ts` 仅回显 `governedContext`；H2-02 报告明写"observability-only, NOT in prompt" | 诚实边界。**对 H2-03 至关重要**：今天只能评测"上下文装配是否正确"，不能评测"输出是否体现偏好" |
| **F-03** | **类别漂移风险**：`memory_type='FACT'` 的 `content` 是自由文本，契约无法阻止有人把"基础款 1499"（Knowledge）写成 Memory | `memory-record.ts` 只约束长度与生命周期 | 真实风险 → 建议用**评测断言**兜住（如"Memory 不得含全店价格陈述"），不改契约 |
| **F-04** | **知识即代码的漂移风险**：服务类型词表（26 词）、预算线索词、日期模式硬编码在 `extract.ts`；套餐/价格在 KB。两者各自演进，无一致性检查 | `extract.ts` vs S1 `pricing` | 报告，不改 |
| **F-05** | **真实知识内部冲突**：定金有效期 3 个月 / 永久 / 一年（RULE-004、KB-006） | S1 三个文档 | 业务数据缺陷，须 Owner 裁定，不可由工程猜 |
| **F-06** | **KB 缺受众字段**：内部销售战术（催定金、催尾款 D+7 最后通牒、异议话术）与客户可见内容混在同一知识库，无 `audience` 标记 | S1 `sales_strategy` / `payment_collection` vs `faq` | 若将来引入检索层，必须先做受众隔离，否则存在"把催收话术念给客户"的真实风险 |
| **F-07** | **KB 缺有效期字段**：季节主题、满四赠一等有时效内容与长期政策同构存储 | S1 `seasonal_marketing` | 报告 |
| **F-08** | 演示/夹具数据含形似真人的中文姓名与占位手机号（`packages/workspace-read/src/seed.ts`、`packages/memory/src/seed.ts`） | 直接阅读 | 非真实客户，但对外演示时建议改用 `Customer-A/B` 别名（**未修改**，仅建议） |

**结论**：BUSOS 当前没有把 Knowledge 和 Memory *混用*——因为它只实现了 Memory 一侧，而且刻意保持"不是 RAG 平台"。真正的风险在两处：(a) 缺少知识层导致业务事实以硬编码词表/阈值形式散落在代码里（F-01/F-04）；(b) 一旦有人开始把全店事实写进 Memory content，契约不会拦（F-03）。两者都**只在此报告，不在本任务修改任何生产代码**。

---

## 12. §7 H2-03 Recommendation (narrow)

```
建议标题：BUSOS-R2-H2-03 — Golden Set + Minimal Memory Evaluation
形态：15 Core Golden Cases + deterministic evaluator first + minimal read-only demo surface
```

### 12.1 建议的 15 条核心用例（全部取自 §10，且今天即可确定性评测）

| # | 取自 | 主题 |
|---|---|---|
| 1 | GS-01 | 正确使用客户偏好（上下文命中） |
| 2 | GS-02 | CUSTOMER + PROJECT 记忆同时装配、排序确定 |
| 3 | GS-03 | 无关（他项目）记忆被排除 |
| 4 | GS-04 | 跨客户隔离（A 不见 B） |
| 5 | GS-05 | 无 customer 的项目不回退取任意客户记忆 |
| 6 | GS-06 | SUPERSEDED 不参与 |
| 7 | GS-07 | INVALIDATED 不参与 |
| 8 | GS-08 | 非规范 provenance → fail-closed |
| 9 | GS-09 | 空 evidence → 写入即拒 |
| 10 | GS-10 | secret 内容被 redact |
| 11 | GS-12 | 超量记忆按确定性规则截断 |
| 12 | GS-14 | 零记忆时优雅降级 |
| 13 | GS-18 | 审阅决策派生记忆可追溯 |
| 14 | GS-19 | 幂等重放上下文一致、零新增写入 |
| 15 | GS-20 | trace 只含 allowlist 引用 |

### 12.2 建议的最小实现形态

- **一个新包**（只读，纯确定性）：`packages/memory-evaluation`（或 `@busos/golden-set`），只依赖 `@busos/contracts` + `@busos/memory`（+ 现有 orchestrator 端口用于集成用例）。
- **金标准数据为静态 fixture**：`packages/memory-evaluation/fixtures/golden-set.v0.json` —— 全 synthetic（§9 personas），带 `expected` 字段；**零真实客户数据**。
- **evaluator = 确定性断言**：每条用例产出 `PASS / FAIL / NOT_EVALUABLE` + 原因；无 LLM 评委、无相似度、无打分模型。
- **最小可见面**：Operator Workspace 增加**一个只读区块**"Evaluation"，显示 `15 cases · N PASS · M FAIL`，点开看单条用例的期望/实际（仍不含 content/secret）。不新增导航层级、不新增编辑器、不新增仪表盘。
- **CI**：作为普通 vitest 套件跑，遵循每包 `vitest.config.ts` 钉 `root` + `include` 的既有约定。
- **门禁**：沿用 A..J 命名（A 权威/范围、B 确定性、C 隔离、D 生命周期、E provenance、F 边界与脱敏、G 真实消费方集成、H trace 安全、I 幂等回归、J 全量回归与 bundle 扫描）。

### 12.3 明确不建议（一开始就不要做）

通用 Eval SaaS、ML observability 平台、标注平台、向量库 / embedding pipeline、分布式评测基础设施、LLM-as-judge、第二个数据库、把 Memory 塞进 prompt 以"让评测有东西可评"。

### 12.4 前置条件（Owner 决策后才能扩到 15 条以外）

`GS-11`（RESTRICTED 敏感信息期望）、`GS-15`（冲突记忆策略）、`GS-21`（定金有效期唯一口径）、`GS-17/GS-22`（是否要引入知识层）——这四项需要业务判断，**不属于工程可自行决定的范围**。

---

## 13. §8 Product Demo Recommendation

### DEMO-1 — Memory 驱动的 Generate Visual Reference

- **User story**：作为工作室运营，我打开一个进行中的项目，点"生成视觉参考"，系统自动带上这位客户已被治理的偏好。
- **Input**：Project-001（Customer-A，含 1 条 ACTIVE 深色影调偏好）+ 一句创作提示。
- **System behavior**：幂等守卫 → `assembleMemoryContext(project, customer)` → ACTIVE-only、scoped、provenance 校验、确定性排序、边界裁剪 → 以**无内容摘要**形式随动作下传 → 运行留痕。
- **Visible UI result**：GVR 面板显示"Context: 1 governed memories will be used"，结果区显示"Memory context: 1 record(s)"，运行详情可看到 `memory_refs`。
- **Interview talking point**：记忆不是往 prompt 里塞历史对话，而是一条**有锚点、有出处、有生命周期、有上限**的受治理输入；今天它是可观测的、可审计的，而且**故意还没有**去改写 prompt——这条边界是显式设计，不是遗漏。

### DEMO-2 — 错误客户的记忆被隔离

- **User story**：我担心 AI 把别的客户的偏好用到这一单上。
- **Input**：两位客户各有偏好；对 Customer-A 的项目发起动作。
- **System behavior**：`listForContext` 按 project + 其 customer 分区读取；跨客户/跨项目记录不可能进入。
- **Visible UI result**：上下文计数为 1 而非 2；运行详情里的 `memory_refs` 只含 A 的记忆 id。
- **Interview talking point**："scope 等于 anchor" 是写在契约里的**不变量**（`scope !== subject_type` 直接校验失败），不是靠查询语句的自觉。

### DEMO-3 — Knowledge + Memory 协同（含诚实缺口）

- **User story**：客户问"我这个套餐几张精修"，同时我要按他的偏好出参考图。
- **Input**：全店套餐事实（KB-003）+ 客户个体偏好（Memory）。
- **System behavior**：偏好走 Memory 通道；套餐事实**当前不在 BUSOS 内**（F-01）——演示时明确指出这是下一层要补的知识层。
- **Visible UI result**：项目上下文区能看到偏好；套餐事实标注为"来自工作室知识库（尚未接入）"。
- **Interview talking point**：能清楚说出"哪一半已经做了、哪一半还没做、为什么这样分层"，比演示一个什么都能答但无法解释的黑盒更可信。

### DEMO-4 — Human Review 作为记忆的来源

- **User story**：低置信度线索需要人过一眼，人的决定要能留下来。
- **Input**：`intent.confidence < 0.6` 的候选（RULE-025）。
- **System behavior**：治理降级为 `REVIEW_REQUIRED` → 审阅（仅 8 个 allowlist 字段可改）→ 决策派生 `DECISION` 记忆，evidence 指向 review case。
- **Visible UI result**：Reviews 列表 → 决策 → 项目上下文中出现一条带 `REVIEW_CASE` 出处的记忆。
- **Interview talking point**：系统里唯一能创造"权威新知识"的入口是**人**；AI 只做确定性抽取与提议。

### DEMO-5 — Run / Trace / Evaluation 的可解释性

- **User story**：我要能回答"这次运行到底用了什么、没用什么"。
- **Input**：任意一次 GVR 运行。
- **System behavior**：trace 仅记录 allowlist 键；content / prompt / 资产 URI / 凭据一律不入 trace；未来 Evaluation 面把同一批用例的 PASS/FAIL 摊开。
- **Visible UI result**：运行详情页 + （H2-03 后）Evaluation 区块 `15 cases · N PASS`。
- **Interview talking point**：可观测性的重点不是"记得多"，而是"**记得刚好够审计、且绝不记录不该记的东西**"——allowlist 而非 blocklist。

---

## 14. §9 Learning Map（概念 → 实现位置 → 阅读顺序）

| # | Topic | Relevant BUSOS files / modules | 说明 |
|---|---|---|---|
| 1 | **Contracts as the spine** | `packages/contracts/src/{common,domain,lead-candidate,governance-result,commit-result,memory-record}.ts`；`contracts/*.schema.json` | 先读这里：所有边界都由契约定义 |
| 2 | **Governance** | `packages/golden-path/src/governance.ts`；`contracts` 的 `GOVERNANCE_ISSUE_CODES`；`packages/project-lifecycle/src/eligibility.ts`；`packages/creative-production/src/eligibility.ts` | 确定性放行/拒绝/升级人工 |
| 3 | **Workflow / Orchestration** | `packages/orchestrator/src/{run-business-process,run-creative-project-action,process-contract,process-registry}.ts` | 幂等键、进程注册、单一窄入口 |
| 4 | **Memory（写入与生命周期）** | `packages/memory/src/{memory-service,memory-repository,id,seed}.ts` + `packages/contracts/src/memory-record.ts` | CREATE/READ/SUPERSEDE/INVALIDATE，无删除；结构化幂等 id |
| 5 | **Context Engineering** | `packages/memory/src/memory-context.ts`（`assembleMemoryContext`、`DEFAULT_MEMORY_CONTEXT_LIMITS`、`redactSecretContent`、`validateProvenance`、`toMemoryContextSummary`） | 本仓库最值得精读的一个文件：确定性排序 + 边界 + 脱敏 + fail-closed |
| 6 | **Memory 的消费侧** | `packages/orchestrator/src/run-creative-project-action.ts`；`packages/creative-production/src/{types,execute}.ts` | 看清"摘要下传、prompt 不被污染"的边界（F-02） |
| 7 | **Human Review** | `packages/human-review/src/{review-service,allowlist,store,types}.ts`；`packages/workspace-review/src/*` | allowlist 编辑 + 决策留痕 |
| 8 | **Trace / Observability** | `packages/orchestrator/src/trace.ts`（allowlist + sanitize）；`packages/workspace-run/src/{workspace-run-service,map}.ts` | allowlist 优先于 blocklist 的取舍 |
| 9 | **Repository / Adapter 边界** | `packages/business-repository/src/{business-repository,mapping,feishu-adapter,feishu-adapter-fake,verify}.ts` | 写后回读校验；Fake/Real 双实现 |
| 10 | **AI 供应侧（真实生成）** | `packages/lumen-adapter/src/{types,fake-lumen-adapter,real-lumen-adapter,create-from-env}.ts` | 凭据只在服务端，浏览器包不得含密 |
| 11 | **跨语言边界 / 意图** | `packages/service-agent-candidate/src/{consultation-context,extract,candidate-builder}.ts`；`bridge/service_agent_context.py` | 真实意图枚举 I00–I12 与"知识即代码"的词表 |
| 12 | **产品面** | `apps/operator-workspace/src/{main,ui,api,action,overview-model}.ts`；`server/*`；`smoke-*.mjs` | DEMO / CONNECTED 两种模式的诚实分离 |
| 13 | **RAG（当前状态：不存在于 BUSOS）** | 无实现；外部 `Catcherog/service-agent` 的 `knowledge_base/` + `vector_store/` | 学习点：本项目**故意**先做 Memory 与治理，不先做向量检索 |
| 14 | **Evaluation（当前状态：不存在）** | 现有确定性测试是雏形：`packages/memory/tests/memory-context.test.ts`、`packages/orchestrator/tests/creative-action-memory.test.ts`、`packages/creative-production/tests/governed-context.test.ts` | H2-03 的起点就在这三个文件里 |
| 15 | **治理与验收协议** | `project-control/R2-VERIFICATION-AND-AUDIT-PROTOCOL.md`、`R2-AUDIT-INDEX.md`、`R2-ACCEPTANCE-CHECKLIST.md`、`08-WORKBUDDY-OPERATING-RULES.md` | 工程之外的另一半：怎么证明"真的做完了" |

**推荐阅读顺序**：1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 →（13/14 作为"缺什么"的对照）→ 15。

---

## 15. Privacy / Redaction record

| 检查项 | 结果 |
|---|---|
| 真实客户姓名 / 电话 / 微信 / email / 地址 / 证件 | **NONE**（本文件不含任何客户身份信息；仓库夹具中的形似姓名与占位手机号未被复制，见 F-08） |
| 飞书 wiki_token / doc_token / app_token | **REDACTED**（存在于外部 KB 索引中，故意未抄录） |
| access token / auth password / api key / secret | **NONE** |
| asset private URI | **NONE**（`lumen://` / `feishu-drive://` 具体 token 未出现） |
| 工作室品牌名 | 匿名化为 `Studio-A`；客服人格名匿名化为 `Agent-CS` |
| 保留的商业语义 | 套餐/价格/流程/交付/场地/规则等**工作室自有业务事实**保留（这是本快照的价值所在），门店街道级地址本就是占位符 |
| 真实客户业务数据写入 | **NONE**（未创建、未修改任何真实记录） |
| 飞书知识库内容改动 | **NONE**（只读打开，零写入） |

---

## 16. Deliverable & audit trail

| 项 | 值 |
|---|---|
| 文档路径 | `project-control/BUSOS-KB-SNAPSHOT-v0.1.md`（仓库当前**没有** `project-control/AUDITS/`，按指令沿用既有控制文档位置，未新建目录体系） |
| 索引登记 | `project-control/R2-AUDIT-INDEX.md` 追加一行（审计索引文件本身，属本任务变更集） |
| Baseline SHA | `44c8c06bc6e8adac86838e760011c8caaae4ed84` |
| Final remote SHA | 见完成报告（push 后 `git ls-remote` 实测填写） |
| Engineering / Demo / Connected / Live | `NOT APPLICABLE`（本任务不含产品或代码变更） |
| Owner acceptance | `PENDING` |

---

## 17. Open questions (need Owner business judgment)

1. **定金有效期到底是哪一个？** 真实 KB 三处互斥（3 个月 / 永久 / 一年）。这是对外承诺，工程无法裁定。裁定后才可作为金标准答案（RULE-004 / KB-006 / GS-21）。
2. **敏感个体信息（如化妆品过敏）如何处理？** 建议不进入任何生成上下文、仅供人工与现场使用。是否需要在契约里引入敏感级标记（会改 schema，需单独授权）？（GS-11 / §8 `health_sensitivity`）
3. **互相冲突的 ACTIVE 记忆怎么办？** 全部呈现并标记冲突交人工？还是按 `updated_at` 取新？还是直接 fail-closed？当前无规则（GS-15）。
4. **是否要在 BUSOS 内建知识层？** 若要，最小形态是什么（只读同步一份分类知识 + 精确匹配，还是继续把知识留在外部 Service Agent）？（F-01 / GS-17 / GS-22）
5. **知识库是否需要 `audience` 与 `valid_until` 字段？** 内部催收话术与客户可见 FAQ 目前同库无标记（F-06 / F-07）。
6. **飞书 KB 自 2026-06-26 同步以来是否已有变更？** 本快照描述的是该同步时点的状态。
7. **演示夹具是否改用 `Customer-A/B` 别名？** 当前夹具含形似真人姓名与占位手机号（F-08）。属产品/演示口径决策，未擅自修改。

---

## 18. STOP

```
BUSOS-KB-SNAPSHOT v0.1 = COMPLETE (documentation only)
H2-03 implementation   = NOT STARTED / NOT AUTHORIZED
Evaluation runner      = NOT CREATED
Memory runtime         = UNTOUCHED
Lumen / Creative / Orchestrator / Operator Workspace = UNTOUCHED
Feishu knowledge base  = UNTOUCHED (read-only)
BL-018                 = OPEN (untouched)
```

等待 Owner 显式授权后方可进入下一步。
