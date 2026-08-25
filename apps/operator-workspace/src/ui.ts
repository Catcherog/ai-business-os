import type {
  Project,
  Customer,
  Task,
  Asset,
} from '@busos/contracts';
import type { ProjectWorkspace } from '@busos/workspace-read';
import type {
  ReviewCase,
  ReviewState,
  ReviewOutcome,
  EditPatch,
} from '@busos/workspace-review';
import type {
  RunDetail,
  RunSummary,
  RunOutcomeView,
  RunStageView,
} from '@busos/workspace-run';
import type { BusinessProcessResult } from '@busos/orchestrator';
import type { MemoryRecordV1 } from '@busos/contracts';
import { getDataSource, getMemoryService } from './api.js';
import { runGenerateVisualReference } from './action.js';
import { buildOverview, type OverviewModel } from './overview-model.js';
import {
  NAVIGATION,
  createRouter,
  isNavigationActive,
  type Route,
} from './router.js';
import { renderRuntimeIdentity } from './runtime-identity.js';
import {
  unwrapWorkspaceEnvelope,
  type WorkspaceDataSource,
} from './workspace-data-source.js';
import { createServiceAgentFeature } from './features/service-agent/index.js';
import { serviceAgentConversationMarkup, createCandidateReviewAction } from './features/service-agent/index.js';
import { createDemoServiceAgentClient } from './demo/service-agent-demo.js';
import { createBusinessDataFeature } from './features/business-data/index.js';
import { createDemoBusinessDataClient } from './demo/business-data-demo.js';
import { createOperationsFeature, createDemoOperationsClient } from './features/operations/index.js';
import { renderBusinessDataView } from './business-data-view.js';
import { renderSchedulingView } from './scheduling-view.js';
import { createEvaluationFeature } from './features/evaluation/evaluation-view.js';
import { createDemoEvaluationReportClient } from './demo/evaluation-demo.js';

type View = Route['name'];

let svc: WorkspaceDataSource;
let activeRoute: Route = { name: 'overview' };
let active: View = activeRoute.name;
let selectedProjectId: string | null = null;
let selectedReviewId: string | null = null;
let selectedRunId: string | null = null;
let selectedCustomerId: string | null = null;
let selectedOrderId: string | null = null;

// BUSOS-R2-BATCH1-PRODUCT-INTEGRATION-CORR-01 — lazy feature holders. Constructed
// on first use (after initWorkspace resolves) so the DEMO data channels can
// safely read the shared registry / seeded dataset.
let serviceAgentFeatureRef: ReturnType<typeof createServiceAgentFeature> | null = null;
function serviceAgentFeature(): ReturnType<typeof createServiceAgentFeature> {
  return (serviceAgentFeatureRef ??= createServiceAgentFeature(createDemoServiceAgentClient()));
}
let businessDataFeatureRef: ReturnType<typeof createBusinessDataFeature> | null = null;
function businessDataFeature(): ReturnType<typeof createBusinessDataFeature> {
  return (businessDataFeatureRef ??= createBusinessDataFeature(createDemoBusinessDataClient()));
}
let evaluationFeatureRef: ReturnType<typeof createEvaluationFeature> | null = null;
function evaluationFeature(): ReturnType<typeof createEvaluationFeature> {
  return (evaluationFeatureRef ??= createEvaluationFeature(createDemoEvaluationReportClient()));
}
let operationsFeatureRef: ReturnType<typeof createOperationsFeature> | null = null;
function operationsFeature(): ReturnType<typeof createOperationsFeature> {
  // Default DEMO channel (in-memory, deterministic) for a populated, clickable
  // preview. The CONNECTED client (createOperationsClient) is the production path
  // and is exercised by the server-side endpoint tests; the UI default mirrors
  // the other surfaces (business-data/evaluation/service-agent) in this app.
  return (operationsFeatureRef ??= createOperationsFeature(createDemoOperationsClient().client));
}
let appReady = false;
const router = createRouter();

async function readWorkspace<T>(
  request: Promise<import('./workspace-data-source.js').WorkspaceEnvelope<T>>,
): Promise<T> {
  return unwrapWorkspaceEnvelope(await request);
}

/* ----------------------------- tiny DOM helper ---------------------------- */
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

function pill(status: string): HTMLElement {
  return h('span', { class: `pill pill-${status}` }, [status]);
}

function esc(s: string | null | undefined): string {
  return (s ?? '—').toString();
}

const REVIEW_STATE_LABEL: Record<ReviewState, string> = {
  PENDING_REVIEW: '待审阅',
  APPROVED: '已通过',
  COMMITTED: '已提交',
  REJECTED: '已拒绝',
  FAILED: '已失败',
};

function reviewStatePill(state: ReviewState): HTMLElement {
  return h('span', { class: `pill pill-${state}` }, [REVIEW_STATE_LABEL[state]]);
}

const RUN_STATUS_LABEL: Record<string, string> = {
  RUNNING: '运行中',
  SUCCEEDED: '成功',
  FAILED: '系统失败',
  REJECTED: '业务拒绝',
  HUMAN_REQUIRED: '需人工决策',
};

const STAGE_STATUS_LABEL: Record<string, string> = {
  completed: '已完成',
  current: '进行中',
  not_reached: '未到达',
  failed: '失败',
  rejected: '业务拒绝',
  human_required: '需人工决策',
};

function runStatusPill(status: string): HTMLElement {
  return h('span', { class: `pill pill-${status}` }, [RUN_STATUS_LABEL[status] ?? status]);
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

function fmtMeta(meta: Record<string, unknown> | undefined): string {
  if (!meta || Object.keys(meta).length === 0) return '—';
  return Object.entries(meta)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join('   ');
}

/* --------------------------------- states -------------------------------- */
function loading(msg: string): HTMLElement {
  return h('div', { class: 'state' }, [
    h('div', { class: 'spinner' }),
    h('div', {}, [msg]),
  ]);
}
function empty(msg: string): HTMLElement {
  return h('div', { class: 'state' }, [msg]);
}
function placeholder(title: string, body: string): HTMLElement {
  return h('div', { class: 'placeholder-hero' }, [
    h('div', { class: 'big' }, ['🚧']),
    h('h1', {}, [title]),
    h('p', {}, [body]),
  ]);
}

/* --------------------------------- nav ----------------------------------- */
function renderNav(): HTMLElement {
  const nav = h('nav', { class: 'nav', id: 'nav', 'aria-label': 'Primary' });
  for (const item of NAVIGATION) {
    const isActive = isNavigationActive(activeRoute, item.id);
    const btn = h('button', {
      class: `nav-item${isActive ? ' active' : ''}`,
      'data-view': item.id,
      type: 'button',
      'aria-current': isActive ? 'page' : 'false',
    }, [h('span', {}, [item.label])]);
    if (item.tag) btn.append(h('span', { class: 'tag' }, [item.tag]));
    btn.addEventListener('click', () => navigate(item.id));
    nav.append(btn);
  }
  return nav;
}

/* ------------------------------- views ----------------------------------- */
function kpiGrid(cards: { label: string; value: string; sub: string }[]): HTMLElement {
  const grid = h('div', { class: 'kpi-grid' });
  for (const c of cards) {
    grid.append(h('div', { class: 'kpi' }, [
      h('div', { class: 'kpi-value' }, [c.value]),
      h('div', { class: 'kpi-label' }, [c.label]),
      h('div', { class: 'kpi-sub' }, [c.sub]),
    ]));
  }
  return grid;
}

function statusSummary(counts: Record<string, number>): string {
  const parts = Object.entries(counts).map(([k, v]) => `${v} ${k}`);
  return parts.length ? parts.join(' · ') : '—';
}

function overviewSection(title: string, content: HTMLElement): HTMLElement {
  return h('div', { class: 'section overview-section' }, [h('h2', {}, [title]), content]);
}

function activityList(items: OverviewModel['recentActivity']): HTMLElement {
  const list = h('div', { class: 'activity' });
  if (!items.length) return h('p', { class: 'muted' }, ['（无）']);
  for (const it of items) {
    const row = h('div', { class: 'activity-row', role: 'button', tabindex: '0' }, [
      h('span', { class: `dot dot-${it.kind}` }),
      h('div', { class: 'activity-main' }, [
        h('div', { class: 'title' }, [esc(it.label)]),
        h('div', { class: 'sub muted' }, [it.sub]),
      ]),
      h('span', { class: 'muted' }, [it.at]),
    ]);
    const go = () => navigate(it.kind === 'project' ? 'project-detail' : it.kind === 'run' ? 'run-detail' : 'review-detail', it.id);
    row.addEventListener('click', go);
    row.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') go();
    });
    list.append(row);
  }
  return list;
}

async function viewOverview(): Promise<HTMLElement> {
  const wrap = h('div', {});
  wrap.append(
    h('div', { class: 'view-head' }, [
      h('h1', {}, ['Operator Workspace']),
      h('p', {}, ['AI Business OS · 运营工作台 · 演示数据（in-memory）']),
    ]),
  );
  const body = h('div', { class: 'overview-body' });
  wrap.append(body);
  body.append(loading('正在加载概览…'));

  try {
    const m = await buildOverview(
      {
        listProjects: async () => (await readWorkspace(svc.listProjects())).map((workspace) => workspace.project),
      },
      { listReviews: () => readWorkspace(svc.listReviews()) },
      { listRuns: () => readWorkspace(svc.listRuns()) },
    );
    body.replaceChildren();

    if (m.projects.length === 0 && m.runs.length === 0 && m.reviews.length === 0) {
      body.append(empty('工作区暂无数据。'));
      return wrap;
    }

    // KPI cards — real counts from the existing read surfaces.
    body.append(kpiGrid([
      { label: 'Projects', value: String(m.projects.length), sub: statusSummary(m.projectStatusCounts) },
      { label: '待审阅', value: String(m.pendingReviews.length), sub: m.pendingReviews.length ? '需人工处理' : '全部已处理' },
      { label: 'Runs', value: String(m.runs.length), sub: statusSummary(m.runStatusCounts) },
      { label: '最近活动', value: String(m.recentActivity.length), sub: '跨三个业务面' },
    ]));

    // R2-BATCH1-CORR-01 — entry points to the newly wired product surfaces.
    body.append(overviewSection('新增产品面（Product Integration）', (() => {
      const list = h('div', { class: 'capability-cards' });
      const cards = [
        { id: 'service-agent' as const, title: 'Service Agent', desc: '客服对话智能体 · DEMO 推理' },
        { id: 'business-data' as const, title: 'Business Data', desc: '客户 / Lead / 项目 连接态' },
        { id: 'evaluation' as const, title: 'Evaluation', desc: 'Golden Set 确定性回归' },
      ];
      for (const card of cards) {
        const btn = h('button', { class: 'btn capability-card', type: 'button' }, [
          h('span', { class: 'capability-title' }, [card.title]),
          h('span', { class: 'capability-desc muted' }, [card.desc]),
        ]);
        btn.addEventListener('click', () => navigate(card.id));
        list.append(btn);
      }
      return list;
    })()));

    // Project status breakdown.
    body.append(overviewSection('项目状态', (() => {
      const list = h('div', { class: 'status-list' });
      const entries = Object.entries(m.projectStatusCounts);
      if (!entries.length) return h('p', { class: 'muted' }, ['（无）']);
      for (const [status, n] of entries) {
        list.append(h('div', { class: 'status-row' }, [pill(status), h('span', { class: 'muted' }, [`${n} 个`])]));
      }
      return list;
    })()));

    // Needs attention — pending reviews (clickable → review detail).
    if (m.pendingReviews.length) {
      const list = h('div', { class: 'card link-list' });
      for (const rc of m.pendingReviews) list.append(reviewRow(rc));
      body.append(overviewSection('需要你处理 · 待审阅', list));
    }

    // Recent runs (clickable → run detail).
    if (m.runs.length) {
      const list = h('div', { class: 'card run-list' });
      for (const r of m.runs.slice(0, 5)) list.append(runRow(r));
      body.append(overviewSection('最近运行', list));
    }

    // Recent cross-surface activity feed.
    if (m.recentActivity.length) {
      body.append(overviewSection('最近活动', activityList(m.recentActivity)));
    }
  } catch (err) {
    body.replaceChildren();
    body.append(empty(`加载失败：${(err as Error).message}`));
  }
  return wrap;
}

async function viewProjects(): Promise<HTMLElement> {
  const wrap = h('div', {});
  wrap.append(
    h('div', { class: 'view-head' }, [
      h('h1', {}, ['Projects']),
      h('p', {}, ['规范化的项目列表（按最近更新排序）· 只读']),
    ]),
  );
  const list = h('div', { class: 'card project-list' });
  wrap.append(list);
  list.append(loading('正在加载项目…'));

  try {
    const workspaces = await readWorkspace(svc.listProjects());
    const projects = workspaces.map((workspace) => workspace.project);
    list.replaceChildren();
    if (projects.length === 0) {
      list.append(empty('暂无项目。'));
      return wrap;
    }
    for (const p of projects) list.append(projectRow(p));
  } catch (err) {
    list.replaceChildren();
    list.append(empty(`加载失败：${(err as Error).message}`));
  }
  return wrap;
}

function projectRow(p: Project): HTMLElement {
  const row = h('div', { class: 'project-row', role: 'button', tabindex: '0' }, [
    h('div', {}, [
      h('div', { class: 'title' }, [esc(p.title)]),
      h('div', { class: 'sub' }, [`${esc(p.project_type)} · ${esc(p.customer_id)}`]),
    ]),
    h('div', { style: 'display:flex;gap:8px;align-items:center' }, [
      pill(p.status),
    ]),
  ]);
  const go = () => navigate('project-detail', p.project_id);
  row.addEventListener('click', go);
  row.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') go();
  });
  return row;
}

/* ------------------- Generate Visual Reference (H1-04) -------------------- */
const GVR_MAX_BYTES = 5 * 1024 * 1024;
const GVR_ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'];

/** Stable de-duplication key for one (Project + prompt + image) intent. */
function stableGvrKey(projectId: string, prompt: string, base64: string): string {
  let hash = 5381;
  const s = `gvr|${projectId}|${prompt}|${base64.length}`;
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) + hash + s.charCodeAt(i)) | 0;
  return `gvr_${projectId}_${(hash >>> 0).toString(36)}`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : '');
    fr.onerror = () => reject(new Error('读取文件失败'));
    fr.readAsDataURL(file);
  });
}

/** Render the H1-04 action form inside a project-detail section. */
function gvrPanel(
  projectId: string,
  customerId?: string | null,
  onSuccess?: () => Promise<void> | void,
): HTMLElement {
  const promptEl = h('textarea', {
    class: 'gvr-prompt', rows: '3',
    placeholder: '描述你想要的视觉调整，例如：把背景换成蓝色调',
  });
  const fileEl = h('input', {
    class: 'gvr-file', type: 'file', accept: 'image/png,image/jpeg,image/webp',
  });
  const genBtn = h('button', { class: 'btn-primary', type: 'button' }, ['Generate Visual Reference']);
  const statusEl = h('div', { class: 'gvr-status' });
  // H2-02 — light, read-only visibility of the governed memory context that will
  // be consumed by the action. No memory management console / editor / search.
  const memCtxEl = h('div', { class: 'gvr-memctx' });
  if (customerId) {
    void (async () => {
      try {
        const items = await getMemoryService().listForContext(projectId, customerId);
        memCtxEl.replaceChildren(
          h('p', { class: 'muted' }, [`Context: ${items.length} governed memories will be used`]),
        );
      } catch {
        memCtxEl.replaceChildren(h('p', { class: 'muted' }, ['Context: memory unavailable']));
      }
    })();
  } else {
    memCtxEl.replaceChildren(h('p', { class: 'muted' }, ['Context: no customer linked']));
  }

  genBtn.addEventListener('click', () => {
    void (async () => {
      const prompt = promptEl.value.trim();
      const file = fileEl.files ? fileEl.files[0] : undefined;
      if (!prompt) { statusEl.replaceChildren(h('p', { class: 'err' }, ['请输入 prompt。'])); return; }
      if (!file) { statusEl.replaceChildren(h('p', { class: 'err' }, ['请上传一张源图。'])); return; }
      if (!GVR_ALLOWED_MIME.includes(file.type)) {
        statusEl.replaceChildren(h('p', { class: 'err' }, ['仅支持 PNG / JPEG / WEBP。'])); return;
      }
      if (file.size > GVR_MAX_BYTES) {
        statusEl.replaceChildren(h('p', { class: 'err' }, ['图片过大（≤ 5MB）。'])); return;
      }
      let pure = '';
      try {
        pure = (await readFileAsBase64(file)).split(',')[1] ?? '';
      } catch (e) {
        statusEl.replaceChildren(h('p', { class: 'err' }, ['读取文件失败：' + (e as Error).message]));
        return;
      }
      if (!pure) { statusEl.replaceChildren(h('p', { class: 'err' }, ['源图解码失败。'])); return; }

      const key = stableGvrKey(projectId, prompt, pure);
      genBtn.setAttribute('disabled', 'true');
      statusEl.replaceChildren(loading('正在生成视觉参考（DEMO / in-memory）…'));
      try {
        const { result, mode } = await runGenerateVisualReference(
          { projectId, prompt, sourceImageBase64: pure, sourceImageMimeType: file.type },
          key,
        );
        renderGvrResult(statusEl, result, mode, projectId);
        // H1-05 state-consistency: after a successful action, refresh the
        // project's Tasks / Assets / Related Runs in place so the new output is
        // visible without a manual "refresh" hunt (BL-021 fix, Case 1).
        if (result.status === 'SUCCEEDED' && onSuccess) {
          void onSuccess();
        }
      } catch (e) {
        statusEl.replaceChildren(h('p', { class: 'err' }, ['生成失败：' + (e as Error).message]));
      } finally {
        genBtn.removeAttribute('disabled');
      }
    })();
  });

  return h('div', { class: 'section gvr' }, [
    h('h2', {}, ['Generate Visual Reference']),
    h('p', { class: 'muted' }, ['DEMO 模式 · 浏览器内 Fake 适配器（非真实 Feishu / Lumen）。']),
    h('label', { class: 'gvr-label' }, ['Prompt']),
    promptEl,
    h('label', { class: 'gvr-label' }, ['Source image (PNG / JPEG / WEBP, ≤ 5MB)']),
    fileEl,
    h('div', { class: 'gvr-actions' }, [genBtn]),
    memCtxEl,
    statusEl,
  ]);
}

/** Render the action outcome (success shows asset refs + run/project links). */
function renderGvrResult(
  host: HTMLElement,
  result: BusinessProcessResult,
  mode: string,
  projectId: string,
): void {
  const rows: (Node | string)[] = [
    h('div', { class: 'gvr-result-head' }, [
      h('span', {}, ['Result: ']),
      runStatusPill(result.status),
      h('span', { class: 'badge badge-demo' }, [mode]),
    ]),
    h('div', {}, [`processId: ${result.processId}`]),
  ];
  if (result.deduplicated) {
    rows.push(h('div', { class: 'muted' }, ['（幂等命中：复用已有执行，未产生新写入）']));
  }

  if (result.status === 'SUCCEEDED' && result.output) {
    rows.push(h('div', {}, [`assetId: ${esc(result.output.assetId)}`]));
    rows.push(h('div', {}, [`assetUri: ${esc(result.output.assetUri)}`]));
    // H2-02 — light visibility of the governed memory context actually consumed.
    const gm = result.output.governedMemory;
    if (gm) {
      rows.push(h('div', { class: 'muted' }, [
        `Memory context: ${gm.count} record${gm.count === 1 ? '' : 's'}` + (gm.truncated ? ' (truncated)' : ''),
      ]));
    }
    const runLink = h('button', { class: 'btn-back', type: 'button' }, ['查看 Run →']);
    runLink.addEventListener('click', () => navigate('run-detail', result.processId));
    rows.push(h('div', { class: 'gvr-actions' }, [runLink]));
  } else if (result.status === 'HUMAN_REQUIRED' && result.rejection) {
    // A normal business pause — NEVER rendered as a system failure.
    rows.push(h('p', { class: 'human-note' }, [
      `需人工决策（正常暂停，非系统失败）：${esc(result.rejection.reasonCode)} — ${esc(result.rejection.message)}`,
    ]));
  } else if (result.status === 'REJECTED' && result.rejection) {
    rows.push(h('p', { class: 'err' }, [`业务拒绝：${esc(result.rejection.reasonCode)} — ${esc(result.rejection.message)}`]));
  } else if (result.status === 'FAILED' && result.error) {
    rows.push(h('p', { class: 'err' }, [`系统失败：${esc(result.error.code)} — ${esc(result.error.message)}`]));
  } else {
    rows.push(h('p', { class: 'muted' }, [`状态：${esc(result.status)}`]));
  }
  host.replaceChildren(...rows);
}

/* ---- Project Detail task / asset table builders (reused by reload) ---- */
function projectTasksTable(tasks: Task[]): HTMLElement {
  if (!tasks.length) return h('p', { class: 'muted' }, ['（暂无任务）']);
  return h('table', { class: 'tbl' }, [
    h('thead', {}, [h('tr', {}, [
      h('th', {}, ['Title']), h('th', {}, ['Type']), h('th', {}, ['Status']), h('th', {}, ['Due']),
    ])]),
    h('tbody', {}, tasks.map((t: Task) =>
      h('tr', {}, [
        h('td', {}, [esc(t.title)]),
        h('td', {}, [esc(t.task_type)]),
        h('td', {}, [pill(t.status)]),
        h('td', {}, [esc(t.due_date)]),
      ]),
    )),
  ]);
}

function projectAssetsTable(assets: Asset[]): HTMLElement {
  if (!assets.length) return h('p', { class: 'muted' }, ['（暂无素材）']);
  return h('table', { class: 'tbl' }, [
    h('thead', {}, [h('tr', {}, [
      h('th', {}, ['Type']), h('th', {}, ['Source']), h('th', {}, ['URI']), h('th', {}, ['MIME']),
    ])]),
    h('tbody', {}, assets.map((a: Asset) =>
      h('tr', {}, [
        h('td', {}, [pill(a.asset_type)]),
        h('td', {}, [esc(a.source)]),
        h('td', {}, [esc(a.asset_uri)]),
        h('td', {}, [esc(a.mime_type)]),
      ]),
    )),
  ]);
}

/** H1-05 — populate the Project → Related Runs section from the run surface. */
async function populateRelatedRuns(host: HTMLElement, projectId: string): Promise<void> {
  host.replaceChildren(h('h2', {}, ['Related Runs（本项目关联运行）']), loading('正在加载关联运行…'));
  try {
    const runs = (await readWorkspace(svc.listRuns())).filter((run) => run.projectId === projectId);
    if (!runs.length) {
      host.replaceChildren(
        h('h2', {}, ['Related Runs（本项目关联运行）']),
        h('p', { class: 'muted' }, ['（该 Project 暂无关联 Run。可在下方 Generate Visual Reference 创建一个真实执行，完成后会显示在此处。）']),
      );
      return;
    }
    const list = h('div', { class: 'card run-list related-runs' });
    for (const r of runs) list.append(runRow(r));
    host.replaceChildren(h('h2', {}, [`Related Runs（本项目关联运行 · ${runs.length}）`]), list);
  } catch (e) {
    host.replaceChildren(h('h2', {}, ['Related Runs（本项目关联运行）']), empty(`加载失败：${(e as Error).message}`));
  }
}

/* ---- H2-01 Memory / 上下文 (read-only) ---- */
const MEMORY_TYPE_LABEL: Record<string, string> = {
  PREFERENCE: '偏好', FACT: '事实', DECISION: '决策', OUTCOME: '结果',
};
function memoryTypePill(t: string): HTMLElement {
  return h('span', { class: `pill pill-mem-${t}` }, [MEMORY_TYPE_LABEL[t] ?? t]);
}
function memoryRow(m: MemoryRecordV1): HTMLElement {
  return h('div', { class: 'memory-row' }, [
    h('div', {}, [
      h('div', { class: 'title' }, [esc(m.content)]),
      h('div', { class: 'sub' }, [`${m.memory_type} · ${m.scope} · 置信 ${(m.confidence * 100).toFixed(0)}%`]),
      h('div', { class: 'sub muted' }, [`来源 ${esc(m.source_type)} / ${esc(m.source_ref)} · 证据 ${m.evidence_refs.length}`]),
    ]),
    h('div', {}, [memoryTypePill(m.memory_type)]),
  ]);
}

/**
 * H2-01 — populate the read-only "Memory / 项目上下文" section for the project
 * plus its customer. Customer-wide memories apply inside every one of that
 * customer's projects. No write path is exposed here; business logic lives in
 * `MemoryService` (api.ts).
 */
async function populateMemory(host: HTMLElement, ws: ProjectWorkspace): Promise<void> {
  host.replaceChildren(h('h2', {}, ['Memory / 项目上下文（只读）']), loading('正在加载记忆…'));
  try {
    const items = await getMemoryService().listForContext(
      ws.project.project_id,
      ws.customer?.customer_id,
    );
    if (!items.length) {
      host.replaceChildren(
        h('h2', {}, ['Memory / 项目上下文（只读）']),
        h('p', { class: 'muted' }, ['（该客户 / 项目暂无已记录记忆）']),
      );
      return;
    }
    const list = h('div', { class: 'card memory-list' });
    for (const m of items) list.append(memoryRow(m));
    host.replaceChildren(
      h('h2', {}, [`Memory / 项目上下文（只读 · ${items.length}）`]),
      list,
    );
  } catch (e) {
    host.replaceChildren(
      h('h2', {}, ['Memory / 项目上下文（只读）']),
      empty(`加载失败：${(e as Error).message}`),
    );
  }
}

async function viewProjectDetail(projectId: string): Promise<HTMLElement> {
  const wrap = h('div', {});
  const back = h('button', { class: 'btn-back', type: 'button' }, ['← Projects']);
  back.addEventListener('click', () => navigate('projects'));
  wrap.append(back);
  wrap.append(loading('正在加载项目详情…'));

  try {
    const ws = await readWorkspace(svc.getProject(projectId));
    wrap.replaceChildren(back);
    if (!ws) {
      wrap.append(empty('未找到该项目。'));
      return wrap;
    }
    wrap.append(
      h('div', { class: 'view-head' }, [
        h('h1', {}, [esc(ws.project.title)]),
        h('p', {}, [`${esc(ws.project.project_type)} · 项目只读详情`]),
      ]),
    );
    const grid = h('div', { class: 'detail-grid' });

    // Project section
    grid.append(
      h('div', { class: 'section' }, [
        h('h2', {}, ['Project']),
        kv([
          ['Project ID', ws.project.project_id],
          ['Type', ws.project.project_type],
          ['Status', ''],
          ['Scheduled', esc(ws.project.scheduled_date)],
          ['Created', ws.project.created_at],
          ['Updated', ws.project.updated_at],
        ], { statusValue: ws.project.status }),
      ]),
    );

    // Customer section
    grid.append(
      h('div', { class: 'section' }, [
        h('h2', {}, ['Customer']),
        ws.customer
          ? kv([
              ['Customer ID', ws.customer.customer_id],
              ['Name', ws.customer.display_name],
              ['Phone', esc(ws.customer.phone)],
              ['WeChat', esc(ws.customer.wechat)],
              ['Status', ws.customer.status],
            ])
          : h('p', { class: 'muted' }, ['（无关联客户）']),
      ]),
    );

    // Tasks section — referenced node so it can be refreshed in place.
    const tasksSection = h('div', { class: 'section' }, [
      h('h2', {}, [`Tasks (${ws.tasks.length})`]),
      projectTasksTable(ws.tasks),
    ]);
    grid.append(tasksSection);

    // Assets section — referenced node.
    const assetsSection = h('div', { class: 'section' }, [
      h('h2', {}, [`Assets (${ws.assets.length})`]),
      projectAssetsTable(ws.assets),
    ]);
    grid.append(assetsSection);

    // H2-01 — Memory / 项目上下文 (read-only surface over canonical memory).
    const memorySection = h('div', { class: 'section' });
    grid.append(memorySection);

    // H1-05 — Related Runs (closed loop: Project → its executions).
    const runsSection = h('div', { class: 'section' });
    grid.append(runsSection);

    // H1-04 — Generate Visual Reference (DEMO: in-browser Fake adapters). On a
    // successful action, reloadDynamic refreshes Tasks / Assets / Related Runs
    // in place (state-consistency, Case 1).
    const reloadDynamic = async (): Promise<void> => {
      const fresh = await readWorkspace(svc.getProject(projectId));
      if (!fresh) return;
      tasksSection.replaceChildren(h('h2', {}, [`Tasks (${fresh.tasks.length})`]), projectTasksTable(fresh.tasks));
      assetsSection.replaceChildren(h('h2', {}, [`Assets (${fresh.assets.length})`]), projectAssetsTable(fresh.assets));
      await populateRelatedRuns(runsSection, projectId);
    };
    grid.append(gvrPanel(ws.project.project_id, ws.customer?.customer_id, reloadDynamic));

    wrap.append(grid);
    // Populate the related-runs section after the static parts are mounted.
    await populateRelatedRuns(runsSection, projectId);
    // H2-01 — populate the read-only Memory / 上下文 section.
    await populateMemory(memorySection, ws);
  } catch (err) {
    wrap.replaceChildren(back);
    wrap.append(empty(`加载失败：${(err as Error).message}`));
  }
  return wrap;
}

/* ----------------------------- Reviews list ------------------------------ */
async function viewReviews(): Promise<HTMLElement> {
  const wrap = h('div', {});
  wrap.append(
    h('div', { class: 'view-head' }, [
      h('h1', {}, ['Reviews']),
      h('p', {}, ['人工审阅工作台 · 待处理优先 · 规范化线索']),
    ]),
  );
  const list = h('div', { class: 'card review-list' });
  wrap.append(list);
  list.append(loading('正在加载审阅队列…'));

  try {
    const reviews = await readWorkspace(svc.listReviews());
    list.replaceChildren();
    if (reviews.length === 0) {
      list.append(empty('暂无待审阅线索。'));
      return wrap;
    }
    for (const rc of reviews) list.append(reviewRow(rc));
  } catch (err) {
    list.replaceChildren();
    list.append(empty(`加载失败：${(err as Error).message}`));
  }
  return wrap;
}

function reviewRow(rc: ReviewCase): HTMLElement {
  const cand = rc.original_candidate;
  const req = cand.requirement;
  const issueSummary = rc.original_governance.issues
    .map((i) => i.code)
    .join('、') || '—';
  const row = h('div', { class: 'review-row', role: 'button', tabindex: '0' }, [
    h('div', {}, [
      h('div', { class: 'title' }, [esc(req.service_type ?? '(无服务类型)')]),
      h('div', { class: 'sub' }, [
        `线索 ${esc(cand.candidate_id)} · 预算 ${req.budget_max ?? '—'} · 客户 ${esc(cand.customer_candidate.wechat ?? cand.customer_candidate.phone ?? cand.customer_candidate.name ?? '未知')}`,
      ]),
      h('div', { class: 'sub muted' }, [`治理问题：${issueSummary}`]),
    ]),
    h('div', { style: 'display:flex;gap:8px;align-items:center' }, [
      reviewStatePill(rc.state),
    ]),
  ]);
  const go = () => navigate('review-detail', rc.case_id);
  row.addEventListener('click', go);
  row.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') go();
  });
  return row;
}

/* ---------------------------- Review detail ------------------------------ */
async function viewReviewDetail(caseId: string): Promise<HTMLElement> {
  const wrap = h('div', {});
  const back = h('button', { class: 'btn-back', type: 'button' }, ['← Reviews']);
  back.addEventListener('click', () => navigate('reviews'));
  wrap.append(back);
  wrap.append(loading('正在加载审阅详情…'));

  try {
    const rc = await readWorkspace(svc.getReview(caseId));
    wrap.replaceChildren(back);
    if (!rc) {
      wrap.append(empty('未找到该审阅。'));
      return wrap;
    }

    const cand = rc.original_candidate;
    const req = cand.requirement;
    wrap.append(
      h('div', { class: 'view-head' }, [
        h('h1', {}, ['Review · ', esc(cand.candidate_id)]),
        h('p', {}, [esc(req.service_type ?? '(无服务类型)')]),
      ]),
    );
    const grid = h('div', { class: 'detail-grid' });

    // A. Current state
    grid.append(
      h('div', { class: 'section' }, [
        h('h2', {}, ['当前状态']),
        reviewStatePill(rc.state),
      ]),
    );

    // B. Original AI Candidate
    grid.append(
      h('div', { class: 'section' }, [
        h('h2', {}, ['原始 AI 候选（快照）']),
        kv([
          ['Service Type', esc(req.service_type)],
          ['Budget Min', req.budget_min == null ? '—' : String(req.budget_min)],
          ['Budget Max', req.budget_max == null ? '—' : String(req.budget_max)],
          ['Preferred Date', esc(req.preferred_date_text)],
          ['Notes', esc(req.notes)],
          ['Intent', `${cand.intent.type} (${cand.intent.confidence})`],
          ['Customer', esc(cand.customer_candidate.wechat ?? cand.customer_candidate.phone ?? cand.customer_candidate.name ?? '未知')],
        ]),
      ]),
    );

    // C. Governance
    const issuesTbl = h('table', { class: 'tbl' }, [
      h('thead', {}, [h('tr', {}, [h('th', {}, ['Code']), h('th', {}, ['Field'])])]),
      h('tbody', {}, rc.original_governance.issues.map((i) =>
        h('tr', {}, [h('td', {}, [esc(i.code)]), h('td', {}, [esc(i.field)])]),
      )),
    ]);
    grid.append(
      h('div', { class: 'section' }, [
        h('h2', {}, ['治理（Governance）']),
        kv([
          ['Decision', rc.original_governance.decision],
          ['Customer Resolution', rc.original_governance.customer_resolution.status],
        ]),
        h('p', { class: 'muted', style: 'margin:10px 0 4px' }, ['Issues']),
        rc.original_governance.issues.length ? issuesTbl : h('p', { class: 'muted' }, ['（无）']),
      ]),
    );

    // D. Evidence
    const evTbl = h('table', { class: 'tbl' }, [
      h('thead', {}, [h('tr', {}, [h('th', {}, ['Field']), h('th', {}, ['Source Text'])])]),
      h('tbody', {}, cand.evidence.map((e) =>
        h('tr', {}, [h('td', {}, [esc(e.field)]), h('td', {}, [esc(e.source_text)])]),
      )),
    ]);
    grid.append(
      h('div', { class: 'section' }, [
        h('h2', {}, [`证据（Evidence, ${cand.evidence.length}）`]),
        cand.evidence.length ? evTbl : h('p', { class: 'muted' }, ['（无）']),
      ]),
    );

    wrap.append(grid);

    // Terminal or pending → action panel / outcome
    const isTerminal =
      rc.state === 'COMMITTED' ||
      rc.state === 'REJECTED' ||
      rc.state === 'FAILED' ||
      rc.state === 'APPROVED';

    if (isTerminal) {
      wrap.append(renderOutcome(rc));
    } else {
      wrap.append(renderActions(rc));
    }
  } catch (err) {
    wrap.replaceChildren(back);
    wrap.append(empty(`加载失败：${(err as Error).message}`));
  }
  return wrap;
}

function renderOutcome(rc: ReviewCase): HTMLElement {
  const o = rc.outcome;
  const box = h('div', { class: 'section outcome' }, [
    h('h2', {}, ['处理结果（Outcome）']),
    reviewStatePill(rc.state),
  ]);

  if (o) {
    if (o.approval) {
      box.append(
        kv([
          ['Decision', o.approval.action],
          ['Decided At', o.approval.decided_at],
          ['Reviewer Note', esc(o.approval.reviewer_note)],
        ]),
      );
    }
    if (o.edits.length) {
      const editsTbl = h('table', { class: 'tbl' }, [
        h('thead', {}, [h('tr', {}, [h('th', {}, ['Field']), h('th', {}, ['Before']), h('th', {}, ['After'])])]),
        h('tbody', {}, o.edits.map((e) =>
          h('tr', {}, [
            h('td', {}, [esc(e.field)]),
            h('td', {}, [esc(String(e.before))]),
            h('td', {}, [esc(String(e.after))]),
          ]),
        )),
      ]);
      box.append(h('p', { class: 'muted', style: 'margin:10px 0 4px' }, ['人工编辑']), editsTbl);
    }
    if (o.commit) {
      box.append(
        kv([
          ['Commit Status', String(o.commit_status)],
          ['Write Status', o.commit.write_status],
          ['Readback', o.commit.readback_status],
        ]),
      );
    }
    if (o.lead) {
      box.append(
        kv([
          ['Lead ID', o.lead.lead_id],
          ['Lead Budget Max', o.lead.budget_max == null ? '—' : String(o.lead.budget_max)],
          ['Customer ID', esc(o.lead.customer_id)],
        ]),
      );
    }
    if (o.failure_reason) {
      box.append(h('p', { class: 'fail-reason' }, [`失败原因：${o.failure_reason}`]));
    }
    if (o.evidence_notes.length) {
      box.append(h('p', { class: 'muted', style: 'margin:10px 0 4px' }, ['证据说明']));
      for (const n of o.evidence_notes) box.append(h('p', { class: 'ev-note' }, [n]));
    }
  }
  box.append(h('p', { class: 'muted', style: 'margin-top:12px' }, ['该审阅已结束，不可重复操作。']));
  return box;
}

function renderActions(rc: ReviewCase): HTMLElement {
  const panel = h('div', { class: 'section actions' }, [
    h('h2', {}, ['人工决策']),
  ]);

  const noteInput = h('input', {
    class: 'field',
    type: 'text',
    placeholder: '审阅备注（可选）',
  }) as HTMLInputElement;
  panel.append(h('label', { class: 'field-label' }, ['审阅备注']), noteInput);

  // Edit form — allowlisted editable business fields only.
  const req = rc.original_candidate.requirement;
  const budgetInput = h('input', {
    class: 'field',
    type: 'number',
    value: req.budget_max == null ? '' : String(req.budget_max),
  }) as HTMLInputElement;
  const serviceInput = h('input', {
    class: 'field',
    type: 'text',
    value: req.service_type ?? '',
  }) as HTMLInputElement;
  const notesInput = h('input', {
    class: 'field',
    type: 'text',
    value: req.notes ?? '',
  }) as HTMLInputElement;

  const editBox = h('div', { class: 'edit-box' }, [
    h('p', { class: 'muted', style: 'margin:0 0 6px' }, ['可编辑业务字段（仅允许清单内字段）']),
    h('label', { class: 'field-label' }, ['Budget Max']), budgetInput,
    h('label', { class: 'field-label' }, ['Service Type']), serviceInput,
    h('label', { class: 'field-label' }, ['Notes']), notesInput,
  ]);
  panel.append(editBox);

  const btnApprove = h('button', { class: 'btn btn-approve', type: 'button' }, ['Approve']);
  const btnEditApprove = h('button', { class: 'btn btn-edit', type: 'button' }, ['Edit + Approve']);
  const btnReject = h('button', { class: 'btn btn-reject', type: 'button' }, ['Reject']);
  const status = h('p', { class: 'decide-status' }, ['']);
  panel.append(h('div', { class: 'btn-row' }, [btnApprove, btnEditApprove, btnReject]), status);

  const disableAll = (disable: boolean) => {
    for (const b of [btnApprove, btnEditApprove, btnReject]) {
      (b as HTMLButtonElement).disabled = disable;
    }
  };

  const onDecided = async () => {
    disableAll(false);
    status.textContent = '';
    await navigate('review-detail', rc.case_id);
  };

  btnApprove.addEventListener('click', async () => {
    disableAll(true);
    status.textContent = '正在提交…';
    try {
      await readWorkspace(svc.decideReview({
        caseId: rc.case_id,
        action: 'APPROVE',
        note: noteInput.value.trim() || null,
      }));
    } catch (e) {
      status.textContent = `错误：${(e as Error).message}`;
    }
    await onDecided();
  });

  btnEditApprove.addEventListener('click', async () => {
    disableAll(true);
    status.textContent = '正在提交…';
    const patch: EditPatch = {
      'requirement.budget_max': budgetInput.value === '' ? null : Number(budgetInput.value),
      'requirement.service_type': serviceInput.value.trim() || null,
      'requirement.notes': notesInput.value.trim() || null,
    };
    try {
      await readWorkspace(svc.decideReview({
        caseId: rc.case_id,
        action: 'EDIT_APPROVE',
        patch,
        note: noteInput.value.trim() || null,
      }));
    } catch (e) {
      status.textContent = `错误：${(e as Error).message}`;
    }
    await onDecided();
  });

  btnReject.addEventListener('click', async () => {
    disableAll(true);
    status.textContent = '正在提交…';
    try {
      await readWorkspace(svc.decideReview({
        caseId: rc.case_id,
        action: 'REJECT',
        note: noteInput.value.trim() || null,
      }));
    } catch (e) {
      status.textContent = `错误：${(e as Error).message}`;
    }
    await onDecided();
  });

  return panel;
}

/* ------------------------------- Runs list ------------------------------- */
async function viewRuns(): Promise<HTMLElement> {
  const wrap = h('div', {});
  wrap.append(
    h('div', { class: 'view-head' }, [
      h('h1', {}, ['Runs']),
      h('p', {}, ['业务流程运行记录（P6 Orchestrator）· 按最近更新排序 · 只读']),
    ]),
  );
  const list = h('div', { class: 'card run-list' });
  wrap.append(list);
  list.append(loading('正在加载运行记录…'));

  try {
    const runs = await readWorkspace(svc.listRuns());
    list.replaceChildren();
    if (runs.length === 0) {
      list.append(empty('暂无运行记录。'));
      return wrap;
    }
    for (const r of runs) list.append(runRow(r));
  } catch (err) {
    list.replaceChildren();
    list.append(empty(`加载失败：${(err as Error).message}`));
  }
  return wrap;
}

function runRow(r: RunSummary): HTMLElement {
  const row = h('div', { class: 'run-row', role: 'button', tabindex: '0' }, [
    h('div', {}, [
      h('div', { class: 'title' }, [esc(r.processId)]),
      h('div', { class: 'sub' }, [
        `stage ${esc(r.stage)} · ${r.startedAt}`,
      ]),
      h('div', { class: 'sub muted' }, [
        `duration ${fmtDuration(r.durationMs)} · output ${esc(r.outputSummary)}`,
        r.outcomeSummary ? ` · ${esc(r.outcomeSummary)}` : '',
      ]),
    ]),
    h('div', { style: 'display:flex;gap:8px;align-items:center' }, [
      runStatusPill(r.status),
    ]),
  ]);
  const go = () => navigate('run-detail', r.processId);
  row.addEventListener('click', go);
  row.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') go();
  });
  return row;
}

/* ------------------------------ Run detail ------------------------------- */
async function viewRunDetail(processId: string): Promise<HTMLElement> {
  const wrap = h('div', {});
  const backRow = h('div', { class: 'back-row' });
  const runsBack = h('button', { class: 'btn-back', type: 'button' }, ['← Runs']);
  runsBack.addEventListener('click', () => navigate('runs'));
  backRow.append(runsBack);
  wrap.append(backRow);
  wrap.append(loading('正在加载运行详情…'));

  try {
    const detail = await readWorkspace(svc.getRun(processId));
    wrap.replaceChildren(backRow);
    if (!detail) {
      wrap.append(empty('未找到该运行记录。'));
      return wrap;
    }

    // H1-05 — Run → Project return path (closed loop). Only when the run is
    // actually associated with a Project.
    if (detail.output?.projectId) {
      const projBack = h('button', { class: 'btn-back', type: 'button' }, ['← 返回项目']);
      projBack.addEventListener('click', () => navigate('project-detail', detail.output!.projectId!));
      backRow.append(projBack);
    }

    wrap.append(
      h('div', { class: 'view-head' }, [
        h('h1', {}, ['Run · ', esc(detail.processId)]),
        h('p', {}, [RUN_STATUS_LABEL[detail.status] ?? detail.status]),
      ]),
    );

    const grid = h('div', { class: 'detail-grid' });

    // A. Execution
    grid.append(
      h('div', { class: 'section' }, [
        h('h2', {}, ['执行（Execution）']),
        kv([
          ['Process ID', detail.processId],
          ['Status', ''],
          ['Started', detail.startedAt],
          ['Ended', detail.endedAt ?? '（进行中 / 尚未产生）'],
          ['Duration', fmtDuration(detail.durationMs)],
          ['Dedup', detail.deduplicated ? '是（幂等重放）' : '否'],
        ], { statusValue: detail.status }),
      ]),
    );

    // B. Stage Progress
    grid.append(
      h('div', { class: 'section' }, [
        h('h2', {}, ['阶段进度（Stage Progress）']),
        ...detail.stages.map((s: RunStageView) => h('div', { class: 'stage-line' }, [
          h('span', { class: 'stage-name' }, [esc(s.stage)]),
          h('span', { class: `pill pill-${s.status}` }, [STAGE_STATUS_LABEL[s.status] ?? s.status]),
          s.durationMs != null ? h('span', { class: 'muted' }, [` ${fmtDuration(s.durationMs)}`]) : h('span', {}, []),
        ])),
      ]),
    );

    // C. Output
    grid.append(
      h('div', { class: 'section' }, [
        h('h2', {}, ['业务输出（Output）']),
        detail.output
          ? kv(outputRows(detail.output))
          : h('p', { class: 'muted' }, ['（无业务输出）']),
      ]),
    );

    wrap.append(grid);

    // D. Error / Business Stop
    wrap.append(renderOutcomeBlock(detail.outcome));

    // E. Structured Trace
    wrap.append(renderTrace(detail));
  } catch (err) {
    wrap.replaceChildren(backRow);
    wrap.append(empty(`加载失败：${(err as Error).message}`));
  }
  return wrap;
}

function outputRows(output: NonNullable<RunDetail['output']>): [string, string][] {
  const rows: [string, string][] = [];
  if (output.leadId) rows.push(['Lead ID', output.leadId]);
  if (output.customerId) rows.push(['Customer ID', output.customerId]);
  if (output.projectId) rows.push(['Project ID', output.projectId]);
  if (output.taskId) rows.push(['Task ID', output.taskId]);
  if (output.assetId) rows.push(['Asset ID', output.assetId]);
  if (output.assetUri) rows.push(['Asset URI', output.assetUri]);
  // BUSOS-R2-SCS-INTEGRATION-01 — Service Agent run result in Run Detail.
  if (output.serviceAgent) {
    rows.push(['服务 Agent · 回答', output.serviceAgent.answer]);
    rows.push(['Intent', output.serviceAgent.intent]);
    rows.push(['Risk', output.serviceAgent.risk]);
    rows.push(['Route', output.serviceAgent.route]);
    rows.push([
      'Handoff',
      output.serviceAgent.handoff.mustHandoff
        ? '转人工（必须）'
        : output.serviceAgent.handoff.needsClarification
          ? '需澄清'
          : output.serviceAgent.handoff.needsHumanConfirm
            ? '需人工确认'
            : '无需',
    ]);
    rows.push([
      'Evidence',
      [
        output.serviceAgent.evidence.sourceModules.join('、') || '—',
        output.serviceAgent.evidence.canonicalAnswerId
          ? `标准话术 ${output.serviceAgent.evidence.canonicalAnswerId}`
          : '',
        output.serviceAgent.evidence.hasRetrievalEvidence
          ? `retrieval ${output.serviceAgent.evidence.retrievalScore.toFixed(3)}`
          : '无检索命中',
      ].filter(Boolean).join(' · '),
    ]);
    rows.push([
      'Run',
      `${output.serviceAgent.trace.runId} · ${output.serviceAgent.trace.conversationId} · ${output.serviceAgent.trace.latencyMs}ms`,
    ]);
  }
  return rows;
}

/**
 * D. The mandatory semantic gate (H1-03-F): render a SYSTEM failure, a BUSINESS
 * rejection, and a HUMAN-required outcome with DISTINCT presentations. A
 * business rejection / human decision is NEVER shown as a system error.
 */
function renderOutcomeBlock(outcome: RunOutcomeView): HTMLElement {
  if (outcome.kind === 'system_error') {
    const box = h('div', { class: 'section outcome outcome-system' }, [
      h('h2', {}, ['系统错误（System Failure）— 集成/系统故障']),
      outcome.error
        ? kv([
            ['Code', outcome.error.code],
            ['Stage', outcome.error.stage],
            ['Disposition', outcome.error.disposition],
            ['Message', outcome.error.message],
          ])
        : h('p', { class: 'muted' }, ['（无 error 明细）']),
    ]);
    return box;
  }
  if (outcome.kind === 'business_rejection') {
    const box = h('div', { class: 'section outcome outcome-business' }, [
      h('h2', {}, ['业务决策（Business Rejection）— 系统未失败']),
      outcome.rejection
        ? kv([
            ['Stage', outcome.rejection.stage],
            ['Reason Code', outcome.rejection.reasonCode],
            ['Message', outcome.rejection.message],
          ])
        : h('p', { class: 'muted' }, ['（无 rejection 明细）']),
    ]);
    return box;
  }
  if (outcome.kind === 'human_required') {
    const box = h('div', { class: 'section outcome outcome-human' }, [
      h('h2', {}, ['需人工决策（Human Required）— 流程正常暂停']),
      outcome.rejection
        ? kv([
            ['Stage', outcome.rejection.stage],
            ['Reason Code', outcome.rejection.reasonCode],
            ['Message', outcome.rejection.message],
          ])
        : h('p', { class: 'muted' }, ['（无 rejection 明细）']),
    ]);
    return box;
  }
  if (outcome.kind === 'running') {
    return h('div', { class: 'section outcome' }, [
      h('h2', {}, ['状态（Status）']),
      h('p', { class: 'muted' }, ['运行中 — 尚未产生结构化 trace / 业务输出。']),
    ]);
  }
  // success
  return h('div', { class: 'section outcome' }, [
    h('h2', {}, ['状态（Status）']),
    h('p', { class: 'muted' }, ['执行成功 — 无错误。']),
  ]);
}

/** E. Structured trace — a structured table, NOT a raw log / JSON dump. */
function renderTrace(detail: RunDetail): HTMLElement {
  const box = h('div', { class: 'section' }, [h('h2', {}, ['结构化 Trace（Structured Trace）'])]);
  if (!detail.trace.length) {
    box.append(h('p', { class: 'muted' }, ['（无结构化 trace — 运行中或记录不可用）']));
    return box;
  }
  const tbl = h('table', { class: 'tbl trace-tbl' }, [
    h('thead', {}, [h('tr', {}, [
      h('th', {}, ['Stage']), h('th', {}, ['Status']), h('th', {}, ['Started']),
      h('th', {}, ['Ended']), h('th', {}, ['Dur']), h('th', {}, ['Err']), h('th', {}, ['Metadata（allowlisted）']),
    ])]),
    h('tbody', {}, detail.trace.map((e) =>
      h('tr', {}, [
        h('td', {}, [esc(e.stage)]),
        h('td', {}, [pill(e.status)]),
        h('td', {}, [esc(e.startedAt)]),
        h('td', {}, [esc(e.endedAt ?? '—')]),
        h('td', {}, [e.durationMs != null ? String(e.durationMs) : '—']),
        h('td', {}, [esc(e.errorCode ?? '—')]),
        h('td', {}, [esc(fmtMeta(e.metadata))]),
      ]),
    )),
  ]);
  box.append(tbl);
  box.append(h('p', { class: 'muted', style: 'margin-top:8px' }, [
    'Trace metadata 仅含允许清单内的稳定引用（leadId / projectId / reasonCode / …）；prompt、密钥、凭据与第三方原始响应不会进入此视图。',
  ]));
  return box;
}

function kv(rows: [string, string][], opts: { statusValue?: string } = {}): HTMLElement {
  const dl = h('dl', { class: 'kv' });
  for (const [k, v] of rows) {
    dl.append(h('dt', {}, [k]));
    if (k === 'Status' && opts.statusValue) {
      const dd = h('dd', {}, []);
      dd.append(runStatusPill(opts.statusValue));
      dl.append(dd);
    } else {
      dl.append(h('dd', {}, [esc(v)]));
    }
  }
  return dl;
}

/* -------------------- product integration surfaces (CORR-01) ------------- */

async function viewServiceAgent(): Promise<HTMLElement> {
  const wrap = h('div', {});
  wrap.append(
    h('div', { class: 'view-head' }, [
      h('h1', {}, ['Service Agent']),
      h('p', {}, ['客服对话智能体 · DEMO 数据通道（in-memory 确定性推理）· 只读']),
    ]),
  );
  const body = h('div', { class: 'card service-agent-console' });
  wrap.append(body);
  body.append(loading('正在加载 Service Agent 控制台…'));

  const input = h('input', {
    class: 'sa-input', type: 'text', placeholder: '输入客户问题，例如：如何预约拍摄？',
  }) as HTMLInputElement;
  const goBtn = h('button', { class: 'btn-primary', type: 'button' }, ['咨询']);
  const errorEl = h('div', { class: 'err' });

  const form = h('div', { class: 'sa-form' }, [
    h('label', { class: 'muted' }, ['客户问题']),
    input,
    goBtn,
    errorEl,
  ]);

  async function run(): Promise<void> {
    const query = input.value.trim();
    if (!query) { errorEl.replaceChildren(h('span', {}, ['请输入问题。'])); return; }
    errorEl.replaceChildren();
    const resultHost = h('div', { class: 'sa-result' });
    body.replaceChildren(form, loading('正在咨询 Service Agent（DEMO）…'));
    try {
      const { viewModel } = await serviceAgentFeature().consult({
        query,
        idempotencyKey: `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      });
      const markup = serviceAgentConversationMarkup(viewModel);
      const host = h('div', { class: 'sa-markup' });
      host.innerHTML = markup;
      const govBtn = host.querySelector('button[data-action="governance-review"]');
      if (govBtn) govBtn.addEventListener('click', () => {
        void (async () => {
          const action = createCandidateReviewAction(viewModel);
          errorEl.replaceChildren(
            h('span', { class: 'muted' }, [`已生成治理审阅意图：${JSON.stringify(action)}`]),
          );
        })();
      });
      body.replaceChildren(form, host, resultHost);
      resultHost.append(h('p', { class: 'muted' }, ['咨询完成（DEMO 数据通道，未连接生产 SCS）。']));
    } catch (err) {
      errorEl.replaceChildren(h('span', {}, [`咨询失败：${(err as Error).message}`]));
    }
  }
  goBtn.addEventListener('click', () => void run());
  input.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') void run();
  });

  body.replaceChildren(form, h('p', { class: 'muted' }, ['输入问题后点击「咨询」，结果将展示意图 / 风险 / 路由 / 证据 / 转人工 / 关联 Run。']));
  return wrap;
}

async function viewBusinessData(): Promise<HTMLElement> {
  return renderBusinessDataView({ onSchedule: (projectId) => { selectedProjectId = projectId; navigate('scheduling'); } });
}

async function viewScheduling(): Promise<HTMLElement> {
  return renderSchedulingView({ initialProjectId: selectedProjectId });
}

async function viewBusinessDataCustomer(): Promise<HTMLElement> {
  const wrap = h('div', {});
  if (!selectedCustomerId) {
    wrap.append(empty('未选择客户。'));
    return wrap;
  }
  const host = h('div', { class: 'business-data-host' });
  wrap.append(
    h('div', { class: 'view-head' }, [
      h('h1', {}, ['Business Data · Customer']),
      h('p', {}, ['客户详情 · Leads / Projects（DEMO seeded 数据，只读）']),
    ]),
    host,
  );
  host.append(loading('正在加载客户详情…'));
  try {
    const node = await businessDataFeature().renderCustomer(
      selectedCustomerId,
      (projectId) => navigate('project-detail', projectId),
      () => navigate('business-data'),
    );
    host.replaceChildren(node);
  } catch (err) {
    host.replaceChildren(empty(`加载失败：${(err as Error).message}`));
  }
  return wrap;
}

async function viewEvaluation(): Promise<HTMLElement> {
  const wrap = h('div', {});
  wrap.append(
    h('div', { class: 'view-head' }, [
      h('h1', {}, ['Evaluation']),
      h('p', {}, ['确定性 Golden Set 回归 · 真实 recompute（42 cases / 28 PASS / 14 NOT_EVALUABLE）']),
    ]),
  );
  const host = h('div', { class: 'evaluation-host' });
  wrap.append(host);
  host.append(loading('正在运行确定性 Golden Set 回归…'));
  try {
    const node = await evaluationFeature().render();
    host.replaceChildren(node);
  } catch (err) {
    host.replaceChildren(empty(`加载失败：${(err as Error).message}`));
  }
  return wrap;
}

/* ----------------- Operations (V3 Feishu product integration) ------------ */

async function viewOperations(): Promise<HTMLElement> {
  return operationsFeature().renderDashboard({
    onCustomers: () => navigate('customers'),
    onOrders: () => navigate('orders'),
    onReviews: () => navigate('review-queue'),
  });
}

async function viewCustomers(): Promise<HTMLElement> {
  return operationsFeature().renderCustomers((id) => navigate('customer-detail', id));
}

async function viewCustomer(customerId: string): Promise<HTMLElement> {
  return operationsFeature().renderCustomer(customerId, () => navigate('customers'));
}

async function viewOrders(): Promise<HTMLElement> {
  return operationsFeature().renderOrders((id) => navigate('order-detail', id));
}

async function viewOrder(orderId: string): Promise<HTMLElement> {
  return operationsFeature().renderOrder(
    orderId,
    () => navigate('orders'),
    (customerId) => navigate('customer-detail', customerId),
  );
}

async function viewReviewQueue(): Promise<HTMLElement> {
  return operationsFeature().renderReviewQueue((id) => navigate('review-queue-detail', id));
}

async function viewReviewQueueDetail(reviewId: string): Promise<HTMLElement> {
  return operationsFeature().renderReviewDetail(reviewId, {
    onBack: () => navigate('review-queue'),
    onDecided: () => navigate('review-queue'),
  });
}

/* ------------------------------- router ---------------------------------- */
function routeForView(view: View, id?: string): Route {
  switch (view) {
    case 'overview': return { name: 'overview' };
    case 'projects': return { name: 'projects' };
    case 'project-detail': return id ? { name: 'project-detail', projectId: id } : { name: 'projects' };
    case 'reviews': return { name: 'reviews' };
    case 'review-detail': return id ? { name: 'review-detail', caseId: id } : { name: 'reviews' };
    case 'runs': return { name: 'runs' };
    case 'run-detail': return id ? { name: 'run-detail', processId: id } : { name: 'runs' };
    case 'service-agent': return { name: 'service-agent' };
    case 'business-data': return { name: 'business-data' };
    case 'business-data-detail': return id ? { name: 'business-data-detail', customerId: id } : { name: 'business-data' };
    case 'scheduling': return { name: 'scheduling' };
    case 'evaluation': return { name: 'evaluation' };
    case 'business': return { name: 'business' };
    case 'customers': return { name: 'customers' };
    case 'customer-detail': return id ? { name: 'customer-detail', customerId: id } : { name: 'customers' };
    case 'orders': return { name: 'orders' };
    case 'order-detail': return id ? { name: 'order-detail', orderId: id } : { name: 'orders' };
    case 'review-queue': return { name: 'review-queue' };
    case 'review-queue-detail': return id ? { name: 'review-queue-detail', reviewId: id } : { name: 'review-queue' };
  }
}

function syncRoute(route: Route): void {
  activeRoute = route;
  active = route.name;
  if (route.name === 'project-detail') selectedProjectId = route.projectId;
  if (route.name === 'review-detail') selectedReviewId = route.caseId;
  if (route.name === 'run-detail') selectedRunId = route.processId;
  if (route.name === 'business-data-detail') selectedCustomerId = route.customerId;
  if (route.name === 'customer-detail') selectedCustomerId = route.customerId;
  if (route.name === 'order-detail') selectedOrderId = route.orderId;
  if (route.name === 'review-queue-detail') selectedReviewId = route.reviewId;
  if (!appReady) return;
  const navHost = document.getElementById('nav');
  if (navHost) navHost.replaceWith(renderNav());
  void renderContent();
}

router.subscribe(syncRoute);
const stopRouter = router.start();

async function renderContent(): Promise<void> {
  const content = document.getElementById('content')!;
  content.replaceChildren(loading('Loading…'));
  let node: HTMLElement;
  switch (active) {
    case 'overview': node = await viewOverview(); break;
    case 'projects': node = await viewProjects(); break;
    case 'project-detail': node = await viewProjectDetail(selectedProjectId!); break;
    case 'reviews': node = await viewReviews(); break;
    case 'review-detail': node = await viewReviewDetail(selectedReviewId!); break;
    case 'runs': node = await viewRuns(); break;
    case 'run-detail': node = await viewRunDetail(selectedRunId!); break;
    case 'service-agent': node = await viewServiceAgent(); break;
    case 'business-data': node = await viewBusinessData(); break;
    case 'business-data-detail': node = await viewBusinessDataCustomer(); break;
    case 'scheduling': node = await viewScheduling(); break;
    case 'evaluation': node = await viewEvaluation(); break;
    case 'business': node = await viewOperations(); break;
    case 'customers': node = await viewCustomers(); break;
    case 'customer-detail': node = await viewCustomer(selectedCustomerId!); break;
    case 'orders': node = await viewOrders(); break;
    case 'order-detail': node = await viewOrder(selectedOrderId!); break;
    case 'review-queue': node = await viewReviewQueue(); break;
    case 'review-queue-detail': node = await viewReviewQueueDetail(selectedReviewId!); break;
    default: node = await viewOverview(); break;
  }
  content.replaceChildren(node);
}

export function navigate(view: View, id?: string): void {
  router.navigate(routeForView(view, id));
}

/* --------------------------------- shell --------------------------------- */
export function renderApp(dataSource: WorkspaceDataSource): void {
  svc = dataSource;
  appReady = true;
  const runtimeHost = document.getElementById('runtime-identity');
  if (runtimeHost) {
    void svc.runtime.then((envelope) => {
      renderRuntimeIdentity(runtimeHost, envelope.data ?? {
        mode: envelope.mode,
        buildSha: envelope.buildSha,
        connectionSummary: envelope.error?.message ?? `Workspace ${envelope.status.toLowerCase()}`,
      });
    });
  }
  const navHost = document.getElementById('nav');
  if (navHost) navHost.replaceWith(renderNav());
  syncRoute(router.current());
}

// Keep the listener alive for the lifetime of the single-page app. The value is
// intentionally retained to make the ownership of the browser event explicit.
void stopRouter;
