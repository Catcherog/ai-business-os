import type { Customer, Lead, Project } from '@busos/contracts';
import {
  type BusinessDataClient,
  type BusinessDataCustomerDetail,
  type BusinessDataCustomerSummary,
  type BusinessDataEnvelope,
  type BusinessDataHealthView,
} from './business-data-client.js';

export interface BusinessDataHealthModel {
  mode: BusinessDataHealthView['mode'];
  status: BusinessDataEnvelope<unknown>['status'];
  label: string;
  detail: string;
  configuredResourceCount: number;
  lastSuccessfulReadAt: string | null;
  lastSuccessfulWriteAt: string | null;
  lastReadbackStatus: BusinessDataHealthView['lastReadbackStatus'];
  latencyBucket: BusinessDataHealthView['latencyBucket'];
}

export interface BusinessDataCustomerRow {
  id: string;
  name: string;
  status: Customer['status'];
  leadCount: number;
  projectCount: number;
}

export interface BusinessDataCustomerListViewModel {
  health: BusinessDataHealthModel;
  connectionLabel: string;
  connectionDetail: string;
  customers: BusinessDataCustomerRow[];
  isInteractive: boolean;
  errorMessage: string | null;
}

export interface BusinessDataCustomerDetailModel {
  health: BusinessDataHealthModel;
  connectionLabel: string;
  connectionDetail: string;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    wechat: string | null;
    status: Customer['status'];
  } | null;
  leads: Array<{
    id: string;
    serviceType: string;
    status: Lead['status'];
    budget: string;
    preferredDate: string;
  }>;
  projects: Array<{
    id: string;
    title: string;
    projectType: string;
    status: Project['status'];
    scheduledDate: string;
  }>;
  isInteractive: boolean;
  errorMessage: string | null;
}

function healthModel<T>(envelope: BusinessDataEnvelope<T>): BusinessDataHealthModel {
  const { health } = envelope;
  const detail = [
    `${health.configuredResourceCount} resources`,
    `last read ${health.lastSuccessfulReadAt ?? 'not yet'}`,
    `readback ${health.lastReadbackStatus}`,
    `latency ${health.latencyBucket}`,
  ].join(' · ');
  return {
    mode: health.mode,
    status: envelope.status,
    label: `${envelope.mode} · ${envelope.status}`,
    detail,
    configuredResourceCount: health.configuredResourceCount,
    lastSuccessfulReadAt: health.lastSuccessfulReadAt,
    lastSuccessfulWriteAt: health.lastSuccessfulWriteAt,
    lastReadbackStatus: health.lastReadbackStatus,
    latencyBucket: health.latencyBucket,
  };
}

function formatMoney(value: number): string {
  return `¥${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)}`;
}

function formatBudget(min: number | null, max: number | null): string {
  if (min === null) {
    return max === null ? '—' : `≤${formatMoney(max)}`;
  }
  if (max === null) return `≥${formatMoney(min)}`;
  if (min === max) return formatMoney(min);
  return `${formatMoney(min)}–${formatMoney(max)}`;
}

function readyData<T>(envelope: BusinessDataEnvelope<T>): T | undefined {
  return envelope.status === 'READY' ? envelope.data : undefined;
}

export function businessDataCustomerListViewModel(
  envelope: BusinessDataEnvelope<BusinessDataCustomerSummary[]>,
): BusinessDataCustomerListViewModel {
  const data = readyData(envelope) ?? [];
  const health = healthModel(envelope);
  return {
    health,
    connectionLabel: health.label,
    connectionDetail: health.detail,
    customers: data.map(({ customer, leadCount, projectCount }) => ({
      id: customer.customer_id,
      name: customer.display_name,
      status: customer.status,
      leadCount,
      projectCount,
    })),
    isInteractive: envelope.status === 'READY',
    errorMessage: envelope.error?.message ?? null,
  };
}

export function businessDataCustomerDetailViewModel(
  envelope: BusinessDataEnvelope<BusinessDataCustomerDetail | null>,
): BusinessDataCustomerDetailModel {
  const data = readyData(envelope) ?? null;
  const health = healthModel(envelope);
  return {
    health,
    connectionLabel: health.label,
    connectionDetail: health.detail,
    customer: data?.customer
      ? {
          id: data.customer.customer_id,
          name: data.customer.display_name,
          phone: data.customer.phone,
          wechat: data.customer.wechat,
          status: data.customer.status,
        }
      : null,
    leads: data?.leads.map((lead) => ({
      id: lead.lead_id,
      serviceType: lead.service_type,
      status: lead.status,
      budget: formatBudget(lead.budget_min, lead.budget_max),
      preferredDate: lead.preferred_date_text ?? '—',
    })) ?? [],
    projects: data?.projects.map((project) => ({
      id: project.project_id,
      title: project.title,
      projectType: project.project_type,
      status: project.status,
      scheduledDate: project.scheduled_date ?? '—',
    })) ?? [],
    isInteractive: envelope.status === 'READY',
    errorMessage: envelope.error?.message ?? null,
  };
}

function text(documentRef: Document, value: string): Text {
  return documentRef.createTextNode(value);
}

function element<K extends keyof HTMLElementTagNameMap>(
  documentRef: Document,
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = documentRef.createElement(tag);
  if (className) node.className = className;
  return node;
}

function appendValue(
  documentRef: Document,
  parent: HTMLElement,
  label: string,
  value: string,
): void {
  const item = element(documentRef, 'div', 'kv');
  const term = element(documentRef, 'dt');
  term.append(text(documentRef, label));
  const definition = element(documentRef, 'dd');
  definition.append(text(documentRef, value));
  item.append(term, definition);
  parent.append(item);
}

function appendHealth(
  documentRef: Document,
  root: HTMLElement,
  model: BusinessDataHealthModel,
  errorMessage: string | null,
): void {
  const health = element(documentRef, 'section', 'card business-data-health');
  const heading = element(documentRef, 'h2');
  heading.append(text(documentRef, 'Connection'));
  const pill = element(documentRef, 'span', `pill business-data-status business-data-status-${model.status.toLowerCase()}`);
  pill.append(text(documentRef, model.label));
  heading.append(documentRef.createTextNode(' '), pill);
  health.append(heading);
  const detail = element(documentRef, 'p', 'muted');
  detail.append(text(documentRef, model.detail));
  health.append(detail);
  if (errorMessage) {
    const error = element(documentRef, 'p', 'err');
    error.append(text(documentRef, errorMessage));
    health.append(error);
  }
  root.append(health);
}

function appendEmptyState(
  documentRef: Document,
  root: HTMLElement,
  message: string,
  className = 'muted',
): void {
  const empty = element(documentRef, 'p', className);
  empty.append(text(documentRef, message));
  root.append(empty);
}

export function renderBusinessDataCustomerList(
  envelope: BusinessDataEnvelope<BusinessDataCustomerSummary[]>,
  onSelectCustomer?: (customerId: string) => void,
  documentRef: Document = document,
): HTMLElement {
  const model = businessDataCustomerListViewModel(envelope);
  const root = element(documentRef, 'section', 'section business-data-feature');
  const header = element(documentRef, 'div', 'view-head');
  const heading = element(documentRef, 'h1');
  heading.append(text(documentRef, 'Customers'));
  header.append(heading);
  root.append(header);
  appendHealth(documentRef, root, model.health, model.errorMessage);

  if (model.customers.length === 0) {
    appendEmptyState(
      documentRef,
      root,
      model.errorMessage ?? 'No customers are available in this Connected view.',
      model.errorMessage ? 'state' : 'muted',
    );
    return root;
  }

  const table = element(documentRef, 'table', 'tbl business-data-customers');
  const head = element(documentRef, 'thead');
  const headerRow = element(documentRef, 'tr');
  for (const label of ['Customer', 'Leads', 'Projects', 'Status']) {
    const cell = element(documentRef, 'th');
    cell.append(text(documentRef, label));
    headerRow.append(cell);
  }
  head.append(headerRow);
  table.append(head);
  const body = element(documentRef, 'tbody');
  for (const customer of model.customers) {
    const row = element(documentRef, 'tr');
    const identity = element(documentRef, 'td');
    const select = element(documentRef, 'button', 'btn');
    select.type = 'button';
    select.append(text(documentRef, customer.name));
    select.addEventListener('click', () => onSelectCustomer?.(customer.id));
    identity.append(select);
    const leads = element(documentRef, 'td');
    leads.append(text(documentRef, String(customer.leadCount)));
    const projects = element(documentRef, 'td');
    projects.append(text(documentRef, String(customer.projectCount)));
    const status = element(documentRef, 'td');
    status.append(text(documentRef, customer.status));
    row.append(identity, leads, projects, status);
    body.append(row);
  }
  table.append(body);
  root.append(table);
  return root;
}

export function renderBusinessDataCustomerDetail(
  envelope: BusinessDataEnvelope<BusinessDataCustomerDetail | null>,
  onSelectProject?: (projectId: string) => void,
  onBack?: () => void,
  documentRef: Document = document,
): HTMLElement {
  const model = businessDataCustomerDetailViewModel(envelope);
  const root = element(documentRef, 'section', 'section business-data-feature');
  const header = element(documentRef, 'div', 'view-head');
  if (onBack) {
    const back = element(documentRef, 'button', 'btn-back');
    back.type = 'button';
    back.append(text(documentRef, 'Back to customers'));
    back.addEventListener('click', onBack);
    header.append(back);
  }
  const heading = element(documentRef, 'h1');
  heading.append(text(documentRef, model.customer?.name ?? 'Customer detail'));
  header.append(heading);
  root.append(header);
  appendHealth(documentRef, root, model.health, model.errorMessage);

  if (!model.customer) {
    appendEmptyState(documentRef, root, model.errorMessage ?? 'Customer not found.', model.errorMessage ? 'state' : 'muted');
    return root;
  }

  const identity = element(documentRef, 'dl', 'detail-grid card');
  appendValue(documentRef, identity, 'Status', model.customer.status);
  appendValue(documentRef, identity, 'Phone', model.customer.phone ?? '—');
  appendValue(documentRef, identity, 'WeChat', model.customer.wechat ?? '—');
  root.append(identity);

  const leadsSection = element(documentRef, 'section', 'card');
  const leadsHeading = element(documentRef, 'h2');
  leadsHeading.append(text(documentRef, 'Leads'));
  leadsSection.append(leadsHeading);
  if (model.leads.length === 0) {
    appendEmptyState(documentRef, leadsSection, 'No leads linked to this customer.');
  } else {
    const table = element(documentRef, 'table', 'tbl business-data-leads');
    const head = element(documentRef, 'thead');
    const row = element(documentRef, 'tr');
    for (const label of ['Service', 'Status', 'Budget', 'Preferred date']) {
      const cell = element(documentRef, 'th');
      cell.append(text(documentRef, label));
      row.append(cell);
    }
    head.append(row);
    table.append(head);
    const body = element(documentRef, 'tbody');
    for (const lead of model.leads) {
      const leadRow = element(documentRef, 'tr');
      for (const value of [lead.serviceType, lead.status, lead.budget, lead.preferredDate]) {
        const cell = element(documentRef, 'td');
        cell.append(text(documentRef, value));
        leadRow.append(cell);
      }
      body.append(leadRow);
    }
    table.append(body);
    leadsSection.append(table);
  }
  root.append(leadsSection);

  const projectsSection = element(documentRef, 'section', 'card');
  const projectsHeading = element(documentRef, 'h2');
  projectsHeading.append(text(documentRef, 'Projects'));
  projectsSection.append(projectsHeading);
  if (model.projects.length === 0) {
    appendEmptyState(documentRef, projectsSection, 'No projects linked to this customer.');
  } else {
    const table = element(documentRef, 'table', 'tbl business-data-projects');
    const head = element(documentRef, 'thead');
    const row = element(documentRef, 'tr');
    for (const label of ['Project', 'Type', 'Status', 'Scheduled date']) {
      const cell = element(documentRef, 'th');
      cell.append(text(documentRef, label));
      row.append(cell);
    }
    head.append(row);
    table.append(head);
    const body = element(documentRef, 'tbody');
    for (const project of model.projects) {
      const projectRow = element(documentRef, 'tr');
      const projectCell = element(documentRef, 'td');
      const select = element(documentRef, 'button', 'btn');
      select.type = 'button';
      select.append(text(documentRef, project.title));
      select.addEventListener('click', () => onSelectProject?.(project.id));
      projectCell.append(select);
      for (const value of [project.projectType, project.status, project.scheduledDate]) {
        const cell = element(documentRef, 'td');
        cell.append(text(documentRef, value));
        projectRow.append(cell);
      }
      projectRow.prepend(projectCell);
      body.append(projectRow);
    }
    table.append(body);
    projectsSection.append(table);
  }
  root.append(projectsSection);
  return root;
}

function renderFeatureError(documentRef: Document, title: string, message: string): HTMLElement {
  const root = element(documentRef, 'section', 'section business-data-feature');
  const heading = element(documentRef, 'h1');
  heading.append(text(documentRef, title));
  const error = element(documentRef, 'p', 'err');
  error.append(text(documentRef, message));
  root.append(heading, error);
  return root;
}

export interface BusinessDataFeature {
  renderList(onSelectCustomer?: (customerId: string) => void): Promise<HTMLElement>;
  renderCustomer(
    customerId: string,
    onSelectProject?: (projectId: string) => void,
    onBack?: () => void,
  ): Promise<HTMLElement>;
}

export function createBusinessDataFeature(
  client: BusinessDataClient,
  documentRef?: Document,
): BusinessDataFeature {
  const getDocument = (): Document => documentRef ?? document;
  return {
    async renderList(onSelectCustomer?: (customerId: string) => void): Promise<HTMLElement> {
      try {
        return renderBusinessDataCustomerList(await client.listCustomers(), onSelectCustomer, getDocument());
      } catch {
        return renderFeatureError(getDocument(), 'Customers', 'Customer list is unavailable.');
      }
    },
    async renderCustomer(
      customerId: string,
      onSelectProject?: (projectId: string) => void,
      onBack?: () => void,
    ): Promise<HTMLElement> {
      try {
        return renderBusinessDataCustomerDetail(
          await client.getCustomer(customerId),
          onSelectProject,
          onBack,
          getDocument(),
        );
      } catch {
        return renderFeatureError(getDocument(), 'Customer detail', 'Customer detail is unavailable.');
      }
    },
  };
}
