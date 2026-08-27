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
import { runConnectedLumenWorkflow, validateLumenInput } from './lumen-action.js';
import { createConnectedWorkspaceApi } from './workspace-api.js';
import { workspaceError } from '../src/workspace-data-source.js';
import { ServiceAgentRuntime, createServiceAgentEndpoint } from './features/service-agent/service-agent-runtime.js';
import { loadServiceAgentProductionConfig } from './features/service-agent/service-agent-production-config.js';
import { resolveServiceAgentPort } from './features/service-agent/service-agent-production-binding.js';
import { createEvaluationServerFeature } from './features/evaluation/evaluation-api.js';
import { InMemoryServiceAgentConversationStore } from '@busos/service-agent-port';
import { InMemoryProcessRegistry } from '@busos/orchestrator';
import { createConnectedFeishuDataSource } from './features/feishu/connected-data-source.js';
import { createBusinessDataApi, type BusinessDataResponse } from './business-data.js';
import { createSchedulingApi } from './scheduling-api.js';
import type { ReviewDecision, ReviewStatus } from '@busos/business-repository';

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
const serviceAgentConfig = loadServiceAgentProductionConfig();
const serviceAgentPort = resolveServiceAgentPort(serviceAgentConfig);

const saEndpoint = createServiceAgentEndpoint(
  new ServiceAgentRuntime({
    serviceAgent: serviceAgentPort,
    conversationStore: new InMemoryServiceAgentConversationStore(),
    processRegistry: new InMemoryProcessRegistry(),
  }),
);
const evaluationFeature = createEvaluationServerFeature({ datasetPath: evaluationDatasetPath });
const businessDataSource = createConnectedFeishuDataSource({ buildSha: 'server' });
const canonicalBusinessDataApi = createBusinessDataApi({ env: process.env });
const canonicalSchedulingApi = createSchedulingApi({ repository: canonicalBusinessDataApi.repository });

const BUSINESS_BUILD_SHA = 'server';

/**
 * Translate the server-internal Business Data envelope (`{mode:'BLOCKED',reason}`
 * / `{mode:'CONNECTED',source,data}` / error) into the canonical browser
 * `WorkspaceEnvelope + health` shape the CONNECTED transport requires. The real
 * Feishu reads stay BLOCKED without configuration; the review queue is a local
 * store and returns READY with an honest (non-fabricated) health view.
 */
function translateBusiness<T>(result: BusinessDataResponse<T>): { statusCode: number; body: unknown } {
  const health = businessDataSource.health();
  const { statusCode } = result;
  const body = result.body;
  if (body.mode === 'BLOCKED') {
    return {
      statusCode,
      body: {
        mode: 'CONNECTED',
        buildSha: BUSINESS_BUILD_SHA,
        status: 'BLOCKED',
        error: { code: 'BUSINESS_DATA_NOT_CONFIGURED', message: body.reason },
        health,
      },
    };
  }
  if ('error' in body) {
    return {
      statusCode,
      body: {
        mode: 'CONNECTED',
        buildSha: BUSINESS_BUILD_SHA,
        status: 'ERROR',
        error: body.error,
        health,
      },
    };
  }
  return {
    statusCode,
    body: {
      mode: 'CONNECTED',
      buildSha: BUSINESS_BUILD_SHA,
      status: 'READY',
      data: body.data,
      health,
    },
  };
}

function sendBusiness<T>(res: http.ServerResponse, result: BusinessDataResponse<T>): void {
  const { statusCode, body } = translateBusiness(result);
  sendJson(res, statusCode, body);
}

function businessErrorEnvelope(code: string, message: string, statusCode = 422): { statusCode: number; body: unknown } {
  return {
    statusCode,
    body: {
      mode: 'CONNECTED',
      buildSha: BUSINESS_BUILD_SHA,
      status: 'ERROR',
      error: { code, message },
      health: businessDataSource.health(),
    },
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

    // Feishu v3 canonical operations surface. These handlers are server-only;
    // without target credentials they return BLOCKED and never seed DEMO data.
    if (req.method === 'GET' && pathname === '/api/business-data/projects') {
      const query = new URL(url, 'http://localhost').searchParams;
      const result = await canonicalBusinessDataApi.listProjects({
        limit: query.get('limit') ?? undefined,
        cursor: query.get('cursor') ?? undefined,
      });
      sendJson(res, result.statusCode, result.body);
      return;
    }
    if (req.method === 'GET' && pathname === '/api/business-data/resources') {
      const query = new URL(url, 'http://localhost').searchParams;
      const result = await canonicalBusinessDataApi.listResources({
        limit: query.get('limit') ?? undefined,
        cursor: query.get('cursor') ?? undefined,
        type: query.get('type') ?? undefined,
        status: query.get('status') ?? undefined,
      });
      sendJson(res, result.statusCode, result.body);
      return;
    }
    const businessPath = pathname.split('/').filter(Boolean);
    if (
      req.method === 'GET' && businessPath[0] === 'api' && businessPath[1] === 'business-data' &&
      businessPath[2] === 'resources' && businessPath[4] === 'availability' && businessPath.length === 5
    ) {
      const query = new URL(url, 'http://localhost').searchParams;
      const resourceKey = decodeURIComponent(businessPath[3] ?? '');
      const result = await canonicalBusinessDataApi.listAvailability(resourceKey, {
        start: query.get('start') ?? undefined,
        end: query.get('end') ?? undefined,
        limit: query.get('limit') ?? undefined,
      });
      sendJson(res, result.statusCode, result.body);
      return;
    }
    if (
      req.method === 'GET' && businessPath[0] === 'api' && businessPath[1] === 'business-data' &&
      businessPath[2] === 'projects' && businessPath[4] === 'context' && businessPath.length === 5
    ) {
      const projectId = decodeURIComponent(businessPath[3] ?? '');
      const result = await canonicalBusinessDataApi.getProjectContext(projectId);
      sendJson(res, result.statusCode, result.body);
      return;
    }
    if (req.method === 'POST' && pathname === '/api/scheduling/proposals') {
      let input: unknown;
      try { input = await readJson(req); } catch {
        sendJson(res, 400, { mode: 'CONNECTED', source: 'FEISHU_NEW_BASE', error: { code: 'INVALID_REQUEST', message: 'Invalid JSON body.' } });
        return;
      }
      const result = await canonicalSchedulingApi.proposals(input);
      sendJson(res, result.statusCode, result.body);
      return;
    }
    if (req.method === 'POST' && pathname === '/api/outreach/draft') {
      let input: unknown;
      try { input = await readJson(req); } catch {
        sendJson(res, 400, { mode: 'CONNECTED', source: 'FEISHU_NEW_BASE', error: { code: 'INVALID_REQUEST', message: 'Invalid JSON body.' } });
        return;
      }
      const result = await canonicalSchedulingApi.draft(input);
      sendJson(res, result.statusCode, result.body);
      return;
    }
    if (req.method === 'POST' && pathname === '/api/scheduling/confirm') {
      let input: unknown;
      try { input = await readJson(req); } catch {
        sendJson(res, 400, { mode: 'BLOCKED', reason: 'Invalid JSON body; no scheduling write was performed.' });
        return;
      }
      const result = await canonicalSchedulingApi.confirm(input);
      sendJson(res, result.statusCode, result.body);
      return;
    }

    // BUSOS-R2-BATCH2C — Lumen image-workbench CONNECTED boundary (RunningHub).
    // The browser SPA posts the chosen capability + source image; this server
    // owns the RunningHub key and returns the result. BLOCKED without creds.
    if (req.method === 'POST' && pathname === '/api/lumen/run') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let parsed: unknown;
      try { parsed = JSON.parse(body); } catch {
        sendJson(res, 400, { error: 'invalid JSON body' });
        return;
      }
      const valid = validateLumenInput(parsed);
      if ('error' in valid) {
        sendJson(res, 422, { error: valid.error });
        return;
      }
      const out = await runConnectedLumenWorkflow(valid);
      sendJson(res, 200, out);
      return;
    }

    // Sanitized integration inventory. Only booleans and stable capability
    // labels leave the server; provider URLs, credentials, table ids, and
    // upstream response bodies never cross this endpoint.
    if (req.method === 'GET' && pathname === '/api/integrations/health') {
      const feishuConfigured = canonicalBusinessDataApi.repository !== null;
      const serviceAgentConfigured = serviceAgentConfig !== null;
      const runningHubConfigured = Boolean(
        (process.env.RUNNINGHUB_API_KEY ?? '').trim()
        && (process.env.RUNNINGHUB_CONFIG_JSON ?? '').trim(),
      );
      sendJson(res, 200, {
        mode: 'CONNECTED',
        buildSha: BUSINESS_BUILD_SHA,
        status: 'READY',
        integrations: [
          {
            id: 'feishu',
            mode: feishuConfigured ? 'CONNECTED' : 'BLOCKED',
            capability: 'canonical business data and assignment boundary',
            reason: feishuConfigured ? 'server-side target configured' : 'target Base or adapter configuration is unavailable',
          },
          {
            id: 'service-agent',
            mode: serviceAgentConfigured ? 'CONNECTED' : 'BLOCKED',
            capability: 'production SCS ServiceAgentPort binding',
            reason: serviceAgentConfigured ? 'server-side binding configured' : 'server-side SCS binding is unavailable',
          },
          {
            id: 'creative-provider',
            mode: runningHubConfigured ? 'CONNECTED' : 'BLOCKED',
            capability: 'provider-backed Creative workflow binding',
            reason: runningHubConfigured ? 'server-side workflow mapping configured' : 'provider workflow mapping is unavailable',
          },
        ],
      });
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
    // Feishu V3 product-integration surfaces (Business API). All real Feishu reads
    // fail closed to BLOCKED without a connected configuration; the review queue
    // is a local store and returns READY. Every response is translated into the
    // canonical browser WorkspaceEnvelope+health contract.
    if (req.method === 'GET' && pathname === '/api/business-data/overview') {
      sendBusiness(res, await canonicalBusinessDataApi.getOverview());
      return;
    }
    if (req.method === 'GET' && pathname === '/api/business-data/customers') {
      const query = new URL(url, 'http://localhost').searchParams;
      sendBusiness(res, await canonicalBusinessDataApi.listCustomers({
        limit: query.get('limit') ?? undefined,
        cursor: query.get('cursor') ?? undefined,
        status: query.get('status') ?? undefined,
      }));
      return;
    }
    if (
      req.method === 'GET' && businessPath[0] === 'api' && businessPath[1] === 'business-data' &&
      businessPath[2] === 'customers' && businessPath.length === 4
    ) {
      const customerId = decodeURIComponent(businessPath[3] ?? '');
      sendBusiness(res, await canonicalBusinessDataApi.getCustomer(customerId));
      return;
    }
    if (req.method === 'GET' && pathname === '/api/business-data/orders') {
      const query = new URL(url, 'http://localhost').searchParams;
      sendBusiness(res, await canonicalBusinessDataApi.listOrders({
        limit: query.get('limit') ?? undefined,
        cursor: query.get('cursor') ?? undefined,
        customerId: query.get('customerId') ?? undefined,
        status: query.get('status') ?? undefined,
      }));
      return;
    }
    if (
      req.method === 'GET' && businessPath[0] === 'api' && businessPath[1] === 'business-data' &&
      businessPath[2] === 'orders' && businessPath.length === 4
    ) {
      const orderId = decodeURIComponent(businessPath[3] ?? '');
      sendBusiness(res, await canonicalBusinessDataApi.getOrder(orderId));
      return;
    }
    if (req.method === 'GET' && pathname === '/api/business-data/reviews') {
      const query = new URL(url, 'http://localhost').searchParams;
      const statusParam = query.get('status');
      const allowedStatuses: ReviewStatus[] = ['PENDING', 'APPROVED', 'SKIPPED', 'KEEP_IN_REVIEW'];
      const status = statusParam && allowedStatuses.includes(statusParam as ReviewStatus)
        ? (statusParam as ReviewStatus)
        : undefined;
      sendBusiness(res, await canonicalBusinessDataApi.listReviewQueue({
        limit: query.get('limit') ? Number(query.get('limit')) : undefined,
        cursor: query.get('cursor') ? Number(query.get('cursor')) : undefined,
        status,
        reason: query.get('reason') ?? undefined,
      }));
      return;
    }
    if (
      req.method === 'GET' && businessPath[0] === 'api' && businessPath[1] === 'business-data' &&
      businessPath[2] === 'reviews' && businessPath.length === 4
    ) {
      const reviewId = decodeURIComponent(businessPath[3] ?? '');
      sendBusiness(res, await canonicalBusinessDataApi.getReviewQueueItem(reviewId));
      return;
    }
    if (
      req.method === 'POST' && businessPath[0] === 'api' && businessPath[1] === 'business-data' &&
      businessPath[2] === 'reviews' && businessPath[3] !== undefined && businessPath[4] === 'decision' &&
      businessPath.length === 5
    ) {
      const reviewId = decodeURIComponent(businessPath[3]);
      let body: unknown;
      try {
        body = await readJson(req);
      } catch {
        const err = businessErrorEnvelope('INVALID_REQUEST', 'Invalid JSON body.');
        sendJson(res, err.statusCode, err.body);
        return;
      }
      const parsed = body as { decision?: unknown; idempotencyKey?: unknown; actor?: unknown; note?: unknown; patch?: unknown };
      if (
        typeof parsed.decision !== 'string' ||
        !['APPROVE', 'EDIT_AND_APPROVE', 'SKIP', 'KEEP_IN_REVIEW'].includes(parsed.decision)
      ) {
        const err = businessErrorEnvelope('REVIEW_INVALID_DECISION', 'A valid review decision is required.', 422);
        sendJson(res, err.statusCode, err.body);
        return;
      }
      sendBusiness(res, await canonicalBusinessDataApi.decideReviewQueueItem(
        reviewId,
        parsed.decision as ReviewDecision,
        {
          idempotencyKey: typeof parsed.idempotencyKey === 'string' ? parsed.idempotencyKey : null,
          actor: typeof parsed.actor === 'string' ? parsed.actor : undefined,
          note: typeof parsed.note === 'string' ? parsed.note : null,
          editPatch: parsed.patch && typeof parsed.patch === 'object' ? (parsed.patch as Record<string, unknown>) : null,
        },
      ));
      return;
    }
    if (req.method === 'GET' && pathname === '/api/business-data/audit') {
      const query = new URL(url, 'http://localhost').searchParams;
      const limit = query.get('limit') ? Number(query.get('limit')) : undefined;
      sendBusiness(res, await canonicalBusinessDataApi.listAuditEvents(limit));
      return;
    }
    if (req.method === 'PATCH' && pathname === '/api/business-data/fields') {
      let body: unknown;
      try {
        body = await readJson(req);
      } catch {
        const err = businessErrorEnvelope('INVALID_REQUEST', 'Invalid JSON body.');
        sendJson(res, err.statusCode, err.body);
        return;
      }
      const parsed = body as { entityType?: unknown; entityId?: unknown; patch?: unknown; idempotencyKey?: unknown };
      if (
        typeof parsed.entityType !== 'string' ||
        typeof parsed.entityId !== 'string' ||
        !parsed.patch || typeof parsed.patch !== 'object'
      ) {
        const err = businessErrorEnvelope('INVALID_REQUEST', 'entityType, entityId and patch are required.', 400);
        sendJson(res, err.statusCode, err.body);
        return;
      }
      sendBusiness(res, await canonicalBusinessDataApi.patchBusinessFields({
        entityType: parsed.entityType,
        entityId: parsed.entityId,
        patch: parsed.patch as Record<string, unknown>,
        idempotencyKey: typeof parsed.idempotencyKey === 'string' ? parsed.idempotencyKey : undefined,
      }));
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
