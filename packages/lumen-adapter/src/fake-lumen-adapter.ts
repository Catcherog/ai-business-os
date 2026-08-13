import type { LumenGenerateInput, LumenGenerateResult, LumenPort } from './types.js';

/**
 * In-memory Lumen adapter for development + unit tests (explicitly Fake, §6).
 *
 * It proves the creative-production orchestration, the LumenPort contract, and
 * error handling WITHOUT any Lumen network/secret. It must NEVER be reported as
 * real P5 E2E success — the real E2E requires `RealLumenAdapter` against a
 * live Lumen deployment, which is BLOCKED here (P5-I) due to missing
 * credentials/availability.
 */
export interface FakeLumenAdapterOptions {
  /** Force a FAILED result (simulates a provider/network failure). */
  failGeneration?: boolean;
  /** Stable error code reported on injected failure. */
  errorCode?: string;
  /** MIME type advertised for generated assets. */
  mimeType?: string;
}

export class FakeLumenAdapter implements LumenPort {
  private readonly opts: FakeLumenAdapterOptions;
  /** Project ids passed to `release()` — asserted by compensation tests. */
  releasedProjectIds: string[] = [];
  /** Number of `generate()` calls — proves "0 Lumen writes" on eligibility block. */
  generateCalls = 0;

  constructor(opts: FakeLumenAdapterOptions = {}) {
    this.opts = opts;
  }

  async generate(input: LumenGenerateInput): Promise<LumenGenerateResult> {
    this.generateCalls += 1;
    if (this.opts.failGeneration) {
      return {
        status: 'FAILED',
        error_code: this.opts.errorCode ?? 'GENERATION_FAILED',
        error_message: 'injected Lumen generation failure',
      };
    }
    const projectId = `lumen_proj_${Math.random().toString(36).slice(2, 10)}`;
    return {
      status: 'GENERATED',
      asset_uri: `lumen-stub://generated/${projectId}/asset.png`,
      mime_type: this.opts.mimeType ?? 'image/png',
      lumen_project_id: projectId,
    };
  }

  async release(lumenProjectId: string): Promise<void> {
    this.releasedProjectIds.push(lumenProjectId);
  }
}

export function createFakeLumenAdapter(opts: FakeLumenAdapterOptions = {}): LumenPort {
  return new FakeLumenAdapter(opts);
}
