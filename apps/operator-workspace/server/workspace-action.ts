/**
 * H1-04 — SERVER-ONLY Workspace Action boundary (CONNECTED mode).
 *
 * This module is NEVER bundled into the browser SPA. It is the single place
 * where real Feishu / Lumen credentials and the Real* adapters live. Secrets
 * stay server-side: the browser bundle imports only `../src/action.ts` (DEMO
 * fakes), never this file.
 *
 * `runConnectedGenerateVisualReference` builds the real adapters from the
 * environment; if credentials are absent it short-circuits to `BLOCKED`
 * (honest — we never fake a LIVE result). When credentials are present it runs
 * the SAME narrow `runCreativeProjectAction` the DEMO path uses, against a
 * server-side `BusinessRepository` backed by the real Feishu adapter.
 */
import { BusinessRepository, createFeishuAdapterFromEnv, type FeishuAdapter } from '@busos/business-repository';
import { createLumenAdapterFromEnv, type LumenPort } from '@busos/lumen-adapter';
import {
  runCreativeProjectAction,
  InMemoryProcessRegistry,
  type BusinessProcessResult,
  type CreativeProjectActionInput,
} from '@busos/orchestrator';

export type GenerateVisualReferenceServerMode = 'CONNECTED' | 'BLOCKED';

export interface GenerateVisualReferenceServerResult {
  /** Present only when mode === 'CONNECTED'. */
  result?: BusinessProcessResult;
  mode: GenerateVisualReferenceServerMode;
  /** Human-readable reason when BLOCKED (never a substitute for a real run). */
  reason?: string;
}

/**
 * Execute "Generate Visual Reference" against the REAL Feishu + Lumen services.
 *
 * @param env environment to read `FEISHU_*` / `LUMEN_*` credentials from
 *   (defaults to `process.env`). Injectable so the smoke probe can assert the
 *   BLOCKED gate without real secrets.
 */
export async function runConnectedGenerateVisualReference(
  input: CreativeProjectActionInput,
  idempotencyKey: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<GenerateVisualReferenceServerResult> {
  const feishu: FeishuAdapter | null = createFeishuAdapterFromEnv(env);
  const lumen: LumenPort | null = createLumenAdapterFromEnv(env);

  // Credential gate — honest BLOCKED, never a faked LIVE result.
  if (!feishu || !lumen) {
    return {
      mode: 'BLOCKED',
      reason: 'Missing Feishu/Lumen credentials (FEISHU_* / LUMEN_*). Real action cannot run.',
    };
  }

  // Server-side repository backed by the REAL Feishu adapter. The project must
  // already exist in the live Base — we never create leads/projects here.
  const repo = new BusinessRepository(feishu);
  const registry = new InMemoryProcessRegistry();

  const result = await runCreativeProjectAction(
    input,
    { businessRepository: repo, lumen },
    { idempotencyKey, registry },
  );
  return { result, mode: 'CONNECTED' };
}
