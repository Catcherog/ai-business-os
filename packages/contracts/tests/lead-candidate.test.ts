import { describe, expect, it } from 'vitest';
import {
  CONTRACT_VERSIONS,
  ContractValidationError,
  assertLeadCandidateV1,
  isLeadCandidateV1,
  validateLeadCandidateV1,
} from '../src/index.js';
import { canonicalLeadCandidate, clone } from './fixtures.js';

describe('LeadCandidateV1 — valid samples', () => {
  it('validates the canonical GP-001 consultation example', () => {
    const result = validateLeadCandidateV1(canonicalLeadCandidate);
    expect(result.ok).toBe(true);
  });

  it('exposes an explicit contract version', () => {
    expect(canonicalLeadCandidate.version).toBe(
      CONTRACT_VERSIONS.LEAD_CANDIDATE_V1,
    );
    expect(CONTRACT_VERSIONS.LEAD_CANDIDATE_V1).toBe('lead_candidate.v1');
  });

  it('accepts null for every unknown optional business value', () => {
    const candidate = clone(canonicalLeadCandidate);
    candidate.customer_candidate = { name: null, phone: null, wechat: null };
    candidate.requirement = {
      service_type: null,
      budget_min: null,
      budget_max: null,
      preferred_date_text: null,
      notes: null,
    };
    expect(validateLeadCandidateV1(candidate).ok).toBe(true);
  });

  it('accepts an empty evidence array', () => {
    const candidate = clone(canonicalLeadCandidate);
    candidate.evidence = [];
    expect(validateLeadCandidateV1(candidate).ok).toBe(true);
  });

  it('preserves original date wording and exact budget value', () => {
    const parsed = assertLeadCandidateV1(canonicalLeadCandidate);
    expect(parsed.requirement.preferred_date_text).toBe('下个月');
    expect(parsed.requirement.budget_max).toBe(4000);
  });
});

describe('LeadCandidateV1 — clearly invalid samples', () => {
  it('rejects a wrong contract version', () => {
    const candidate = clone(canonicalLeadCandidate) as Record<string, unknown>;
    candidate.version = 'lead_candidate.v2';
    const result = validateLeadCandidateV1(candidate);
    expect(result.ok).toBe(false);
  });

  it('rejects a missing required top-level field', () => {
    const candidate = clone(canonicalLeadCandidate) as Record<string, unknown>;
    delete candidate.session_id;
    const result = validateLeadCandidateV1(candidate);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join('|')).toContain('session_id');
    }
  });

  it('rejects a missing customer_candidate key instead of silently defaulting', () => {
    const candidate = clone(canonicalLeadCandidate);
    const customer = candidate.customer_candidate as Record<string, unknown>;
    delete customer.phone;
    expect(validateLeadCandidateV1(candidate).ok).toBe(false);
  });

  it('rejects unknown extra properties', () => {
    const candidate = clone(canonicalLeadCandidate) as Record<string, unknown>;
    candidate.unexpected_field = 'x';
    expect(validateLeadCandidateV1(candidate).ok).toBe(false);
  });

  it('rejects confidence outside 0..1', () => {
    const candidate = clone(canonicalLeadCandidate);
    candidate.intent.confidence = 1.5;
    expect(validateLeadCandidateV1(candidate).ok).toBe(false);
  });

  it('rejects a negative budget', () => {
    const candidate = clone(canonicalLeadCandidate);
    candidate.requirement.budget_max = -1;
    expect(validateLeadCandidateV1(candidate).ok).toBe(false);
  });

  it('rejects an unknown governance status', () => {
    const candidate = clone(canonicalLeadCandidate) as Record<string, unknown>;
    candidate.governance = {
      status: 'APPROVED',
      risk_level: 'R0',
      missing_fields: [],
    };
    expect(validateLeadCandidateV1(candidate).ok).toBe(false);
  });

  it('rejects an unknown risk level', () => {
    const candidate = clone(canonicalLeadCandidate) as Record<string, unknown>;
    candidate.governance = {
      status: 'PENDING_REVIEW',
      risk_level: 'R9',
      missing_fields: [],
    };
    expect(validateLeadCandidateV1(candidate).ok).toBe(false);
  });

  it('rejects a non ISO-8601 created_at', () => {
    const candidate = clone(canonicalLeadCandidate);
    candidate.created_at = '2026/08/11 10:00';
    expect(validateLeadCandidateV1(candidate).ok).toBe(false);
  });

  it('rejects an evidence item without source_text', () => {
    const candidate = clone(canonicalLeadCandidate);
    const [first] = candidate.evidence as Array<Record<string, unknown>>;
    delete first?.source_text;
    expect(validateLeadCandidateV1(candidate).ok).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(validateLeadCandidateV1(null).ok).toBe(false);
    expect(validateLeadCandidateV1('candidate').ok).toBe(false);
    expect(isLeadCandidateV1([])).toBe(false);
  });

  it('throws ContractValidationError from the assert variant', () => {
    expect(() => assertLeadCandidateV1({})).toThrow(ContractValidationError);
  });
});
