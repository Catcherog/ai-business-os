/**
 * Operations views (BUSOS-R2-FEISHU-V3-OS-PRODUCT-INTEGRATION-01).
 *
 * Pure render layer over `BusinessDataEnvelope<T>` (the canonical CONNECTED/DEMO
 * envelope). Every view honors the runtime mode badge and the fail-closed states
 * (BLOCKED / ERROR) — no demo fallback ever replaces a blocked CONNECTED read.
 * The Review Queue workbench (§13) implements the single-approval workflow with
 * idempotency, an allowlisted edit form, readback status and a live audit trail.
 */
import {
  type BusinessDataEnvelope,
  type BusinessDataHealthView,
} from '../business-data/business-data-client.js';
import type {
  OperationsAuditEvent,
  OperationsCustomer,
  OperationsDashboard,
  OperationsOrder,
  OperationsReviewCase,
  ReviewDecision,
  ReviewDecideOptions,
  ReviewQueueListResult,
} from '@busos/business-repository';
import type { OperationsClient } from './operations-client.js';

/* ------------------------------- primitives ------------------------------ */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return node;
}

function text(value: unknown): string {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function esc(s: string | null | undefined): string {
  return (s ?? '—').toString();
}

function appendHealth(root: HTMLElement, envelope: BusinessDataEnvelope<unknown>): void {
  const h = envelope.health;
  const detail = [
    `${h.configuredResourceCount} resources`,
    `read ${h.lastSuccessfulReadAt ?? 'not yet'}`,
    `readback ${h.lastReadbackStatus}`,
    `latency ${h.latencyBucket}`,
  ].join(' · ');
  const section = el('section', 'card business-data-health');
  const heading = el('h2', undefined, ['Connection']);
  const pill = el('span', `pill business-data-status business-data-status-${envelope.status.toLowerCase()}`, [`${envelope.mode} · ${envelope.status}`]);
  heading.append(document.createTextNode(' '), pill);
  section.append(heading);
  section.append(el('p', 'muted', [detail]));
  if (envelope.status !== 'READY' && envelope.error) {
    section.append(el('p', 'err', [envelope.error.message]));
  }
  root.append(section);
}

function appendEmpty(root: HTMLElement, message: string, isError = false): void {
  root.append(el('p', isError ? 'state' : 'muted', [message]));
}

function readyData<T>(envelope: BusinessDataEnvelope<T>): T | undefined {
  return envelope.status === 'READY' ? envelope.data : undefined;
}

function pillFor(status: string): HTMLElement {
  return el('span', `pill pill-${status}`, [status]);
}

/* ------------------------------- dashboard ------------------------------- */

export interface OperationsDashboardModel {
  health: BusinessDataHealthModel;
  counts: { label: string; value: string; sub: string }[];
  projectStatus: { status: string; count: number }[];
  orderStatus: { status: string; count: number }[];
  reviewsByReason: { reason: string; count: number }[];
  recentProjects: OperationsDashboard['recent_projects'];
  recentOrders: OperationsOrder[];
  pendingReviews: OperationsDashboard['pending_reviews_sample'];
}

export interface BusinessDataHealthModel {
  mode: BusinessDataHealthView['mode'];
  status: BusinessDataEnvelope<unknown>['status'];
  label: string;
  detail: string;
  configuredResourceCount: number;
  lastSuccessfulReadAt: string | null;
  lastReadbackStatus: BusinessDataHealthView['lastReadbackStatus'];
  latencyBucket: BusinessDataHealthView['latencyBucket'];
}

export function operationsDashboardModel(envelope: BusinessDataEnvelope<OperationsDashboard>): OperationsDashboardModel {
  const data = readyData(envelope);
  const h = envelope.health;
  const health: BusinessDataHealthModel = {
    mode: h.mode,
    status: envelope.status,
    label: `${envelope.mode} · ${envelope.status}`,
    detail: [
      `${h.configuredResourceCount} resources`,
      `read ${h.lastSuccessfulReadAt ?? 'not yet'}`,
      `readback ${h.lastReadbackStatus}`,
      `latency ${h.latencyBucket}`,
    ].join(' · '),
    configuredResourceCount: h.configuredResourceCount,
    lastSuccessfulReadAt: h.lastSuccessfulReadAt,
    lastReadbackStatus: h.lastReadbackStatus,
    latencyBucket: h.latencyBucket,
  };
  const counts = data
    ? [
        { label: 'Customers', value: String(data.counts.customers), sub: `Active ${data.counts.customers}` },
        { label: 'Projects / Orders', value: String(data.counts.orders), sub: `derived from Projects` },
        { label: 'Resources', value: String(data.counts.resources), sub: 'V3 Base' },
        { label: 'Reviews pending', value: String(data.counts.reviews_pending), sub: data.synthetic_review_data ? 'synthetic seed' : 'live' },
        { label: 'Reviews resolved', value: String(data.counts.reviews_resolved), sub: 'approved/skipped' },
      ]
    : [];
  return {
    health,
    counts,
    projectStatus: data ? Object.entries(data.project_status).map(([status, count]) => ({ status, count })) : [],
    orderStatus: data ? Object.entries(data.order_status).map(([status, count]) => ({ status, count })) : [],
    reviewsByReason: data ? Object.entries(data.reviews_by_reason).map(([reason, count]) => ({ reason, count })) : [],
    recentProjects: data?.recent_projects ?? [],
    recentOrders: data?.recent_orders ?? [],
    pendingReviews: data?.pending_reviews_sample ?? [],
  };
}

function kpiGrid(cards: { label: string; value: string; sub: string }[]): HTMLElement {
  const grid = el('div', 'kpi-grid');
  for (const c of cards) {
    grid.append(el('div', 'kpi', [
      el('div', 'kpi-value', [c.value]),
      el('div', 'kpi-label', [c.label]),
      el('div', 'kpi-sub', [c.sub]),
    ]));
  }
  return grid;
}

function statusList(title: string, entries: { status: string; count: number }[]): HTMLElement {
  const section = el('section', 'card');
  section.append(el('h2', undefined, [title]));
  if (!entries.length) { section.append(el('p', 'muted', ['（无）'])); return section; }
  for (const e of entries) {
    const row = el('div', 'status-row', [pillFor(e.status), el('span', 'muted', [`${e.count}`])]);
    section.append(row);
  }
  return section;
}

export function renderOperationsDashboard(
  envelope: BusinessDataEnvelope<OperationsDashboard>,
  navigation: { onCustomers: () => void; onOrders: () => void; onReviews: () => void },
  documentRef: Document = document,
): HTMLElement {
  const model = operationsDashboardModel(envelope);
  const root = el('section', 'section business-data-feature');
  root.append(el('div', 'view-head', [el('h1', undefined, ['Operations Dashboard']),
    el('p', undefined, ['Feishu V3 运营智能总览 · 只读'])]));
  appendHealth(root, envelope);

  if (model.counts.length === 0) {
    appendEmpty(root, envelope.error?.message ?? 'Operations data is unavailable in this mode.', envelope.status !== 'READY');
    return root;
  }

  root.append(kpiGrid(model.counts));

  const body = el('div', 'overview-body');
  body.append(statusList('项目状态（Project Status）', model.projectStatus));
  body.append(statusList('订单状态（Order Status）', model.orderStatus));

  if (model.reviewsByReason.length) {
    const section = el('section', 'card');
    section.append(el('h2', undefined, ['待审阅原因分布（Review Reasons）']));
    for (const r of model.reviewsByReason) {
      section.append(el('div', 'status-row', [el('span', undefined, [r.reason]), el('span', 'muted', [String(r.count)])]));
    }
    body.append(section);
  }

  if (model.recentOrders.length) {
    const section = el('section', 'card');
    section.append(el('h2', undefined, ['最近订单（Recent Orders）']));
    const table = el('table', 'tbl');
    table.append(el('thead', undefined, [el('tr', undefined, [
      el('th', undefined, ['Order']), el('th', undefined, ['Customer']), el('th', undefined, ['Type']), el('th', undefined, ['Status']),
    ])]));
    const tbody = el('tbody');
    for (const o of model.recentOrders) {
      tbody.append(el('tr', undefined, [
        el('td', undefined, [o.title]),
        el('td', undefined, [esc(o.customer_name)]),
        el('td', undefined, [o.project_type]),
        el('td', undefined, [pillFor(o.status)]),
      ]));
    }
    table.append(tbody);
    section.append(table);
    body.append(section);
  }
  root.append(body);

  // Capability entry points.
  const cards = el('div', 'capability-cards');
  const make = (title: string, desc: string, fn: () => void) => {
    const b = el('button', 'btn capability-card', [el('span', 'capability-title', [title]), el('span', 'capability-desc muted', [desc])]);
    b.addEventListener('click', fn);
    return b;
  };
  cards.append(make('Customers', '客户中心 · V3 Base', navigation.onCustomers));
  cards.append(make('Orders', '订单中心 · 派生自项目', navigation.onOrders));
  cards.append(make('Review Queue', '审阅工作台 · 562 待处理', navigation.onReviews));
  root.append(el('section', 'overview-section', [el('h2', undefined, ['产品面（Product Surfaces）']), cards]));

  return root;
}

/* -------------------------------- customers ------------------------------ */

export function renderOperationsCustomers(
  envelope: BusinessDataEnvelope<OperationsCustomer[]>,
  onSelect?: (customerId: string) => void,
  documentRef: Document = document,
): HTMLElement {
  const data = readyData(envelope) ?? [];
  const root = el('section', 'section business-data-feature');
  root.append(el('div', 'view-head', [el('h1', undefined, ['Customers']), el('p', undefined, ['客户中心 · V3 Base（只读）'])]));
  appendHealth(root, envelope);
  if (data.length === 0) {
    appendEmpty(root, envelope.error?.message ?? 'No customers are available in this Connected view.');
    return root;
  }
  const table = el('table', 'tbl business-data-customers');
  table.append(el('thead', undefined, [el('tr', undefined, [
    el('th', undefined, ['Customer']), el('th', undefined, ['Region']), el('th', undefined, ['Channel']), el('th', undefined, ['Status']),
  ])]));
  const tbody = el('tbody');
  for (const c of data) {
    const row = el('tr');
    const identity = el('td');
    if (onSelect) {
      const btn = el('button', 'btn', [c.display_name]);
      btn.addEventListener('click', () => onSelect(c.customer_id));
      identity.append(btn);
    } else {
      identity.append(document.createTextNode(c.display_name));
    }
    row.append(identity, el('td', undefined, [esc(c.region)]), el('td', undefined, [esc(c.source_channel)]), el('td', undefined, [pillFor(c.status)]));
    tbody.append(row);
  }
  table.append(tbody);
  root.append(table);
  return root;
}

export function renderOperationsCustomerDetail(
  envelope: BusinessDataEnvelope<OperationsCustomer | null>,
  onBack?: () => void,
  documentRef: Document = document,
): HTMLElement {
  const data = readyData(envelope);
  const root = el('section', 'section business-data-feature');
  const header = el('div', 'view-head');
  if (onBack) {
    const back = el('button', 'btn-back', ['Back to customers']);
    back.addEventListener('click', onBack);
    header.append(back);
  }
  header.append(el('h1', undefined, [data?.display_name ?? 'Customer detail']));
  root.append(header);
  appendHealth(root, envelope);
  if (!data) {
    appendEmpty(root, envelope.error?.message ?? 'Customer not found.', envelope.status !== 'READY');
    return root;
  }
  const dl = el('dl', 'detail-grid card');
  const kv = (k: string, v: string) => {
    dl.append(el('dt', undefined, [k]));
    dl.append(el('dd', undefined, [v]));
  };
  kv('Customer ID', data.customer_id);
  kv('Status', data.status);
  kv('Phone', esc(data.phone));
  kv('WeChat', esc(data.wechat));
  kv('Region', esc(data.region));
  kv('Source Channel', esc(data.source_channel));
  kv('Migration Key', data.migration_key);
  kv('Created', data.created_at);
  kv('Updated', data.updated_at);
  root.append(dl);
  return root;
}

/* --------------------------------- orders -------------------------------- */

export function renderOperationsOrders(
  envelope: BusinessDataEnvelope<OperationsOrder[]>,
  onSelect?: (orderId: string) => void,
  documentRef: Document = document,
): HTMLElement {
  const data = readyData(envelope) ?? [];
  const root = el('section', 'section business-data-feature');
  root.append(el('div', 'view-head', [el('h1', undefined, ['Orders']), el('p', undefined, ['订单中心 · 由项目派生的客户参与（只读）'])]));
  appendHealth(root, envelope);
  if (data.length === 0) {
    appendEmpty(root, envelope.error?.message ?? 'No orders are available in this Connected view.');
    return root;
  }
  const table = el('table', 'tbl business-data-orders');
  table.append(el('thead', undefined, [el('tr', undefined, [
    el('th', undefined, ['Order']), el('th', undefined, ['Customer']), el('th', undefined, ['Type']), el('th', undefined, ['Scheduled']), el('th', undefined, ['Status']),
  ])]));
  const tbody = el('tbody');
  for (const o of data) {
    const row = el('tr');
    const identity = el('td');
    if (onSelect) {
      const btn = el('button', 'btn', [o.title]);
      btn.addEventListener('click', () => onSelect(o.order_id));
      identity.append(btn);
    } else {
      identity.append(document.createTextNode(o.title));
    }
    row.append(
      identity,
      el('td', undefined, [esc(o.customer_name)]),
      el('td', undefined, [o.project_type]),
      el('td', undefined, [esc(o.scheduled_date)]),
      el('td', undefined, [pillFor(o.status)]),
    );
    tbody.append(row);
  }
  table.append(tbody);
  root.append(table);
  return root;
}

export function renderOperationsOrderDetail(
  envelope: BusinessDataEnvelope<OperationsOrder | null>,
  onBack?: () => void,
  onCustomer?: (customerId: string) => void,
  documentRef: Document = document,
): HTMLElement {
  const data = readyData(envelope);
  const root = el('section', 'section business-data-feature');
  const header = el('div', 'view-head');
  if (onBack) {
    const back = el('button', 'btn-back', ['Back to orders']);
    back.addEventListener('click', onBack);
    header.append(back);
  }
  header.append(el('h1', undefined, [data?.title ?? 'Order detail']));
  root.append(header);
  appendHealth(root, envelope);
  if (!data) {
    appendEmpty(root, envelope.error?.message ?? 'Order not found.', envelope.status !== 'READY');
    return root;
  }
  const dl = el('dl', 'detail-grid card');
  const kv = (k: string, v: string) => { dl.append(el('dt', undefined, [k])); dl.append(el('dd', undefined, [v])); };
  kv('Order ID', data.order_id);
  kv('Customer', data.customer_name ?? '—');
  kv('Project Type', data.project_type);
  kv('Status', data.status);
  kv('Scheduled', esc(data.scheduled_date));
  kv('Created', data.created_at);
  kv('Updated', data.updated_at);
  root.append(dl);
  return root;
}

/* ----------------------------- review queue ------------------------------ */

function auditRow(e: OperationsAuditEvent): HTMLElement {
  return el('div', 'review-audit-row', [
    el('span', 'muted', [e.at]),
    el('span', undefined, [e.kind]),
    el('span', undefined, [e.actor]),
    el('span', 'muted', [e.detail]),
  ]);
}

export function renderReviewQueue(
  envelope: BusinessDataEnvelope<ReviewQueueListResult>,
  onSelect?: (reviewId: string) => void,
  documentRef: Document = document,
): HTMLElement {
  const data = readyData(envelope);
  const root = el('section', 'section business-data-feature');
  root.append(el('div', 'view-head', [el('h1', undefined, ['Review Queue']), el('p', undefined, ['人工审阅工作台 · 待处理优先（§13）'])]));
  appendHealth(root, envelope);
  if (!data || data.data.length === 0) {
    appendEmpty(root, envelope.error?.message ?? 'No reviews are pending in this view.');
    return root;
  }
  root.append(el('p', 'muted', [`${data.total} total · ${data.pending} pending · ${data.resolved} resolved`]));
  const list = el('div', 'card review-list');
  for (const r of data.data) {
    const row = el('div', 'review-row', [
      el('div', undefined, [
        el('div', 'title', [r.review_id]),
        el('div', 'sub', [`${r.entity_type} · ${r.source_table}`]),
        el('div', 'sub muted', [`Reason: ${r.reason}`]),
      ]),
      el('div', undefined, [pillFor(r.status)]),
    ]);
    if (onSelect) {
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.addEventListener('click', () => onSelect(r.review_id));
    }
    list.append(row);
  }
  root.append(list);
  return root;
}

export function renderReviewDetail(
  envelope: BusinessDataEnvelope<OperationsReviewCase | null>,
  callbacks: {
    onBack?: () => void;
    onDecided?: () => void;
    decide: (reviewId: string, decision: ReviewDecision, options?: ReviewDecideOptions) => Promise<void>;
  },
  documentRef: Document = document,
): HTMLElement {
  const data = readyData(envelope);
  const root = el('section', 'section business-data-feature');
  const header = el('div', 'view-head');
  if (callbacks.onBack) {
    const back = el('button', 'btn-back', ['Back to queue']);
    back.addEventListener('click', callbacks.onBack);
    header.append(back);
  }
  header.append(el('h1', undefined, [data?.review_id ?? 'Review detail']));
  root.append(header);
  appendHealth(root, envelope);

  if (!data) {
    appendEmpty(root, envelope.error?.message ?? 'Review not found.', envelope.status !== 'READY');
    return root;
  }

  const grid = el('div', 'detail-grid');
  const identity = el('dl', 'card');
  const kv = (k: string, v: string) => { identity.append(el('dt', undefined, [k])); identity.append(el('dd', undefined, [v])); };
  kv('Review ID', data.review_id);
  kv('Entity Type', data.entity_type);
  kv('Source Table', data.source_table);
  kv('Entity Hash', data.entity_hash);
  kv('Reason', data.reason);
  kv('Status', data.status);
  kv('Decision', data.decision ?? '—');
  kv('Decided By', esc(data.decided_by));
  kv('Readback', data.readback_status);
  grid.append(identity);

  const auditCard = el('section', 'card');
  auditCard.append(el('h2', undefined, ['Audit Trail']));
  if (!data.audit.length) auditCard.append(el('p', 'muted', ['（无）']));
  for (const e of data.audit) auditCard.append(auditRow(e));
  grid.append(auditCard);
  root.append(grid);

  const isTerminal = data.status !== 'PENDING';
  if (isTerminal) {
    root.append(el('p', 'muted', ['该审阅已结束，不可重复操作。']));
    return root;
  }

  const panel = el('section', 'card actions');
  panel.append(el('h2', undefined, ['人工决策（Single Approval）']));
  const noteInput = el('input', 'field') as HTMLInputElement;
  noteInput.type = 'text';
  noteInput.placeholder = '审阅备注（可选）';
  panel.append(el('label', 'field-label', ['审阅备注']), noteInput);

  const editBox = el('div', 'edit-box');
  editBox.append(el('p', 'muted', ['可编辑业务字段（仅允许清单内字段）']));
  const displayNameInput = el('input', 'field') as HTMLInputElement;
  displayNameInput.type = 'text'; displayNameInput.placeholder = 'display_name';
  const regionInput = el('input', 'field') as HTMLInputElement;
  regionInput.type = 'text'; regionInput.placeholder = 'region';
  const channelInput = el('input', 'field') as HTMLInputElement;
  channelInput.type = 'text'; channelInput.placeholder = 'source_channel';
  editBox.append(el('label', 'field-label', ['display_name']), displayNameInput);
  editBox.append(el('label', 'field-label', ['region']), regionInput);
  editBox.append(el('label', 'field-label', ['source_channel']), channelInput);
  panel.append(editBox);

  const status = el('p', 'decide-status', ['']);
  const btnApprove = el('button', 'btn btn-approve', ['Approve']);
  const btnEditApprove = el('button', 'btn btn-edit', ['Edit + Approve']);
  const btnSkip = el('button', 'btn', ['Skip']);
  const btnKeep = el('button', 'btn', ['Keep in Review']);
  panel.append(el('div', 'btn-row', [btnApprove, btnEditApprove, btnSkip, btnKeep]), status);

  const guard = (fn: () => Promise<void>) => async () => {
    [btnApprove, btnEditApprove, btnSkip, btnKeep].forEach((b) => (b as HTMLButtonElement).disabled = true);
    status.textContent = '正在提交…';
    try {
      await fn();
      status.textContent = '';
      callbacks.onDecided?.();
    } catch (e) {
      status.textContent = `错误：${(e as Error).message}`;
      [btnApprove, btnEditApprove, btnSkip, btnKeep].forEach((b) => (b as HTMLButtonElement).disabled = false);
    }
  };

  btnApprove.addEventListener('click', guard(async () => {
    await callbacks.decide(data.review_id, 'APPROVE', { note: noteInput.value.trim() || null });
  }));
  btnEditApprove.addEventListener('click', guard(async () => {
    const patch: Record<string, string> = {};
    if (displayNameInput.value.trim()) patch.display_name = displayNameInput.value.trim();
    if (regionInput.value.trim()) patch.region = regionInput.value.trim();
    if (channelInput.value.trim()) patch.source_channel = channelInput.value.trim();
    await callbacks.decide(data.review_id, 'EDIT_AND_APPROVE', { note: noteInput.value.trim() || null, editPatch: patch });
  }));
  btnSkip.addEventListener('click', guard(async () => {
    await callbacks.decide(data.review_id, 'SKIP', { note: noteInput.value.trim() || null });
  }));
  btnKeep.addEventListener('click', guard(async () => {
    await callbacks.decide(data.review_id, 'KEEP_IN_REVIEW', { note: noteInput.value.trim() || null });
  }));

  root.append(panel);
  return root;
}

/* -------------------------------- feature -------------------------------- */

export interface OperationsFeature {
  renderDashboard(navigation: { onCustomers: () => void; onOrders: () => void; onReviews: () => void }): Promise<HTMLElement>;
  renderCustomers(onSelect?: (customerId: string) => void): Promise<HTMLElement>;
  renderCustomer(customerId: string, onBack?: () => void): Promise<HTMLElement>;
  renderOrders(onSelect?: (orderId: string) => void): Promise<HTMLElement>;
  renderOrder(orderId: string, onBack?: () => void, onCustomer?: (customerId: string) => void): Promise<HTMLElement>;
  renderReviewQueue(onSelect?: (reviewId: string) => void): Promise<HTMLElement>;
  renderReviewDetail(reviewId: string, callbacks: { onBack?: () => void; onDecided?: () => void }): Promise<HTMLElement>;
  renderAudit(): Promise<HTMLElement>;
}

export function createOperationsFeature(client: OperationsClient, documentRef?: Document): OperationsFeature {
  const doc = (): Document => documentRef ?? document;
  const reviewDecide = async (reviewId: string, decision: ReviewDecision, options?: ReviewDecideOptions) => {
    await client.decideReviewQueueItem(reviewId, decision, options);
  };
  return {
    async renderDashboard(navigation) {
      try {
        return renderOperationsDashboard(await client.getOverview(), navigation, doc());
      } catch {
        return renderError(doc(), 'Operations Dashboard', 'Dashboard is unavailable.');
      }
    },
    async renderCustomers(onSelect) {
      try {
        return renderOperationsCustomers(await client.listCustomers({ limit: 100 }), onSelect, doc());
      } catch {
        return renderError(doc(), 'Customers', 'Customer list is unavailable.');
      }
    },
    async renderCustomer(customerId, onBack) {
      try {
        return renderOperationsCustomerDetail(await client.getCustomer(customerId), onBack, doc());
      } catch {
        return renderError(doc(), 'Customer detail', 'Customer detail is unavailable.');
      }
    },
    async renderOrders(onSelect) {
      try {
        return renderOperationsOrders(await client.listOrders({ limit: 100 }), onSelect, doc());
      } catch {
        return renderError(doc(), 'Orders', 'Order list is unavailable.');
      }
    },
    async renderOrder(orderId, onBack, onCustomer) {
      try {
        return renderOperationsOrderDetail(await client.getOrder(orderId), onBack, onCustomer, doc());
      } catch {
        return renderError(doc(), 'Order detail', 'Order detail is unavailable.');
      }
    },
    async renderReviewQueue(onSelect) {
      try {
        return renderReviewQueue(await client.listReviewQueue({ limit: 50 }), onSelect, doc());
      } catch {
        return renderError(doc(), 'Review Queue', 'Review queue is unavailable.');
      }
    },
    async renderReviewDetail(reviewId, callbacks) {
      try {
        return renderReviewDetail(await client.getReviewQueueItem(reviewId), {
          ...callbacks,
          decide: async (id: string, decision: ReviewDecision, options?: ReviewDecideOptions) => {
            await client.decideReviewQueueItem(id, decision, options);
          },
        }, doc());
      } catch {
        return renderError(doc(), 'Review detail', 'Review detail is unavailable.');
      }
    },
    async renderAudit() {
      try {
        const envelope = await client.listAuditEvents(200);
        const events = readyData(envelope) ?? [];
        const root = el('section', 'section business-data-feature');
        root.append(el('div', 'view-head', [el('h1', undefined, ['Audit Events'])]));
        appendHealth(root, envelope);
        if (!events.length) { appendEmpty(root, 'No audit events.'); return root; }
        const list = el('div', 'card review-list');
        for (const e of events) list.append(auditRow(e));
        root.append(list);
        return root;
      } catch {
        return renderError(doc(), 'Audit', 'Audit log is unavailable.');
      }
    },
  };
}

function renderError(documentRef: Document, title: string, message: string): HTMLElement {
  const root = el('section', 'section business-data-feature');
  root.append(el('h1', undefined, [title]));
  root.append(el('p', 'err', [message]));
  return root;
}
