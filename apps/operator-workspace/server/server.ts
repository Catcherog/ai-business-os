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
import { createConnectedWorkspaceApi } from './workspace-api.js';
import { workspaceError } from '../src/workspace-data-source.js';

const PORT = Number(process.env.PORT ?? 4173);
const here = fileURLToPath(new URL('.', import.meta.url));
const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
const indexPath = fileURLToPath(new URL('../index.html', import.meta.url));
const workspaceApi = createConnectedWorkspaceApi();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json',
};

function sendJson(res: http.ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  let body = '';
  for await (const chunk of req) body += chunk;
  return JSON.parse(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = req.url ?? '/';
    const pathname = new URL(url, 'http://localhost').pathname;

    // Canonical Workspace Data Source API. Connected configuration is owned by
    // this server; missing configuration is returned as BLOCKED and never
    // replaced with browser DEMO data. Review decisions also remain BLOCKED
    // here because this batch has no live-write authorization.
    if (req.method === 'GET' && pathname === '/api/workspace/runtime') {
      sendJson(res, 200, await workspaceApi.runtime());
      return;
    }
    const workspacePath = pathname.split('/').filter(Boolean);
    if (workspacePath[0] === 'api' && workspacePath[1] === 'workspace') {
      const surface = workspacePath[2];
      const idSegment = workspacePath[3];
      let id: string | undefined;
      try {
        id = idSegment === undefined ? undefined : decodeURIComponent(idSegment);
      } catch {
        sendJson(res, 400, workspaceError('CONNECTED', 'unknown', 'WORKSPACE_INVALID_ID', 'Invalid workspace identifier.'));
        return;
      }

      if (req.method === 'GET' && workspacePath.length === 3) {
        if (surface === 'projects') { sendJson(res, 200, await workspaceApi.listProjects()); return; }
        if (surface === 'reviews') { sendJson(res, 200, await workspaceApi.listReviews()); return; }
        if (surface === 'runs') { sendJson(res, 200, await workspaceApi.listRuns()); return; }
      }
      if (req.method === 'GET' && id !== undefined && workspacePath.length === 4) {
        if (surface === 'projects') { sendJson(res, 200, await workspaceApi.getProject(id)); return; }
        if (surface === 'reviews') { sendJson(res, 200, await workspaceApi.getReview(id)); return; }
        if (surface === 'runs') { sendJson(res, 200, await workspaceApi.getRun(id)); return; }
      }
      if (
        req.method === 'POST' && surface === 'reviews' && id !== undefined &&
        workspacePath.length === 5 && workspacePath[4] === 'decision'
      ) {
        const runtime = await workspaceApi.runtime();
        let input: unknown;
        try {
          input = await readJson(req);
        } catch {
          sendJson(res, 400, workspaceError(runtime.mode, runtime.buildSha, 'WORKSPACE_INVALID_REQUEST', 'Invalid JSON body.'));
          return;
        }
        const parsed = input as { action?: unknown; patch?: unknown; note?: unknown };
        if (
          parsed.action !== 'APPROVE' && parsed.action !== 'EDIT_APPROVE' && parsed.action !== 'REJECT'
        ) {
          sendJson(res, 422, workspaceError(runtime.mode, runtime.buildSha, 'WORKSPACE_INVALID_REQUEST', 'A valid review action is required.'));
          return;
        }
        sendJson(res, 200, await workspaceApi.decideReview({
          caseId: id,
          action: parsed.action,
          patch: parsed.patch as never,
          note: typeof parsed.note === 'string' ? parsed.note : null,
        }));
        return;
      }
    }

    // CONNECTED Workspace Action API boundary.
    if (req.method === 'POST' && pathname === '/api/actions/generate-visual-reference') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let input: unknown;
      try { input = JSON.parse(body); } catch {
        sendJson(res, 400, { error: 'invalid JSON body' });
        return;
      }
      const parsed = input as {
        projectId?: string; prompt?: string; sourceImageBase64?: string;
        sourceImageMimeType?: string; title?: string; idempotencyKey?: string;
      };
      if (!parsed.projectId || !parsed.prompt || !parsed.sourceImageBase64) {
        sendJson(res, 422, { error: 'projectId, prompt and sourceImageBase64 are required' });
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
      sendJson(res, 200, out);
      return;
    }

    // Static SPA (DEMO bundle — contains no secrets).
    if (req.method === 'GET') {
      const rel = pathname === '/' ? '/index.html' : pathname;
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
    sendJson(res, 500, { error: 'internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`operator-workspace server (CONNECTED boundary) listening on http://localhost:${PORT}`);
});
