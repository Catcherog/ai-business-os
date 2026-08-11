import { describe, it, expect } from 'vitest';
import businessRepositoryRaw from '../src/business-repository.ts?raw';
import typesRaw from '../src/types.ts?raw';
import feishuAdapterRaw from '../src/feishu-adapter.ts?raw';
import mappingRaw from '../src/mapping.ts?raw';

/**
 * Gate 3 proof: Feishu-specific knowledge (URLs, tokens, field names) is
 * confined to the adapter layer. The domain boundary (BusinessRepository) and
 * the port (types) must not leak it.
 */

const FEISHU_SECRETS = [
  'open.feishu.cn',
  'tenant_access_token',
  'BitableWriter',
  '客户姓名',
  '拍摄类型',
  '客户关联',
  '预算下限',
];

describe('Feishu boundary isolation (gate 3)', () => {
  it('BusinessRepository contains no Feishu specifics', () => {
    for (const secret of FEISHU_SECRETS) {
      expect(businessRepositoryRaw.includes(secret), `leak in business-repository: ${secret}`).toBe(false);
    }
  });

  it('the FeishuAdapter port (types.ts) contains no Feishu specifics', () => {
    for (const secret of FEISHU_SECRETS) {
      expect(typesRaw.includes(secret), `leak in types: ${secret}`).toBe(false);
    }
  });

  it('RealFeishuAdapter owns the Feishu URL + token', () => {
    expect(feishuAdapterRaw.includes('open.feishu.cn')).toBe(true);
    expect(feishuAdapterRaw.includes('tenant_access_token')).toBe(true);
  });

  it('mapping owns the Feishu field names', () => {
    expect(mappingRaw.includes('客户姓名')).toBe(true);
    expect(mappingRaw.includes('拍摄类型')).toBe(true);
  });
});
