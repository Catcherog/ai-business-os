import { initWorkspace, getService } from './api.js';
import { renderApp } from './ui.js';
import { buildSha, release } from './build-info.js';

// Smoke seam (H1-04): expose the exact symbols the headless browser smoke drives
// so it can run the REAL `runGenerateVisualReference` code path (DEMO mode) under
// a DOM shim. Harmless in the browser; never used by the UI.
export { runGenerateVisualReference, getActionRepo, getActionRegistry, getRunService, getRunRegistry } from './smoke-driver.js';
export { getMemoryService } from './api.js';

// X01 — render the build identity into the sidebar footer (placeholder lives in
// index.html). Only a non-sensitive short SHA + release label; no secrets.
function renderBuildMeta(): void {
  const meta = document.getElementById('build-meta');
  if (meta) meta.textContent = `Build ${buildSha} · ${release}`;
}

initWorkspace()
  .then(() => {
    renderApp(getService());
    renderBuildMeta();
  })
  .catch((err: unknown) => {
    const content = document.getElementById('content');
    const msg = err instanceof Error ? err.message : String(err);
    if (content) {
      content.replaceChildren();
      content.append(
        Object.assign(document.createElement('div'), {
          className: 'state',
          textContent: `初始化失败：${msg}`,
        }),
      );
    }
  });
