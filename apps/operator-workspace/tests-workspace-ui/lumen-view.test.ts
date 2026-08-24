import { describe, expect, it } from 'vitest';

/**
 * Lumen image-workbench UI test (BUSOS-R2-BATCH2C).
 *
 * Drives the REAL ui.ts module graph through a minimal DOM shim (same technique
 * as smoke-run.mjs) so we can assert: the Lumen surface renders, capability
 * cards are present, the form reflects the selected capability, the DEMO run
 * executes end-to-end, the result + history display, and no secret material
 * leaks into the rendered presentation.
 */
const ALL: any[] = [];
function mkEl(tag: string): any {
  const el: any = {
    tagName: tag,
    children: [] as any[],
    _handlers: {} as Record<string, Function[]>,
    className: '',
    style: {},
    textContent: '',
    value: '',
    attrs: {} as Record<string, string>,
    append(...kids: any[]) { for (const k of kids) this.children.push(k); },
    appendChild(k: any) { this.children.push(k); },
    replaceChildren(...kids: any[]) { this.children = kids; },
    replaceWith() { /* no-op */ },
    setAttribute(k: string, v: string) { this.attrs[k] = v; },
    removeAttribute(k: string) { delete this.attrs[k]; },
    addEventListener(type: string, fn: Function) { (this._handlers[type] ||= []).push(fn); },
    async click() { for (const fn of this._handlers['click'] || []) await fn({ key: 'Enter' }); },
  };
  ALL.push(el);
  return el;
}
const byId: Record<string, any> = {};
(globalThis as any).document = {
  getElementById(id: string) { return (byId[id] ||= mkEl('div')); },
  createElement: mkEl,
  createTextNode: (t: string) => ({ __text: t }),
};
(globalThis as any).window = globalThis;

function textOf(node: any): string {
  let s = '';
  if (node == null) return s;
  if (typeof node.__text === 'string') s += node.__text;
  if (typeof node.textContent === 'string') s += node.textContent;
  const kids = node.children || [];
  for (const c of kids) s += textOf(c);
  return s;
}
function findDeep(node: any, pred: (e: any) => boolean): any {
  if (!node || typeof node !== 'object') return undefined;
  if (pred(node)) return node;
  for (const c of node.children || []) {
    const r = findDeep(c, pred);
    if (r) return r;
  }
  return undefined;
}
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

const FORBIDDEN = ['apiKey', 'api_key', 'RUNNINGHUB_API_KEY', 'Bearer ', 'password', 'secret', 'authorization'];

describe('Lumen image-workbench UI', () => {
  it('renders the surface, capability cards, form, DEMO run + result + history, no secret leakage', async () => {
    const driver = await import('../src/smoke-driver.js');
    await driver.initWorkspace();
    driver.renderApp(driver.getDataSource());
    // Let the initial overview render settle before navigating. renderContent is
    // async; an in-flight overview render (viewOverview awaits datasource work)
    // would otherwise resolve AFTER the synchronous Lumen view and overwrite it
    // on the final replaceChildren under the headless DOM shim.
    await tick(60);

    driver.navigate('lumen');
    await tick(60);
    const content = (globalThis as any).document.getElementById('content');
    const text = textOf(content);

    // Surface + intro
    expect(text).toContain('Lumen · AI 图像工作台');
    expect(text).toContain('选择能力');

    // Capability cards (>= 4 required; we ship 5)
    const cards = ALL.filter((e) => (e.className || '').includes('lumen-cap-card'));
    expect(cards.length).toBeGreaterThanOrEqual(4);
    const labels = cards.map((c) => textOf(c)).join(' | ');
    expect(labels).toContain('AI 产品图');
    expect(labels).toContain('AI 换背景');
    expect(labels).toContain('AI 局部修图');
    expect(labels).toContain('AI 风格变体');

    // Select a capability -> form reflects it
    const productCard = findDeep(content, (e) => (e.className || '').includes('lumen-cap-card') && textOf(e).includes('AI 产品图'));
    expect(productCard).toBeTruthy();
    await productCard.click();
    await tick();
    const afterSelect = textOf((globalThis as any).document.getElementById('content'));
    expect(afterSelect).toContain('风格 / 场景描述'); // PRODUCT_SHOT promptLabel

    // Provide a source data URL (no FileReader needed) + run DEMO
    const dataUrlInput = findDeep((globalThis as any).document.getElementById('content'), (e) => (e.attrs?.placeholder || '').includes('data URL'));
    expect(dataUrlInput).toBeTruthy();
    dataUrlInput.value = 'data:image/png;base64,AAAA';
    const demoBtn = findDeep((globalThis as any).document.getElementById('content'), (e) => (e.className || '').includes('btn-primary') && textOf(e).includes('运行（DEMO）'));
    expect(demoBtn).toBeTruthy();
    await demoBtn.click();
    await tick();
    await tick();

    const resultText = textOf((globalThis as any).document.getElementById('content'));
    // Status shown via pill ('成功' for SUCCEEDED) + DEMO badge + fake demo url
    expect(resultText).toMatch(/成功|SUCCEEDED/);
    expect(resultText).toContain('lumen-demo://runninghub/');
    expect(resultText).toContain('DEMO · 模拟 RunningHub');

    // History recorded the run
    const history = driver.getLumenHistory();
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].type).toBe('PRODUCT_SHOT');
    expect(history[0].status).toBe('SUCCEEDED');
    expect(history[0].mode).toBe('DEMO');

    // No secret material in the rendered presentation
    for (const tok of FORBIDDEN) {
      expect(resultText).not.toContain(tok);
    }
  });
});
