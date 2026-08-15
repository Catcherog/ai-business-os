// Headless smoke test for the browser bundle: stubs a minimal DOM and imports
// the built bundle to confirm it loads, seeds the fake workspace (exercising
// the node:crypto shim), and renders without throwing.
const mkEl = () => ({
  replaceChildren() {}, append() {}, appendChild() {}, setAttribute() {},
  addEventListener() {}, replaceWith() {}, className: '', style: {}, textContent: '',
});
globalThis.document = {
  getElementById: () => mkEl(),
  createElement: () => mkEl(),
  createTextNode: () => ({}),
};
globalThis.window = globalThis;

let failed = false;
process.on('unhandledRejection', (e) => { console.error('UNHANDLED', e); failed = true; });

await import('file:///D:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/AI%20Business%20OS/apps/operator-workspace/dist/bundle.js');
await new Promise((r) => setTimeout(r, 800));
console.log(failed ? 'SMOKE_FAIL' : 'SMOKE_OK');
process.exit(failed ? 1 : 0);
