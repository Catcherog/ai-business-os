import { describe, expect, it } from 'vitest';
import { parseGoldenSetPayload } from '../src/loader.js';
import { EVALUATION_CASE_VERSION } from '../src/versions.js';

const base = {
  version: EVALUATION_CASE_VERSION,
  domain: 'GOVERNANCE',
  provenance_type: 'BUSINESS_ABSTRACTED',
  query: 'q',
  review_status: 'SYSTEM_REVIEWED',
  synthetic: false,
};

describe('golden set loader', () => {
  it('loads a valid array payload', () => {
    const { cases, issues } = parseGoldenSetPayload(
      [{ ...base, case_id: 'A-01' }, { ...base, case_id: 'A-02' }],
      'dataset.json',
    );
    expect(issues).toHaveLength(0);
    expect(cases.map((c) => c.case_id)).toEqual(['A-01', 'A-02']);
  });

  it('loads a { cases: [...] } payload', () => {
    const { cases, issues } = parseGoldenSetPayload(
      { cases: [{ ...base, case_id: 'A-01' }] },
      'dataset.json',
    );
    expect(issues).toHaveLength(0);
    expect(cases).toHaveLength(1);
  });

  it('rejects an invalid-provenance case with a per-case issue', () => {
    const { cases, issues } = parseGoldenSetPayload(
      [{ ...base, case_id: 'A-01', provenance_type: 'NOT_REAL' }],
      'dataset.json',
    );
    expect(cases).toHaveLength(0);
    expect(issues).toHaveLength(1);
    expect(issues[0].case_index).toBe(0);
    expect(issues[0].errors.join()).toContain('provenance_type');
  });

  it('rejects a non-array / non-object payload', () => {
    const { issues } = parseGoldenSetPayload(42, 'dataset.json');
    expect(issues).toHaveLength(1);
    expect(issues[0].errors.join()).toContain('array');
  });

  it('rejects duplicate case_ids', () => {
    const { cases, issues } = parseGoldenSetPayload(
      [{ ...base, case_id: 'DUP' }, { ...base, case_id: 'DUP' }],
      'dataset.json',
    );
    expect(cases).toHaveLength(1);
    expect(issues.some((i) => i.errors.join().includes('duplicate case_id'))).toBe(true);
  });
});
