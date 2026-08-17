/**
 * BUSOS-R2-H1-X01 — TEMPORARY LIVE FEASIBILITY PROBE (NOT a production gate).
 *
 * PURPOSE (narrow, one question only)
 * -----------------------------------
 * Prove that the real path
 *
 *   BUSOS Project -> real AI generation -> real asset storage -> real BUSOS
 *   business persistence -> readback -> product visibility
 *
 * is technically viable WITHOUT the CloudBase persistence path that is
 * currently quota-exhausted (BL-018, expected reset 2026-08-21).
 *
 * WHAT IS REAL HERE
 * -----------------
 *  - Real Lumen server code (`lumen-ink` src/server/index.ts) running locally
 *    with its EXISTING `PERSISTENCE_BACKEND=local` file backend. No CloudBase
 *    env var is present in that process at all.
 *  - Real generation: Lumen's existing synchronous `POST /api/edit` legacy route
 *    -> real `ProviderFactory` -> real `SeedreamProvider.edit()` -> real
 *    Volcengine Ark HTTP call. No fake / stub / simulator anywhere.
 *  - Real asset storage: Feishu Drive (`drive/v1/medias/upload_all`).
 *  - Real business persistence: `BusinessRepository` + `createFeishuAdapterFromEnv`
 *    writing real Project / Task / Asset rows into the real Feishu Bitable.
 *  - Real orchestration: the UNMODIFIED production `runCreativeProjectAction`
 *    (H1-04 narrow entry) and `executeCreativeProduction`.
 *
 * WHAT IS PROBE-ONLY (and must NOT be mistaken for production design)
 * -------------------------------------------------------------------
 *  1. `ProbeLumenDrivePort` below is a probe-only `LumenPort` implementation. It
 *     deliberately fuses two responsibilities that production must keep apart:
 *     (a) call Lumen to generate, (b) store the produced bytes. Production needs
 *     a separate `AssetStoragePort`; see the H1-X01 report follow-ups.
 *  2. `asset_uri` is written as `feishu-drive://<file_token>`. That scheme is a
 *     PROBE CONVENTION, not a frozen contract decision.
 *  3. Nothing here closes BL-018 and nothing here is NORMAL LIVE evidence.
 *
 * SAFETY
 * ------
 *  - Skipped unless `H1X01_PROBE=1` AND every required env var is present, so a
 *    normal `npm test` / CI run never executes it and never fakes a PASS.
 *  - Secrets are read from the environment only and are NEVER printed or written
 *    to the evidence file. Only HTTP statuses, Feishu `code`s, byte counts,
 *    sha256 digests and stable business ids are emitted.
 *  - Zero production `src/` files are touched by this probe.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createHash, randomUUID } from 'node:crypto';
import { BusinessRepository, createFeishuAdapterFromEnv } from '@busos/business-repository';
import type { LumenGenerateInput, LumenGenerateResult, LumenPort } from '@busos/lumen-adapter';
import { runCreativeProjectAction } from '../src/run-creative-project-action.js';
import { InMemoryProcessRegistry } from '../src/process-registry.js';

const env = process.env as Record<string, string | undefined>;

/** The probe is opt-in AND credential-gated. Absence => honest skip, never a fake PASS. */
const REQUIRED_ENV = [
  'H1X01_LUMEN_BASE_URL',
  'H1X01_LUMEN_AUTH_PASSWORD',
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
  'FEISHU_BASE_APP_TOKEN',
  'FEISHU_LEAD_TABLE_ID',
  'FEISHU_CUSTOMER_TABLE_ID',
  'FEISHU_PROJECT_TABLE_ID',
  'FEISHU_TASK_TABLE_ID',
  'FEISHU_ASSET_TABLE_ID',
] as const;

const PROBE_ENABLED = env.H1X01_PROBE === '1' && REQUIRED_ENV.every((k) => !!env[k]);

const OPEN_BASE = env.H1X01_FEISHU_OPEN_BASE ?? 'https://open.feishu.cn';
const EVIDENCE_PATH = env.H1X01_EVIDENCE_PATH ?? 'h1-x01-evidence.json';

/** CloudBase-free assertion surface: these must be absent from the probe process. */
const CLOUDBASE_ENV_KEYS = Object.keys(env).filter((k) => k.startsWith('CLOUDBASE_'));

/* ------------------------------------------------------------------ fixtures */

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
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

/* --------------------------------------------------------- Feishu Drive (probe) */

interface DriveTrace {
  step: string;
  httpStatus: number;
  feishuCode?: number;
  bytes?: number;
  note?: string;
}

async function tenantAccessToken(trace: DriveTrace[]): Promise<string> {
  const r = await fetch(`${OPEN_BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET }),
  });
  const j = (await r.json()) as { code: number; tenant_access_token?: string };
  trace.push({ step: 'drive.tenant_access_token', httpStatus: r.status, feishuCode: j.code });
  if (j.code !== 0 || !j.tenant_access_token) throw new Error(`FEISHU_AUTH_FAILED:${j.code}`);
  return j.tenant_access_token;
}

async function driveUpload(
  token: string,
  bytes: Buffer,
  fileName: string,
  trace: DriveTrace[],
): Promise<string> {
  const fd = new FormData();
  fd.set('file_name', fileName);
  fd.set('parent_type', 'bitable_image');
  fd.set('parent_node', env.FEISHU_BASE_APP_TOKEN as string);
  fd.set('size', String(bytes.length));
  fd.set('file', new Blob([bytes], { type: 'image/png' }), fileName);
  const r = await fetch(`${OPEN_BASE}/open-apis/drive/v1/medias/upload_all`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const j = (await r.json()) as { code: number; data?: { file_token?: string } };
  trace.push({
    step: 'drive.medias.upload_all',
    httpStatus: r.status,
    feishuCode: j.code,
    bytes: bytes.length,
  });
  if (j.code !== 0 || !j.data?.file_token) throw new Error(`DRIVE_UPLOAD_FAILED:${j.code}`);
  return j.data.file_token;
}

async function driveDownload(
  token: string,
  fileToken: string,
  trace: DriveTrace[],
): Promise<Buffer> {
  const r = await fetch(
    `${OPEN_BASE}/open-apis/drive/v1/medias/${encodeURIComponent(fileToken)}/download`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const contentType = r.headers.get('content-type') ?? '';
  if (!r.ok || contentType.includes('application/json')) {
    trace.push({ step: 'drive.medias.download', httpStatus: r.status, note: 'non-binary body' });
    throw new Error(`DRIVE_DOWNLOAD_FAILED:${r.status}`);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  trace.push({ step: 'drive.medias.download', httpStatus: r.status, bytes: buf.length });
  return buf;
}

async function driveTmpUrlReadback(
  token: string,
  fileToken: string,
  trace: DriveTrace[],
): Promise<Buffer | null> {
  const r = await fetch(
    `${OPEN_BASE}/open-apis/drive/v1/medias/batch_get_tmp_download_url?file_tokens=${encodeURIComponent(fileToken)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const j = (await r.json()) as {
    code: number;
    data?: { tmp_download_urls?: Array<{ tmp_download_url: string }> };
  };
  trace.push({
    step: 'drive.medias.batch_get_tmp_download_url',
    httpStatus: r.status,
    feishuCode: j.code,
  });
  const url = j.data?.tmp_download_urls?.[0]?.tmp_download_url;
  if (j.code !== 0 || !url) return null;
  const g = await fetch(url);
  const buf = Buffer.from(await g.arrayBuffer());
  trace.push({ step: 'drive.tmp_download_url.GET', httpStatus: g.status, bytes: buf.length });
  return buf;
}

/* ------------------------------------------------- probe-only LumenPort adapter */

interface ProbeCapture {
  lumenAuthStatus?: number;
  lumenEditStatus?: number;
  generatedBytes?: number;
  generatedSha256?: string;
  generatedMimeType?: string;
  driveFileToken?: string;
  generateCalls: number;
  drive: DriveTrace[];
}

/**
 * PROBE-ONLY LumenPort.
 *
 * `generate()`:
 *   1. `POST {lumen}/api/auth`  -> JWT (Lumen's own AUTH_PASSWORD; never the
 *      image-provider key — D018 boundary preserved: BUSOS never sees it).
 *   2. `POST {lumen}/api/edit`  -> Lumen's EXISTING synchronous legacy route,
 *      which runs the real ProviderFactory pipeline. Returns real base64 bytes.
 *      This route touches no persistence backend at all, hence CloudBase-free.
 *   3. upload the real bytes to Feishu Drive and return
 *      `asset_uri = feishu-drive://<file_token>`.
 *
 * `release()` is a genuine no-op: the synchronous route creates no Lumen Project
 * resource, so there is nothing to cascade-delete. (`executeCreativeProduction`
 * never calls it — verified in src/execute.ts.)
 */
class ProbeLumenDrivePort implements LumenPort {
  constructor(
    private readonly baseUrl: string,
    private readonly authPassword: string,
    private readonly capture: ProbeCapture,
  ) {}

  async generate(input: LumenGenerateInput): Promise<LumenGenerateResult> {
    this.capture.generateCalls += 1;
    try {
      // 1) Lumen auth
      const auth = await fetch(`${this.baseUrl}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: this.authPassword }),
      });
      this.capture.lumenAuthStatus = auth.status;
      const authJson = (await auth.json()) as { success?: boolean; token?: string };
      if (!auth.ok || !authJson.token) {
        return { status: 'FAILED', error_code: `LUMEN_AUTH_${auth.status}` };
      }

      // 2) Real synchronous generation through Lumen's existing /api/edit route.
      const edit = await fetch(`${this.baseUrl}/api/edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authJson.token}`,
        },
        body: JSON.stringify({
          prompt: input.prompt,
          image: input.source_image_base64,
          mimeType: input.source_image_mime_type,
        }),
      });
      this.capture.lumenEditStatus = edit.status;
      const editJson = (await edit.json()) as {
        success?: boolean;
        imageData?: string;
        mimeType?: string;
        error?: string;
      };
      if (!edit.ok || !editJson.success || !editJson.imageData) {
        return { status: 'FAILED', error_code: `LUMEN_EDIT_${edit.status}` };
      }

      const bytes = Buffer.from(editJson.imageData, 'base64');
      this.capture.generatedBytes = bytes.length;
      this.capture.generatedSha256 = createHash('sha256').update(bytes).digest('hex');
      this.capture.generatedMimeType = editJson.mimeType ?? 'image/png';

      // 3) Real asset storage: Feishu Drive.
      const token = await tenantAccessToken(this.capture.drive);
      const fileToken = await driveUpload(
        token,
        bytes,
        `h1x01-${Date.now()}.png`,
        this.capture.drive,
      );
      this.capture.driveFileToken = fileToken;

      return {
        status: 'GENERATED',
        asset_uri: `feishu-drive://${fileToken}`,
        mime_type: this.capture.generatedMimeType,
      };
    } catch (e) {
      return {
        status: 'FAILED',
        error_code: 'PROBE_TRANSPORT_FAILED',
        error_message: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async release(): Promise<void> {
    /* no Lumen Project resource is created by the synchronous route */
  }
}

/* ------------------------------------------------------------------- the probe */

describe.skipIf(!PROBE_ENABLED)(
  'H1-X01 — TEMPORARY LIVE FEASIBILITY PROBE (real generation, CloudBase-free)',
  () => {
    it('real Project -> real generation -> Feishu Drive -> real Asset -> readback -> visible', async () => {
      // CloudBase-free invariant: the probe process itself carries no CloudBase config.
      expect(CLOUDBASE_ENV_KEYS).toEqual([]);

      const feishu = createFeishuAdapterFromEnv(env);
      expect(feishu).not.toBeNull();
      const repo = new BusinessRepository(feishu!);

      const capture: ProbeCapture = { generateCalls: 0, drive: [] };
      const lumen = new ProbeLumenDrivePort(
        env.H1X01_LUMEN_BASE_URL as string,
        env.H1X01_LUMEN_AUTH_PASSWORD as string,
        capture,
      );
      const registry = new InMemoryProcessRegistry();

      // 1) Real Feishu Project (written through the production repository, then
      //    loaded back by the production slice via getProject()).
      const { project, commit: projectCommit } = await repo.createProject({
        customer_id: 'cust_h1x01_probe',
        lead_id: 'lead_h1x01_probe',
        project_type: 'BRAND',
        title: 'H1-X01 Temporary Live Feasibility Probe',
      });
      expect(project.project_id).toBeTruthy();

      const loaded = await repo.getProject(project.project_id);
      expect(loaded).not.toBeNull();
      expect(loaded!.project_id).toBe(project.project_id);

      // 2) The narrow production action — unmodified.
      const idempotencyKey = `h1x01_${randomUUID()}`;
      const result = await runCreativeProjectAction(
        {
          projectId: project.project_id,
          prompt: 'turn this studio backdrop into a warm sunset beach scene',
          sourceImageBase64: makePngBase64(512, 384),
          sourceImageMimeType: 'image/png',
          title: 'H1-X01 Generate Visual Reference',
        },
        { businessRepository: repo, lumen, processRegistry: registry },
        { idempotencyKey },
      );

      // 3) Business persistence readback through the production repository.
      const assetId = result.output?.assetId;
      const taskId = result.output?.taskId;
      const readbackAsset = assetId ? await repo.getAsset(assetId) : null;
      const readbackTask = taskId ? await repo.getTask(taskId) : null;

      // 4) Asset-storage readback: resolve asset_uri back to real bytes.
      let driveSha256: string | null = null;
      let driveBytes: number | null = null;
      let tmpUrlSha256: string | null = null;
      if (capture.driveFileToken) {
        const token = await tenantAccessToken(capture.drive);
        const dl = await driveDownload(token, capture.driveFileToken, capture.drive);
        driveSha256 = createHash('sha256').update(dl).digest('hex');
        driveBytes = dl.length;
        const tmp = await driveTmpUrlReadback(token, capture.driveFileToken, capture.drive);
        if (tmp) tmpUrlSha256 = createHash('sha256').update(tmp).digest('hex');
      }

      // 5) Idempotency replay — a duplicate must NOT re-generate or double-write.
      const replay = await runCreativeProjectAction(
        {
          projectId: project.project_id,
          prompt: 'turn this studio backdrop into a warm sunset beach scene',
          sourceImageBase64: makePngBase64(512, 384),
          sourceImageMimeType: 'image/png',
          title: 'H1-X01 Generate Visual Reference',
        },
        { businessRepository: repo, lumen, processRegistry: registry },
        { idempotencyKey },
      );

      // 6) Non-secret evidence (written BEFORE assertions so failures stay diagnosable).
      const evidence = {
        probe: 'BUSOS-R2-H1-X01',
        evidenceClass: 'TEMPORARY LIVE FEASIBILITY',
        cloudBaseEnvKeysInProbeProcess: CLOUDBASE_ENV_KEYS,
        run: {
          processId: result.processId,
          status: result.status,
          currentStage: result.currentStage ?? null,
          completedStages: result.completedStages,
          durationMs: result.durationMs,
          error: result.error ? { code: result.error.code, stage: result.error.stage } : null,
          rejection: result.rejection ?? null,
          traceEvents: result.trace.map((t) => ({
            stage: t.stage,
            status: t.status,
            metadata: t.metadata ?? null,
          })),
        },
        business: {
          projectId: project.project_id,
          projectCommitStatus: projectCommit.status,
          taskId: taskId ?? null,
          taskStatusReadback: readbackTask?.status ?? null,
          assetId: assetId ?? null,
          assetUri: result.output?.assetUri ?? null,
          assetTypeReadback: readbackAsset?.asset_type ?? null,
          assetSourceReadback: readbackAsset?.source ?? null,
          assetMimeTypeReadback: readbackAsset?.mime_type ?? null,
          assetUriReadback: readbackAsset?.asset_uri ?? null,
        },
        generation: {
          lumenAuthHttpStatus: capture.lumenAuthStatus ?? null,
          lumenEditHttpStatus: capture.lumenEditStatus ?? null,
          generatedBytes: capture.generatedBytes ?? null,
          generatedSha256: capture.generatedSha256 ?? null,
          generatedMimeType: capture.generatedMimeType ?? null,
          lumenGenerateCalls: capture.generateCalls,
        },
        assetStorage: {
          driveFileTokenLength: capture.driveFileToken?.length ?? null,
          driveReadbackBytes: driveBytes,
          driveReadbackShaMatchesGenerated:
            driveSha256 !== null && driveSha256 === capture.generatedSha256,
          tmpUrlReadbackShaMatchesGenerated:
            tmpUrlSha256 !== null && tmpUrlSha256 === capture.generatedSha256,
          driveTrace: capture.drive,
        },
        idempotency: {
          replayStatus: replay.status,
          replayDeduplicated: replay.deduplicated === true,
          replayProcessIdMatches: replay.processId === result.processId,
          lumenGenerateCallsAfterReplay: capture.generateCalls,
        },
      };
      writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
      // eslint-disable-next-line no-console
      console.log('[H1-X01-EVIDENCE] ' + EVIDENCE_PATH);
      // eslint-disable-next-line no-console
      console.log(
        '[H1-X01-RESULT] ' +
          JSON.stringify({
            status: result.status,
            assetId: assetId ?? null,
            generateCalls: capture.generateCalls,
            driveShaMatch: evidence.assetStorage.driveReadbackShaMatchesGenerated,
            replayDeduplicated: evidence.idempotency.replayDeduplicated,
          }),
      );

      /* ---------------------------------------------------------- assertions */

      // Gate C — real generation actually happened through Lumen.
      expect(capture.lumenAuthStatus).toBe(200);
      expect(capture.lumenEditStatus).toBe(200);
      expect(capture.generatedBytes).toBeGreaterThan(1024);

      // Gate E/G — asset storage round-trips the exact generated bytes.
      expect(driveBytes).toBe(capture.generatedBytes);
      expect(driveSha256).toBe(capture.generatedSha256);

      // Gate F — real business persistence via the production repository.
      expect(result.status).toBe('SUCCEEDED');
      expect(result.completedStages).toEqual(['CREATIVE_PRODUCTION']);
      expect(assetId).toBeTruthy();
      expect(readbackAsset).not.toBeNull();
      expect(readbackAsset!.asset_type).toBe('IMAGE');
      expect(readbackAsset!.source).toBe('LUMEN');
      expect(readbackAsset!.asset_uri).toBe(`feishu-drive://${capture.driveFileToken}`);
      expect(readbackTask).not.toBeNull();
      expect(readbackTask!.status).toBe('DONE');

      // Gate H — the run is auditable and the duplicate click is deduplicated.
      expect(result.trace.length).toBeGreaterThan(0);
      expect(replay.deduplicated).toBe(true);
      expect(capture.generateCalls).toBe(1);
    }, 540_000);
  },
);

describe('H1-X01 — probe gate status (always runs)', () => {
  it('reports probe availability honestly (never a fake PASS)', () => {
    if (!PROBE_ENABLED) {
      expect(env.H1X01_PROBE === '1' && REQUIRED_ENV.every((k) => !!env[k])).toBe(false);
    } else {
      expect(REQUIRED_ENV.every((k) => !!env[k])).toBe(true);
    }
  });
});
