import { describe, expect, it } from 'vitest';
import { runConnectedLumenWorkflow, validateLumenInput } from '../server/lumen-action.js';

const SAMPLE = {
  workflowType: 'PRODUCT_SHOT' as const,
  sourceImageBase64: 'data:image/png;base64,AAAA',
  sourceImageMimeType: 'image/png',
  prompt: 'x',
  params: {},
};

describe('Lumen server action — credential gate (owner-gated, honest)', () => {
  it('returns BLOCKED without RunningHub credentials (never fakes LIVE)', async () => {
    const out = await runConnectedLumenWorkflow(SAMPLE, {});
    expect(out.mode).toBe('BLOCKED');
    expect(out.reason).toContain('RUNNINGHUB_API_KEY');
    expect(out.result).toBeUndefined();
  });

  it('CONNECTED but unconfigured workflow -> FAILED (WORKFLOW_NOT_CONFIGURED)', async () => {
    const out = await runConnectedLumenWorkflow(SAMPLE, { RUNNINGHUB_API_KEY: 'k' });
    expect(out.mode).toBe('CONNECTED');
    expect(out.result?.status).toBe('FAILED');
    expect(out.result?.errorCode).toBe('WORKFLOW_NOT_CONFIGURED');
  });
});

describe('Lumen server input validation', () => {
  it('rejects an unknown workflowType', () => {
    const r = validateLumenInput({ workflowType: 'BOGUS', sourceImageBase64: 'x' });
    expect('error' in r).toBe(true);
  });
  it('rejects a missing source image', () => {
    const r = validateLumenInput({ workflowType: 'PRODUCT_SHOT' });
    expect('error' in r).toBe(true);
  });
  it('accepts a well-formed input', () => {
    const r = validateLumenInput(SAMPLE);
    expect('error' in r).toBe(false);
    if (!('error' in r)) expect(r.workflowType).toBe('PRODUCT_SHOT');
  });
});
