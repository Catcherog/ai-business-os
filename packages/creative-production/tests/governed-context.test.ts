import { describe, it, expect } from 'vitest';
import { executeCreativeProduction } from '../src/index.js';
import type { LumenPort, LumenGenerateInput, LumenGenerateResult } from '@busos/lumen-adapter';
import { makeEnv, seedProject, type FakeEnv } from './testkit.js';

/**
 * BUSOS-R2-H2-02 — Governed Memory Context separation at the creative slice.
 *
 * The governed memory context summary is carried into `executeCreativeProduction`
 * as a SEPARATE, auditable business input. It must NEVER be concatenated into the
 * user `prompt` (the user action input) — Lumen receives the prompt untouched.
 * This is gate H2-02-A (authority / scope isolation of the context boundary) at
 * the slice layer.
 */

const SAMPLE = {
  prompt: 'turn the studio into a sunset beach',
  source_image_base64: 'A'.repeat(64),
  source_image_mime_type: 'image/png',
  title: 'Creative 1',
};

/** A Lumen adapter that records exactly what prompt it was called with. */
class SpyLumenAdapter implements LumenPort {
  lastInput: LumenGenerateInput | null = null;
  calls = 0;
  async generate(input: LumenGenerateInput): Promise<LumenGenerateResult> {
    this.calls += 1;
    this.lastInput = input;
    return {
      status: 'GENERATED',
      asset_uri: 'lumen-stub://generated/x/asset.png',
      mime_type: 'image/png',
      lumen_project_id: 'lp',
    };
  }
  async release(): Promise<void> {}
}

describe('H2-02-A — governed context carried but NEVER merged into prompt', () => {
  it('echoes the supplied summary and leaves the Lumen prompt verbatim', async () => {
    const spy = new SpyLumenAdapter();
    const env: FakeEnv = makeEnv({ lumen: spy });
    const projectId = await seedProject(env.repo, 'DRAFT');

    const governed = {
      count: 2,
      types: ['PREFERENCE', 'OUTCOME'],
      refs: ['mem_x', 'mem_y'],
      truncated: false,
    };

    const res = await executeCreativeProduction(
      { project_id: projectId, ...SAMPLE, governedMemoryContext: governed },
      env.deps,
    );

    expect(res.status).toBe('CREATIVE_SUCCESS');
    // The summary is echoed back for observability (never the raw content).
    expect(res.governedContext).toEqual(governed);
    // Lumen received the user prompt verbatim — governed context is NOT in it.
    expect(spy.lastInput?.prompt).toBe(SAMPLE.prompt);
    expect(spy.lastInput?.prompt).not.toContain('mem_x');
    expect(spy.lastInput?.prompt).not.toContain('PREFERENCE');
    expect(spy.lastInput?.prompt).not.toContain('OUTCOME');
    // The slice still performs its normal writes.
    expect(env.counts.writes).toEqual({ task: 1, asset: 1, taskStatusUpdate: 1 });
  });

  it('omitting the governed context still succeeds with prompt untouched (no regression)', async () => {
    const spy = new SpyLumenAdapter();
    const env = makeEnv({ lumen: spy });
    const projectId = await seedProject(env.repo, 'DRAFT');

    const res = await executeCreativeProduction(
      { project_id: projectId, ...SAMPLE },
      env.deps,
    );

    expect(res.status).toBe('CREATIVE_SUCCESS');
    expect(res.governedContext).toBeUndefined();
    expect(spy.lastInput?.prompt).toBe(SAMPLE.prompt);
    expect(env.counts.writes).toEqual({ task: 1, asset: 1, taskStatusUpdate: 1 });
  });
});
