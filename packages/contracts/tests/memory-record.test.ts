import { describe, expect, it } from 'vitest';
import {
  MEMORY_EVIDENCE_KINDS,
  MEMORY_SCOPES,
  MEMORY_SOURCE_TYPES,
  MEMORY_STATUSES,
  MEMORY_SUBJECT_TYPES,
  MEMORY_TYPES,
  assertMemoryRecordV1,
  isActiveMemory,
  isMemoryRecordV1,
  scopeForSubjectType,
  validateMemoryRecordV1,
  ContractValidationError,
} from '../src/index.js';
import { canonicalMemoryRecord, clone } from './fixtures.js';

/**
 * H2-01-B — canonical Memory contract.
 *
 * The point of these tests is that the contract, not a caller, decides what a
 * memory is: narrow enumerable scopes/types, mandatory provenance, and a
 * lifecycle that cannot be self-contradictory.
 */
describe('memory_record.v1 — enumerations stay narrow', () => {
  it('keeps subjects to canonical BUSOS entities', () => {
    expect(MEMORY_SUBJECT_TYPES).toEqual(['CUSTOMER', 'PROJECT']);
    expect(MEMORY_SCOPES).toEqual(['CUSTOMER', 'PROJECT']);
  });

  it('keeps memory categories to the four demonstrated ones', () => {
    expect(MEMORY_TYPES).toEqual(['PREFERENCE', 'FACT', 'DECISION', 'OUTCOME']);
  });

  it('only allows source types that map to canonical surfaces', () => {
    expect(MEMORY_SOURCE_TYPES).toEqual([
      'HUMAN_REVIEW',
      'PROJECT',
      'TASK',
      'ASSET',
      'PROCESS_RUN',
    ]);
  });

  it('only allows evidence kinds that are canonical records', () => {
    expect(MEMORY_EVIDENCE_KINDS).toEqual([
      'REVIEW_CASE',
      'LEAD',
      'CUSTOMER',
      'PROJECT',
      'TASK',
      'ASSET',
      'PROCESS_RUN',
    ]);
  });

  it('has exactly three lifecycle states — no destructive delete state', () => {
    expect(MEMORY_STATUSES).toEqual(['ACTIVE', 'SUPERSEDED', 'INVALIDATED']);
  });
});

describe('memory_record.v1 — canonical record', () => {
  it('accepts the canonical fixture', () => {
    const result = validateMemoryRecordV1(canonicalMemoryRecord);
    expect(result.ok).toBe(true);
    expect(isMemoryRecordV1(canonicalMemoryRecord)).toBe(true);
  });

  it('exposes the single definition of an active memory', () => {
    expect(isActiveMemory(canonicalMemoryRecord)).toBe(true);

    const superseded = clone(canonicalMemoryRecord);
    superseded.status = 'SUPERSEDED';
    superseded.superseded_by_memory_id = 'mem_ffffffffffffffff';
    expect(isActiveMemory(superseded)).toBe(false);

    const invalidated = clone(canonicalMemoryRecord);
    invalidated.status = 'INVALIDATED';
    invalidated.invalidation_reason = 'no longer true';
    expect(isActiveMemory(invalidated)).toBe(false);
  });

  it('derives scope from the anchor', () => {
    expect(scopeForSubjectType('CUSTOMER')).toBe('CUSTOMER');
    expect(scopeForSubjectType('PROJECT')).toBe('PROJECT');
  });
});

describe('memory_record.v1 — fails closed', () => {
  it('rejects a memory without provenance evidence', () => {
    const bad = clone(canonicalMemoryRecord);
    bad.evidence_refs = [];
    const result = validateMemoryRecordV1(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('evidence_refs');
    }
  });

  it('rejects a memory whose scope contradicts its anchor', () => {
    const bad = clone(canonicalMemoryRecord);
    bad.subject_type = 'PROJECT';
    bad.subject_id = 'proj_0001';
    const result = validateMemoryRecordV1(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('scope');
    }
  });

  it('rejects an ACTIVE memory that is also superseded', () => {
    const bad = clone(canonicalMemoryRecord);
    bad.superseded_by_memory_id = 'mem_ffffffffffffffff';
    expect(validateMemoryRecordV1(bad).ok).toBe(false);
  });

  it('rejects a SUPERSEDED memory with no replacement reference', () => {
    const bad = clone(canonicalMemoryRecord);
    bad.status = 'SUPERSEDED';
    expect(validateMemoryRecordV1(bad).ok).toBe(false);
  });

  it('rejects an INVALIDATED memory with no stated reason', () => {
    const bad = clone(canonicalMemoryRecord);
    bad.status = 'INVALIDATED';
    expect(validateMemoryRecordV1(bad).ok).toBe(false);
  });

  it('rejects unknown extra fields such as an embedding', () => {
    const bad = clone(canonicalMemoryRecord) as Record<string, unknown>;
    bad.embedding = [0.1, 0.2, 0.3];
    expect(validateMemoryRecordV1(bad).ok).toBe(false);
  });

  it('throws a ContractValidationError from the assert helper', () => {
    const bad = clone(canonicalMemoryRecord);
    bad.content = '';
    expect(() => assertMemoryRecordV1(bad)).toThrow(ContractValidationError);
    try {
      assertMemoryRecordV1(bad);
    } catch (e) {
      expect((e as ContractValidationError).contract).toBe('memory_record.v1');
    }
  });
});
