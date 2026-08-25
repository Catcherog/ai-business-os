import { createHash } from 'node:crypto';
import type { FeishuMigrationConfig } from './config.js';

export type ConfigPresence = 'PRESENT' | 'MISSING';

export interface ConfigFieldDiagnostic {
  status: ConfigPresence;
  fingerprint?: string;
  format?: 'KEY_VALUE' | 'LABEL_NEXT_LINE' | 'MARKDOWN_TABLE' | 'RAW' | 'URL_TOKEN';
}

export interface FeishuConfigDiagnostics {
  formats: string[];
  source_field_names: string[];
  fields: Record<string, ConfigFieldDiagnostic>;
}

export interface FeishuConfigDocumentResult {
  config: FeishuMigrationConfig;
  diagnostics: FeishuConfigDiagnostics;
}

export class FeishuConfigDocumentError extends Error {
  readonly code: 'CONFIG_MISSING' | 'CONFIG_CONFLICT' | 'CONFIG_INVALID';
  readonly missing_fields: string[];
  readonly conflicting_fields: string[];
  readonly diagnostics?: FeishuConfigDiagnostics;

  constructor(
    code: 'CONFIG_MISSING' | 'CONFIG_CONFLICT' | 'CONFIG_INVALID',
    fields: string[],
    diagnostics?: FeishuConfigDiagnostics,
  ) {
    super(`${code}: ${fields.join(', ')}`);
    this.name = 'FeishuConfigDocumentError';
    this.code = code;
    this.missing_fields = code === 'CONFIG_MISSING' ? [...fields] : [];
    this.conflicting_fields = code === 'CONFIG_CONFLICT' ? [...fields] : [];
    this.diagnostics = diagnostics;
  }
}

type ConfigSemantic =
  | 'FEISHU_APP_ID'
  | 'FEISHU_APP_SECRET'
  | 'FEISHU_SOURCE_BASE_TOKEN'
  | 'FEISHU_TARGET_BASE_TOKEN'
  | { kind: 'source_sheet'; key: string };

interface LabeledEntry {
  label: string;
  value: string;
  format: ConfigFieldDiagnostic['format'];
}

interface Candidate {
  field: string;
  value: string;
  format: ConfigFieldDiagnostic['format'];
}

const CHINESE_SHEET_KEYS: Array<[RegExp, string]> = [
  [/客户/iu, 'CUSTOMERS'],
  [/项目/iu, 'PROJECTS'],
  [/(?:资源|模特|化妆|摄影|场地)/iu, 'RESOURCES'],
  [/(?:档期|可用时间|可用)/iu, 'AVAILABILITY'],
  [/(?:内容|研究|小红书|笔记)/iu, 'CONTENT'],
  [/(?:脚本|话术|沟通)/iu, 'SCRIPTS'],
  [/(?:知识|SOP)/iu, 'KNOWLEDGE'],
  [/(?:媒体|素材|资产)/iu, 'MEDIA'],
];

function normalizeLabel(label: string): string {
  return label
    .normalize('NFKC')
    .replace(/^\s*[-*#>]+\s*/u, '')
    .replace(/^\s*\*\*(.*?)\*\*\s*$/u, '$1')
    .replace(/^\s*`(.*?)`\s*$/u, '$1')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

function stripValue(value: string): string {
  const trimmed = value.trim().replace(/,$/u, '').trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('`') && trimmed.endsWith('`'))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  const markdownLink = /^\[[^\]]*\]\((?<url>https?:\/\/[^)]+)\)$/iu.exec(trimmed);
  return markdownLink?.groups?.url?.trim() ?? trimmed;
}

function explicitSheetKey(label: string): string | undefined {
  const normalized = normalizeLabel(label);
  const explicit = /(?:feishu_)?source[_\s-]*sheet[_\s-]*(?<key>[a-z0-9_-]+)[_\s-]*token/iu.exec(normalized);
  if (explicit?.groups?.key) return explicit.groups.key.replace(/-/gu, '_').toUpperCase();
  const sourceLabel = /source\s+sheet\s+(?<key>[a-z0-9_-]+)\s+token/iu.exec(normalized);
  if (sourceLabel?.groups?.key) return sourceLabel.groups.key.replace(/-/gu, '_').toUpperCase();
  for (const [pattern, key] of CHINESE_SHEET_KEYS) {
    if (pattern.test(label) && /(?:sheet|table|token|表格|数据表)/iu.test(label)) return key;
  }
  return undefined;
}

function semanticForLabel(label: string): ConfigSemantic | undefined {
  const normalized = normalizeLabel(label);
  if (/^(?:feishu[\s_-]*)?app[\s_-]*id$/iu.test(normalized) || /^应用[\s_-]*id$/iu.test(normalized)) {
    return 'FEISHU_APP_ID';
  }
  if (/^(?:feishu[\s_-]*)?app[\s_-]*secret$/iu.test(normalized) || /^应用[\s_-]*密钥$/iu.test(normalized)) return 'FEISHU_APP_SECRET';
  if (/(?:source[\s_-]*base|旧[\s_-]*base|源[\s_-]*base)/iu.test(normalized)) return 'FEISHU_SOURCE_BASE_TOKEN';
  if (/(?:target[\s_-]*base|新[\s_-]*base|目标[\s_-]*base)/iu.test(normalized)) return 'FEISHU_TARGET_BASE_TOKEN';
  const sheetKey = explicitSheetKey(label);
  if (sheetKey) return { kind: 'source_sheet', key: sheetKey };
  return undefined;
}

function splitMarkdownRow(line: string): string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return undefined;
  const cells = trimmed.split('|').slice(1, trimmed.endsWith('|') ? -1 : undefined).map((cell) => cell.trim());
  return cells.length >= 2 ? cells : undefined;
}

function entriesFromDocument(text: string): { entries: LabeledEntry[]; formats: Set<string>; sourceFieldNames: Set<string> } {
  const entries: LabeledEntry[] = [];
  const formats = new Set<string>();
  const sourceFieldNames = new Set<string>();
  let pendingLabel: string | undefined;

  const addEntry = (label: string, value: string, format: ConfigFieldDiagnostic['format']): void => {
    const cleanLabel = label.trim();
    const cleanValue = stripValue(value);
    if (!cleanLabel) return;
    sourceFieldNames.add(cleanLabel);
    const semantic = semanticForLabel(cleanLabel);
    if (!semantic || !cleanValue) return;
    entries.push({ label: cleanLabel, value: cleanValue, format });
    if (format) formats.add(format);
  };

  for (const rawLine of text.split(/\r?\n/gu)) {
    const line = rawLine.trim();
    if (!line) continue;
    const cells = splitMarkdownRow(line);
    if (cells) {
      formats.add('MARKDOWN_TABLE');
      if (/^[-\s:]+$/u.test(cells[0]) || /^[-\s:]+$/u.test(cells[1])) continue;
      addEntry(cells[0], cells[1], 'MARKDOWN_TABLE');
      pendingLabel = undefined;
      continue;
    }

    const keyValue = /^\s*(?<label>[^=：:]+?)\s*(?:=|：|:)\s*(?<value>.*)$/u.exec(line);
    if (keyValue?.groups) {
      formats.add('KEY_VALUE');
      const label = keyValue.groups.label.trim();
      const value = keyValue.groups.value.trim();
      sourceFieldNames.add(label);
      if (value) addEntry(label, value, 'KEY_VALUE');
      else pendingLabel = label;
      continue;
    }

    if (semanticForLabel(line)) {
      formats.add('LABEL_NEXT_LINE');
      pendingLabel = line;
      sourceFieldNames.add(line);
      continue;
    }

    if (pendingLabel) {
      addEntry(pendingLabel, line, 'LABEL_NEXT_LINE');
      pendingLabel = undefined;
    } else if (/https?:\/\//iu.test(line)) {
      formats.add('URL');
    }
  }

  return { entries, formats, sourceFieldNames };
}

function urlFromValue(value: string): URL | undefined {
  const match = /https?:\/\/[^\s<>|]+/iu.exec(value);
  if (!match) return undefined;
  try {
    return new URL(match[0]);
  } catch {
    return undefined;
  }
}

function tokenFromUrl(value: string, kind: 'base' | 'sheet'): string | undefined {
  const url = urlFromValue(value);
  if (!url) return undefined;
  const queryNames = kind === 'base'
    ? ['app_token', 'base_token', 'appToken', 'baseToken']
    : ['sheet_token', 'spreadsheet_token', 'token', 'sheetToken'];
  for (const name of queryNames) {
    const candidate = url.searchParams.get(name)?.trim();
    if (candidate) return candidate;
  }
  const segments = url.pathname.split('/').filter(Boolean);
  const markers = kind === 'base'
    ? new Set(['base', 'bitable'])
    : new Set(['sheets', 'spreadsheet']);
  const markerIndex = segments.findIndex((segment) => markers.has(segment.toLowerCase()));
  if (markerIndex >= 0 && segments[markerIndex + 1]) return segments[markerIndex + 1];
  const pattern = kind === 'base' ? /^app[_-]?[a-z0-9]+$/iu : /^(?:sht|sheet|ssht)[_-]?[a-z0-9]+$/iu;
  return segments.find((segment) => pattern.test(segment));
}

function normalizeCandidateValue(value: string, semantic: ConfigSemantic): string {
  const clean = stripValue(value);
  if (typeof semantic === 'string') {
    if (semantic === 'FEISHU_SOURCE_BASE_TOKEN' || semantic === 'FEISHU_TARGET_BASE_TOKEN') {
      const token = tokenFromUrl(clean, 'base');
      if (token) return token;
      if (urlFromValue(clean)) throw new FeishuConfigDocumentError('CONFIG_INVALID', [semantic]);
    }
    return clean;
  }
  const token = tokenFromUrl(clean, 'sheet');
  if (token) return token;
  if (urlFromValue(clean)) throw new FeishuConfigDocumentError('CONFIG_INVALID', [`FEISHU_SOURCE_SHEET_${semantic.key}_TOKEN`]);
  return clean;
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 8);
}

function fieldName(semantic: ConfigSemantic): string {
  return typeof semantic === 'string'
    ? semantic
    : `FEISHU_SOURCE_SHEET_${semantic.key}_TOKEN`;
}

function addCandidate(
  candidates: Map<string, Candidate[]>,
  semantic: ConfigSemantic,
  value: string,
  format: ConfigFieldDiagnostic['format'],
): void {
  const field = fieldName(semantic);
  const normalized = normalizeCandidateValue(value, semantic);
  if (!normalized) return;
  const current = candidates.get(field) ?? [];
  current.push({ field, value: normalized, format });
  candidates.set(field, current);
}

function resolveCandidates(candidates: Map<string, Candidate[]>): { values: Map<string, Candidate>; conflicts: string[] } {
  const values = new Map<string, Candidate>();
  const conflicts: string[] = [];
  for (const [field, entries] of candidates.entries()) {
    const unique = new Map<string, Candidate>();
    for (const entry of entries) unique.set(fingerprint(entry.value), entry);
    if (unique.size > 1) conflicts.push(field);
    else if (unique.size === 1) values.set(field, [...unique.values()][0]);
  }
  return { values, conflicts: conflicts.sort() };
}

function requiredFields(values: Map<string, Candidate>): string[] {
  const required = [
    'FEISHU_APP_ID',
    'FEISHU_APP_SECRET',
    'FEISHU_SOURCE_BASE_TOKEN',
    'FEISHU_TARGET_BASE_TOKEN',
  ];
  const missing = required.filter((field) => !values.has(field));
  const sheetFields = [...values.keys()].filter((field) => /^FEISHU_SOURCE_SHEET_.+_TOKEN$/u.test(field));
  if (sheetFields.length !== 8) missing.push('FEISHU_SOURCE_SHEET_*_TOKEN');
  return missing;
}

function diagnosticsFrom(
  parsed: { formats: Set<string>; sourceFieldNames: Set<string> },
  values: Map<string, Candidate>,
): FeishuConfigDiagnostics {
  const fields: Record<string, ConfigFieldDiagnostic> = {};
  const presentSheets = [...values.keys()].filter((field) => /^FEISHU_SOURCE_SHEET_.+_TOKEN$/u.test(field));
  const names = [
    'FEISHU_APP_ID',
    'FEISHU_APP_SECRET',
    'FEISHU_SOURCE_BASE_TOKEN',
    'FEISHU_TARGET_BASE_TOKEN',
    ...presentSheets,
  ];
  for (const field of names) {
    const candidate = values.get(field);
    fields[field] = candidate
      ? { status: 'PRESENT', fingerprint: fingerprint(candidate.value), format: candidate.format }
      : { status: 'MISSING' };
  }
  for (const field of [
    'FEISHU_APP_ID',
    'FEISHU_APP_SECRET',
    'FEISHU_SOURCE_BASE_TOKEN',
    'FEISHU_TARGET_BASE_TOKEN',
  ]) {
    if (!fields[field]) fields[field] = { status: 'MISSING' };
  }
  if (presentSheets.length !== 8) fields['FEISHU_SOURCE_SHEET_*_TOKEN'] = { status: 'MISSING' };
  return {
    formats: [...parsed.formats].sort(),
    source_field_names: [...parsed.sourceFieldNames].sort(),
    fields,
  };
}

function collectCandidates(text: string): {
  parsed: { entries: LabeledEntry[]; formats: Set<string>; sourceFieldNames: Set<string> };
  resolved: { values: Map<string, Candidate>; conflicts: string[] };
} {
  const parsed = entriesFromDocument(text);
  const candidates = new Map<string, Candidate[]>();
  for (const entry of parsed.entries) {
    const semantic = semanticForLabel(entry.label);
    if (semantic) addCandidate(candidates, semantic, entry.value, entry.format);
  }
  return { parsed, resolved: resolveCandidates(candidates) };
}

export function inspectFeishuMigrationConfigDocument(text: string): FeishuConfigDiagnostics {
  if (!text.trim()) throw new FeishuConfigDocumentError('CONFIG_INVALID', ['DOCUMENT']);
  const { parsed, resolved } = collectCandidates(text);
  return diagnosticsFrom(parsed, resolved.values);
}

export function parseFeishuMigrationConfigDocument(text: string): FeishuConfigDocumentResult {
  if (!text.trim()) throw new FeishuConfigDocumentError('CONFIG_INVALID', ['DOCUMENT']);
  const { parsed, resolved } = collectCandidates(text);
  const diagnostics = diagnosticsFrom(parsed, resolved.values);
  if (resolved.conflicts.length > 0) {
    throw new FeishuConfigDocumentError('CONFIG_CONFLICT', resolved.conflicts, diagnostics);
  }
  const missing = requiredFields(resolved.values);
  if (missing.length > 0) {
    throw new FeishuConfigDocumentError('CONFIG_MISSING', missing, diagnostics);
  }
  const sourceBaseToken = resolved.values.get('FEISHU_SOURCE_BASE_TOKEN')!.value;
  const targetBaseToken = resolved.values.get('FEISHU_TARGET_BASE_TOKEN')!.value;
  if (sourceBaseToken === targetBaseToken) {
    throw new FeishuConfigDocumentError('CONFIG_CONFLICT', ['SOURCE_TARGET_BASE_EQUAL'], diagnostics);
  }

  const sourceSheets = [...resolved.values.entries()]
    .filter(([field]) => /^FEISHU_SOURCE_SHEET_(.+)_TOKEN$/u.test(field))
    .map(([field, candidate]) => ({
      key: /^FEISHU_SOURCE_SHEET_(.+)_TOKEN$/u.exec(field)![1],
      token: candidate.value,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
  const config: FeishuMigrationConfig = {
    appId: resolved.values.get('FEISHU_APP_ID')!.value,
    appSecret: resolved.values.get('FEISHU_APP_SECRET')!.value,
    sourceBaseToken,
    targetBaseToken,
    sourceSheets,
  };
  return {
    config,
    diagnostics,
  };
}
