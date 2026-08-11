import { describe, expect, it } from 'vitest';
import {
  CONTRACT_VERSIONS,
  ContractValidationError,
  assertCommitResultV1,
  isBusinessCommitSuccess,
  validateCommitResultV1,
} from '../src/index.js';
import { canonicalCommitResult, clone } from './fixtures.js';

describe('CommitResultV1 — valid samples', () => {
  it('validates a committed + verified result', () => {
    expect(validateCommitResultV1(canonicalCommitResult).ok).toBe(true);
  });

  it('exposes an explicit contract version', () => {
    expect(canonicalCommitResult.version).toBe(
      CONTRACT_VERSIONS.COMMIT_RESULT_V1,
    );
  });

  it('validates a failed write with a null external record id', () => {
    const result = clone(canonicalCommitResult);
    result.status = 'FAILED';
    result.external_record_id = null;
    result.write_status = 'FAILED';
    result.readback_status = 'NOT_RUN';
    result.errors = ['FEISHU_WRITE_TIMEOUT'];
    expect(validateCommitResultV1(result).ok).toBe(true);
  });
});

describe('CommitResultV1 — business success rule (D019)', () => {
  it('treats COMMITTED + SUCCESS + VERIFIED as business success', () => {
    expect(isBusinessCommitSuccess(canonicalCommitResult)).toBe(true);
  });

  it('does not treat a successful write without readback as success', () => {
    const result = clone(canonicalCommitResult);
    result.readback_status = 'NOT_RUN';
    expect(isBusinessCommitSuccess(result)).toBe(false);
  });

  it('does not treat a failed readback as success', () => {
    const result = clone(canonicalCommitResult);
    result.readback_status = 'FAILED';
    expect(isBusinessCommitSuccess(result)).toBe(false);
  });

  it('does not treat a failed write as success', () => {
    const result = clone(canonicalCommitResult);
    result.write_status = 'FAILED';
    expect(isBusinessCommitSuccess(result)).toBe(false);
  });
});

describe('CommitResultV1 — clearly invalid samples', () => {
  it('rejects an unknown readback status', () => {
    const result = clone(canonicalCommitResult) as Record<string, unknown>;
    result.readback_status = 'SKIPPED';
    expect(validateCommitResultV1(result).ok).toBe(false);
  });

  it('rejects an unknown domain object', () => {
    const result = clone(canonicalCommitResult) as Record<string, unknown>;
    result.domain_object = 'project';
    expect(validateCommitResultV1(result).ok).toBe(false);
  });

  it('rejects a storage value other than feishu', () => {
    const result = clone(canonicalCommitResult) as Record<string, unknown>;
    result.storage = 'postgres';
    expect(validateCommitResultV1(result).ok).toBe(false);
  });

  it('rejects a missing errors array', () => {
    const result = clone(canonicalCommitResult) as Record<string, unknown>;
    delete result.errors;
    expect(validateCommitResultV1(result).ok).toBe(false);
  });

  it('rejects an empty domain_id', () => {
    const result = clone(canonicalCommitResult);
    result.domain_id = '';
    expect(validateCommitResultV1(result).ok).toBe(false);
  });

  it('rejects unknown extra properties', () => {
    const result = clone(canonicalCommitResult) as Record<string, unknown>;
    result.feishu_table_id = 'tblXXX';
    expect(validateCommitResultV1(result).ok).toBe(false);
  });

  it('throws ContractValidationError from the assert variant', () => {
    expect(() => assertCommitResultV1({})).toThrow(ContractValidationError);
  });
});
