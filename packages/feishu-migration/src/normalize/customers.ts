import type { SourceRecord } from '../types.js';
import {
  asNonEmptyText,
  canonicalFields,
  deterministicTextHash,
  type NormalizedEntity,
  valueAt,
} from './common.js';

const CUSTOMER_ALIASES = {
  customer_id: [
    'legacy_customer_id',
    'legacy_id',
    '客户id',
    '客户_id',
    'id',
  ],
  name: ['customer_name', '客户姓名', '姓名', '客户名称'],
  phone: ['phone_number', '手机号', '联系电话', '电话'],
  wechat: ['wechat_id', '微信号', '微信'],
  region: ['地区', '区域', '城市', 'city'],
} as const;

function identity(value: unknown): string | undefined {
  return asNonEmptyText(value);
}

function phoneIdentity(value: unknown): string | undefined {
  return asNonEmptyText(value)?.replace(/[^\d+]/gu, '');
}

export function normalizeCustomer(record: SourceRecord): NormalizedEntity {
  const fields = canonicalFields(record.fields, CUSTOMER_ALIASES);
  const customerId = identity(valueAt(fields, ['customer_id']));
  const phone = phoneIdentity(valueAt(fields, ['phone']));
  const wechat = asNonEmptyText(valueAt(fields, ['wechat']))?.toLowerCase();
  const name = asNonEmptyText(valueAt(fields, ['name']));
  const region = asNonEmptyText(valueAt(fields, ['region']));
  const fallback = name && region ? `name_region:${deterministicTextHash(name.toLowerCase(), region.toLowerCase())}` : undefined;
  const keyValue =
    customerId ??
    (phone ? `phone:${phone}` : wechat ? `wechat:${wechat}` : fallback);
  const confidence = customerId || phone || wechat ? 'HIGH' : 'LOW';
  return {
    entity_type: 'customer',
    key: keyValue ? `customer:${keyValue}` : null,
    canonical_target: { ...fields, ...(phone ? { phone } : {}), ...(wechat ? { wechat } : {}) },
    confidence,
    reason: confidence === 'HIGH' ? 'exact customer identity' : 'customer has no exact identity key',
  };
}
