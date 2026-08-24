import type { SourceRecord } from '../types.js';
import {
  asNonEmptyText,
  canonicalFields,
  deterministicTextHash,
  type NormalizedEntity,
  valueAt,
} from './common.js';
import { canonicalizeXiaohongshuUrl } from './content.js';

export interface AvailabilityParseResult {
  status: 'PARSED' | 'UNPARSED';
  raw: string;
  start_date?: string;
  end_date?: string;
}

const ISO_DATE = '(\\d{4})-(\\d{2})-(\\d{2})';
const DATE_RE = new RegExp(`^${ISO_DATE}$`, 'u');
const RANGE_RE = new RegExp(`^${ISO_DATE}\\s*(?:至|到|~|～|-)\\s*${ISO_DATE}$`, 'u');

function validIsoDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function parseAvailability(value: unknown): AvailabilityParseResult {
  const raw = asNonEmptyText(value) ?? '';
  const single = DATE_RE.exec(raw);
  if (single && validIsoDate(raw)) {
    return { status: 'PARSED', raw, start_date: raw, end_date: raw };
  }
  const range = RANGE_RE.exec(raw);
  if (range) {
    const start_date = `${range[1]}-${range[2]}-${range[3]}`;
    const end_date = `${range[4]}-${range[5]}-${range[6]}`;
    if (validIsoDate(start_date) && validIsoDate(end_date) && start_date <= end_date) {
      return { status: 'PARSED', raw, start_date, end_date };
    }
  }
  return { status: 'UNPARSED', raw };
}

const RESOURCE_ALIASES = {
  resource_id: [
    'resource_key',
    'legacy_resource_id',
    'legacy_id',
    '资源id',
    '资源_id',
    'resource_no',
  ],
  resource_type: ['类型', '资源类型', 'type'],
  resource_name: ['name', '资源名称', '名称'],
  xhs_profile_url: [
    'xiaohongshu_profile_url',
    'xiaohongshu_url',
    '小红书主页',
    '小红书主页链接',
  ],
  phone: ['phone_number', '手机号', '联系电话', '电话'],
  wechat: ['wechat_id', '微信号', '微信'],
  city: ['地区', '城市', '所在城市'],
  availability: ['available_date', 'date', '档期', '可用时间'],
} as const;

export function normalizeResource(record: SourceRecord): NormalizedEntity {
  const fields = canonicalFields(record.fields, RESOURCE_ALIASES);
  const resourceId = asNonEmptyText(valueAt(fields, ['resource_id']));
  const resourceType = asNonEmptyText(valueAt(fields, ['resource_type']));
  const name = asNonEmptyText(valueAt(fields, ['resource_name']));
  const xhsProfileUrl = canonicalizeXiaohongshuUrl(valueAt(fields, ['xhs_profile_url']));
  const phone = asNonEmptyText(valueAt(fields, ['phone']))?.replace(/[^\d+]/gu, '');
  const wechat = asNonEmptyText(valueAt(fields, ['wechat']))?.toLowerCase();
  const city = asNonEmptyText(valueAt(fields, ['city']));
  const availability = parseAvailability(valueAt(fields, ['availability']));
  const fallback =
    resourceType && name && city
      ? `type_name_city:${deterministicTextHash(
          resourceType.toLowerCase(),
          name.toLowerCase(),
          city.toLowerCase(),
        )}`
      : undefined;
  const keyValue =
    (resourceType && xhsProfileUrl
      ? `${resourceType.toUpperCase()}:${xhsProfileUrl}`
      : undefined) ??
    (phone ? `phone:${phone}` : wechat ? `wechat:${wechat}` : resourceId ?? fallback);
  const confidence = resourceId || xhsProfileUrl || phone || wechat ? 'HIGH' : 'LOW';
  return {
    entity_type: 'resource',
    key: keyValue ? `resource:${keyValue}` : null,
    canonical_target: {
      ...fields,
      ...(xhsProfileUrl ? { xhs_profile_url: xhsProfileUrl } : {}),
      ...(phone ? { phone } : {}),
      ...(wechat ? { wechat } : {}),
      ...(availability.raw ? { availability_raw: availability.raw } : {}),
      availability_status: availability.status,
      ...(availability.start_date ? { availability_start_date: availability.start_date } : {}),
      ...(availability.end_date ? { availability_end_date: availability.end_date } : {}),
    },
    confidence,
    reason: confidence === 'HIGH' ? 'exact resource identity' : 'resource identity is not exact',
  };
}
