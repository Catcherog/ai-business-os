import type {
  Project,
  Customer,
  Task,
  Asset,
} from '@busos/business-repository';
import type { WorkspaceReadService } from '@busos/workspace-read';

type View = 'overview' | 'projects' | 'reviews' | 'runs' | 'project-detail';

const NAV: { id: View; label: string; tag?: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'projects', label: 'Projects', tag: 'LIVE' },
  { id: 'reviews', label: 'Reviews', tag: 'soon' },
  { id: 'runs', label: 'Runs', tag: 'soon' },
];

let svc: WorkspaceReadService;
let active: View = 'overview';
let selectedProjectId: string | null = null;

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
  for (const item of NAV) {
    const btn = h('button', {
      class: `nav-item${active === item.id ? ' active' : ''}`,
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
      h('p', {}, ['AI Business OS · 运营工作台（只读演示）']),
    ]),
  );
  const card = h('div', { class: 'section' }, [
    h('h2', {}, ['Welcome']),
    h('p', {}, [
      '本工作区是 AI Business OS 的第一个产品化界面。当前版本（H1-01）仅开放 Projects 只读垂直切片：', h('strong', {}, ['项目列表']),
      ' 与 ', h('strong', {}, ['项目详情']), '（含客户、任务、素材）。',
    ]),
    h('p', {}, ['Overview / Reviews / Runs 为占位视图，将在后续迭代中接入。']),
  ]);
  const cta = h('button', { class: 'btn-back', type: 'button' }, ['打开 Projects →']);
  cta.style.marginTop = '14px';
  cta.addEventListener('click', () => navigate('projects'));
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
    case 'reviews': node = placeholder('Reviews', '人工审阅工作台将在 H1-02 接入。'); break;
    case 'runs': node = placeholder('Runs', '业务流程运行视图将在 H1-03 接入。'); break;
    default: node = viewOverview();
  }
  content.replaceChildren(node);
}

function navigate(view: View, projectId?: string): void {
  active = view;
  if (projectId) selectedProjectId = projectId;
  // refresh nav highlight
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
