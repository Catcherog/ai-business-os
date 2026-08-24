import type { Project } from '@busos/contracts';
import type { BusinessDataClient, ProjectContext } from './business-data-api.js';
import { ConnectedApiError, createBusinessDataClient } from './business-data-api.js';
import type { OutreachDraft, SchedulingProposal } from '@busos/scheduling';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) key === 'class' ? node.className = value : node.setAttribute(key, value);
  for (const child of children) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return node;
}

function loading(message: string): HTMLElement { return el('div', { class: 'state' }, [el('div', { class: 'spinner' }), message]); }
function blocked(reason: string): HTMLElement {
  return el('div', { class: 'v3-blocked' }, [el('div', { class: 'v3-blocked-kicker' }, ['BLOCKED']), el('h2', {}, ['Scheduling is unavailable']), el('p', {}, [reason]), el('p', { class: 'muted' }, ['No demo proposals or messages are shown.'])]);
}
function fmt(value: string | null | undefined): string { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '未确认'; }

export interface SchedulingViewOptions { client?: BusinessDataClient; initialProjectId?: string | null; }

export async function renderSchedulingView(options: SchedulingViewOptions = {}): Promise<HTMLElement> {
  const client = options.client ?? createBusinessDataClient();
  const root = el('div', { class: 'v3-view' });
  root.append(el('div', { class: 'view-head' }, [el('span', { class: 'v3-eyebrow' }, ['DECISION SUPPORT']), el('h1', {}, ['Scheduling']), el('p', {}, ['从规范化需求到可解释候选时段；确认只保留在本地 UI，不写入 Feishu。'])]));
  const host = el('div', { class: 'v3-scheduling-host' }, [loading('Loading connected projects…')]);
  root.append(host);
  try {
    const envelope = await client.listProjects({ limit: 100 });
    if (envelope.mode === 'BLOCKED') { host.replaceChildren(blocked(envelope.reason)); return root; }
    if ('error' in envelope) { host.replaceChildren(blocked(envelope.error.message)); return root; }
    host.replaceChildren(buildSchedulingSurface(client, envelope.data, options.initialProjectId));
  } catch (error) {
    host.replaceChildren(blocked(error instanceof ConnectedApiError ? error.message : 'Connected projects could not be loaded.'));
  }
  return root;
}

function buildSchedulingSurface(client: BusinessDataClient, projects: Project[], initialProjectId?: string | null): HTMLElement {
  const projectSelect = el('select', { class: 'field', 'aria-label': 'Project' }) as HTMLSelectElement;
  projectSelect.append(el('option', { value: '' }, ['Select a project']));
  for (const project of projects) projectSelect.append(el('option', { value: project.project_id }, [`${project.title} · ${project.project_id}`]));
  if (initialProjectId && projects.some((project) => project.project_id === initialProjectId)) projectSelect.value = initialProjectId;
  const startInput = el('input', { class: 'field', type: 'datetime-local', 'aria-label': 'Start' }) as HTMLInputElement;
  const endInput = el('input', { class: 'field', type: 'datetime-local', 'aria-label': 'End' }) as HTMLInputElement;
  const locationInput = el('input', { class: 'field', type: 'text', placeholder: 'Location (optional)', 'aria-label': 'Location' }) as HTMLInputElement;
  const contextHost = el('div', { class: 'v3-context-host' }, [el('p', { class: 'muted' }, ['Choose a project to load canonical requirements.'])]);
  const resultsHost = el('div', { class: 'v3-proposals-host' });
  const errorHost = el('div', { class: 'err', role: 'alert' });
  const generateButton = el('button', { class: 'btn-primary', type: 'button' }, ['Generate proposals']);

  const renderContext = (context: ProjectContext | null): void => {
    if (!context) { contextHost.replaceChildren(el('p', { class: 'muted' }, ['Project context not found.'])); return; }
    contextHost.replaceChildren(el('section', { class: 'v3-context-panel' }, [
      el('div', { class: 'v3-panel-head' }, [el('div', {}, [el('span', { class: 'v3-eyebrow' }, ['PROJECT CONTEXT']), el('h2', {}, [context.project.title])]), el('span', { class: 'v3-context-count' }, [`${context.requirements.length} requirements`])]),
      el('div', { class: 'v3-context-columns' }, [
        el('div', {}, [el('h3', {}, ['Requirements']), ...context.requirements.map((requirement) => el('div', { class: 'v3-requirement-row' }, [`${requirement.role_type} × ${requirement.required_count}`, el('span', { class: 'muted' }, [requirement.duration_hours ? `${requirement.duration_hours}h` : 'duration unresolved'])]))]),
        el('div', {}, [el('h3', {}, ['Assignments']), ...context.assignments.map((assignment) => el('div', { class: 'v3-requirement-row' }, [assignment.resource_key, el('span', { class: `pill pill-${assignment.status}` }, [assignment.status])]))]),
      ]),
    ]));
  };

  const loadContext = (): void => {
    if (!projectSelect.value) { contextHost.replaceChildren(el('p', { class: 'muted' }, ['Choose a project to load canonical requirements.'])); return; }
    contextHost.replaceChildren(loading('Loading requirements and assignments…'));
    void client.getProjectContext(projectSelect.value).then((envelope) => {
      if (envelope.mode === 'BLOCKED') contextHost.replaceChildren(blocked(envelope.reason));
      else if ('error' in envelope) contextHost.replaceChildren(blocked(envelope.error.message));
      else renderContext(envelope.data);
    }).catch(() => contextHost.replaceChildren(blocked('Project context request failed.')));
  };
  projectSelect.addEventListener('change', loadContext);
  if (projectSelect.value) loadContext();

  generateButton.addEventListener('click', () => {
    errorHost.replaceChildren();
    if (!projectSelect.value || !startInput.value || !endInput.value) { errorHost.textContent = 'Select a project and both time boundaries.'; return; }
    const start = new Date(startInput.value).toISOString();
    const end = new Date(endInput.value).toISOString();
    generateButton.setAttribute('disabled', 'true');
    resultsHost.replaceChildren(loading('Ranking connected availability…'));
    void client.propose({ projectId: projectSelect.value, start, end, location: locationInput.value.trim() || undefined }).then((envelope) => {
      generateButton.removeAttribute('disabled');
      if (envelope.mode === 'BLOCKED') resultsHost.replaceChildren(blocked(envelope.reason));
      else if ('error' in envelope) resultsHost.replaceChildren(blocked(envelope.error.message));
      else renderProposals(client, projectSelect.value, envelope.data, resultsHost);
    }).catch(() => { generateButton.removeAttribute('disabled'); resultsHost.replaceChildren(blocked('Proposal request failed.')); });
  });

  return el('div', { class: 'v3-scheduling-surface' }, [
    el('div', { class: 'v3-identity is-connected' }, [el('span', { class: 'v3-identity-dot' }), el('span', { class: 'v3-identity-label' }, ['CONNECTED TEST BASE']), el('span', { class: 'v3-identity-source' }, ['FEISHU_NEW_BASE'])]),
    el('section', { class: 'v3-panel v3-scheduling-form' }, [
      el('div', { class: 'v3-panel-head' }, [el('div', {}, [el('span', { class: 'v3-eyebrow' }, ['PROPOSAL INPUT']), el('h2', {}, ['Find a workable slot'])]), el('span', { class: 'muted' }, ['read-only facts'])]),
      el('div', { class: 'v3-form-grid' }, [
        el('label', {}, ['Project', projectSelect]),
        el('label', {}, ['Window start', startInput]),
        el('label', {}, ['Window end', endInput]),
        el('label', {}, ['Location', locationInput]),
      ]),
      el('div', { class: 'v3-form-actions' }, [generateButton, errorHost]),
    ]),
    contextHost,
    resultsHost,
  ]);
}

function renderProposals(client: BusinessDataClient, projectId: string, proposals: SchedulingProposal[], host: HTMLElement): void {
  if (!proposals.length) { host.replaceChildren(el('section', { class: 'v3-panel' }, [el('h2', {}, ['No feasible proposals']), el('p', { class: 'muted' }, ['Hard constraints eliminated every candidate. Review the unresolved availability or requirement facts.'])])); return; }
  const list = el('div', { class: 'v3-proposal-list' });
  proposals.forEach((proposal, index) => list.append(proposalCard(client, projectId, proposal, index === 0)));
  host.replaceChildren(el('section', { class: 'v3-panel' }, [el('div', { class: 'v3-panel-head' }, [el('div', {}, [el('span', { class: 'v3-eyebrow' }, ['RANKED OPTIONS']), el('h2', {}, [`${proposals.length} feasible proposals`])]), el('span', { class: 'muted' }, ['deterministic order'])]), list]));
}

function proposalCard(client: BusinessDataClient, projectId: string, proposal: SchedulingProposal, recommended: boolean): HTMLElement {
  const draftHost = el('div', { class: 'v3-draft-host' });
  const card = el('article', { class: `v3-proposal-card${recommended ? ' is-recommended' : ''}` }, [
    el('div', { class: 'v3-proposal-head' }, [
      el('div', {}, [recommended ? el('span', { class: 'v3-recommended' }, ['RECOMMENDED']) : el('span', { class: 'v3-eyebrow' }, ['OPTION']), el('h3', {}, [proposal.resourceKey])]),
      el('span', { class: 'v3-score' }, [`score ${proposal.score}`]),
    ]),
    el('div', { class: 'v3-proposal-time' }, [`${fmt(proposal.startAt)} → ${fmt(proposal.endAt)}`]),
    el('div', { class: 'v3-reason-list' }, proposal.reasons.map((reason) => el('span', { class: 'v3-reason' }, [`✓ ${reason}`]))),
    proposal.warnings.length ? el('div', { class: 'v3-warning-list' }, proposal.warnings.map((warning) => el('span', {}, [`! ${warning}`]))) : el('div', { class: 'v3-warning-list is-empty' }, ['No unresolved warnings']),
    el('div', { class: 'v3-proposal-actions' }, [
      el('button', { class: 'btn-primary', type: 'button' }, ['Generate model / makeup draft']),
      el('button', { class: 'btn-secondary', type: 'button' }, ['Confirm locally']),
    ]),
    draftHost,
  ]);
  const buttons = card.querySelectorAll('button');
  buttons[0]?.addEventListener('click', () => {
    const button = buttons[0]!;
    button.setAttribute('disabled', 'true');
    void client.draft({ projectId, resourceKey: proposal.resourceKey, requirementId: proposal.requirementId, audience: 'resource', scene: 'availability_check' }).then((envelope) => {
      button.removeAttribute('disabled');
      if (envelope.mode === 'BLOCKED') draftHost.replaceChildren(blocked(envelope.reason));
      else if ('error' in envelope) draftHost.replaceChildren(blocked(envelope.error.message));
      else draftHost.replaceChildren(draftCard(envelope.data));
    }).catch(() => { button.removeAttribute('disabled'); draftHost.replaceChildren(blocked('Draft request failed.')); });
  });
  buttons[1]?.addEventListener('click', () => {
    buttons[1]!.textContent = 'Local confirmation saved';
    buttons[1]!.classList.add('is-confirmed');
  });
  return card;
}

function draftCard(draft: OutreachDraft): HTMLElement {
  const copy = el('button', { class: 'btn-secondary', type: 'button' }, ['Copy script']);
  const status = el('span', { class: 'muted' });
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(draft.body).then(() => { copy.textContent = 'Copied'; status.textContent = 'Text only · not sent'; }).catch(() => { status.textContent = 'Copy unavailable; select text manually.'; });
  });
  return el('div', { class: 'v3-draft-card' }, [el('div', { class: 'v3-panel-head' }, [el('strong', {}, ['Availability draft']), el('span', { class: 'muted' }, [draft.scriptId ?? 'template missing'])]), el('pre', {}, [draft.body]), el('div', { class: 'v3-proposal-actions' }, [copy, status])]);
}
