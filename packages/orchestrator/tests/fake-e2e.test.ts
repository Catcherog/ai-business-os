import { describe, it, expect } from 'vitest';
import { BusinessRepository, FakeFeishuAdapter } from '@busos/business-repository';
import { createFakeLumenAdapter } from '@busos/lumen-adapter';
import { runBusinessProcess } from '../src/index.js';

/**
 * BUSOS-P6-01 — Orchestrator MVP fake-adapter E2E.
 *
 * Exercises the full composed chain through in-memory fakes (no Feishu/Lumen
 * network or secret). Proves the slices compose correctly and that the
 * execution trace records every stage. The real-adapter (Feishu + Lumen) path
 * is intentionally NOT asserted here — it stays deferred on CloudBase quota
 * (BL-016) and is a re-run of this same `runBusinessProcess` call with real
 * adapters.
 */

// Customer-linked, governance-approved consultation (mirrors golden-path Flow B).
const IDENTIFIED_TEXT =
  '我是张三，微信 zhangsan123，想下个月拍新中式写真，预算4000。';
// Any non-empty base64 + png mime satisfies creative eligibility in fakes.
const SOURCE_IMAGE_B64 = 'aGVsbG8td29ybGQtZmFrZS1wbmc=';

describe('BUSOS-P6-01 — Orchestrator MVP fake E2E', () => {
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

    expect(result.status).toBe('SUCCESS');
    expect(result.failedStage).toBeNull();
    expect(result.leadId).toBeDefined();
    expect(result.customerId).toBeDefined();
    expect(result.projectId).toBeDefined();
    expect(result.assetId).toBeDefined();
    expect(result.assetUri).toMatch(/^lumen-stub:\/\//);

    // Trace records all three stages in pipeline order, all OK.
    expect(result.trace.stages.map((s) => s.stage)).toEqual([
      'GOLDEN_PATH',
      'PROJECT_LIFECYCLE',
      'CREATIVE_PRODUCTION',
    ]);
    expect(result.trace.stages.every((s) => s.status === 'OK')).toBe(true);
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
    expect(result.failedStage).toBe('CREATIVE_PRODUCTION');
    expect(result.assetId).toBeUndefined();

    // All three stages ran; the last one is marked FAILED in the trace.
    expect(result.trace.stages.map((s) => s.stage)).toEqual([
      'GOLDEN_PATH',
      'PROJECT_LIFECYCLE',
      'CREATIVE_PRODUCTION',
    ]);
    expect(result.trace.stages[2].status).toBe('FAILED');
  });
});
