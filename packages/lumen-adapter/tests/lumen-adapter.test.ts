import { describe, it, expect } from 'vitest';
import { RealLumenAdapter, FakeLumenAdapter, createFakeLumenAdapter, createLumenAdapterFromEnv } from '../src/index.js';

/**
 * P5-F precursor: exercise the REAL Lumen adapter against a stubbed HTTP
 * transport that faithfully mimics the deployed Lumen API (auth -> projects
 * -> jobs -> poll -> signedUrls, plus DELETE cleanup). This validates the
 * real adapter's mapping WITHOUT any network or provider key.
 */

function makeLumenStub(opts: { failJob?: boolean } = {}) {
  let projectCounter = 0;
  const jobStatus = opts.failJob ? 'failed' : 'succeeded';
  let deleteCount = 0;
  const lumenJobs: Record<string, any> = {};

  const json = (body: unknown, status = 200) =>
    ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

  const fetchFn: typeof fetch = async (input: any, init?: any) => {
    const url: string = typeof input === 'string' ? input : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(init.body) : undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const hasAuth = !!headers.Authorization;

    if (url.endsWith('/api/auth')) {
      return json({ success: true, token: 'stub-lumen-token' });
    }
    if (!hasAuth) return json({ errorCode: 'UNAUTHORIZED', message: 'no auth' }, 401);

    // POST /api/projects
    if (method === 'POST' && url.endsWith('/api/projects')) {
      const pid = `proj_${++projectCounter}`;
      const versionId = `ver_src_${pid}`;
      const assetId = `asset_src_${pid}`;
      const storageKey = `projects/${pid}/original/${assetId}.bin`;
      const snapshot = {
        project: { id: pid, name: body.name, activeVersionId: versionId },
        assets: [{ id: assetId, storageKey, mimeType: body.mimeType }],
        versions: [{ id: versionId, assetId }],
        activeVersion: { id: versionId, assetId },
        signedUrls: { [assetId]: `file://${storageKey}` },
      };
      return json(snapshot, 201);
    }

    // POST /api/projects/:id/jobs
    if (method === 'POST' && /\/api\/projects\/[^/]+\/jobs$/.test(url)) {
      const m = url.match(/\/api\/projects\/([^/]+)\/jobs$/);
      const pid = m![1];
      if (!headers['Idempotency-Key']) {
        return json({ errorCode: 'INVALID_RECIPE', message: 'missing Idempotency-Key' }, 400);
      }
      const jobId = `job_${pid}`;
      const job = {
        id: jobId,
        projectId: pid,
        prompt: body.prompt,
        status: 'queued',
        inputVersionId: body.inputVersionId,
      };
      // Terminal immediately so polling returns without sleeping. A succeeded
      // real job carries `resultVersionId` so the adapter can resolve the
      // generated asset from the snapshot's signed URLs.
      const resultVersionId = `ver_gen_${pid}`;
      lumenJobs[jobId] = { ...job, status: jobStatus, resultVersionId };
      return json({ ...job, status: jobStatus, resultVersionId }, 201);
    }

    // GET /api/jobs/:id
    if (method === 'GET' && /\/api\/jobs\/[^/]+$/.test(url)) {
      const m = url.match(/\/api\/jobs\/([^/]+)$/);
      const job = lumenJobs[m![1]];
      if (!job) return json({ errorCode: 'JOB_NOT_FOUND', message: 'nf' }, 404);
      return json(job);
    }

    // GET /api/projects/:id  (result snapshot after success)
    if (method === 'GET' && /\/api\/projects\/[^/]+$/.test(url)) {
      const m = url.match(/\/api\/projects\/([^/]+)$/);
      const pid = m![1];
      const resultAssetId = `asset_gen_${pid}`;
      const resultVersionId = `ver_gen_${pid}`;
      const storageKey = `projects/${pid}/generated/${resultAssetId}.bin`;
      const snapshot = {
        project: { id: pid, activeVersionId: `ver_src_${pid}` },
        assets: [{ id: resultAssetId, storageKey, mimeType: 'image/png' }],
        versions: [{ id: resultVersionId, assetId: resultAssetId }],
        activeVersion: { id: `ver_src_${pid}` },
        signedUrls: { [resultAssetId]: `https://lumen.example/${storageKey}` },
      };
      return json(snapshot);
    }

    // DELETE /api/projects/:id  (release / cascade cleanup)
    if (method === 'DELETE' && /\/api\/projects\/[^/]+$/.test(url)) {
      deleteCount += 1;
      return json({ deleted: true, cleanupFailures: [] });
    }

    return json({ errorCode: 'NOT_FOUND', message: url }, 404);
  };

  return { fetchFn, getDeleteCount: () => deleteCount };
}

const SAMPLE_INPUT = {
  prompt: 'turn the studio into a sunset beach',
  project_name: 'creative-task-1',
  source_image_base64: 'A'.repeat(64),
  source_image_mime_type: 'image/png',
};

describe('RealLumenAdapter — real API mapping (via stub)', () => {
  it('happy path: GENERATED with resolved asset_uri + lumen_project_id, no release', async () => {
    const stub = makeLumenStub();
    const adapter = new RealLumenAdapter({
      baseUrl: 'https://lumen.example',
      authPassword: 'changeme000000',
      fetchImpl: stub.fetchFn,
    });

    const result = await adapter.generate(SAMPLE_INPUT);

    expect(result.status).toBe('GENERATED');
    expect(result.asset_uri).toBe('https://lumen.example/projects/proj_1/generated/asset_gen_proj_1.bin');
    expect(result.mime_type).toBe('image/png');
    expect(result.lumen_project_id).toBe('proj_1');
    expect(result.error_code).toBeUndefined();
    // Success path must NOT release the Lumen project.
    expect(stub.getDeleteCount()).toBe(0);
  });

  it('job failure: FAILED + release() invoked for cleanup', async () => {
    const stub = makeLumenStub({ failJob: true });
    const adapter = new RealLumenAdapter({
      baseUrl: 'https://lumen.example',
      authPassword: 'changeme000000',
      fetchImpl: stub.fetchFn,
    });

    const result = await adapter.generate(SAMPLE_INPUT);

    expect(result.status).toBe('FAILED');
    expect(result.error_code).toBe('GENERATION_FAILED');
    expect(result.lumen_project_id).toBe('proj_1');
    // Compensation must release the Lumen project.
    expect(stub.getDeleteCount()).toBe(1);
  });
});

describe('FakeLumenAdapter — in-memory stand-in', () => {
  it('happy: GENERATED with a stable stub uri', async () => {
    const adapter = createFakeLumenAdapter();
    const result = await adapter.generate(SAMPLE_INPUT);
    expect(result.status).toBe('GENERATED');
    expect(result.asset_uri).toMatch(/^lumen-stub:\/\//);
    expect(result.mime_type).toBe('image/png');
    expect(result.lumen_project_id).toBeDefined();
  });

  it('injected failure: FAILED, generate counted once', async () => {
    const adapter = new FakeLumenAdapter({ failGeneration: true, errorCode: 'PROVIDER_TIMEOUT' });
    const result = await adapter.generate(SAMPLE_INPUT);
    expect(result.status).toBe('FAILED');
    expect(result.error_code).toBe('PROVIDER_TIMEOUT');
    expect(adapter.generateCalls).toBe(1);
  });

  it('release records the project id for compensation assertions', async () => {
    const adapter = new FakeLumenAdapter();
    await adapter.release('proj_x');
    expect(adapter.releasedProjectIds).toContain('proj_x');
  });
});

describe('createLumenAdapterFromEnv — credential gating (P5-I)', () => {
  it('returns null when LUMEN_BASE_URL / LUMEN_AUTH_PASSWORD are absent', () => {
    expect(createLumenAdapterFromEnv({})).toBeNull();
    expect(createLumenAdapterFromEnv({ LUMEN_BASE_URL: 'https://x' })).toBeNull();
  });

  it('constructs a real adapter when both are present', () => {
    const a = createLumenAdapterFromEnv({
      LUMEN_BASE_URL: 'https://lumen.example',
      LUMEN_AUTH_PASSWORD: 'changeme000000',
    });
    expect(a).not.toBeNull();
    expect(a).toBeInstanceOf(RealLumenAdapter);
  });
});
