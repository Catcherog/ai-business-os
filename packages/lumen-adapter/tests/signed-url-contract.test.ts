import { describe, it, expect } from 'vitest';
import { RealLumenAdapter } from '../src/index.js';

/**
 * BUSOS-P5-03 — signed-URL contract test for the REAL Lumen adapter.
 *
 * The external Lumen API (GET /api/projects/:id) now exposes `signedUrls`
 * keyed by the public, stable `asset.id` (NOT the redacted `storageKey`).
 * This test proves the adapter:
 *   (B1) resolves `generate()` -> asset_uri via `signedUrls[asset.id]`;
 *   (B2) does NOT fall back to / guess via the redacted `storageKey`,
 *        suffix, basename, or string replacement — a storageKey-keyed map
 *        MUST yield ASSET_URL_MISSING, never a silently-wrong URL.
 */

const SAMPLE_INPUT = {
  prompt: 'turn the studio into a sunset beach',
  project_name: 'p5-03-contract',
  source_image_base64: 'A'.repeat(64),
  source_image_mime_type: 'image/png',
};

/** Build a stub Lumen transport. `keyBy` selects how `signedUrls` is keyed. */
function makeStub(keyBy: 'assetId' | 'storageKey') {
  const pid = 'proj_p5';
  const resultAssetId = 'asset_gen_p5';
  const storageKey = `projects/${pid}/generated/${resultAssetId}.bin`;
  const signedUrl = `https://lumen.example/${storageKey}`;

  const resultSnapshot = () => {
    const key = keyBy === 'assetId' ? resultAssetId : storageKey;
    return {
      project: { id: pid, activeVersionId: `ver_src_${pid}` },
      assets: [{ id: resultAssetId, storageKey, mimeType: 'image/png' }],
      versions: [{ id: `ver_gen_${pid}`, assetId: resultAssetId }],
      activeVersion: { id: `ver_src_${pid}` },
      signedUrls: { [key]: signedUrl },
    };
  };

  const json = (body: unknown, status = 200) =>
    ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

  const fetchFn: typeof fetch = async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (url.endsWith('/api/auth')) return json({ success: true, token: 't' });
    if (!headers.Authorization) return json({ errorCode: 'UNAUTHORIZED' }, 401);

    if (method === 'POST' && url.endsWith('/api/projects')) {
      return json(
        {
          project: { id: pid, activeVersionId: `ver_src_${pid}` },
          assets: [{ id: `asset_src_${pid}`, storageKey: `projects/${pid}/original/asset_src.bin`, mimeType: 'image/png' }],
          versions: [{ id: `ver_src_${pid}`, assetId: `asset_src_${pid}` }],
          activeVersion: { id: `ver_src_${pid}` },
          signedUrls: { [`asset_src_${pid}`]: 'https://lumen.example/src' },
        },
        201,
      );
    }
    if (method === 'POST' && /\/api\/projects\/[^/]+\/jobs$/.test(url)) {
      return json(
        { id: `job_${pid}`, projectId: pid, status: 'succeeded', resultVersionId: `ver_gen_${pid}` },
        201,
      );
    }
    if (method === 'GET' && /\/api\/jobs\/[^/]+$/.test(url)) {
      return json({ id: `job_${pid}`, projectId: pid, status: 'succeeded', resultVersionId: `ver_gen_${pid}` });
    }
    if (method === 'GET' && /\/api\/projects\/[^/]+$/.test(url)) {
      return json(resultSnapshot());
    }
    if (method === 'DELETE' && /\/api\/projects\/[^/]+$/.test(url)) {
      return json({ deleted: true, cleanupFailures: [] });
    }
    return json({ errorCode: 'NOT_FOUND', message: url }, 404);
  };

  return { fetchFn, signedUrl };
}

describe('RealLumenAdapter signed-URL contract (BUSOS-P5-03)', () => {
  it('B1: succeeds and resolves asset_uri via signedUrls[asset.id]', async () => {
    const stub = makeStub('assetId');
    const adapter = new RealLumenAdapter({
      baseUrl: 'https://lumen.example',
      authPassword: 'changeme000000',
      fetchImpl: stub.fetchFn,
    });

    const result = await adapter.generate(SAMPLE_INPUT);

    expect(result.status).toBe('GENERATED');
    expect(result.error_code).toBeUndefined();
    expect(result.asset_uri).toBe(stub.signedUrl);
    expect(result.asset_uri).toMatch(/^https:\/\//);
    expect(result.mime_type).toBe('image/png');
  });

  it('B2: does NOT guess via storageKey — old keying yields ASSET_URL_MISSING', async () => {
    const stub = makeStub('storageKey');
    const adapter = new RealLumenAdapter({
      baseUrl: 'https://lumen.example',
      authPassword: 'changeme000000',
      fetchImpl: stub.fetchFn,
    });

    const result = await adapter.generate(SAMPLE_INPUT);

    expect(result.status).toBe('FAILED');
    expect(result.error_code).toBe('ASSET_URL_MISSING');
    expect(result.asset_uri).toBeUndefined();
  });
});
