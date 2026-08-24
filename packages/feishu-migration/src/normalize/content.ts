import type { SourceRecord } from '../types.js';
import {
  asNonEmptyText,
  canonicalFields,
  type NormalizedEntity,
  valueAt,
} from './common.js';

export function canonicalizeXiaohongshuUrl(value: unknown): string | undefined {
  const raw = asNonEmptyText(value);
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  if (!/xiaohongshu\.com$/iu.test(url.hostname)) return raw;
  url.protocol = 'https:';
  url.hostname = url.hostname.toLowerCase();
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/u, '') || '/';
  return url.toString();
}

const CONTENT_ALIASES = {
  content_id: [
    'legacy_content_id',
    'legacy_asset_id',
    'research_id',
    'script_id',
    'knowledge_id',
    '笔记id',
    '笔记_id',
    'note_id',
    'id',
  ],
  title: ['标题', '内容标题'],
  url: [
    'canonical_source_url',
    'source_url',
    'link',
    '链接',
    '笔记链接',
    'xiaohongshu_url',
  ],
} as const;

function isSearchResultUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /(?:search|search_result|explore\/search)/iu.test(url.pathname);
  } catch {
    return false;
  }
}

export function normalizeContent(record: SourceRecord): NormalizedEntity {
  const fields = canonicalFields(record.fields, CONTENT_ALIASES);
  const contentId = asNonEmptyText(valueAt(fields, ['content_id']));
  const url = canonicalizeXiaohongshuUrl(valueAt(fields, ['url']));
  const title = asNonEmptyText(valueAt(fields, ['title']));
  const keyValue = contentId ?? url;
  const confidence = contentId || (url && !isSearchResultUrl(url)) ? 'HIGH' : 'LOW';
  return {
    entity_type: 'content',
    key: keyValue ? `content:${keyValue}` : null,
    canonical_target: { ...fields, ...(url ? { url } : {}) },
    confidence,
    reason: confidence === 'HIGH' ? 'exact content identity' : title ? 'title is not an exact content key' : 'content has no identity key',
  };
}
