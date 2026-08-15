import { initWorkspace } from './api.js';
import { renderApp } from './ui.js';

initWorkspace()
  .then((svc) => renderApp(svc))
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
