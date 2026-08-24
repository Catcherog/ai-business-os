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
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runConnectedGenerateVisualReference } from './workspace-action.js';
import { createConnectedWorkspaceApi } from './workspace-api.js';
import { workspaceError } from '../src/workspace-data-source.js';
import { ServiceAgentRuntime, createServiceAgentEndpoint } from './features/service-agent/service-agent-runtime.js';
import { loadServiceAgentProductionConfig } from './features/service-agent/service-agent-production-config.js';
import { resolveServiceAgentPort } from './features/service-agent/service-agent-production-binding.js';
import { createEvaluationServerFeature } from './features/evaluation/evaluation-api.js';
import { InMemoryServiceAgentConversationStore } from '@busos/service-agent-port';
import { InMemoryProcessRegistry } from '@busos/orchestrator';
import { createConnectedFeishuDataSource } from './features/feishu/connected-data-source.js';

const PORT = Number(process.env.PORT ?? 4173);

// esbuild rewrites `import.meta.url` to the BUNDLE output (server/dist/), so
// import.meta.url-relative file paths would resolve to the wrong location at
// runtime (the bundled server returned 500 for the SPA and 422 for the
// Evaluation Golden Set until this was anchored on process.cwd()). Fallbacks
// cover the two documented run locations: the repo root, and the app directory
// per the header's `node server/dist/server.js`.
function firstExisting(candidates: string[]): string {
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}
const cwd = process.cwd();
const distDir = firstExisting([
  resolve(cwd, 'dist'),
  resolve(cwd, 'apps/operator-workspace/dist'),
]);
const indexPath = firstExisting([
  resolve(cwd, 'index.html'),
  resolve(cwd, 'apps/operator-workspace/index.html'),
]);
const evaluationDatasetPath = firstExisting([
  resolve(cwd, '../../packages/evaluation/datasets/golden-set.v0.json'),
  resolve(cwd, 'packages/evaluation/datasets/golden-set.v0.json'),
]);
const workspaceApi = createConnectedWorkspaceApi();

// BUSOS-R2-BATCH1-PRODUCT-INTEGRATION-CORR-01 — register the three product
// surfaces on the SAME route strings the browser bundle calls, so the contract
// is `browser path === server route === feature contract`. The CONNECTED server
// boundary fails closed without authorization: the Service Agent port is
// fail-closed UNLESS a valid production SCS configuration is supplied (no DEMO
// fallback), the Business Data read is read-only and BLOCKED until real
// configuration is supplied, and the Evaluation surface runs the real
// deterministic Golden Set harness.
// BUSOS-R2-BATCH2-SCS-PRODUCTION-CONNECT-01 — bind the Service Agent port
// behind the existing ServiceAgentProductionAdapter only when a valid
// production SCS configuration is present. No config (or invalid config) keeps
// the CONNECTED server boundary fail-closed; a production error also fails
// closed through the adapter. No DEMO fallback is ever returned (OWNER-REVIEW).
const serviceAgentPort = resolveServiceAgentPort(loadServiceAgentProductionConfig());

const saEndpoint = createServiceAgentEndpoint(
  new ServiceAgentRuntime({
    serviceAgent: serviceAgentPort,
    conversationStore: new InMemoryServiceAgentConversationStore(),
    processRegistry: new InMemoryProcessRegistry(),
  }),
);
const evaluationFeature = createEvaluationServerFeature({ datasetPath: evaluationDatasetPath });
const businessDataSource = createConnectedFeishuDataSource({ buildSha: 'server' });

function businessBlockedCustomersEnvelope() {
  const health = businessDataSource.health();
  return {
    mode: 'CONNECTED',
    buildSha: 'server',
    status: 'BLOCKED',
    error: { code: 'BUSINESS_DATA_NOT_CONFIGURED', message: 'Business Data read requires a connected Feishu configuration.' },
    health: {
      mode: 'CONNECTED',
      connected: health.connected,
      configuredResourceCount: health.configuredResourceCount,
      lastSuccessfulReadAt: null,
      lastSuccessfulWriteAt: null,
      lastReadbackStatus: 'NOT_RUN',
      latencyBucket: 'UNKNOWN',
    },
  };
}

function businessBlockedCustomerEnvelope(customerId: string) {
  return {
    ...businessBlockedCustomersEnvelope(),
    error: { code: 'BUSINESS_DATA_NOT_CONFIGURED', message: `Business Data read for ${customerId} requires a connected Feishu configuration.` },
  };
}

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

    // BUSOS-R2-BATCH1-PRODUCT-INTEGRATION-CORR-01 — product surface routes.
    // Service Agent (fail-closed without configuration).
    if (pathname.startsWith('/api/service-agent/')) {
      let body: unknown;
      if (req.method === 'POST') {
        try { body = await readJson(req); } catch { body = undefined; }
      }
      const result = await saEndpoint({ method: (req.method ?? 'GET') as 'GET' | 'POST', pathname, body });
      sendJson(res, result.statusCode, result.body);
      return;
    }
    // Evaluation (real deterministic Golden Set harness).
    const evaluation = await evaluationFeature.handle({ method: req.method ?? 'GET', pathname });
    if (evaluation) {
      sendJson(res, evaluation.statusCode, evaluation.body);
      return;
    }
    // Business Data — read-only, BLOCKED until a connected configuration exists.
    if (req.method === 'GET' && pathname === '/api/business-data/customers') {
      sendJson(res, 200, businessBlockedCustomersEnvelope());
      return;
    }
    if (req.method === 'GET' && pathname.startsWith('/api/business-data/customers/')) {
      const id = decodeURIComponent(pathname.split('/')[3] ?? '');
      sendJson(res, 200, businessBlockedCustomerEnvelope(id));
      return;
    }

    // Static SPA (DEMO bundle — contains no secrets).
    if (req.method === 'GET') {
      const rel = pathname === '/' ? '/index.html' : pathname;
      const safe = rel.replace(/^\/+/, '');
      // `file://${distDir}` would be an invalid file URL on Windows (missing the
      // third slash); pathToFileURL produces the canonical form.
      const full = fileURLToPath(new URL(`./${safe}`, pathToFileURL(`${distDir}/`)));
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
