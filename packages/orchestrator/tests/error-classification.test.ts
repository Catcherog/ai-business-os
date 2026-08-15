import { describe, it, expect } from 'vitest';
import {
  classifyFailure,
  invalidInputError,
  sanitizeMessage,
  runBusinessProcess,
} from '../src/index.js';
import { createCountingDeps, validInput } from './helpers.js';

/**
 * BUSOS-P6-02 gate P6-J — error classification.
 *
 * Covers the taxonomy as a unit (every required real-world category) and then
 * proves the classification is actually wired through `runBusinessProcess`.
 */

describe('P6-J — Error classification taxonomy', () => {
  it('classifies CloudBase quota exhaustion as EXTERNAL_DEPENDENCY', () => {
    const cases = [
      'CloudBase NoSQL read quota exhausted',
      'RESOURCE_EXHAUSTED: daily read limit exceeded',
      'HTTP 429 Too Many Requests',
    ];
    for (const message of cases) {
      const error = classifyFailure('CREATIVE_PRODUCTION', message);
      expect(error.disposition).toBe('EXTERNAL_DEPENDENCY');
      expect(error.code).toBe('EXTERNAL_QUOTA_EXHAUSTED');
      expect(error.stage).toBe('CREATIVE_PRODUCTION');
    }
  });

  it('classifies Lumen temporary 5xx / timeout as RETRYABLE', () => {
    const cases = [
      'Lumen responded 503 Service Unavailable',
      'Lumen request timed out after 30000ms',
      'lumen upstream bad gateway',
    ];
    for (const message of cases) {
      const error = classifyFailure('CREATIVE_PRODUCTION', message);
      expect(error.disposition).toBe('RETRYABLE');
      expect(error.code).toBe('UPSTREAM_TEMPORARY_FAILURE');
    }
  });

  it('classifies Feishu temporary timeout / network failure as RETRYABLE', () => {
    const cases = [
      'ETIMEDOUT connecting to open.feishu.cn',
      'ECONNRESET while writing Lead record',
      'network error talking to Feishu OpenAPI',
      'socket hang up',
    ];
    for (const message of cases) {
      const error = classifyFailure('GOLDEN_PATH', message);
      expect(error.disposition).toBe('RETRYABLE');
      expect(error.code).toBe('UPSTREAM_TEMPORARY_FAILURE');
    }
  });

  it('classifies contract validation failure as TERMINAL', () => {
    const cases = [
      'LeadSchema validation failed: service_type must not be null',
      'zod: invalid enum value',
      'code=1254064 msg=DatetimeFieldConvFail field="Created At"',
    ];
    for (const message of cases) {
      const error = classifyFailure('PROJECT_LIFECYCLE', message);
      expect(error.disposition).toBe('TERMINAL');
      expect(error.code).toBe('CONTRACT_VALIDATION_FAILED');
    }
  });

  it('classifies invalid orchestrator input as TERMINAL', () => {
    const error = invalidInputError('GOLDEN_PATH', 'input.projectTitle is required');
    expect(error.disposition).toBe('TERMINAL');
    expect(error.code).toBe('INVALID_INPUT');
  });

  it('classifies an unverified write as RETRYABLE PERSISTENCE_NOT_VERIFIED', () => {
    const error = classifyFailure(
      'GOLDEN_PATH',
      'lead commit not verified (write=OK, readback=MISSING)',
    );
    expect(error.code).toBe('PERSISTENCE_NOT_VERIFIED');
    expect(error.disposition).toBe('RETRYABLE');
  });

  it('falls back to documented slice reason codes when the message has no signal', () => {
    expect(classifyFailure('CREATIVE_PRODUCTION', 'LUMEN_GENERATION_FAILED')).toMatchObject({
      code: 'CREATIVE_GENERATION_FAILED',
      disposition: 'RETRYABLE',
    });
    expect(classifyFailure('PROJECT_LIFECYCLE', 'PROJECT_WRITE_FAILED')).toMatchObject({
      code: 'UPSTREAM_TEMPORARY_FAILURE',
      disposition: 'RETRYABLE',
    });
  });

  it('fails closed to TERMINAL for unclassifiable faults', () => {
    const error = classifyFailure('GOLDEN_PATH', 'something inexplicable happened');
    expect(error.code).toBe('UNCLASSIFIED_FAILURE');
    expect(error.disposition).toBe('TERMINAL');
  });

  it('redacts credential material and clamps message length', () => {
    expect(sanitizeMessage('auth failed: password=hunter2')).not.toContain('hunter2');
    // Synthetic, non-credential fixture string (never a real token).
    const fakeBearer = 'FAKE0000TESTTOKEN0000';
    expect(sanitizeMessage(`Authorization: Bearer ${fakeBearer}`)).not.toContain(fakeBearer);
    expect(sanitizeMessage('token: abcdefgh12345678')).toContain('[REDACTED]');
    expect(sanitizeMessage('x'.repeat(500)).length).toBeLessThanOrEqual(301);
  });
});

describe('P6-J — Classification wired through runBusinessProcess', () => {
  it('EXTERNAL_DEPENDENCY: CloudBase quota exhaustion surfaces on the result and trace', async () => {
    const { businessRepository, lumen } = createCountingDeps({
      createProjectError: new Error(
        'CloudBase NoSQL read quota exhausted (RESOURCE_EXHAUSTED)',
      ),
    });

    const result = await runBusinessProcess(validInput(), {
      businessRepository,
      lumen,
    });

    expect(result.status).toBe('FAILED');
    expect(result.error?.disposition).toBe('EXTERNAL_DEPENDENCY');
    expect(result.error?.code).toBe('EXTERNAL_QUOTA_EXHAUSTED');
    expect(result.error?.stage).toBe('PROJECT_LIFECYCLE');

    const terminal = result.trace.find(
      (e) => e.stage === 'PROJECT_LIFECYCLE' && e.status === 'FAILED',
    );
    expect(terminal?.error?.disposition).toBe('EXTERNAL_DEPENDENCY');
  });

  it('RETRYABLE: a transient Lumen fault is marked retryable', async () => {
    const { businessRepository, lumen } = createCountingDeps({
      lumenGenerateError: new Error('Lumen 504 gateway timeout'),
    });

    const result = await runBusinessProcess(validInput(), {
      businessRepository,
      lumen,
    });

    expect(result.status).toBe('FAILED');
    expect(result.error?.disposition).toBe('RETRYABLE');
    expect(result.error?.stage).toBe('CREATIVE_PRODUCTION');
  });

  it('TERMINAL: structurally invalid input never reaches a slice', async () => {
    const { businessRepository, lumen, counts } = createCountingDeps();

    const result = await runBusinessProcess(
      // projectTitle is required by the orchestrator contract.
      validInput({ projectTitle: '   ' }),
      { businessRepository, lumen },
    );

    expect(result.status).toBe('FAILED');
    expect(result.error?.code).toBe('INVALID_INPUT');
    expect(result.error?.disposition).toBe('TERMINAL');
    expect(counts).toEqual({
      createLead: 0,
      createProject: 0,
      lumenGenerate: 0,
      createAsset: 0,
    });
  });

  it('TERMINAL: a contract validation fault from the repository is not retryable', async () => {
    const { businessRepository, lumen } = createCountingDeps({
      createAssetError: new Error('AssetSchema validation failed: asset_uri invalid'),
    });

    const result = await runBusinessProcess(validInput(), {
      businessRepository,
      lumen,
    });

    expect(result.status).toBe('FAILED');
    expect(result.error?.code).toBe('CONTRACT_VALIDATION_FAILED');
    expect(result.error?.disposition).toBe('TERMINAL');
    expect(result.error?.stage).toBe('CREATIVE_PRODUCTION');
  });

  it('never leaks credential material into result error messages', async () => {
    const { businessRepository, lumen } = createCountingDeps({
      createLeadError: new Error('auth rejected: AUTH_PASSWORD=s3cr3t-value'),
    });

    const result = await runBusinessProcess(validInput(), {
      businessRepository,
      lumen,
    });

    expect(result.status).toBe('FAILED');
    expect(result.error?.message).not.toContain('s3cr3t-value');
    expect(result.error?.message).toContain('[REDACTED]');
  });
});
