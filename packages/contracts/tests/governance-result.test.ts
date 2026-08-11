import { describe, expect, it } from 'vitest';
import {
  CONTRACT_VERSIONS,
  ContractValidationError,
  GOVERNANCE_DECISIONS,
  assertGovernanceResultV1,
  validateGovernanceResultV1,
} from '../src/index.js';
import { canonicalGovernanceResult, clone } from './fixtures.js';

describe('GovernanceResultV1 — valid samples', () => {
  it('validates the canonical review-required result', () => {
    expect(validateGovernanceResultV1(canonicalGovernanceResult).ok).toBe(true);
  });

  it('exposes an explicit contract version', () => {
    expect(canonicalGovernanceResult.version).toBe(
      CONTRACT_VERSIONS.GOVERNANCE_RESULT_V1,
    );
  });

  it('accepts every frozen decision value', () => {
    for (const decision of GOVERNANCE_DECISIONS) {
      const result = clone(canonicalGovernanceResult);
      result.decision = decision;
      expect(validateGovernanceResultV1(result).ok).toBe(true);
    }
  });

  it('accepts a resolved customer and an empty issue list', () => {
    const result = clone(canonicalGovernanceResult);
    result.decision = 'APPROVE';
    result.issues = [];
    result.customer_resolution = {
      status: 'RESOLVED',
      customer_id: 'cust_0001',
    };
    expect(validateGovernanceResultV1(result).ok).toBe(true);
  });

  it('accepts an issue that is not attributable to a single field', () => {
    const result = clone(canonicalGovernanceResult);
    result.issues = [{ code: 'INTENT_CONFIDENCE_LOW', field: null }];
    expect(validateGovernanceResultV1(result).ok).toBe(true);
  });
});

describe('GovernanceResultV1 — clearly invalid samples', () => {
  it('rejects an unknown decision', () => {
    const result = clone(canonicalGovernanceResult) as Record<string, unknown>;
    result.decision = 'MAYBE';
    expect(validateGovernanceResultV1(result).ok).toBe(false);
  });

  it('rejects a missing customer_resolution', () => {
    const result = clone(canonicalGovernanceResult) as Record<string, unknown>;
    delete result.customer_resolution;
    expect(validateGovernanceResultV1(result).ok).toBe(false);
  });

  it('rejects an unknown customer resolution status', () => {
    const result = clone(canonicalGovernanceResult) as Record<string, unknown>;
    result.customer_resolution = { status: 'FUZZY_MATCH', customer_id: null };
    expect(validateGovernanceResultV1(result).ok).toBe(false);
  });

  it('rejects an issue without a code', () => {
    const result = clone(canonicalGovernanceResult) as Record<string, unknown>;
    result.issues = [{ field: 'customer_candidate' }];
    expect(validateGovernanceResultV1(result).ok).toBe(false);
  });

  it('rejects a non-object normalized_data', () => {
    const result = clone(canonicalGovernanceResult) as Record<string, unknown>;
    result.normalized_data = [];
    expect(validateGovernanceResultV1(result).ok).toBe(false);
  });

  it('rejects unknown extra properties', () => {
    const result = clone(canonicalGovernanceResult) as Record<string, unknown>;
    result.approved_by = 'someone';
    expect(validateGovernanceResultV1(result).ok).toBe(false);
  });

  it('rejects a wrong version', () => {
    const result = clone(canonicalGovernanceResult) as Record<string, unknown>;
    result.version = 'governance_result.v2';
    expect(validateGovernanceResultV1(result).ok).toBe(false);
  });

  it('throws ContractValidationError from the assert variant', () => {
    expect(() => assertGovernanceResultV1({})).toThrow(ContractValidationError);
  });
});
