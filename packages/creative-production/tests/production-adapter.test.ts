import { describe, it, expect } from 'vitest';
import { executeCreativeProduction } from '../src/index.js';
import { RealLumenAdapter } from '@busos/lumen-adapter';
import { makeEnv, seedProject } from './testkit.js';

/**
 * P5-F — Production adapter boundary.
 *
 * Drives the REAL `RealLumenAdapter` (the same code path that targets a live
 * Vercel Lumen deployment) through `executeCreativeProduction`, using a stubbed
 * fetch that faithfully mimics the deployed Lumen HTTP API. This validates the
 * real adapter's request/response mapping end-to-end WITHOUT network, a real
 * provider key, or any Feishu secret. The creative-production app layer only
 * ever sees `LumenPort` — never Lumen's HTTP paths or the provider key.
 */

function makeLumenStub(opts: { failJob?: boolean } = {}) {
  let projectCounter = 0;
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

    if (url.endsWith('/api/auth')) return json({ success: true, token: 'stub-lumen-token' });
    if (!hasAuth) return json({ errorCode: 'UNAUTHORIZED', message: 'no auth' }, 401);

    if (method === 'POST' && url.endsWith('/api/projects')) {
      const pid = `proj_${++projectCounter}`;
      const versionId = `ver_src_${pid}`;
      const assetId = `asset_src_${pid}`;
      const storageKey = `projects/${pid}/original/${assetId}.bin`;
      return json(
        {
          project: { id: pid, name: body.name, activeVersionId: versionId },
          assets: [{ id: assetId, storageKey, mimeType: body.mimeType }],
          versions: [{ id: versionId, assetId }],
          activeVersion: { id: versionId, assetId },
          signedUrls: { [storageKey]: `file://${storageKey}` },
        },
        201,
      );
    }

    if (method === 'POST' && /\/api\/projects\/[^/]+\/jobs$/.test(url)) {
      const m = url.match(/\/api\/projects\/([^/]+)\/jobs$/)!;
      const pid = m[1];
      if (!headers['Idempotency-Key']) {
        return json({ errorCode: 'INVALID_RECIPE', message: 'missing Idempotency-Key' }, 400);
      }
      const jobId = `job_${pid}`;
      const resultVersionId = `ver_gen_${pid}`;
      const job = {
        id: jobId,
        projectId: pid,
        prompt: body.prompt,
        inputVersionId: body.inputVersionId,
        status: opts.failJob ? 'failed' : 'succeeded',
        resultVersionId: opts.failJob ? undefined : resultVersionId,
        errorCode: opts.failJob ? 'GENERATION_FAILED' : undefined,
      };
      lumenJobs[jobId] = job;
      return json(job, 201);
    }

    if (method === 'GET' && /\/api\/jobs\/[^/]+$/.test(url)) {
      const m = url.match(/\/api\/jobs\/([^/]+)$/)!;
      const job = lumenJobs[m[1]];
      if (!job) return json({ errorCode: 'JOB_NOT_FOUND', message: 'nf' }, 404);
      return json(job);
    }

    if (method === 'GET' && /\/api\/projects\/[^/]+$/.test(url)) {
      const m = url.match(/\/api\/projects\/([^/]+)$/)!;
      const pid = m[1];
      const resultAssetId = `asset_gen_${pid}`;
      const resultVersionId = `ver_gen_${pid}`;
      const storageKey = `projects/${pid}/generated/${resultAssetId}.bin`;
      return json({
        project: { id: pid, activeVersionId: `ver_src_${pid}` },
        assets: [{ id: resultAssetId, storageKey, mimeType: 'image/png' }],
        versions: [{ id: resultVersionId, assetId: resultAssetId }],
        activeVersion: { id: `ver_src_${pid}` },
        signedUrls: { [storageKey]: `https://lumen.example/${storageKey}` },
      });
    }

    if (method === 'DELETE' && /\/api\/projects\/[^/]+$/.test(url)) {
      deleteCount += 1;
      return json({ deleted: true });
    }

    return json({ errorCode: 'NOT_FOUND', message: url }, 404);
  };

  return { fetchFn, getDeleteCount: () => deleteCount };
}

const SAMPLE = {
  prompt: 'turn the studio into a sunset beach',
  source_image_base64: 'A'.repeat(64),
  source_image_mime_type: 'image/png',
  title: 'Creative 1',
};

describe('P5-F — creative-production via REAL Lumen adapter (stubbed transport)', () => {
  it('CREATIVE_SUCCESS with asset_uri resolved from Lumen signed URLs (no Feishu/provider secret leaked)', async () => {
    const stub = makeLumenStub();
    const lumen = new RealLumenAdapter({
      baseUrl: 'https://lumen.example',
      authPassword: 'changeme000000',
      fetchImpl: stub.fetchFn,
      poll: { maxAttempts: 30, intervalMs: 10 },
    });
    const env = makeEnv({ lumen });
    const projectId = await seedProject(env.repo, 'DRAFT');

    const res = await executeCreativeProduction({ project_id: projectId, ...SAMPLE }, env.deps);

    expect(res.status).toBe('CREATIVE_SUCCESS');
    expect(res.writes).toEqual({ task: 1, asset: 1, taskStatusUpdate: 1 });
    expect(res.compensation).toEqual({ deletedTask: false, deletedAsset: false });

    // Asset uri is exactly the URL Lumen returned in its signedUrls map.
    expect(res.asset!.asset_uri).toBe('https://lumen.example/projects/proj_1/generated/asset_gen_proj_1.bin');
    expect(res.asset!.mime_type).toBe('image/png');
    expect(res.asset!.asset_type).toBe('IMAGE');
    expect(res.asset!.source).toBe('LUMEN');

    // The generated (success) path must NOT release the Lumen project.
    expect(stub.getDeleteCount()).toBe(0);

    // Feishu side: Task advanced to DONE, Asset persisted.
    const storedTask = await env.counts.getTask(res.task!.task_id);
    expect(storedTask).not.toBeNull();
    expect(storedTask!.status).toBe('DONE');
    const storedAsset = await env.counts.getAsset(res.asset!.asset_id);
    expect(storedAsset).not.toBeNull();
    expect(storedAsset!.asset_uri).toBe(res.asset!.asset_uri);
  });

  it('propagates a Lumen job failure into a compensated FAILED run (release invoked)', async () => {
    const stub = makeLumenStub({ failJob: true });
    const lumen = new RealLumenAdapter({
      baseUrl: 'https://lumen.example',
      authPassword: 'changeme000000',
      fetchImpl: stub.fetchFn,
      poll: { maxAttempts: 30, intervalMs: 10 },
    });
    const env = makeEnv({ lumen });
    const projectId = await seedProject(env.repo, 'DRAFT');

    const res = await executeCreativeProduction({ project_id: projectId, ...SAMPLE }, env.deps);

    // The real adapter reports GENERATION_FAILED; creative-production
    // compensates by deleting the created Task and fails closed.
    expect(res.status).toBe('FAILED');
    expect(res.reason).toMatch(/^LUMEN_GENERATION_FAILED/);
    expect(res.writes.task).toBe(1);
    expect(res.writes.asset).toBe(0);
    expect(res.compensation.deletedTask).toBe(true);
    expect(res.compensation.deletedAsset).toBe(false);
    expect(await env.counts.getTask(res.task!.task_id)).toBeNull();
    // The real adapter's compensation released the Lumen project on failure.
    expect(stub.getDeleteCount()).toBe(1);
  });
});
