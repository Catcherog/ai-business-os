import { describe, it, expect } from 'vitest';
import { runBusinessProcess, InMemoryProcessRegistry } from '../src/index.js';
import { createCountingDeps, validInput } from './helpers.js';

/**
 * BUSOS-P6-02 gates P6-H (duplicate after success) and P6-I (duplicate after a
 * TERMINAL failure).
 *
 * Every assertion is backed by real downstream CALL COUNTERS, so a "duplicate
 * suppressed" claim is proven by the absence of side effects — not by comparing
 * two return values.
 */

describe('P6-H — Idempotency: duplicate after success', () => {
  it('a second call with the same key executes no downstream work and replays the result', async () => {
    const { businessRepository, lumen, counts } = createCountingDeps();
    const registry = new InMemoryProcessRegistry();
    const options = { idempotencyKey: 'K1', registry };

    const first = await runBusinessProcess(
      validInput(),
      { businessRepository, lumen },
      options,
    );

    expect(first.status).toBe('SUCCEEDED');
    expect(first.idempotencyKey).toBe('K1');
    expect(first.deduplicated).toBeUndefined();
    expect(counts).toEqual({
      createLead: 1,
      createProject: 1,
      lumenGenerate: 1,
      createAsset: 1,
    });

    const second = await runBusinessProcess(
      validInput(),
      { businessRepository, lumen },
      options,
    );

    // Downstream ran exactly ONCE in total.
    expect(counts).toEqual({
      createLead: 1,
      createProject: 1,
      lumenGenerate: 1,
      createAsset: 1,
    });

    // The prior successful result is returned, flagged as a replay.
    expect(second.deduplicated).toBe(true);
    expect(second.status).toBe('SUCCEEDED');
    expect(second.processId).toBe(first.processId);
    expect(second.output).toEqual(first.output);
    expect(second.completedStages).toEqual(first.completedStages);
    expect(registry.size).toBe(1);
  });

  it('different keys are independent executions', async () => {
    const { businessRepository, lumen, counts } = createCountingDeps();
    const registry = new InMemoryProcessRegistry();

    const a = await runBusinessProcess(
      validInput(),
      { businessRepository, lumen },
      { idempotencyKey: 'KA', registry },
    );
    const b = await runBusinessProcess(
      validInput(),
      { businessRepository, lumen },
      { idempotencyKey: 'KB', registry },
    );

    expect(a.status).toBe('SUCCEEDED');
    expect(b.status).toBe('SUCCEEDED');
    expect(a.processId).not.toBe(b.processId);
    expect(b.deduplicated).toBeUndefined();
    expect(counts.createLead).toBe(2);
    expect(counts.lumenGenerate).toBe(2);
    expect(registry.size).toBe(2);
  });

  it('an in-flight (RUNNING) key returns a deterministic duplicate without executing', async () => {
    const { businessRepository, lumen, counts } = createCountingDeps();
    const registry = new InMemoryProcessRegistry();

    // Simulate an execution already in flight under the same key.
    await registry.save({
      idempotencyKey: 'K_RUNNING',
      processId: 'proc_inflight',
      status: 'RUNNING',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: 'PROJECT_LIFECYCLE',
    });

    const result = await runBusinessProcess(
      validInput(),
      { businessRepository, lumen },
      { idempotencyKey: 'K_RUNNING', registry },
    );

    expect(result.status).toBe('RUNNING');
    expect(result.deduplicated).toBe(true);
    expect(result.processId).toBe('proc_inflight');
    expect(result.currentStage).toBe('PROJECT_LIFECYCLE');
    // Nothing was executed a second time.
    expect(counts).toEqual({
      createLead: 0,
      createProject: 0,
      lumenGenerate: 0,
      createAsset: 0,
    });
  });

  it('an idempotencyKey without a registry fails closed instead of silently losing the guarantee', async () => {
    const { businessRepository, lumen, counts } = createCountingDeps();

    const result = await runBusinessProcess(
      validInput(),
      { businessRepository, lumen },
      { idempotencyKey: 'K_NO_REGISTRY' },
    );

    expect(result.status).toBe('FAILED');
    expect(result.error?.code).toBe('INVALID_INPUT');
    expect(result.error?.disposition).toBe('TERMINAL');
    expect(counts.createLead).toBe(0);
    // Even this early failure leaves a terminal trace event.
    expect(result.trace.map((e) => e.status)).toEqual(['STARTED', 'FAILED']);
  });

  it('a registry supplied via deps is honoured', async () => {
    const { businessRepository, lumen, counts } = createCountingDeps();
    const processRegistry = new InMemoryProcessRegistry();
    const deps = { businessRepository, lumen, processRegistry };

    await runBusinessProcess(validInput(), deps, { idempotencyKey: 'K_DEPS' });
    const second = await runBusinessProcess(validInput(), deps, {
      idempotencyKey: 'K_DEPS',
    });

    expect(second.deduplicated).toBe(true);
    expect(counts.createLead).toBe(1);
  });
});

describe('P6-I — Idempotency: duplicate after TERMINAL failure', () => {
  it('does not re-execute after a TERMINAL failure and replays the recorded failure', async () => {
    // A contract/validation rejection from the Project write is TERMINAL:
    // re-running cannot help, so it must never be retried automatically.
    const { businessRepository, lumen, counts } = createCountingDeps({
      createProjectError: new Error(
        'schema validation failed: project_type is invalid',
      ),
    });
    const registry = new InMemoryProcessRegistry();
    const options = { idempotencyKey: 'K_TERMINAL', registry };

    const first = await runBusinessProcess(
      validInput(),
      { businessRepository, lumen },
      options,
    );

    expect(first.status).toBe('FAILED');
    expect(first.currentStage).toBe('PROJECT_LIFECYCLE');
    expect(first.error?.disposition).toBe('TERMINAL');
    expect(first.error?.code).toBe('CONTRACT_VALIDATION_FAILED');

    const countsAfterFirst = { ...counts };
    expect(countsAfterFirst.createLead).toBe(1);
    expect(countsAfterFirst.createProject).toBe(1);

    const second = await runBusinessProcess(
      validInput(),
      { businessRepository, lumen },
      options,
    );

    // No automatic duplicate side effect of ANY kind.
    expect(counts).toEqual(countsAfterFirst);
    expect(second.deduplicated).toBe(true);
    expect(second.status).toBe('FAILED');
    expect(second.processId).toBe(first.processId);
    expect(second.error?.code).toBe('CONTRACT_VALIDATION_FAILED');
  });

  it('an explicit retry request is still refused for a TERMINAL failure', async () => {
    const { businessRepository, lumen, counts } = createCountingDeps({
      createProjectError: new Error('invalid field conversion (ConvFail)'),
    });
    const registry = new InMemoryProcessRegistry();

    const first = await runBusinessProcess(
      validInput(),
      { businessRepository, lumen },
      { idempotencyKey: 'K_TERM_RETRY', registry },
    );
    expect(first.error?.disposition).toBe('TERMINAL');
    const after = { ...counts };

    const second = await runBusinessProcess(
      validInput(),
      { businessRepository, lumen },
      {
        idempotencyKey: 'K_TERM_RETRY',
        registry,
        retryPreviousFailure: true,
      },
    );

    // Fail closed: TERMINAL is never re-executed, not even on request.
    expect(counts).toEqual(after);
    expect(second.deduplicated).toBe(true);
    expect(second.status).toBe('FAILED');
  });

  it('a RETRYABLE failure replays by default and re-executes only when explicitly requested', async () => {
    const { businessRepository, lumen, counts } = createCountingDeps({
      lumenGenerateError: new Error('Lumen gateway timeout after 30s'),
    });
    const registry = new InMemoryProcessRegistry();
    const base = { idempotencyKey: 'K_RETRYABLE', registry };

    const first = await runBusinessProcess(
      validInput(),
      { businessRepository, lumen },
      base,
    );
    expect(first.status).toBe('FAILED');
    expect(first.error?.disposition).toBe('RETRYABLE');
    expect(counts.lumenGenerate).toBe(1);

    // Default: no automatic re-run.
    const replay = await runBusinessProcess(
      validInput(),
      { businessRepository, lumen },
      base,
    );
    expect(replay.deduplicated).toBe(true);
    expect(counts.lumenGenerate).toBe(1);

    // Explicit opt-in extension point: re-runs the process from the start.
    const retried = await runBusinessProcess(
      validInput(),
      { businessRepository, lumen },
      { ...base, retryPreviousFailure: true },
    );
    expect(retried.deduplicated).toBeUndefined();
    expect(retried.processId).not.toBe(first.processId);
    expect(counts.lumenGenerate).toBe(2);
  });
});
