type AutomationStatus = 'READY' | 'RUNNING' | 'SUCCEEDED' | 'HUMAN_REQUIRED' | 'BLOCKED';

interface AutomationDefinition {
  id: string;
  name: string;
  trigger: string;
  action: string;
  status: AutomationStatus;
  lastRun: string;
  trace: string;
}

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

function definitionCard(
  item: AutomationDefinition,
  onRun: (item: AutomationDefinition, host: HTMLElement) => void,
  onOpenRuns: () => void,
): HTMLElement {
  const runHost = el('div', { class: 'automation-run-result', role: 'status' });
  const run = el('button', { class: 'btn-primary', type: 'button', 'data-action': 'automation-run' }, ['Run DEMO']);
  const trace = el('button', { class: 'btn', type: 'button', 'data-action': 'automation-trace' }, ['Open trace']);
  run.addEventListener('click', () => onRun(item, runHost));
  trace.addEventListener('click', onOpenRuns);
  return el('article', { class: 'card automation-card', 'data-automation-id': item.id }, [
    el('div', { class: 'automation-card-head' }, [
      el('div', {}, [el('span', { class: 'eyebrow' }, ['DEFINITION']), el('h2', {}, [item.name])]),
      pill(item.status),
    ]),
    el('dl', { class: 'automation-facts' }, [
      el('dt', {}, ['Trigger']), el('dd', {}, [item.trigger]),
      el('dt', {}, ['Action']), el('dd', {}, [item.action]),
      el('dt', {}, ['Last run']), el('dd', {}, [item.lastRun]),
      el('dt', {}, ['Trace']), el('dd', {}, [item.trace]),
    ]),
    el('div', { class: 'btn-row' }, [run, trace]),
    runHost,
  ]);
}

export interface AutomationsViewOptions {
  onOpenRuns?: () => void;
}

/** Definitions are the product layer; each run exposes a stable trace path. */
export function renderAutomationsView(options: AutomationsViewOptions = {}): HTMLElement {
  const definitions: AutomationDefinition[] = [
    {
      id: 'lead-follow-up',
      name: 'New lead follow-up',
      trigger: 'Candidate passes governance review',
      action: 'Draft availability outreach for operator approval',
      status: 'READY',
      lastRun: 'Never · DEMO',
      trace: '—',
    },
    {
      id: 'shoot-day-pack',
      name: 'Shoot-day brief pack',
      trigger: 'Project slot becomes CONFIRMED',
      action: 'Create project brief and notify the internal workspace',
      status: 'READY',
      lastRun: 'Never · DEMO',
      trace: '—',
    },
    {
      id: 'creative-review',
      name: 'Creative review gate',
      trigger: 'Creative output is generated',
      action: 'Require human review before customer delivery',
      status: 'HUMAN_REQUIRED',
      lastRun: 'Awaiting a governed output',
      trace: 'human gate',
    },
  ];
  const root = el('div', { class: 'automations-view', 'data-surface': 'automations', 'data-journey': 'E' });
  const list = el('div', { class: 'automation-list' });
  root.append(
    el('div', { class: 'view-head' }, [
      el('span', { class: 'eyebrow' }, ['SYSTEM / AUTOMATIONS']),
      el('h1', {}, ['Automations']),
      el('p', {}, ['Definitions sit above Runs and Trace: every execution is inspectable and human gates remain visible.']),
    ]),
    el('div', { class: 'runtime-strip' }, [badge('DEMO'), el('span', { class: 'muted' }, ['Local definitions · no outbound message is sent'])]),
    el('div', { class: 'automation-summary' }, [
      el('div', {}, [el('strong', {}, ['3']), el('span', {}, ['definitions'])]),
      el('div', {}, [el('strong', {}, ['0']), el('span', {}, ['outbound sends'])]),
      el('div', {}, [el('strong', {}, ['1']), el('span', {}, ['human gate visible'])]),
    ]),
    list,
    el('section', { class: 'section' }, [
      el('h2', {}, ['Runs / Trace']),
      el('p', { class: 'muted' }, ['Open a run to inspect stages, outcome, and structured trace. A DEMO run never claims a provider-side delivery.']),
      el('button', { class: 'btn', type: 'button' }, ['Open Runs →']),
    ]),
  );
  const openRuns = options.onOpenRuns ?? (() => undefined);
  root.querySelector('section button')?.addEventListener('click', openRuns);

  for (const item of definitions) {
    list.append(definitionCard(item, (definition, host) => {
      const processId = `automation:${definition.id}:demo`;
      host.replaceChildren(
        pill('SUCCEEDED'),
        el('span', { class: 'muted' }, [` Run created · ${processId} · `]),
        el('button', { class: 'link-button', type: 'button' }, ['Open Trace']),
      );
      host.querySelector('button')?.addEventListener('click', openRuns);
    }, openRuns));
  }
  return root;
}
