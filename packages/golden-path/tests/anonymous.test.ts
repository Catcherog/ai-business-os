import { describe, it, expect } from 'vitest';
import { isBusinessCommitSuccess } from '@busos/contracts';
import { executeGoldenPath } from '../src/index.js';
import { fakeDeps } from './testkit.js';

/**
 * Test 1 — Anonymous success (P2 GP-001 Gate A).
 *
 * Input: "我想下个月拍一套新中式写真，预算大概4000。"
 * Expect: governance APPROVE, no customer lookup/create, lead created with
 * customer_id = null, readback VERIFIED, result SUCCESS.
 */
describe('Flow A — Anonymous Lead', () => {
  it('commits an anonymous lead with customer_id = null and VERIFIED readback', async () => {
    const { deps, counts } = fakeDeps();

    const result = await executeGoldenPath(
      { text: '我想下个月拍一套新中式写真，预算大概4000。' },
      deps,
    );

    expect(result.status).toBe('SUCCESS');
    expect(result.governance?.decision).toBe('APPROVE');

    // No customer identity -> no lookup, no create.
    expect(counts.writes.customer).toBe(0);

    // Exactly one lead created.
    expect(counts.writes.lead).toBe(1);
    expect(counts.writes.link).toBe(0);

    // Critical assertions from the task spec.
    expect(result.lead).not.toBeNull();
    expect(result.lead!.customer_id).toBeNull();
    expect(result.lead!.service_type).toBe('新中式写真');
    expect(result.lead!.budget_max).toBe(4000);
    expect(result.lead!.preferred_date_text).toBe('下个月');

    expect(result.leadCommit).toBeDefined();
    expect(result.leadCommit!.readback_status).toBe('VERIFIED');
    expect(isBusinessCommitSuccess(result.leadCommit!)).toBe(true);
  });
});
