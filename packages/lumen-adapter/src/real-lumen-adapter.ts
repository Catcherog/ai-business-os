import type { LumenAdapterConfig, LumenGenerateInput, LumenGenerateResult, LumenPort } from './types.js';

/**
 * Real Lumen adapter (BUSOS-P5-01).
 *
 * Maps the deployed Lumen HTTP API as probed from `github.com/Catcherog/lumen-ink`
 * (`D:\360Downloads\Trae 项目\picture-edit`):
 *   POST /api/auth                 {password} -> {success, token}
 *   POST /api/projects             {name, imageBase64, mimeType} -> ProjectSnapshot(201)
 *   POST /api/projects/:id/jobs     Idempotency-Key + {prompt, inputVersionId} -> Job(201)
 *   GET  /api/jobs/:id             poll until terminal
 *   GET  /api/projects/:id         ProjectSnapshot w/ signedUrls (re-generable)
 *   DELETE /api/projects/:id       cascade cleanup
 *
 * Async job model: queued -> uploading -> analyzing -> generating ->
 * postprocessing -> saving -> succeeded | failed. Generation may take minutes;
 * `generate` polls with bounded attempts.
 *
 * Only Lumen's `AUTH_PASSWORD` + base URL are held here. The image-provider key
 * never leaves Lumen (§19). Failures are normalized into LumenGenerateResult so
 * the application layer never throws on a provider/network error.
 */

interface LumenAuthResponse {
  success?: boolean;
  token?: string;
  error?: string;
}
interface LumenProject {
  id: string;
  activeVersionId?: string;
}
interface LumenAsset {
  id: string;
  storageKey: string;
  mimeType: string;
}
interface LumenVersion {
  id: string;
  assetId: string;
}
interface LumenSnapshot {
  project: LumenProject;
  assets: LumenAsset[];
  versions: LumenVersion[];
  activeVersion?: LumenVersion;
  approvedVersion?: LumenVersion;
  signedUrls: Record<string, string>;
}
interface LumenJob {
  id: string;
  projectId: string;
  status: string;
  inputVersionId?: string;
  resultVersionId?: string;
  errorCode?: string;
  error?: string;
}

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

export class RealLumenAdapter implements LumenPort {
  private readonly baseUrl: string;
  private readonly authPassword: string;
  private readonly authPath: string;
  private readonly projectsPath: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pollMaxAttempts: number;
  private readonly pollIntervalMs: number;
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(config: LumenAdapterConfig) {
    if (!config.baseUrl) throw new Error('RealLumenAdapter requires baseUrl');
    if (!config.authPassword) throw new Error('RealLumenAdapter requires authPassword');
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.authPassword = config.authPassword;
    this.authPath = config.authPath ?? '/api/auth';
    this.projectsPath = config.projectsPath ?? '/api/projects';
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    this.pollMaxAttempts = config.poll?.maxAttempts ?? 90;
    this.pollIntervalMs = config.poll?.intervalMs ?? 2000;
  }

  private async getToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 30_000) {
      return this.tokenCache.token;
    }
    const resp = await this.fetchImpl(`${this.baseUrl}${this.authPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ password: this.authPassword }),
    });
    const json = (await resp.json().catch(() => ({}))) as LumenAuthResponse;
    if (!resp.ok || !json.success || !json.token) {
      throw new Error(`Lumen auth failed: ${json.error ?? resp.status}`);
    }
    // Lumen issues a JWT; cache with a conservative 1h margin.
    this.tokenCache = { token: json.token, expiresAt: Date.now() + 60 * 60 * 1000 };
    return json.token;
  }

  private async lumenCall<T>(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const token = await this.getToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const opts: RequestInit = { method, headers };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const resp = await this.fetchImpl(`${this.baseUrl}${path}`, opts);
    const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
    if (!resp.ok) {
      const code = (json.errorCode as string) ?? `HTTP_${resp.status}`;
      const message = (json.message as string) ?? resp.statusText;
      const err = new Error(`Lumen ${path} failed: ${code} ${message}`) as Error & {
        lumenErrorCode?: string;
      };
      err.lumenErrorCode = code;
      throw err;
    }
    return json as T;
  }

  async generate(input: LumenGenerateInput): Promise<LumenGenerateResult> {
    // 1) Create a Lumen project with the source image (becomes V0).
    let snapshot: LumenSnapshot;
    try {
      snapshot = await this.lumenCall<LumenSnapshot>('POST', this.projectsPath, {
        name: input.project_name,
        imageBase64: input.source_image_base64,
        mimeType: input.source_image_mime_type,
      });
    } catch (e) {
      return this.fail(e, 'PROJECT_CREATE_FAILED');
    }
    const projectId = snapshot.project?.id;
    if (!projectId) {
      return {
        status: 'FAILED',
        error_code: 'PROJECT_CREATE_FAILED',
        error_message: 'Lumen returned no project id',
      };
    }
    // The source image is the project's active version (V0).
    const inputVersionId = snapshot.project.activeVersionId;
    const idemKey = `busos_${randomId()}`;

    // 2) Enqueue the generation job.
    let job: LumenJob;
    try {
      job = await this.lumenCall<LumenJob>(
        'POST',
        `${this.projectsPath}/${projectId}/jobs`,
        { prompt: input.prompt, inputVersionId },
        idemKey,
      );
    } catch (e) {
      await this.release(projectId).catch(() => undefined);
      return this.fail(e, 'JOB_CREATE_FAILED', projectId);
    }

    // 3) Poll until terminal.
    let finalJob: LumenJob | null = null;
    try {
      finalJob = await this.pollJob(job.id);
    } catch (e) {
      await this.release(projectId).catch(() => undefined);
      return this.fail(e, 'JOB_POLL_FAILED', projectId);
    }
    if (!finalJob) {
      await this.release(projectId).catch(() => undefined);
      return {
        status: 'FAILED',
        error_code: 'JOB_NOT_FOUND',
        error_message: `job ${job.id} disappeared during polling`,
        lumen_project_id: projectId,
      };
    }
    if (finalJob.status !== 'succeeded') {
      await this.release(projectId).catch(() => undefined);
      return {
        status: 'FAILED',
        error_code: finalJob.errorCode ?? 'GENERATION_FAILED',
        error_message: finalJob.error ?? `job status ${finalJob.status}`,
        lumen_project_id: projectId,
      };
    }

    // 4) Resolve the result asset URI from the snapshot's signed URLs.
    try {
      const resultSnapshot = await this.lumenCall<LumenSnapshot>(
        'GET',
        `${this.projectsPath}/${projectId}`,
      );
      const version = resultSnapshot.versions.find((v) => v.id === finalJob!.resultVersionId);
      const asset = version
        ? resultSnapshot.assets.find((a) => a.id === version.assetId)
        : undefined;
      // BUSOS-P5-03: resolve via the public, stable asset.id key (never the
      // redacted storageKey, basename, suffix, or string replacement).
      const uri = asset ? resultSnapshot.signedUrls[asset.id] : undefined;
      if (!uri) {
        return {
          status: 'FAILED',
          error_code: 'ASSET_URL_MISSING',
          error_message: 'Lumen succeeded but the result asset URL could not be resolved',
          lumen_project_id: projectId,
        };
      }
      return {
        status: 'GENERATED',
        asset_uri: uri,
        mime_type: asset!.mimeType ?? null,
        lumen_project_id: projectId,
      };
    } catch (e) {
      return this.fail(e, 'ASSET_RESOLVE_FAILED', projectId);
    }
  }

  private async pollJob(jobId: string): Promise<LumenJob | null> {
    let last: LumenJob | null = null;
    for (let i = 0; i < this.pollMaxAttempts; i++) {
      const job = await this.lumenCall<LumenJob>('GET', `/api/jobs/${jobId}`);
      last = job;
      if (TERMINAL_STATUSES.has(job.status)) return job;
      await sleep(this.pollIntervalMs);
    }
    return last;
  }

  async release(lumenProjectId: string): Promise<void> {
    try {
      await this.lumenCall('DELETE', `${this.projectsPath}/${lumenProjectId}`);
    } catch {
      // best-effort cascade cleanup
    }
  }

  private fail(e: unknown, code: string, lumenProjectId?: string): LumenGenerateResult {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 'FAILED', error_code: code, error_message: msg, lumen_project_id: lumenProjectId };
  }
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 12);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
