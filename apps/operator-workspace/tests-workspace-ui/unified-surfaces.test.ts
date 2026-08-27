import { describe, expect, it, beforeEach } from 'vitest';
import { renderCreativeView } from '../src/features/creative/creative-view.js';
import { renderAutomationsView } from '../src/features/automations/automations-view.js';
import { renderIntegrationsView } from '../src/features/integrations/integrations-view.js';

function makeElement(tag: string): any {
  const node: any = {
    tagName: tag.toUpperCase(),
    children: [],
    attrs: {} as Record<string, string>,
    handlers: {} as Record<string, Function[]>,
    className: '',
    textContent: '',
    value: '',
    append(...children: any[]) { this.children.push(...children.filter((child) => child != null)); },
    appendChild(child: any) { this.children.push(child); return child; },
    replaceChildren(...children: any[]) { this.children = children.filter((child) => child != null); },
    setAttribute(key: string, value: string) { this.attrs[key] = String(value); if (key === 'class') this.className = String(value); },
    removeAttribute(key: string) { delete this.attrs[key]; },
    addEventListener(type: string, fn: Function) { (this.handlers[type] ||= []).push(fn); },
    async click() { for (const fn of this.handlers.click || []) await fn({}); },
    querySelector(selector: string): any {
      const data = selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];
      const walk = (current: any): any => {
        for (const child of current.children || []) {
          if (data && child.attrs?.['data-action'] === data) return child;
          const found = walk(child);
          if (found) return found;
        }
        return null;
      };
      return walk(this);
    },
  };
  return node;
}

function textOf(node: any): string {
  if (!node) return '';
  if (typeof node.__text === 'string') return node.__text;
  return `${node.textContent || ''}${(node.children || []).map(textOf).join('')}`;
}

function findAll(node: any, predicate: (value: any) => boolean, out: any[] = []): any[] {
  for (const child of node?.children || []) {
    if (predicate(child)) out.push(child);
    findAll(child, predicate, out);
  }
  return out;
}

beforeEach(() => {
  (globalThis as any).document = {
    createElement: (tag: string) => makeElement(tag),
    createTextNode: (value: string) => ({ __text: value }),
  };
});

describe('unified V1 product surfaces', () => {
  it('renders the Creative workspace and records an explicit DEMO job', async () => {
    const root = renderCreativeView({ initialProjectId: 'project_demo_001' });
    expect(textOf(root)).toContain('Recent Jobs');
    expect(textOf(root)).toContain('Reference assets');
    expect(textOf(root)).toContain('Run DEMO');

    const run = root.querySelector('[data-action="creative-demo-run"]');
    expect(run).toBeTruthy();
    await run.click();
    const rendered = textOf(root);
    expect(rendered).toContain('creative_job_');
    expect(rendered).toContain('DEMO');
    expect(rendered).toContain('SUCCEEDED');
    expect(rendered).toContain('lumen-demo://');
  });

  it('surfaces a connected Creative provider as BLOCKED without a fake output', async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      mode: 'BLOCKED',
      reason: 'provider configuration unavailable',
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
    try {
      const root = renderCreativeView();
      const check = root.querySelector('[data-action="creative-connected-run"]');
      expect(check).toBeTruthy();
      await check.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
      const rendered = textOf(root);
      expect(rendered).toContain('BLOCKED');
      expect(rendered).toContain('provider configuration unavailable');
      expect(rendered).not.toContain('lumen-demo://');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it('keeps Automations above Runs/Trace and exposes a runnable DEMO definition', async () => {
    let openedRuns = 0;
    const root = renderAutomationsView({ onOpenRuns: () => { openedRuns += 1; } });
    expect(textOf(root)).toContain('Definitions sit above Runs and Trace');
    const run = root.querySelector('[data-action="automation-run"]');
    expect(run).toBeTruthy();
    await run.click();
    expect(textOf(root)).toContain('automation:lead-follow-up:demo');
    expect(textOf(root)).toContain('SUCCEEDED');
    const traceButtons = findAll(root, (value) => value.attrs?.['data-action'] === 'automation-trace');
    expect(traceButtons.length).toBeGreaterThan(0);
    await traceButtons[0].click();
    expect(openedRuns).toBe(1);
  });

  it('renders sanitized integration health with visible BLOCKED gates', () => {
    const root = renderIntegrationsView();
    const rendered = textOf(root);
    expect(rendered).toContain('Feishu data plane');
    expect(rendered).toContain('Service Agent');
    expect(rendered).toContain('Creative provider');
    expect(rendered).toContain('Connected gate: BLOCKED');
    expect(rendered).toContain('no provider credentials');
  });
});
