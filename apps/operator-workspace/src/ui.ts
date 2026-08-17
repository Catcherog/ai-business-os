import type {
  Project,
  Customer,
  Task,
  Asset,
} from '@busos/contracts';
import type { WorkspaceReadService } from '@busos/workspace-read';
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
import { getService, getReviewService, getRunService } from './api.js';
import { runGenerateVisualReference } from './action.js';

type View =
  | 'overview'
  | 'projects'
  | 'reviews'
  | 'review-detail'
  | 'runs'
  | 'run-detail'
  | 'project-detail';

const NAV: { id: View; label: string; tag?: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'projects', label: 'Projects', tag: 'LIVE' },
  { id: 'reviews', label: 'Reviews', tag: 'LIVE' },
  { id: 'runs', label: 'Runs', tag: 'LIVE' },
];

let svc: WorkspaceReadService;
let active: View = 'overview';
let selectedProjectId: string | null = null;
let selectedReviewId: string | null = null;
let selectedRunId: string | null = null;

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
  // Highlight the parent nav entry while inside a detail view.
  const navActive =
    active === 'review-detail' || active === 'run-detail'
      ? active.replace('-detail', '')
      : active;
  const nav = h('nav', { class: 'nav', id: 'nav', 'aria-label': 'Primary' });
  for (const item of NAV) {
    const btn = h('button', {
      class: `nav-item${navActive === item.id ? ' active' : ''}`,
      'data-view': item.id,
      type: 'button',
    }, [h('span', {}, [item.label])]);
    if (item.tag) btn.append(h('span', { class: 'tag' }, [item.tag]));
    btn.addEventListener('click', () => navigate(item.id));
    nav.append(btn);
  }
  return nav;
}

/* ------------------------------- views ----------------------------------- */
function viewOverview(): HTMLElement {
  const wrap = h('div', {});
  wrap.append(
    h('div', { class: 'view-head' }, [
      h('h1', {}, ['Operator Workspace']),
      h('p', {}, ['AI Business OS · 运营工作台']),
    ]),
  );
  const card = h('div', { class: 'section' }, [
    h('h2', {}, ['Welcome']),
    h('p', {}, [
      '本工作区是 AI Business OS 的第一个产品化界面。当前已接入三个垂直切片：',
      h('strong', {}, ['Projects（只读）']), '、', h('strong', {}, ['Reviews（人工审阅）']),
      ' 与 ', h('strong', {}, ['Runs（运行记录 / Trace 视图）']), '。',
    ]),
    h('p', {}, ['Overview 为只读概览占位；Runs 展示现有 P6 Orchestrator 执行可见性。']),
  ]);
  const cta = h('button', { class: 'btn-back', type: 'button' }, ['打开 Runs →']);
  cta.style.marginTop = '14px';
  cta.addEventListener('click', () => navigate('runs'));
  card.append(cta);
  wrap.append(card);
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
    const projects = await svc.listProjects();
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
function gvrPanel(projectId: string): HTMLElement {
  const promptEl = h('textarea', {
    class: 'gvr-prompt', rows: '3',
    placeholder: '描述你想要的视觉调整，例如：把背景换成蓝色调',
  });
  const fileEl = h('input', {
    class: 'gvr-file', type: 'file', accept: 'image/png,image/jpeg,image/webp',
  });
  const genBtn = h('button', { class: 'btn-primary', type: 'button' }, ['Generate Visual Reference']);
  const statusEl = h('div', { class: 'gvr-status' });

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
    const runLink = h('button', { class: 'btn-back', type: 'button' }, ['查看 Run →']);
    runLink.addEventListener('click', () => navigate('run-detail', result.processId));
    const refresh = h('button', { class: 'btn-back', type: 'button' }, ['刷新项目详情（查看新 Task / Asset）']);
    refresh.addEventListener('click', () => navigate('project-detail', projectId));
    rows.push(h('div', { class: 'gvr-actions' }, [runLink, refresh]));
  } else if (result.status === 'REJECTED' && result.rejection) {
    rows.push(h('p', { class: 'err' }, [`业务拒绝：${esc(result.rejection.reasonCode)} — ${esc(result.rejection.message)}`]));
  } else if (result.status === 'FAILED' && result.error) {
    rows.push(h('p', { class: 'err' }, [`系统失败：${esc(result.error.code)} — ${esc(result.error.message)}`]));
  }
  host.replaceChildren(...rows);
}

async function viewProjectDetail(projectId: string): Promise<HTMLElement> {
  const wrap = h('div', {});
  const back = h('button', { class: 'btn-back', type: 'button' }, ['← Projects']);
  back.addEventListener('click', () => navigate('projects'));
  wrap.append(back);
  wrap.append(loading('正在加载项目详情…'));

  try {
    const ws = await svc.getProjectWorkspace(projectId);
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

    // Tasks section
    const tasksTbl = h('table', { class: 'tbl' }, [
      h('thead', {}, [h('tr', {}, [
        h('th', {}, ['Title']), h('th', {}, ['Type']), h('th', {}, ['Status']), h('th', {}, ['Due']),
      ])]),
      h('tbody', {}, ws.tasks.map((t: Task) =>
        h('tr', {}, [
          h('td', {}, [esc(t.title)]),
          h('td', {}, [esc(t.task_type)]),
          h('td', {}, [pill(t.status)]),
          h('td', {}, [esc(t.due_date)]),
        ]),
      )),
    ]);
    grid.append(h('div', { class: 'section' }, [
      h('h2', {}, [`Tasks (${ws.tasks.length})`]),
      ws.tasks.length ? tasksTbl : h('p', { class: 'muted' }, ['（暂无任务）']),
    ]));

    // Assets section
    const assetsTbl = h('table', { class: 'tbl' }, [
      h('thead', {}, [h('tr', {}, [
        h('th', {}, ['Type']), h('th', {}, ['Source']), h('th', {}, ['URI']), h('th', {}, ['MIME']),
      ])]),
      h('tbody', {}, ws.assets.map((a: Asset) =>
        h('tr', {}, [
          h('td', {}, [pill(a.asset_type)]),
          h('td', {}, [esc(a.source)]),
          h('td', {}, [esc(a.asset_uri)]),
          h('td', {}, [esc(a.mime_type)]),
        ]),
      )),
    ]);
    grid.append(h('div', { class: 'section' }, [
      h('h2', {}, [`Assets (${ws.assets.length})`]),
      ws.assets.length ? assetsTbl : h('p', { class: 'muted' }, ['（暂无素材）']),
    ]));

    // H1-04 — Generate Visual Reference (DEMO: in-browser Fake adapters).
    grid.append(gvrPanel(ws.project.project_id));

    wrap.append(grid);
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
    const reviews = getReviewService().listReviews();
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
    const rc = getReviewService().getReview(caseId);
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
      await getReviewService().approve(rc.case_id, noteInput.value.trim() || null);
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
      await getReviewService().editAndApprove(rc.case_id, patch, noteInput.value.trim() || null);
    } catch (e) {
      status.textContent = `错误：${(e as Error).message}`;
    }
    await onDecided();
  });

  btnReject.addEventListener('click', async () => {
    disableAll(true);
    status.textContent = '正在提交…';
    try {
      await getReviewService().reject(rc.case_id, noteInput.value.trim() || null);
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
    const runs = await getRunService().listRuns();
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
  const back = h('button', { class: 'btn-back', type: 'button' }, ['← Runs']);
  back.addEventListener('click', () => navigate('runs'));
  wrap.append(back);
  wrap.append(loading('正在加载运行详情…'));

  try {
    const detail = await getRunService().getRun(processId);
    wrap.replaceChildren(back);
    if (!detail) {
      wrap.append(empty('未找到该运行记录。'));
      return wrap;
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
    wrap.replaceChildren(back);
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

/* ------------------------------- router ---------------------------------- */
async function renderContent(): Promise<void> {
  const content = document.getElementById('content')!;
  content.replaceChildren(loading('Loading…'));
  let node: HTMLElement;
  switch (active) {
    case 'overview': node = viewOverview(); break;
    case 'projects': node = await viewProjects(); break;
    case 'project-detail': node = await viewProjectDetail(selectedProjectId!); break;
    case 'reviews': node = await viewReviews(); break;
    case 'review-detail': node = await viewReviewDetail(selectedReviewId!); break;
    case 'runs': node = await viewRuns(); break;
    case 'run-detail': node = await viewRunDetail(selectedRunId!); break;
    default: node = viewOverview();
  }
  content.replaceChildren(node);
}

export function navigate(view: View, id?: string): void {
  active = view;
  if (view === 'project-detail' && id) selectedProjectId = id;
  if (view === 'review-detail' && id) selectedReviewId = id;
  if (view === 'run-detail' && id) selectedRunId = id;
  const navHost = document.getElementById('nav');
  if (navHost) navHost.replaceWith(renderNav());
  void renderContent();
}

/* --------------------------------- shell --------------------------------- */
export function renderApp(service: WorkspaceReadService): void {
  svc = service;
  const navHost = document.getElementById('nav');
  if (navHost) navHost.replaceWith(renderNav());
  void renderContent();
}
