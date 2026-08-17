import { describe, it, expect } from 'vitest';
import { BusinessRepository, FakeFeishuAdapter } from '@busos/business-repository';
import { createFakeLumenAdapter, type LumenPort } from '@busos/lumen-adapter';
import {
  runCreativeProjectAction,
  InMemoryProcessRegistry,
  type CreativeProjectActionInput,
} from '../src/index.js';

/**
 * BUSOS-R2-H1-04 — Narrow creative-project action gates.
 *
 * Exercises `runCreativeProjectAction` through in-memory fakes (no Feishu/Lumen
 * network or secret). Proves:
 *   - only CREATIVE_PRODUCTION runs against an EXISTING project (no Lead/Project
 *     recreation);
 *   - SUCCEEDED surfaces taskId/assetId/assetUri via the stable contract;
 *   - BLOCKED -> REJECTED (business, not a fault);
 *   - FAILED -> classified system error (Lumen failure);
 *   - idempotency guard replays the recorded outcome with ZERO new Task/Asset;
 *   - a key without a registry fails closed;
 *   - the trace never carries prompt / source_image / secrets.
 */

const SOURCE_IMAGE_B64 = 'aGVsbG8td29ybGQtZmFrZS1wbmc=';
const PROMPT = 'make the background blue';

async function seedProject(repo: BusinessRepository): Promise<string> {
  // DRAFT status is eligible for creative production (only CANCELLED/DELIVERED block).
  const { project } = await repo.createProject({
    customer_id: 'cust_seed',
    lead_id: 'lead_seed',
    project_type: 'portrait_shoot',
    title: '新中式写真拍摄',
  });
  return project.project_id;
}

function makeInput(projectId: string, overrides: Partial<CreativeProjectActionInput> = {}): CreativeProjectActionInput {
  return {
    projectId,
    prompt: PROMPT,
    sourceImageBase64: SOURCE_IMAGE_B64,
    sourceImageMimeType: 'image/png',
    ...overrides,
  };
}

function makeDeps(lumen: LumenPort = createFakeLumenAdapter()): {
  businessRepository: BusinessRepository;
  lumen: LumenPort;
} {
  return { businessRepository: new BusinessRepository(new FakeFeishuAdapter()), lumen };
}

describe('BUSOS-R2-H1-04 — runCreativeProjectAction', () => {
  it('runs CREATIVE_PRODUCTION on an existing project and surfaces asset refs', async () => {
    const repo = new BusinessRepository(new FakeFeishuAdapter());
    const projectId = await seedProject(repo);
    const registry = new InMemoryProcessRegistry();

    const result = await runCreativeProjectAction(
      makeInput(projectId),
      { businessRepository: repo, lumen: createFakeLumenAdapter() },
      { idempotencyKey: 'k-success', registry },
    );

    expect(result.status).toBe('SUCCEEDED');
    expect(result.currentStage).toBeUndefined();
    expect(result.completedStages).toEqual(['CREATIVE_PRODUCTION']);
    expect(result.output?.projectId).toBe(projectId);
    expect(result.output?.taskId).toBeDefined();
    expect(result.output?.assetId).toBeDefined();
    expect(result.output?.assetUri).toMatch(/^lumen-stub:\/\//);

    // A real Task + Asset were written (readback VERIFIED) and are visible on the project.
    const tasks = await repo.listTasksByProject(projectId);
    const assets = await repo.listAssetsByProject(projectId);
    expect(tasks).toHaveLength(1);
    expect(assets).toHaveLength(1);
    expect(tasks[0].status).toBe('DONE');

    // Trace has exactly one stage (CREATIVE_PRODUCTION): STARTED -> SUCCEEDED.
    const terminal = result.trace.filter((e) => e.status !== 'STARTED');
    expect(terminal).toHaveLength(1);
    expect(terminal[0].stage).toBe('CREATIVE_PRODUCTION');
    expect(terminal[0].status).toBe('SUCCEEDED');
  });

  it('maps an empty prompt to REJECTED (business, not a fault)', async () => {
    const repo = new BusinessRepository(new FakeFeishuAdapter());
    const projectId = await seedProject(repo);

    const result = await runCreativeProjectAction(
      makeInput(projectId, { prompt: '   ' }),
      { businessRepository: repo, lumen: createFakeLumenAdapter() },
    );

    expect(result.status).toBe('REJECTED');
    expect(result.currentStage).toBe('CREATIVE_PRODUCTION');
    expect(result.rejection?.reasonCode).toBe('PROMPT_EMPTY');
    expect(result.error).toBeUndefined();
    // Zero downstream writes: eligibility blocks before any Task/Asset.
    expect(await repo.listTasksByProject(projectId)).toHaveLength(0);
    expect(await repo.listAssetsByProject(projectId)).toHaveLength(0);
  });

  it('maps a Lumen generation failure to FAILED with a classified system error', async () => {
    const repo = new BusinessRepository(new FakeFeishuAdapter());
    const projectId = await seedProject(repo);

    const result = await runCreativeProjectAction(
      makeInput(projectId),
      { businessRepository: repo, lumen: createFakeLumenAdapter({ failGeneration: true }) },
    );

    expect(result.status).toBe('FAILED');
    expect(result.currentStage).toBe('CREATIVE_PRODUCTION');
    expect(result.error?.code).toBe('CREATIVE_GENERATION_FAILED');
    expect(result.error?.disposition).toBe('RETRYABLE');
    expect(result.output?.assetId).toBeUndefined();
    expect(await repo.listAssetsByProject(projectId)).toHaveLength(0);
  });

  it('replays the recorded outcome on a duplicate idempotency key (no second Task/Asset)', async () => {
    const repo = new BusinessRepository(new FakeFeishuAdapter());
    const projectId = await seedProject(repo);
    const registry = new InMemoryProcessRegistry();

    const r1 = await runCreativeProjectAction(
      makeInput(projectId),
      { businessRepository: repo, lumen: createFakeLumenAdapter() },
      { idempotencyKey: 'k-dedup', registry },
    );
    expect(r1.status).toBe('SUCCEEDED');

    const tasksAfterFirst = await repo.listTasksByProject(projectId);
    const assetsAfterFirst = await repo.listAssetsByProject(projectId);
    expect(tasksAfterFirst).toHaveLength(1);
    expect(assetsAfterFirst).toHaveLength(1);

    const r2 = await runCreativeProjectAction(
      makeInput(projectId),
      { businessRepository: repo, lumen: createFakeLumenAdapter() },
      { idempotencyKey: 'k-dedup', registry },
    );

    expect(r2.status).toBe('SUCCEEDED');
    expect(r2.deduplicated).toBe(true);
    // No new downstream work was performed by the replay.
    expect(await repo.listTasksByProject(projectId)).toHaveLength(tasksAfterFirst.length);
    expect(await repo.listAssetsByProject(projectId)).toHaveLength(assetsAfterFirst.length);
  });

  it('fails closed when an idempotencyKey is supplied without a registry', async () => {
    const repo = new BusinessRepository(new FakeFeishuAdapter());
    const projectId = await seedProject(repo);

    const result = await runCreativeProjectAction(
      makeInput(projectId),
      makeDeps(),
      { idempotencyKey: 'k-noreg' }, // no registry in deps or options
    );

    expect(result.status).toBe('FAILED');
    expect(result.error?.code).toBe('INVALID_INPUT');
    expect(await repo.listTasksByProject(projectId)).toHaveLength(0);
  });

  it('never emits prompt / source image / secrets into the trace', async () => {
    const repo = new BusinessRepository(new FakeFeishuAdapter());
    const projectId = await seedProject(repo);

    const result = await runCreativeProjectAction(makeInput(projectId), makeDeps());

    const traceJson = JSON.stringify(result.trace);
    // Forbidden leakage: the prompt, the base64 image, field names, and common
    // secret material must never appear in the auditable trace.
    for (const forbidden of [
      PROMPT,
      SOURCE_IMAGE_B64,
      'source_image',
      'prompt',
      'Bearer',
      'password',
      'token',
      'secret',
      'api_key',
      'lumen-stub://',
    ]) {
      expect(traceJson.includes(forbidden)).toBe(false);
    }
    // Allowlisted stable references are present.
    expect(traceJson.includes(projectId)).toBe(true);
  });
});
