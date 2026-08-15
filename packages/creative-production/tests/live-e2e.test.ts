import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createLumenAdapterFromEnv, type LumenPort } from '@busos/lumen-adapter';
import { createFeishuAdapterFromEnv, BusinessRepository } from '@busos/business-repository';
import { executeCreativeProduction, type CreativeProductionDeps } from '../src/index.js';

/**
 * P5-I — REAL end-to-end gate (live Feishu + live Lumen).
 *
 * Runs ONLY when BOTH real Lumen + real Feishu credentials are present in the
 * environment (LIVE_AVAILABLE). It drives the full bounded slice through the
 * real adapters:
 *   Real Project (seeded) -> Creative Task -> RealLumenAdapter -> Lumen prod
 *   -> Asset write -> exact-record-id readback -> contract verification.
 *
 * No fake / simulator / mock is used. Secrets are read from the environment
 * only and never printed. A (non-secret) evidence JSON is written to /tmp so
 * the closure doc can record it without embedding anything sensitive.
 *
 * Egress note: when an egress proxy is configured (LUMEN_PROXY / HTTPS_PROXY /
 * HTTP_PROXY, e.g. the local sandbox proxy), the adapters are routed through it
 * transparently — the call still hits the REAL Lumen / REAL Feishu services.
 * When absent, the adapters use direct fetch as normal.
 */

const env = process.env as Record<string, string | undefined>;

// LIVE availability is decided from env presence (no network yet).
const LIVE_AVAILABLE = ([
  'LUMEN_BASE_URL',
  'LUMEN_AUTH_PASSWORD',
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
  'FEISHU_BASE_APP_TOKEN',
  'FEISHU_PROJECT_TABLE_ID',
  'FEISHU_TASK_TABLE_ID',
  'FEISHU_ASSET_TABLE_ID',
] as const).every((k) => !!env[k]);

/** Self-contained valid RGB PNG generator — no external deps / binary fixture. */
function makePngBase64(width: number, height: number): string {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      raw[p++] = Math.floor((x * 255) / width);
      raw[p++] = Math.floor((y * 255) / height);
      raw[p++] = 128;
    }
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}

/** Build the real adapters, optionally routing through an egress proxy. */
async function liveDeps(): Promise<{ lumen: LumenPort; feishu: ReturnType<typeof createFeishuAdapterFromEnv> }> {
  const proxyUrl = env.LUMEN_PROXY || env.HTTPS_PROXY || env.HTTP_PROXY;
  if (proxyUrl) {
    try {
      const undici = await import('undici');
      undici.setGlobalDispatcher(new undici.ProxyAgent(proxyUrl));
      (globalThis as unknown as { fetch: typeof fetch }).fetch = undici.fetch as typeof fetch;
    } catch {
      // undici not installed: fall back to the default global fetch.
    }
  }
  const lumen = createLumenAdapterFromEnv(env);
  const feishu = createFeishuAdapterFromEnv(env);
  if (!lumen || !feishu) throw new Error('live adapters unresolved');
  return { lumen, feishu: feishu! };
}

describe.skipIf(!LIVE_AVAILABLE)('P5-I — REAL end-to-end (live Feishu + live Lumen)', () => {
  it('seeds a real Project, generates via real Lumen, writes a real Asset, marks Task DONE, readback-verifies', async () => {
    const { lumen, feishu } = await liveDeps();
    expect(lumen).not.toBeNull();
    expect(feishu).not.toBeNull();

    // Capture the (non-secret) Lumen project id for evidence without altering behavior.
    const captured: { lumenProjectId?: string } = {};
    const lumenWrapped: LumenPort = {
      async generate(input) {
        const r = await lumen!.generate(input);
        if (r.lumen_project_id) captured.lumenProjectId = r.lumen_project_id;
        return r;
      },
      async release(id: string) {
        await lumen!.release(id);
      },
    };

    const repo = new BusinessRepository(feishu!);
    const deps: CreativeProductionDeps = { businessRepository: repo, lumen: lumenWrapped };

    // 1) Seed a real Project in Feishu (eligibility requires a non-terminal status).
    const { project } = await repo.createProject({
      customer_id: 'cust_live_p5',
      lead_id: 'lead_live_p5',
      project_type: 'BRAND',
      title: 'P5 Live Creative E2E',
    });
    const projectId = project.project_id;
    expect(projectId).toBeTruthy();

    // 2) Real creative production through the live slice.
    const res = await executeCreativeProduction(
      {
        project_id: projectId,
        prompt: 'turn the studio into a sunset beach',
        source_image_base64: makePngBase64(512, 384),
        source_image_mime_type: 'image/png',
        title: 'Live Creative 1',
      },
      deps,
    );

    // 3) Capture non-secret result BEFORE asserting (so failures are diagnosable).
    const evidence = {
      status: res.status,
      reason: res.reason ?? null,
      project_id: projectId,
      task_id: res.task?.task_id ?? null,
      task_status: res.task?.status ?? null,
      asset_id: res.asset?.asset_id ?? null,
      asset_record_id: res.assetCommit?.external_record_id ?? null,
      asset_type: res.asset?.asset_type ?? null,
      asset_source: res.asset?.source ?? null,
      lumen_project_id: captured.lumenProjectId ?? null,
      writes: res.writes,
      compensation: res.compensation,
    };
    writeFileSync('/tmp/p5-live-evidence.json', JSON.stringify(evidence, null, 2));
    console.log('[P5-LIVE-RESULT] ' + JSON.stringify({ status: res.status, reason: res.reason, writes: res.writes, compensation: res.compensation }));
    if (res.assetCommit) console.log('[P5-LIVE] asset_record_id=' + (res.assetCommit.external_record_id ?? ''));
    if (captured.lumenProjectId) console.log('[P5-LIVE] lumen_project_id=' + captured.lumenProjectId);

    // 4) Success + contract assertions.
    expect(res.status).toBe('CREATIVE_SUCCESS');
    expect(res.task).toBeDefined();
    expect(res.task!.status).toBe('DONE');
    expect(res.asset).toBeDefined();
    expect(res.asset!.asset_type).toBe('IMAGE');
    expect(res.asset!.source).toBe('LUMEN');
    expect(res.assetCommit).toBeDefined();
    expect(res.assetCommit!.status).toBe('COMMITTED');
    expect(res.assetCommit!.external_record_id).toBeTruthy();

    // 5) Exact-record-id readback: by the created asset's canonical id.
    const rb = await repo.getAsset(res.asset!.asset_id);
    expect(rb).not.toBeNull();
    expect(rb!.asset_id).toBe(res.asset!.asset_id);
    expect(rb!.asset_type).toBe('IMAGE');
    expect(rb!.source).toBe('LUMEN');
  }, 540_000);
});

describe('P5-I — live gate status', () => {
  it('reports availability honestly (no fake PASS when secrets are absent)', () => {
    if (!LIVE_AVAILABLE) {
      expect(createLumenAdapterFromEnv(env)).toBeNull();
      expect(createFeishuAdapterFromEnv(env)).toBeNull();
    } else {
      expect(createLumenAdapterFromEnv(env)).not.toBeNull();
      expect(createFeishuAdapterFromEnv(env)).not.toBeNull();
    }
  });
});
