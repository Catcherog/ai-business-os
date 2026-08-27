type IntegrationMode = 'DEMO' | 'CONNECTED' | 'LIVE' | 'BLOCKED';

interface IntegrationCard {
  id: string;
  name: string;
  owner: string;
  mode: IntegrationMode;
  capability: string;
  reason: string;
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

function badge(value: IntegrationMode): HTMLElement {
  return el('span', { class: `badge badge-${value.toLowerCase()}` }, [value]);
}

function integrationCard(item: IntegrationCard, onOpen?: () => void): HTMLElement {
  const button = el('button', { class: 'btn', type: 'button' }, ['Open surface']);
  if (onOpen) button.addEventListener('click', onOpen);
  return el('article', {
    class: 'card integration-card',
    'data-integration': item.id,
    'data-state': item.mode.toLowerCase(),
  }, [
    el('div', { class: 'integration-head' }, [
      el('div', {}, [el('span', { class: 'eyebrow' }, [item.owner]), el('h2', {}, [item.name])]),
      badge(item.mode),
    ]),
    el('p', { class: 'integration-capability' }, [item.capability]),
    el('div', { class: 'integration-gate' }, [
      el('strong', {}, ['Connected gate: BLOCKED']),
      el('p', { class: 'muted' }, [item.reason]),
    ]),
    button,
  ]);
}

export interface IntegrationsViewOptions {
  onOpenServiceAgent?: () => void;
  onOpenCreative?: () => void;
  onOpenScheduling?: () => void;
}

/** Sanitized integration inventory; credentials and provider-shaped payloads never render. */
export function renderIntegrationsView(options: IntegrationsViewOptions = {}): HTMLElement {
  const cards: IntegrationCard[] = [
    {
      id: 'feishu',
      name: 'Feishu data plane',
      owner: 'BUSINESS DATA',
      mode: 'BLOCKED',
      capability: 'Canonical customers, orders, projects, resources, and assignment read/write boundary.',
      reason: 'Target Base configuration or authorized assignment mapping is unavailable in this build. No write was attempted.',
    },
    {
      id: 'service-agent',
      name: 'Service Agent',
      owner: 'ACQUISITION',
      mode: 'BLOCKED',
      capability: 'Production SCS transport behind ServiceAgentPort.',
      reason: 'Server-only SCS binding is not configured. The browser stays on DEMO and never ships a secret.',
    },
    {
      id: 'creative-provider',
      name: 'Creative provider',
      owner: 'CREATIVE',
      mode: 'BLOCKED',
      capability: 'Provider-backed image workflow adapter behind the Creative port.',
      reason: 'Connected provider credentials/workflow mapping are not configured. DEMO output is not relabelled LIVE.',
    },
  ];
  const root = el('div', { class: 'integrations-view', 'data-surface': 'integrations' });
  root.append(
    el('div', { class: 'view-head' }, [
      el('span', { class: 'eyebrow' }, ['SYSTEM / INTEGRATIONS']),
      el('h1', {}, ['Integrations']),
      el('p', {}, ['Sanitized capability health. Runtime identity is explicit: DEMO, CONNECTED, LIVE, or BLOCKED.']),
    ]),
    el('div', { class: 'runtime-strip' }, [badge('DEMO'), el('span', { class: 'muted' }, ['This browser surface contains no provider credentials'])]),
    el('div', { class: 'integration-grid' }, [
      ...cards.map((item) => integrationCard(item,
        item.id === 'service-agent' ? options.onOpenServiceAgent
          : item.id === 'creative-provider' ? options.onOpenCreative
            : options.onOpenScheduling,
      )),
    ]),
    el('section', { class: 'section' }, [
      el('h2', {}, ['Operational rule']),
      el('p', { class: 'muted' }, ['A missing or invalid external configuration is a visible BLOCKED state. There is no silent downgrade and no claim of LIVE evidence.']),
    ]),
  );
  return root;
}
