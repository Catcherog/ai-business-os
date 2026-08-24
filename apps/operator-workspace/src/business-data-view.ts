import type { Project, Resource } from '@busos/contracts';
import type { ApiEnvelope, BusinessDataClient, ProjectContext } from './business-data-api.js';
import { CONNECTED_SOURCE, ConnectedApiError, createBusinessDataClient } from './business-data-api.js';

type NodeChild = Node | string;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, children: NodeChild[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return node;
}

function text(value: unknown): string {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function loading(message: string): HTMLElement {
  return el('div', { class: 'state' }, [el('div', { class: 'spinner' }), message]);
}

function blocked(reason: string): HTMLElement {
  return el('div', { class: 'v3-blocked' }, [
    el('div', { class: 'v3-blocked-kicker' }, ['BLOCKED']),
    el('h2', {}, ['Connected data is unavailable']),
    el('p', {}, [reason]),
    el('p', { class: 'muted' }, ['No demo fallback is shown in this surface. Configure the server-side target Base to continue.']),
  ]);
}

function envelopeData<T>(envelope: ApiEnvelope<T>): T | null {
  if (envelope.mode !== 'CONNECTED' || !('data' in envelope)) return null;
  return envelope.data;
}

function envelopeState<T>(envelope: ApiEnvelope<T>): HTMLElement | null {
  if (envelope.mode === 'BLOCKED') return blocked(envelope.reason);
  if ('error' in envelope) return blocked(envelope.error.message);
  return null;
}

function identityRail(connected: boolean): HTMLElement {
  return el('div', { class: `v3-identity ${connected ? 'is-connected' : 'is-blocked'}` }, [
    el('span', { class: 'v3-identity-dot' }),
    el('span', { class: 'v3-identity-label' }, [connected ? 'CONNECTED TEST BASE' : 'BLOCKED']),
    el('span', { class: 'v3-identity-source' }, [connected ? CONNECTED_SOURCE : 'server-only data boundary']),
  ]);
}

function metric(label: string, value: string): HTMLElement {
  return el('div', { class: 'v3-metric' }, [el('strong', {}, [value]), el('span', {}, [label])]);
}

function projectRow(project: Project, onSelect: () => void): HTMLElement {
  const button = el('button', { class: 'v3-list-row', type: 'button' }, [
    el('span', { class: 'v3-row-main' }, [
      el('strong', {}, [project.title]),
      el('span', { class: 'muted' }, [`${project.project_id} · ${project.project_type}`]),
    ]),
    el('span', { class: `pill pill-${project.status}` }, [project.status]),
  ]);
  button.addEventListener('click', onSelect);
  return button;
}

function resourceRow(resource: Resource): HTMLElement {
  return el('div', { class: 'v3-list-row v3-resource-row' }, [
    el('span', { class: 'v3-row-main' }, [
      el('strong', {}, [resource.name]),
      el('span', { class: 'muted' }, [`${resource.resource_key} · ${resource.city ?? '地点未确认'}`]),
    ]),
    el('span', { class: 'v3-resource-meta' }, [resource.resource_type]),
    el('span', { class: `pill pill-${resource.cooperation_status}` }, [resource.cooperation_status]),
  ]);
}

function contextPanel(context: ProjectContext, onSchedule: () => void): HTMLElement {
  const requirements = el('div', { class: 'v3-context-list' });
  if (!context.requirements.length) requirements.append(el('p', { class: 'muted' }, ['暂无规范化需求记录。']));
  for (const requirement of context.requirements) {
    requirements.append(el('div', { class: 'v3-requirement-row' }, [
      el('span', {}, [`${requirement.role_type} × ${requirement.required_count}`]),
      el('span', { class: 'muted' }, [requirement.location ?? '地点未确认']),
      el('span', { class: 'muted' }, [requirement.duration_hours ? `${requirement.duration_hours}h` : '时长未确认']),
    ]));
  }
  const assignments = el('div', { class: 'v3-context-list' });
  if (!context.assignments.length) assignments.append(el('p', { class: 'muted' }, ['暂无资源指派，排期尚未确认。']));
  for (const assignment of context.assignments) {
    assignments.append(el('div', { class: 'v3-requirement-row' }, [
      el('span', {}, [assignment.resource_key]),
      el('span', { class: 'muted' }, [assignment.role]),
      el('span', { class: `pill pill-${assignment.status}` }, [assignment.status]),
    ]));
  }
  const panel = el('section', { class: 'v3-context-panel' }, [
    el('div', { class: 'v3-panel-head' }, [
      el('div', {}, [el('span', { class: 'v3-eyebrow' }, ['PROJECT CONTEXT']), el('h2', {}, [context.project.title])]),
      el('button', { class: 'btn-primary', type: 'button' }, ['Open Scheduling']),
    ]),
    el('div', { class: 'v3-context-columns' }, [
      el('div', {}, [el('h3', {}, ['Requirement gaps']), requirements]),
      el('div', {}, [el('h3', {}, ['Assignments']), assignments]),
    ]),
  ]);
  panel.querySelector('button')?.addEventListener('click', onSchedule);
  return panel;
}

export interface BusinessDataViewOptions {
  client?: BusinessDataClient;
  onSchedule?: (projectId: string) => void;
}

export async function renderBusinessDataView(options: BusinessDataViewOptions = {}): Promise<HTMLElement> {
  const client = options.client ?? createBusinessDataClient();
  const root = el('div', { class: 'v3-view' });
  root.append(el('div', { class: 'view-head' }, [
    el('div', { class: 'v3-headline-row' }, [el('div', {}, [el('span', { class: 'v3-eyebrow' }, ['OPERATIONS INTELLIGENCE']), el('h1', {}, ['Business Data'])])]),
    el('p', {}, ['Canonical resources, project requirements and assignment gaps from the new Base. Read-only.']),
  ]));
  const host = el('div', { class: 'v3-business-host' }, [loading('Loading connected business data…')]);
  root.append(host);
  try {
    const [projectsEnvelope, resourcesEnvelope] = await Promise.all([
      client.listProjects({ limit: 100 }),
      client.listResources({ limit: 100 }),
    ]);
    const blockedProjects = envelopeState(projectsEnvelope);
    const blockedResources = envelopeState(resourcesEnvelope);
    if (blockedProjects || blockedResources) {
      host.replaceChildren(blockedProjects ?? blockedResources ?? blocked('Connected data is unavailable.'));
      return root;
    }
    const projects = envelopeData(projectsEnvelope) ?? [];
    const initialResources = envelopeData(resourcesEnvelope) ?? [];
    host.replaceChildren(buildConnectedSurface(client, projects, initialResources, options.onSchedule));
  } catch (error) {
    host.replaceChildren(blocked(error instanceof ConnectedApiError ? error.message : 'Connected data could not be loaded.'));
  }
  return root;
}

function buildConnectedSurface(
  client: BusinessDataClient,
  projects: Project[],
  initialResources: Resource[],
  onSchedule?: (projectId: string) => void,
): HTMLElement {
  const projectList = el('div', { class: 'v3-list' });
  const contextHost = el('div', { class: 'v3-context-host' }, [el('p', { class: 'muted' }, ['Select a project to inspect requirement gaps.'])]);
  const resourceList = el('div', { class: 'v3-list' });
  const filter = el('select', { class: 'field', 'aria-label': 'Resource type filter' }) as HTMLSelectElement;
  filter.append(el('option', { value: '' }, ['All resource types']));
  for (const type of ['MODEL', 'MAKEUP', 'PHOTOGRAPHER', 'STUDIO', 'COSTUME', 'RETOUCH', 'PROP', 'OTHER']) filter.append(el('option', { value: type }, [type]));

  const renderResources = (resources: Resource[]): void => {
    resourceList.replaceChildren();
    if (!resources.length) resourceList.append(el('p', { class: 'muted' }, ['No resources match this filter.']));
    resources.forEach((resource) => resourceList.append(resourceRow(resource)));
  };
  filter.addEventListener('change', () => {
    void client.listResources({ type: filter.value || undefined, limit: 100 }).then((envelope) => {
      const state = envelopeState(envelope);
      if (state) resourceList.replaceChildren(state);
      else renderResources(envelopeData(envelope) ?? []);
    }).catch(() => resourceList.replaceChildren(blocked('Resource filter request failed.')));
  });
  renderResources(initialResources);

  for (const project of projects) {
    projectList.append(projectRow(project, () => {
      contextHost.replaceChildren(loading('Loading project context…'));
      void client.getProjectContext(project.project_id).then((envelope) => {
        const state = envelopeState(envelope);
        const context = envelopeData(envelope);
        if (state) contextHost.replaceChildren(state);
        else if (!context) contextHost.replaceChildren(el('p', { class: 'muted' }, ['Project context not found.']));
        else contextHost.replaceChildren(contextPanel(context, () => onSchedule?.(project.project_id)));
      }).catch(() => contextHost.replaceChildren(blocked('Project context request failed.')));
    }));
  }
  if (!projects.length) projectList.append(el('p', { class: 'muted' }, ['No projects in the connected Base.']));

  return el('div', { class: 'v3-connected-surface' }, [
    identityRail(true),
    el('div', { class: 'v3-metric-grid' }, [metric('Projects', String(projects.length)), metric('Resources', String(initialResources.length)), metric('Source', 'NEW BASE')]),
    el('div', { class: 'v3-data-grid' }, [
      el('section', { class: 'v3-panel' }, [el('div', { class: 'v3-panel-head' }, [el('h2', {}, ['Projects']), el('span', { class: 'muted' }, ['Select to inspect'])]), projectList]),
      el('section', { class: 'v3-panel' }, [el('div', { class: 'v3-panel-head' }, [el('h2', {}, ['Resources']), filter]), resourceList]),
    ]),
    contextHost,
  ]);
}
