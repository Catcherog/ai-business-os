import { describe, it, expect } from 'vitest';
import { BusinessRepository, FakeFeishuAdapter } from '@busos/business-repository';
import { createFakeLumenAdapter } from '@busos/lumen-adapter';
import { runBusinessProcess } from '../src/index.js';

/**
 * BUSOS-P6-01 gates P6-A / P6-B — Orchestrator fake-adapter E2E.
 *
 * Exercises the full composed chain through in-memory fakes (no Feishu/Lumen
 * network or secret). Proves the slices compose correctly and that the execution
 * trace records every stage. Re-verified against the richer BUSOS-P6-02 process
 * contract (`SUCCEEDED`/`FAILED` + structured trace events) — same gates, new
 * vocabulary.
 *
 * The real-adapter (Feishu + Lumen) path is intentionally NOT asserted here: it
 * stays deferred as P6-C under BL-018 (OPEN / NON-ENGINEERING LIVE DEPENDENCY —
 * CloudBase quota + LUMEN/FEISHU live credentials) and is a re-run of this same
 * `runBusinessProcess` call with real adapters.
 */

// Customer-linked, governance-approved consultation (mirrors golden-path Flow B).
const IDENTIFIED_TEXT =
  '我是张三，微信 zhangsan123，想下个月拍新中式写真，预算4000。';
// Any non-empty base64 + png mime satisfies creative eligibility in fakes.
const SOURCE_IMAGE_B64 = 'aGVsbG8td29ybGQtZmFrZS1wbmc=';

describe('BUSOS-P6-01 — Orchestrator fake E2E (P6-A / P6-B)', () => {
  it('runs Consultation -> Lead/Customer -> Project/Task -> Asset end to end', async () => {
    const businessRepository = new BusinessRepository(new FakeFeishuAdapter());
    const lumen = createFakeLumenAdapter();

    const result = await runBusinessProcess(
      {
        goldenPath: { text: IDENTIFIED_TEXT },
        projectType: 'portrait_shoot',
        projectTitle: '新中式写真拍摄',
        scheduledDate: '2026-09-15',
        creativeTitle: 'Blue background edit',
        prompt: 'make the background blue',
        sourceImageBase64: SOURCE_IMAGE_B64,
        sourceImageMimeType: 'image/png',
      },
      { businessRepository, lumen },
    );

    expect(result.status).toBe('SUCCEEDED');
    expect(result.currentStage).toBeUndefined();
    expect(result.output?.leadId).toBeDefined();
    expect(result.output?.customerId).toBeDefined();
    expect(result.output?.projectId).toBeDefined();
    expect(result.output?.assetId).toBeDefined();
    expect(result.output?.assetUri).toMatch(/^lumen-stub:\/\//);

    // Trace records all three stages in pipeline order, all succeeded.
    expect(result.completedStages).toEqual([
      'GOLDEN_PATH',
      'PROJECT_LIFECYCLE',
      'CREATIVE_PRODUCTION',
    ]);
    const terminal = result.trace.filter((e) => e.status !== 'STARTED');
    expect(terminal.map((e) => e.stage)).toEqual([
      'GOLDEN_PATH',
      'PROJECT_LIFECYCLE',
      'CREATIVE_PRODUCTION',
    ]);
    expect(terminal.every((e) => e.status === 'SUCCEEDED')).toBe(true);
  });

  it('records the failed stage in the trace when Lumen generation fails', async () => {
    const businessRepository = new BusinessRepository(new FakeFeishuAdapter());
    const lumen = createFakeLumenAdapter({ failGeneration: true });

    const result = await runBusinessProcess(
      {
        goldenPath: { text: IDENTIFIED_TEXT },
        projectType: 'portrait_shoot',
        projectTitle: 'P',
        prompt: 'x',
        sourceImageBase64: SOURCE_IMAGE_B64,
        sourceImageMimeType: 'image/png',
      },
      { businessRepository, lumen },
    );

    expect(result.status).toBe('FAILED');
    expect(result.currentStage).toBe('CREATIVE_PRODUCTION');
    expect(result.error?.stage).toBe('CREATIVE_PRODUCTION');
    expect(result.output?.assetId).toBeUndefined();

    // All three stages ran; the last one is marked FAILED in the trace.
    const terminal = result.trace.filter((e) => e.status !== 'STARTED');
    expect(terminal.map((e) => e.stage)).toEqual([
      'GOLDEN_PATH',
      'PROJECT_LIFECYCLE',
      'CREATIVE_PRODUCTION',
    ]);
    expect(terminal[2].status).toBe('FAILED');
  });
});
