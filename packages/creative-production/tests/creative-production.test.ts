import { describe, it, expect } from 'vitest';
import { executeCreativeProduction } from '../src/index.js';
import { FakeLumenAdapter } from '@busos/lumen-adapter';
import { makeEnv, seedProject, type FakeEnv } from './testkit.js';

const SAMPLE = {
  prompt: 'turn the studio into a sunset beach',
  source_image_base64: 'A'.repeat(64),
  source_image_mime_type: 'image/png',
  title: 'Creative 1',
};

/** Run with a seeded (active) project and the given env overrides. */
async function runOnActive(env: FakeEnv, input: Partial<typeof SAMPLE> = {}) {
  const projectId = await seedProject(env.repo, 'DRAFT');
  return executeCreativeProduction({ project_id: projectId, ...SAMPLE, ...input }, env.deps);
}

describe('P5-C — happy path (Fake Lumen, in-memory Feishu)', () => {
  it('CREATIVE_SUCCESS: task TODO->DONE, IMAGE/LUMEN asset written, 0 compensation', async () => {
    const env = makeEnv();
    const res = await runOnActive(env);

    expect(res.status).toBe('CREATIVE_SUCCESS');
    expect(res.reason).toBeUndefined();
    expect(res.writes).toEqual({ task: 1, asset: 1, taskStatusUpdate: 1 });
    expect(env.counts.writes).toEqual(res.writes);

    // Task advanced to DONE (readback verified).
    expect(res.task).toBeDefined();
    expect(res.task!.status).toBe('DONE');

    // Asset is exactly IMAGE from LUMEN carrying the Lumen asset uri.
    expect(res.asset).toBeDefined();
    expect(res.asset!.asset_type).toBe('IMAGE');
    expect(res.asset!.source).toBe('LUMEN');
    expect(res.asset!.asset_uri).toMatch(/^lumen-stub:\/\//);

    // No compensation triggered.
    expect(res.compensation).toEqual({ deletedTask: false, deletedAsset: false });

    // The persisted records reflect the outcome.
    expect(await env.counts.getTask(res.task!.task_id)).not.toBeNull();
    expect((await env.counts.getTask(res.task!.task_id))!.status).toBe('DONE');
    expect(await env.counts.getAsset(res.asset!.asset_id)).not.toBeNull();
  });

  it('does not touch Feishu for the asset uri — Lumen uri flows through verbatim', async () => {
    const env = makeEnv();
    const res = await runOnActive(env);
    const stored = await env.counts.getAsset(res.asset!.asset_id);
    expect(stored!.asset_uri).toBe(res.asset!.asset_uri);
  });
});

describe('P5-D — eligibility fails closed with ZERO writes', () => {
  it('missing project -> BLOCKED PROJECT_NOT_FOUND, 0 writes, 0 Lumen calls', async () => {
    const env = makeEnv();
    const res = await executeCreativeProduction(
      { project_id: 'nope', ...SAMPLE },
      env.deps,
    );
    expect(res.status).toBe('BLOCKED');
    expect(res.reason).toBe('PROJECT_NOT_FOUND');
    expect(res.writes).toEqual({ task: 0, asset: 0, taskStatusUpdate: 0 });
    expect(res.compensation).toEqual({ deletedTask: false, deletedAsset: false });
    expect((env.lumen as FakeLumenAdapter).generateCalls).toBe(0);
  });

  it('CANCELLED project -> BLOCKED PROJECT_CANCELLED, 0 writes', async () => {
    const env = makeEnv();
    const projectId = await seedProject(env.repo, 'CANCELLED');
    const res = await executeCreativeProduction({ project_id: projectId, ...SAMPLE }, env.deps);
    expect(res.status).toBe('BLOCKED');
    expect(res.reason).toBe('PROJECT_CANCELLED');
    expect(res.writes).toEqual({ task: 0, asset: 0, taskStatusUpdate: 0 });
    expect((env.lumen as FakeLumenAdapter).generateCalls).toBe(0);
  });

  it('DELIVERED project -> BLOCKED PROJECT_DELIVERED, 0 writes', async () => {
    const env = makeEnv();
    const projectId = await seedProject(env.repo, 'DELIVERED');
    const res = await executeCreativeProduction({ project_id: projectId, ...SAMPLE }, env.deps);
    expect(res.status).toBe('BLOCKED');
    expect(res.reason).toBe('PROJECT_DELIVERED');
    expect(res.writes).toEqual({ task: 0, asset: 0, taskStatusUpdate: 0 });
    expect((env.lumen as FakeLumenAdapter).generateCalls).toBe(0);
  });

  it('empty prompt -> BLOCKED PROMPT_EMPTY, 0 writes', async () => {
    const env = makeEnv();
    const res = await runOnActive(env, { prompt: '   ' });
    expect(res.status).toBe('BLOCKED');
    expect(res.reason).toBe('PROMPT_EMPTY');
    expect(res.writes).toEqual({ task: 0, asset: 0, taskStatusUpdate: 0 });
    expect((env.lumen as FakeLumenAdapter).generateCalls).toBe(0);
  });

  it('empty source image -> BLOCKED SOURCE_IMAGE_EMPTY, 0 writes', async () => {
    const env = makeEnv();
    const res = await runOnActive(env, { source_image_base64: '' });
    expect(res.status).toBe('BLOCKED');
    expect(res.reason).toBe('SOURCE_IMAGE_EMPTY');
    expect(res.writes).toEqual({ task: 0, asset: 0, taskStatusUpdate: 0 });
    expect((env.lumen as FakeLumenAdapter).generateCalls).toBe(0);
  });
});

describe('P5-E — failure & exact-record-id compensation', () => {
  it('E1: Lumen FAILED -> delete the created Task, asset never written', async () => {
    const env = makeEnv({ lumen: new FakeLumenAdapter({ failGeneration: true, errorCode: 'PROVIDER_DOWN' }) });
    const res = await runOnActive(env);

    expect(res.status).toBe('FAILED');
    expect(res.reason).toMatch(/^LUMEN_GENERATION_FAILED:PROVIDER_DOWN/);
    expect(res.writes.task).toBe(1); // task was created before generation
    expect(res.writes.asset).toBe(0); // asset never attempted
    expect(res.compensation.deletedTask).toBe(true);
    expect(res.compensation.deletedAsset).toBe(false);

    // The created task record is physically gone (compensated by exact id).
    expect(res.task).toBeDefined();
    expect(await env.counts.getTask(res.task!.task_id)).toBeNull();
  });

  it('E2: Task create/readback failed -> delete Task, 0 assets, no Lumen compensate leak', async () => {
    const env = makeEnv({ adapterOpts: { corruptReadbackTask: { task_id: 'tampered' } } });
    const res = await runOnActive(env);

    expect(res.status).toBe('FAILED');
    expect(res.reason).toBe('TASK_WRITE_FAILED');
    expect(res.writes.task).toBe(1);
    expect(res.writes.asset).toBe(0);
    expect(res.compensation.deletedTask).toBe(true);
    expect(res.compensation.deletedAsset).toBe(false);
    expect(res.task).toBeDefined();
    expect(await env.counts.getTask(res.task!.task_id)).toBeNull();
  });

  it('E3: Asset create/readback failed -> delete Asset + Task', async () => {
    const env = makeEnv({ adapterOpts: { corruptReadbackAsset: { asset_id: 'tampered' } } });
    const res = await runOnActive(env);

    expect(res.status).toBe('FAILED');
    expect(res.reason).toBe('ASSET_WRITE_FAILED');
    expect(res.writes.task).toBe(1);
    expect(res.writes.asset).toBe(1);
    expect(res.compensation.deletedTask).toBe(true);
    expect(res.compensation.deletedAsset).toBe(true);
    expect(res.task).toBeDefined();
    expect(res.asset).toBeDefined();
    expect(await env.counts.getTask(res.task!.task_id)).toBeNull();
    expect(await env.counts.getAsset(res.asset!.asset_id)).toBeNull();
  });

  it('E4: Task DONE update failed -> delete Asset + Task', async () => {
    const env = makeEnv({ adapterOpts: { failTaskStatusUpdate: true } });
    const res = await runOnActive(env);

    expect(res.status).toBe('FAILED');
    expect(res.reason).toBe('TASK_DONE_UPDATE_FAILED');
    expect(res.writes.task).toBe(1);
    expect(res.writes.asset).toBe(1);
    expect(res.compensation.deletedTask).toBe(true);
    expect(res.compensation.deletedAsset).toBe(true);
    expect(res.task).toBeDefined();
    expect(res.asset).toBeDefined();
    expect(await env.counts.getTask(res.task!.task_id)).toBeNull();
    expect(await env.counts.getAsset(res.asset!.asset_id)).toBeNull();
  });
});
