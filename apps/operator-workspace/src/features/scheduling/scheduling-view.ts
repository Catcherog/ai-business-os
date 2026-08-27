import type { SchedulingProposal } from '@busos/scheduling';
import {
  createDemoSchedulingClient,
  type SchedulingClient,
  type SchedulingSnapshot,
} from './scheduling-client.js';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return node;
}

function pill(value: string): HTMLElement {
  return el('span', { class: `pill pill-${value}` }, [value]);
}

function badge(value: string): HTMLElement {
  return el('span', { class: `badge badge-${value.toLowerCase()}` }, [value]);
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false }) : value;
}

function isoFromInput(value: string): string | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export interface UnifiedSchedulingViewOptions {
  client?: SchedulingClient;
  initialProjectId?: string | null;
  projectTitle?: string;
}

const DEFAULT_START = '2026-09-20T01:00';
const DEFAULT_END = '2026-09-20T09:00';

function projectContext(snapshot: SchedulingSnapshot): HTMLElement {
  const requirement = snapshot.requirements[0];
  const context = el('section', { class: 'section scheduling-context', 'data-section': 'project-context' });
  context.append(
    el('div', { class: 'panel-head' }, [
      el('div', {}, [el('span', { class: 'eyebrow' }, ['PROJECT CONTEXT']), el('h2', {}, [snapshot.project.title])]),
      badge(snapshot.mode),
    ]),
    el('div', { class: 'scheduling-facts' }, [
      el('div', {}, [el('strong', {}, ['Requirement']), el('p', { class: 'muted' }, [
        requirement ? `${requirement.role_type} × ${requirement.required_count} · ${requirement.duration_hours ?? '—'}h · ${requirement.location ?? 'location unresolved'}` : 'No requirement found',
      ])]),
      el('div', {}, [el('strong', {}, ['Availability']), el('p', { class: 'muted' }, [
        `${snapshot.availability.filter((slot) => slot.status === 'AVAILABLE').length} parsed available intervals · ${snapshot.resources.length} resources`,
      ])]),
      el('div', {}, [el('strong', {}, ['Assignments']), el('p', { class: 'muted' }, [
        snapshot.assignments.length ? `${snapshot.assignments.length} canonical-style assignment(s)` : 'No confirmed assignment yet',
      ])]),
    ]),
  );
  return context;
}

function proposalCard(
  client: SchedulingClient,
  proposal: SchedulingProposal,
  resourceName: string,
  resultHost: HTMLElement,
): HTMLElement {
  const card = el('article', {
    class: 'card scheduling-proposal',
    'data-proposal-id': proposal.proposalId,
  });
  const statusHost = el('div', { class: 'scheduling-confirmation-status', role: 'status' });
  const confirm = el('button', { class: 'btn-primary', type: 'button', 'data-action': 'schedule-confirm' }, ['Confirm slot']);
  const draft = el('button', { class: 'btn', type: 'button', 'data-action': 'schedule-draft' }, ['Draft outreach']);
  card.append(
    el('div', { class: 'proposal-head' }, [
      el('div', {}, [el('span', { class: 'eyebrow' }, ['RECOMMENDED SLOT']), el('h3', {}, [resourceName])]),
      el('span', { class: 'score' }, [`score ${proposal.score}`]),
    ]),
    el('p', { class: 'proposal-time' }, [`${formatTime(proposal.startAt)} → ${formatTime(proposal.endAt)}`]),
    el('div', { class: 'reason-list' }, proposal.reasons.map((reason) => el('span', { class: 'reason' }, [`✓ ${reason}`]))),
    proposal.warnings.length
      ? el('div', { class: 'warning-list' }, proposal.warnings.map((warning) => el('span', {}, [`! ${warning}`])))
      : el('p', { class: 'muted' }, ['No unresolved warnings']),
    el('div', { class: 'btn-row' }, [confirm, draft]),
    statusHost,
  );
  draft.addEventListener('click', () => {
    statusHost.replaceChildren(el('span', { class: 'muted' }, ['Outreach draft is copy-only and remains unsent in DEMO.']));
  });
  confirm.addEventListener('click', () => {
    confirm.setAttribute('disabled', 'true');
    statusHost.replaceChildren(el('span', { class: 'muted' }, ['Confirming and reading back canonical assignment…']));
    void client.confirm({
      proposal,
      idempotencyKey: `schedule:${proposal.proposalId}`,
      actor: 'operator_demo',
    }).then((outcome) => {
      if (outcome.status === 'CONFIRMED' || outcome.status === 'ALREADY_CONFIRMED') {
        statusHost.replaceChildren(
          pill(outcome.status),
          el('span', { class: 'muted' }, [` ${outcome.message} · readback ${outcome.readbackStatus}`]),
        );
        resultHost.replaceChildren(
          el('div', { class: 'state success', 'data-state': 'schedule-confirmed' }, [
            el('strong', {}, ['Slot confirmed']),
            el('span', {}, [` · ${outcome.readbackStatus} · ${outcome.assignment?.assignment_id ?? 'assignment unavailable'}`]),
          ]),
        );
      } else {
        confirm.removeAttribute('disabled');
        statusHost.replaceChildren(pill(outcome.status), el('span', { class: 'err' }, [` ${outcome.message}`]));
        resultHost.replaceChildren(el('div', { class: 'state error', 'data-state': 'schedule-error' }, [outcome.message]));
      }
    }).catch(() => {
      confirm.removeAttribute('disabled');
      statusHost.replaceChildren(el('span', { class: 'err' }, ['Confirmation request failed. No write was reported.']));
    });
  });
  return card;
}

function renderProposals(
  client: SchedulingClient,
  snapshot: SchedulingSnapshot,
  proposals: SchedulingProposal[],
  resultHost: HTMLElement,
): HTMLElement {
  const root = el('section', { class: 'section scheduling-proposals', 'data-section': 'proposals' });
  root.append(el('div', { class: 'panel-head' }, [
    el('div', {}, [el('span', { class: 'eyebrow' }, ['RANKED OPTIONS']), el('h2', {}, [`${proposals.length} candidate slot(s)`])]),
    el('span', { class: 'muted' }, ['deterministic order']),
  ]));
  if (!proposals.length) {
    root.append(el('p', { class: 'muted' }, ['No feasible proposal. Resolve requirement, availability, or conflict facts.']));
    return root;
  }
  const list = el('div', { class: 'scheduling-proposal-list' });
  for (const proposal of proposals) {
    const resource = snapshot.resources.find((item) => item.resource_key === proposal.resourceKey);
    list.append(proposalCard(client, proposal, resource?.name ?? proposal.resourceKey, resultHost));
  }
  root.append(list);
  return root;
}

/** Render the complete DEMO scheduling journey with explicit confirm/readback. */
export function renderUnifiedSchedulingView(options: UnifiedSchedulingViewOptions = {}): HTMLElement {
  const client = options.client ?? createDemoSchedulingClient({
    projectId: options.initialProjectId ?? undefined,
    projectTitle: options.projectTitle,
  });
  const snapshot = client.getSnapshot();
  const root = el('section', { class: 'section scheduling-view', 'data-surface': 'scheduling', 'data-journey': 'A' });
  root.append(el('div', { class: 'view-head' }, [
    el('span', { class: 'eyebrow' }, ['BUSINESS / SCHEDULING']),
    el('h1', {}, ['Scheduling']),
    el('p', {}, ['Deterministic slot suggestions → explicit operator confirmation → canonical-style readback.']),
  ]));
  root.append(el('div', { class: 'runtime-strip' }, [badge('DEMO'), el('span', { class: 'muted' }, ['Local canonical-style store · no Feishu write'])]));
  root.append(projectContext(snapshot));

  const start = el('input', { class: 'field', type: 'datetime-local', 'aria-label': 'Window start' }) as HTMLInputElement;
  const end = el('input', { class: 'field', type: 'datetime-local', 'aria-label': 'Window end' }) as HTMLInputElement;
  start.value = DEFAULT_START;
  end.value = DEFAULT_END;
  const location = el('input', { class: 'field', type: 'text', 'aria-label': 'Location', placeholder: 'Shanghai / 上海' }) as HTMLInputElement;
  location.value = '上海';
  const error = el('p', { class: 'err', role: 'alert' });
  const propose = el('button', { class: 'btn-primary', type: 'button', 'data-action': 'schedule-propose' }, ['Suggest slots']);
  const resultHost = el('div', { class: 'scheduling-result', role: 'status' });
  const proposalsHost = el('div', { class: 'scheduling-proposals-host' });
  const form = el('section', { class: 'section scheduling-form', 'data-section': 'proposal-input' }, [
    el('div', { class: 'panel-head' }, [el('div', {}, [el('span', { class: 'eyebrow' }, ['PROPOSAL INPUT']), el('h2', {}, ['Find a workable shoot slot'])]), badge('DEMO')]),
    el('div', { class: 'form-grid' }, [
      el('label', {}, ['Window start', start]),
      el('label', {}, ['Window end', end]),
      el('label', {}, ['Location', location]),
    ]),
    el('div', { class: 'btn-row' }, [propose, error]),
  ]);
  root.append(form, resultHost, proposalsHost);

  const runProposal = (): void => {
    const startIso = isoFromInput(start.value);
    const endIso = isoFromInput(end.value);
    if (!startIso || !endIso) {
      error.textContent = 'Choose a valid start and end time.';
      return;
    }
    error.textContent = '';
    const proposals = client.propose({ start: startIso, end: endIso, location: location.value.trim() || null });
    proposalsHost.replaceChildren(renderProposals(client, client.getSnapshot(), proposals, resultHost));
  };
  propose.addEventListener('click', runProposal);
  // The preview uses an explicit UTC fixture so it remains deterministic across
  // operator time zones. Subsequent clicks honor the local datetime inputs.
  const previewProposals = client.propose({
    start: '2026-09-20T01:00:00.000Z',
    end: '2026-09-20T09:00:00.000Z',
    location: '上海',
  });
  proposalsHost.replaceChildren(renderProposals(client, client.getSnapshot(), previewProposals, resultHost));
  return root;
}
