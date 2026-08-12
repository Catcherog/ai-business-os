import { describe, it, expect } from 'vitest';
import { BusinessRepository, FakeFeishuAdapter } from '@busos/business-repository';
import { executeGoldenPath } from '../src/index.js';
import { CountingBusinessRepository } from './testkit.js';
import { buildCandidateFromInput, govern } from '../src/index.js';

/**
 * Test 6 — Identity boundary (no fuzzy matching).
 *
 * Existing customer has wechat = "zhangsan123". An incoming consultation with
 * wechat = "zhangsan12" (off by one char) MUST NOT be merged into the existing
 * customer. Only exact phone / exact WeChat match (04-INTERFACES.md §2, P1-03).
 */
describe('Identity boundary — exact match only', () => {
  it('does not fuzzy-match a near-identical wechat id', async () => {
    const seedAdapter = new FakeFeishuAdapter();
    const seedRepo = new BusinessRepository(seedAdapter);
    const seeded = await seedRepo.createCustomer({
      display_name: '张三',
      phone: null,
      wechat: 'zhangsan123',
    });
    expect(seeded.commit.readback_status).toBe('VERIFIED');

    const repo = new BusinessRepository(seedAdapter);
    const counts = new CountingBusinessRepository(repo);
    const deps = {
      candidateBuilder: buildCandidateFromInput,
      governance: govern,
      businessRepository: counts,
    };

    const result = await executeGoldenPath(
      { text: '我是李四，微信 zhangsan12，想下个月拍新中式写真，预算4000。' },
      deps,
    );

    expect(result.status).toBe('SUCCESS');

    // Near-miss wechat must NOT match -> a brand-new customer is created.
    expect(counts.writes.customer).toBe(1);
    expect(result.customer!.wechat).toBe('zhangsan12');
    expect(result.customer!.customer_id).not.toBe(seeded.customer.customer_id);

    expect(counts.writes.lead).toBe(1);
    expect(counts.writes.link).toBe(1);
    expect(result.lead!.customer_id).toBe(result.customer!.customer_id);
  });
});
