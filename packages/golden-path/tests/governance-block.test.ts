import { describe, it, expect } from 'vitest';
import { executeGoldenPath } from '../src/index.js';
import { fakeDeps } from './testkit.js';

/**
 * Test 4 — Governance Block (P2 GP-001 Gate C).
 *
 * Input with no service type ("你好，请问你们几点关门？") extracts a null
 * service_type; governance REJECTs it. Hard requirement: zero repository writes
 * of any kind (no lead, no customer, no link, no Feishu create).
 */
describe('Flow C — Governance Block', () => {
  it('blocks the write entirely when governance rejects', async () => {
    const { deps, counts } = fakeDeps();

    const result = await executeGoldenPath(
      { text: '你好，请问你们几点关门？' },
      deps,
    );

    expect(result.status).not.toBe('SUCCESS');
    expect(result.governance?.decision).toBe('REJECT');
    expect(result.failureReason).toContain('governance decision=REJECT');

    // The only hard assertion that matters for fail-closed behaviour:
    expect(counts.writes.lead).toBe(0);
    expect(counts.writes.customer).toBe(0);
    expect(counts.writes.link).toBe(0);

    expect(result.lead).toBeUndefined();
    expect(result.customer).toBeNull();
  });

  it('blocks when the candidate itself fails contract validation', async () => {
    const { deps, counts } = fakeDeps();
    // A candidate builder that returns a structurally-invalid payload.
    const brokenDeps = {
      ...deps,
      candidateBuilder: () => ({ not_a_candidate: true }) as any,
    };
    const result = await executeGoldenPath({ text: 'x' }, brokenDeps);
    expect(result.status).toBe('BLOCKED');
    expect(counts.writes.lead).toBe(0);
    expect(counts.writes.customer).toBe(0);
  });
});
