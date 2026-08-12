import { describe, it, expect } from 'vitest';
import { isBusinessCommitSuccess } from '@busos/contracts';
import { FakeFeishuAdapter } from '@busos/business-repository';
import { executeGoldenPath } from '../src/index.js';
import { fakeDeps } from './testkit.js';

/**
 * Test 5 — Readback failure must NOT be reported as success.
 *
 * Uses the Fake adapter's opt-in corruption hook (already part of P1-03, not an
 * extension of the fake) to simulate "write succeeds, readback differs".
 *
 * Hard rule (D019): write SUCCESS + readback FAILED == business commit FAILURE.
 */
describe('Failure-path — corrupted readback', () => {
  it('lead write succeeds but readback mismatch => FAILED (not SUCCESS)', async () => {
    const { deps, counts } = fakeDeps(
      new FakeFeishuAdapter({ corruptReadbackLead: { service_type: 'CORRUPTED' } }),
    );

    const result = await executeGoldenPath(
      { text: '我想下个月拍一套新中式写真，预算大概4000。' },
      deps,
    );

    expect(result.status).toBe('FAILED');
    expect(result.leadCommit).toBeDefined();
    expect(result.leadCommit!.write_status).toBe('SUCCESS');
    expect(result.leadCommit!.readback_status).toBe('FAILED');
    expect(isBusinessCommitSuccess(result.leadCommit!)).toBe(false);
    // Crucially, no downstream writes happened after the failed lead commit.
    expect(counts.writes.link).toBe(0);
    expect(counts.writes.customer).toBe(0);
  });

  it('customer create write succeeds but readback mismatch => FAILED (lead never created)', async () => {
    const { deps, counts } = fakeDeps(
      new FakeFeishuAdapter({ corruptReadbackCustomer: { display_name: 'CORRUPTED' } }),
    );

    const result = await executeGoldenPath(
      { text: '我是张三，微信 zhangsan123，想下个月拍新中式写真，预算4000。' },
      deps,
    );

    expect(result.status).toBe('FAILED');
    expect(result.customerCommit).toBeDefined();
    expect(result.customerCommit!.readback_status).toBe('FAILED');
    expect(isBusinessCommitSuccess(result.customerCommit!)).toBe(false);
    // Fail closed: lead was never created after the failed customer commit.
    expect(counts.writes.lead).toBe(0);
    expect(counts.writes.link).toBe(0);
  });
});
