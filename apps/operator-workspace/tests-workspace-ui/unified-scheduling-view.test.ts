import { describe, expect, it } from 'vitest';
import { renderUnifiedSchedulingView } from '../src/features/scheduling/scheduling-view.js';

function installDom(): { textOf: (node: any) => string } {
  function make(tagName: string): any {
    const node: any = {
      tagName,
      children: [],
      parentNode: null,
      attrs: {},
      className: '',
      textContent: '',
      value: '',
      _handlers: {} as Record<string, Function[]>,
      append(...children: any[]) { children.forEach((child) => { if (child && typeof child === 'object') child.parentNode = this; }); this.children.push(...children); },
      appendChild(child: any) { if (child && typeof child === 'object') child.parentNode = this; this.children.push(child); },
      replaceChildren(...children: any[]) { children.forEach((child) => { if (child && typeof child === 'object') child.parentNode = this; }); this.children = children; },
      replaceWith(replacement: any) {
        const parent = this.parentNode;
        if (!parent) return;
        const index = parent.children.indexOf(this);
        if (index >= 0) {
          if (replacement && typeof replacement === 'object') replacement.parentNode = parent;
          parent.children.splice(index, 1, replacement);
        }
      },
      setAttribute(key: string, value: string) { this.attrs[key] = value; },
      removeAttribute(key: string) { delete this.attrs[key]; },
      addEventListener(type: string, handler: Function) { (this._handlers[type] ||= []).push(handler); },
      async click() { for (const handler of this._handlers.click || []) await handler({}); },
      querySelectorAll(selector: string) {
        const found: any[] = [];
        const visit = (candidate: any) => {
          if (!candidate) return;
          if (selector === 'button' && candidate.tagName === 'button') found.push(candidate);
          for (const child of candidate.children || []) visit(child);
        };
        visit(this);
        return found;
      },
    };
    return node;
  }
  (globalThis as any).document = {
    createElement: make,
    createTextNode: (text: string) => ({ __text: text }),
  };
  const textOf = (node: any): string => {
    if (!node) return '';
    if (typeof node.__text === 'string') return node.__text;
    return `${node.textContent || ''}${(node.children || []).map((child: any) => textOf(child)).join('')}`;
  };
  return { textOf };
}

describe('unified scheduling view', () => {
  it('shows deterministic proposals and performs explicit confirmation/readback', async () => {
    const { textOf } = installDom();
    const view = renderUnifiedSchedulingView({ projectId: 'proj_001' });
    const text = textOf(view);
    expect(text).toContain('Scheduling');
    expect(text).toContain('DEMO');
    expect(text).toContain('Confirm slot');

    const confirm = (view.querySelectorAll?.('button') || []).find((button: any) => textOf(button).includes('Confirm slot'));
    expect(confirm).toBeTruthy();
    await confirm.click();
    expect(textOf(view)).toContain('VERIFIED');
    expect(textOf(view)).toContain('confirmed');
    expect(textOf(view)).toContain('1 canonical-style assignment(s)');
  });
});
