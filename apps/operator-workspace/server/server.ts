/**
 * H1-04 — minimal server-only API + static SPA host (CONNECTED mode).
 *
 * This process is the CONNECTED boundary: it owns the real Feishu/Lumen
 * credentials and is the ONLY place the browser may trigger a LIVE action. The
 * SPA itself only ever talks to the in-memory DEMO adapters; the operator posts
 * to `/api/actions/generate-visual-reference` here, which resolves to BLOCKED
 * unless real credentials are configured. Static files are served from ../dist.
 *
 * Run: `node server/dist/server.js` (after `npm run build`).
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runConnectedGenerateVisualReference } from './workspace-action.js';

const PORT = Number(process.env.PORT ?? 4173);
const here = fileURLToPath(new URL('.', import.meta.url));
const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
const indexPath = fileURLToPath(new URL('../index.html', import.meta.url));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = req.url ?? '/';

    // CONNECTED Workspace Action API boundary.
    if (req.method === 'POST' && url === '/api/actions/generate-visual-reference') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let input: unknown;
      try { input = JSON.parse(body); } catch {
        res.statusCode = 400;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'invalid JSON body' }));
        return;
      }
      const parsed = input as {
        projectId?: string; prompt?: string; sourceImageBase64?: string;
        sourceImageMimeType?: string; title?: string; idempotencyKey?: string;
      };
      if (!parsed.projectId || !parsed.prompt || !parsed.sourceImageBase64) {
        res.statusCode = 422;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'projectId, prompt and sourceImageBase64 are required' }));
        return;
      }
      const out = await runConnectedGenerateVisualReference(
        {
          projectId: parsed.projectId,
          prompt: parsed.prompt,
          sourceImageBase64: parsed.sourceImageBase64,
          sourceImageMimeType: parsed.sourceImageMimeType ?? 'image/png',
          title: parsed.title,
        },
        parsed.idempotencyKey ?? `srv-${Date.now()}`,
      );
      res.statusCode = out.mode === 'CONNECTED' && out.result?.status === 'SUCCEEDED' ? 200 : 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(out));
      return;
    }

    // Static SPA (DEMO bundle — contains no secrets).
    if (req.method === 'GET') {
      const rel = url === '/' ? '/index.html' : url.split('?')[0];
      const safe = rel.replace(/^\/+/, '');
      const full = fileURLToPath(new URL(`./${safe}`, `file://${distDir}`));
      if (!full.startsWith(distDir)) { res.statusCode = 403; res.end('forbidden'); return; }
      try {
        const data = readFileSync(full);
        res.setHeader('content-type', MIME[full.slice(full.lastIndexOf('.'))] ?? 'application/octet-stream');
        res.end(data);
      } catch {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(readFileSync(indexPath));
      }
      return;
    }

    res.statusCode = 404;
    res.end('not found');
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: String(e) }));
  }
});

server.listen(PORT, () => {
  console.log(`operator-workspace server (CONNECTED boundary) listening on http://localhost:${PORT}`);
});
