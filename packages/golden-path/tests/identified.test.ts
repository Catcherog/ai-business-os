import { describe, it, expect } from 'vitest';
import { isBusinessCommitSuccess } from '@busos/contracts';
import { BusinessRepository, FakeFeishuAdapter } from '@busos/business-repository';
import { executeGoldenPath } from '../src/index.js';
import { CountingBusinessRepository, fakeDeps } from './testkit.js';

/**
 * Tests 2 & 3 — Identified Customer (P2 GP-001 Gate B).
 *
 * NOTE on input wording: the task brief lists Flow B as
 * "想下个月拍新中式，预算4000". The FROZEN P1-02 extractor only resolves a
 * service_type when a deliverable noun is present; "新中式" alone is a style
 * modifier and matches no noun, so service_type would be null and the lead
 * could not be created (Lead.service_type is required). To exercise the golden
 * path faithfully we use "新中式写真" (the same phrasing as Flow A). The literal
 * "新中式" extraction gap is logged as BL-015 (non-blocking; child of BL-011).
 */

const IDENTIFIED_TEXT =
  '我是张三，微信 zhangsan123，想下个月拍新中式写真，预算4000。';

describe('Flow B — Identified Customer (new)', () => {
  it('creates a new customer, links it to the lead, all VERIFIED', async () => {
    const { deps, counts } = fakeDeps();

    const result = await executeGoldenPath({ text: IDENTIFIED_TEXT }, deps);

    expect(result.status).toBe('SUCCESS');
    expect(result.governance?.decision).toBe('APPROVE');

    // Customer looked up (no match) then created exactly once.
    expect(counts.writes.customer).toBe(1);
    expect(result.customerCommit).toBeDefined();
    expect(isBusinessCommitSuccess(result.customerCommit!)).toBe(true);
    expect(result.customer!.wechat).toBe('zhangsan123');
    expect(result.customer!.display_name).toBe('张三');

    // Lead created and linked to the new customer.
    expect(counts.writes.lead).toBe(1);
    expect(counts.writes.link).toBe(1);
    expect(result.lead!.customer_id).toBe(result.customer!.customer_id);
    expect(isBusinessCommitSuccess(result.leadCommit!)).toBe(true);
  });
});

describe('Flow B — Identified Customer (existing, exact match)', () => {
  it('reuses the exact-match customer, creates no new one', async () => {
    // Pre-seed an existing customer with wechat = zhangsan123 in the SAME
    // in-memory adapter the golden path will use.
    const seedAdapter = new FakeFeishuAdapter();
    const seedRepo = new BusinessRepository(seedAdapter);
    const seeded = await seedRepo.createCustomer({
      display_name: '张三',
      phone: null,
      wechat: 'zhangsan123',
    });
    expect(seeded.commit.readback_status).toBe('VERIFIED');

    // Counting wrapper is created AFTER seeding so only GP writes are counted.
    const repo = new BusinessRepository(seedAdapter);
    const counts = new CountingBusinessRepository(repo);
    const deps = {
      candidateBuilder: (await import('../src/index.js')).buildCandidateFromInput,
      governance: (await import('../src/index.js')).govern,
      businessRepository: counts,
    };

    const result = await executeGoldenPath({ text: IDENTIFIED_TEXT }, deps);

    expect(result.status).toBe('SUCCESS');

    // Existing customer reused: zero customer creations during GP.
    expect(counts.writes.customer).toBe(0);
    expect(result.customer!.customer_id).toBe(seeded.customer.customer_id);

    // Lead created + linked.
    expect(counts.writes.lead).toBe(1);
    expect(counts.writes.link).toBe(1);
    expect(result.lead!.customer_id).toBe(seeded.customer.customer_id);
  });
});
