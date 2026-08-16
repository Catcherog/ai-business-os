import type {
  Project,
  Customer,
  Task,
  Asset,
} from '@busos/business-repository';
import type { WorkspaceReadService } from '@busos/workspace-read';
import type {
  ReviewCase,
  ReviewState,
  ReviewOutcome,
  EditPatch,
} from '@busos/workspace-review';
import { getService, getReviewService } from './api.js';

type View =
  | 'overview'
  | 'projects'
  | 'reviews'
  | 'review-detail'
  | 'runs'
  | 'project-detail';

const NAV: { id: View; label: string; tag?: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'projects', label: 'Projects', tag: 'LIVE' },
  { id: 'reviews', label: 'Reviews', tag: 'LIVE' },
  { id: 'runs', label: 'Runs', tag: 'soon' },
];

let svc: WorkspaceReadService;
let active: View = 'overview';
let selectedProjectId: string | null = null;
let selectedReviewId: string | null = null;

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
    active === 'review-detail' ? 'reviews' : active === 'project-detail' ? 'projects' : active;
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
      '本工作区是 AI Business OS 的第一个产品化界面。当前版本已接入两个垂直切片：',
      h('strong', {}, ['Projects（只读）']), ' 与 ', h('strong', {}, ['Reviews（人工审阅）']), '。',
    ]),
    h('p', {}, ['Overview / Runs 为占位视图，将在后续迭代中接入。']),
  ]);
  const cta = h('button', { class: 'btn-back', type: 'button' }, ['打开 Reviews →']);
  cta.style.marginTop = '14px';
  cta.addEventListener('click', () => navigate('reviews'));
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

function kv(rows: [string, string][], opts: { statusValue?: string } = {}): HTMLElement {
  const dl = h('dl', { class: 'kv' });
  for (const [k, v] of rows) {
    dl.append(h('dt', {}, [k]));
    if (k === 'Status' && opts.statusValue) {
      const dd = h('dd', {}, []);
      dd.append(pill(opts.statusValue));
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
    case 'runs': node = placeholder('Runs', '业务流程运行视图将在 H1-03 接入。'); break;
    default: node = viewOverview();
  }
  content.replaceChildren(node);
}

export function navigate(view: View, id?: string): void {
  active = view;
  if (view === 'project-detail' && id) selectedProjectId = id;
  if (view === 'review-detail' && id) selectedReviewId = id;
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
