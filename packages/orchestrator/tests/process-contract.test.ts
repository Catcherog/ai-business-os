import { describe, it, expect } from 'vitest';
import { runBusinessProcess, sanitizeTraceMetadata } from '../src/index.js';
import type { BusinessProcessStage, ProcessTraceEvent } from '../src/index.js';
import {
  createCountingDeps,
  rejectingGovernance,
  reviewRequiredGovernance,
  validInput,
} from './helpers.js';

/**
 * BUSOS-P6-02 gates P6-D (process state contract), P6-E (business outcome
 * semantics), P6-F (failure propagation) and P6-G (structured trace).
 */

function eventsFor(
  trace: ProcessTraceEvent[],
  stage: BusinessProcessStage,
): ProcessTraceEvent[] {
  return trace.filter((e) => e.stage === stage);
}

describe('P6-D — Process state contract', () => {
  it('happy path resolves to SUCCEEDED with all stages completed in order', async () => {
    const { businessRepository, lumen, counts } = createCountingDeps();

    const result = await runBusinessProcess(validInput(), {
      businessRepository,
      lumen,
    });

    expect(result.status).toBe('SUCCEEDED');
    expect(result.completedStages).toEqual([
      'GOLDEN_PATH',
      'PROJECT_LIFECYCLE',
      'CREATIVE_PRODUCTION',
    ]);
    // No stage is "current" once the process succeeded.
    expect(result.currentStage).toBeUndefined();
    expect(result.error).toBeUndefined();
    expect(result.rejection).toBeUndefined();

    // Stable references only — no internal slice object trees.
    expect(result.output?.leadId).toBeDefined();
    expect(result.output?.customerId).toBeDefined();
    expect(result.output?.projectId).toBeDefined();
    expect(result.output?.assetId).toBeDefined();
    expect(result.output?.assetUri).toMatch(/^lumen-stub:\/\//);

    // Identity + timing contract.
    expect(result.processId).toMatch(/^proc_/);
    expect(Date.parse(result.startedAt)).not.toBeNaN();
    expect(Date.parse(result.endedAt)).not.toBeNaN();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(Date.parse(result.endedAt)).toBeGreaterThanOrEqual(
      Date.parse(result.startedAt),
    );

    // Each stage really ran exactly once.
    expect(counts).toEqual({
      createLead: 1,
      createProject: 1,
      lumenGenerate: 1,
      createAsset: 1,
    });
  });

  it('honours a caller-supplied processId across the whole trace', async () => {
    const { businessRepository, lumen } = createCountingDeps();

    const result = await runBusinessProcess(
      validInput(),
      { businessRepository, lumen },
      { processId: 'proc_fixed_p6d' },
    );

    expect(result.processId).toBe('proc_fixed_p6d');
    expect(result.trace.every((e) => e.processId === 'proc_fixed_p6d')).toBe(true);
  });
});

describe('P6-E — Business outcome semantics (rejection is not failure)', () => {
  it('governance REJECT yields REJECTED with no downstream side effects', async () => {
    const { businessRepository, lumen, counts } = createCountingDeps();

    const result = await runBusinessProcess(validInput(), {
      businessRepository,
      lumen,
      governance: rejectingGovernance,
    });

    // Business rejection, NOT a system failure.
    expect(result.status).toBe('REJECTED');
    expect(result.status).not.toBe('FAILED');
    expect(result.error).toBeUndefined();

    expect(result.rejection).toBeDefined();
    expect(result.rejection?.stage).toBe('GOLDEN_PATH');
    expect(result.rejection?.reasonCode).toBe('REJECT');

    // Fail closed: nothing downstream ran, nothing was written anywhere.
    expect(result.completedStages).toEqual([]);
    expect(counts).toEqual({
      createLead: 0,
      createProject: 0,
      lumenGenerate: 0,
      createAsset: 0,
    });
    expect(result.output).toBeUndefined();

    // Trace stops at GOLDEN_PATH; later stages never started.
    expect(eventsFor(result.trace, 'PROJECT_LIFECYCLE')).toHaveLength(0);
    expect(eventsFor(result.trace, 'CREATIVE_PRODUCTION')).toHaveLength(0);
    expect(eventsFor(result.trace, 'GOLDEN_PATH').map((e) => e.status)).toEqual([
      'STARTED',
      'REJECTED',
    ]);
  });

  it('governance REVIEW_REQUIRED yields HUMAN_REQUIRED, not FAILED', async () => {
    const { businessRepository, lumen, counts } = createCountingDeps();

    const result = await runBusinessProcess(validInput(), {
      businessRepository,
      lumen,
      governance: reviewRequiredGovernance,
    });

    expect(result.status).toBe('HUMAN_REQUIRED');
    expect(result.error).toBeUndefined();
    expect(result.rejection?.reasonCode).toBe('REVIEW_REQUIRED');
    expect(counts.createLead).toBe(0);
    expect(eventsFor(result.trace, 'GOLDEN_PATH').map((e) => e.status)).toEqual([
      'STARTED',
      'HUMAN_REQUIRED',
    ]);
  });

  it('business ineligibility inside a later stage is REJECTED, not FAILED', async () => {
    const { businessRepository, lumen, counts } = createCountingDeps();

    // Empty prompt is a documented creative-production business rejection
    // (PROMPT_EMPTY) — upstream stages legitimately succeed first.
    const result = await runBusinessProcess(validInput({ prompt: '' }), {
      businessRepository,
      lumen,
    });

    expect(result.status).toBe('REJECTED');
    expect(result.error).toBeUndefined();
    expect(result.currentStage).toBe('CREATIVE_PRODUCTION');
    expect(result.rejection?.reasonCode).toBe('PROMPT_EMPTY');
    expect(result.completedStages).toEqual(['GOLDEN_PATH', 'PROJECT_LIFECYCLE']);
    // Rejected before any generation or asset write.
    expect(counts.lumenGenerate).toBe(0);
    expect(counts.createAsset).toBe(0);
  });
});

describe('P6-F — Failure propagation (fail closed)', () => {
  it('creative-production throwing yields FAILED at CREATIVE_PRODUCTION', async () => {
    const { businessRepository, lumen, counts } = createCountingDeps({
      lumenGenerateError: new Error('Lumen upstream 503 Service Unavailable'),
    });

    const result = await runBusinessProcess(validInput(), {
      businessRepository,
      lumen,
    });

    expect(result.status).toBe('FAILED');
    expect(result.currentStage).toBe('CREATIVE_PRODUCTION');
    expect(result.completedStages).toEqual(['GOLDEN_PATH', 'PROJECT_LIFECYCLE']);

    expect(result.error).toBeDefined();
    expect(result.error?.stage).toBe('CREATIVE_PRODUCTION');
    expect(result.error?.disposition).toBe('RETRYABLE');
    expect(result.error?.message).toContain('503');
    expect(result.rejection).toBeUndefined();

    // No asset was produced.
    expect(result.output?.assetId).toBeUndefined();
    expect(counts.createAsset).toBe(0);

    const cp = eventsFor(result.trace, 'CREATIVE_PRODUCTION');
    expect(cp.map((e) => e.status)).toEqual(['STARTED', 'FAILED']);
    expect(cp[1].error?.stage).toBe('CREATIVE_PRODUCTION');
  });

  it('a GOLDEN_PATH fault never reaches PROJECT_LIFECYCLE', async () => {
    const { businessRepository, lumen, counts } = createCountingDeps({
      createLeadError: new Error('Feishu request timed out'),
    });

    const result = await runBusinessProcess(validInput(), {
      businessRepository,
      lumen,
    });

    expect(result.status).toBe('FAILED');
    expect(result.currentStage).toBe('GOLDEN_PATH');
    expect(result.completedStages).toEqual([]);
    // Stage N+1 must not run.
    expect(counts.createProject).toBe(0);
    expect(counts.lumenGenerate).toBe(0);
    expect(eventsFor(result.trace, 'PROJECT_LIFECYCLE')).toHaveLength(0);
    expect(eventsFor(result.trace, 'CREATIVE_PRODUCTION')).toHaveLength(0);
  });

  it('a PROJECT_LIFECYCLE fault never reaches CREATIVE_PRODUCTION', async () => {
    const { businessRepository, lumen, counts } = createCountingDeps({
      createProjectError: new Error('Feishu socket hang up'),
    });

    const result = await runBusinessProcess(validInput(), {
      businessRepository,
      lumen,
    });

    expect(result.status).toBe('FAILED');
    expect(result.currentStage).toBe('PROJECT_LIFECYCLE');
    expect(result.completedStages).toEqual(['GOLDEN_PATH']);
    expect(counts.lumenGenerate).toBe(0);
    expect(counts.createAsset).toBe(0);
    expect(eventsFor(result.trace, 'CREATIVE_PRODUCTION')).toHaveLength(0);
  });

  it('never throws — faults are returned as a classified result', async () => {
    const { businessRepository, lumen } = createCountingDeps({
      createLeadError: new Error('boom'),
    });

    await expect(
      runBusinessProcess(validInput(), { businessRepository, lumen }),
    ).resolves.toBeDefined();
  });
});

describe('P6-G — Structured trace', () => {
  it('every executed stage emits STARTED plus exactly one terminal event with timing', async () => {
    const { businessRepository, lumen } = createCountingDeps();

    const result = await runBusinessProcess(validInput(), {
      businessRepository,
      lumen,
    });

    const stages: BusinessProcessStage[] = [
      'GOLDEN_PATH',
      'PROJECT_LIFECYCLE',
      'CREATIVE_PRODUCTION',
    ];

    for (const stage of stages) {
      const events = eventsFor(result.trace, stage);
      expect(events).toHaveLength(2);

      const [started, terminal] = events;
      expect(started.status).toBe('STARTED');
      expect(Date.parse(started.startedAt)).not.toBeNaN();

      // A terminal state always exists — never a dangling STARTED.
      expect(terminal.status).not.toBe('STARTED');
      expect(terminal.status).toBe('SUCCEEDED');
      expect(terminal.endedAt).toBeDefined();
      expect(Date.parse(terminal.endedAt!)).not.toBeNaN();
      expect(terminal.durationMs).toBeGreaterThanOrEqual(0);
      expect(terminal.processId).toBe(result.processId);
    }

    // Pipeline order is preserved in the event stream.
    expect(result.trace.map((e) => `${e.stage}:${e.status}`)).toEqual([
      'GOLDEN_PATH:STARTED',
      'GOLDEN_PATH:SUCCEEDED',
      'PROJECT_LIFECYCLE:STARTED',
      'PROJECT_LIFECYCLE:SUCCEEDED',
      'CREATIVE_PRODUCTION:STARTED',
      'CREATIVE_PRODUCTION:SUCCEEDED',
    ]);
  });

  it('a failing stage still reaches a terminal trace event carrying the error', async () => {
    const { businessRepository, lumen } = createCountingDeps({
      failGeneration: true,
    });

    const result = await runBusinessProcess(validInput(), {
      businessRepository,
      lumen,
    });

    expect(result.status).toBe('FAILED');
    const dangling = result.trace.filter(
      (e) =>
        e.status === 'STARTED' &&
        !result.trace.some((t) => t.stage === e.stage && t.status !== 'STARTED'),
    );
    expect(dangling).toEqual([]);

    const terminal = eventsFor(result.trace, 'CREATIVE_PRODUCTION')[1];
    expect(terminal.status).toBe('FAILED');
    expect(terminal.error).toBeDefined();
    expect(terminal.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('trace metadata carries only stable references, never secrets or payloads', async () => {
    const { businessRepository, lumen } = createCountingDeps();

    const result = await runBusinessProcess(validInput(), {
      businessRepository,
      lumen,
    });

    const forbidden = [
      'password',
      'token',
      'secret',
      'authorization',
      'apiKey',
      'prompt',
      'sourceImageBase64',
      'response',
      'lead',
      'customer',
      'project',
      'asset',
    ];

    for (const event of result.trace) {
      for (const key of Object.keys(event.metadata ?? {})) {
        expect(forbidden).not.toContain(key);
        // Only primitives are allowed through — no object trees.
        const value = (event.metadata ?? {})[key];
        expect(['string', 'number', 'boolean']).toContain(typeof value);
      }
    }

    // Stable refs really are present where expected.
    const gpTerminal = eventsFor(result.trace, 'GOLDEN_PATH')[1];
    expect(gpTerminal.metadata?.leadId).toBe(result.output?.leadId);
    expect(gpTerminal.metadata?.governanceDecision).toBe('APPROVE');
  });

  it('sanitizeTraceMetadata drops non-allowlisted keys and non-primitive values', () => {
    const sanitized = sanitizeTraceMetadata({
      leadId: 'lead_1',
      projectId: 'proj_1',
      password: 'hunter2',
      token: 'eyJhbGciOi',
      Authorization: 'Bearer abc.def.ghi',
      prompt: 'full llm prompt text',
      apiResponse: { huge: true },
      customer: { name: '张三', phone: '13800000000' },
      taskWrites: 2,
      sliceStatus: 'CREATIVE_SUCCESS',
    });

    expect(sanitized).toEqual({
      leadId: 'lead_1',
      projectId: 'proj_1',
      taskWrites: 2,
      sliceStatus: 'CREATIVE_SUCCESS',
    });
  });
});
