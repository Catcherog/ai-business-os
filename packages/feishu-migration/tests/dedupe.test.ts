import { describe, expect, it } from 'vitest';
import {
  buildMigrationPlan,
  canonicalizeXiaohongshuUrl,
  deduplicateRecords,
  normalizeProjectCode,
  type NormalizedMigrationRecord,
} from '../src/dedupe.js';
import { parseAvailability } from '../src/normalize/resources.js';
import { normalizeCustomer } from '../src/normalize/customers.js';
import type { SourceInventory } from '../src/inventory.js';
import type { SourceRecord } from '../src/types.js';

function sourceRecord(
  sourceId: string,
  fields: Record<string, unknown>,
  sourceType = 'spreadsheet',
): SourceRecord {
  return { source_type: sourceType, source_id: sourceId, fields };
}

function inventoryOf(records: SourceRecord[]): SourceInventory {
  return {
    base: { tables: [] },
    spreadsheets: [
      {
        key: 'BUSINESS',
        sheets: [
          {
            sheet: {
              sheet_id: 'sheet-business',
              title: 'Business',
            },
            rows: records.map((record) => record.fields) as unknown as unknown[][],
          },
        ],
      },
    ],
  };
}

describe('canonical business keys', () => {
  it('matches Xiaohongshu URLs after removing query and fragment values', () => {
    expect(
      canonicalizeXiaohongshuUrl(
        'https://www.xiaohongshu.com/explore/abc123?xsec_token=secret#comments',
      ),
    ).toBe('https://www.xiaohongshu.com/explore/abc123');
    expect(
      canonicalizeXiaohongshuUrl('https://www.xiaohongshu.com/explore/abc123/'),
    ).toBe('https://www.xiaohongshu.com/explore/abc123');
  });

  it('deduplicates resource profiles using the query-stripped profile identity', () => {
    const records = [
      sourceRecord('base-1', {
        entity_type: 'resource',
        resource_type: 'MODEL',
        name: 'Lin',
        xiaohongshu_profile_url:
          'https://www.xiaohongshu.com/user/profile/abc?xsec_token=secret',
      }, 'legacy_base'),
      sourceRecord('sheet-1', {
        entity_type: 'resource',
        resource_type: 'MODEL',
        name: 'Lin',
        xiaohongshu_profile_url: 'https://www.xiaohongshu.com/user/profile/abc',
      }, 'spreadsheet'),
    ];

    expect(deduplicateRecords(records)).toHaveLength(1);
    expect(deduplicateRecords(records)[0]).toMatchObject({
      migration_key: 'resource:MODEL:https://www.xiaohongshu.com/user/profile/abc',
      decision: 'CREATE',
    });
  });

  it('normalizes only unambiguous project code formatting', () => {
    expect(normalizeProjectCode('FZ-1')).toBe('FZ1');
    expect(normalizeProjectCode('FZ001')).toBe('FZ1');
    expect(normalizeProjectCode('cthen')).toBe('cthen');
    expect(normalizeProjectCode('cthrn')).toBe('cthrn');
    expect(normalizeProjectCode('XM-1')).toBe('XM1');
    expect(normalizeProjectCode('XM20260610001')).toBe('XM20260610001');
  });

  it('maps Source Channel by normalized exact name and reviews unknown values', () => {
    const matched = normalizeCustomer(sourceRecord('customer-1', {
      entity_type: 'customer',
      customer_id: 'C-1',
      'Source Channel': '  ＢＡＳＥ  ',
    }));
    expect(matched).toMatchObject({
      confidence: 'HIGH',
      canonical_target: { source_channel: 'BASE' },
    });

    const unknown = normalizeCustomer(sourceRecord('customer-2', {
      entity_type: 'customer',
      customer_id: 'C-2',
      'Source Channel': 'base-ish',
    }));
    expect(unknown).toMatchObject({
      confidence: 'LOW',
      reason: 'Source Channel value did not exactly match an expected option',
    });
    expect(unknown.canonical_target).not.toHaveProperty('source_channel');
  });
});

describe('availability parsing', () => {
  it('parses complete dates and explicit complete date ranges', () => {
    expect(parseAvailability('2026-06-10')).toEqual({
      status: 'PARSED',
      raw: '2026-06-10',
      start_date: '2026-06-10',
      end_date: '2026-06-10',
    });
    expect(parseAvailability('2026-06-10 至 2026-06-12')).toEqual({
      status: 'PARSED',
      raw: '2026-06-10 至 2026-06-12',
      start_date: '2026-06-10',
      end_date: '2026-06-12',
    });
  });

  it('keeps vague availability unparsed without inventing dates', () => {
    expect(parseAvailability('周末')).toEqual({
      status: 'UNPARSED',
      raw: '周末',
    });
    expect(parseAvailability('六月初')).toEqual({
      status: 'UNPARSED',
      raw: '六月初',
    });
    expect(parseAvailability('近两周')).toEqual({
      status: 'UNPARSED',
      raw: '近两周',
    });
  });
});

describe('deduplication and migration planning', () => {
  it('preserves all conflicting values and excludes an ambiguous group from executable work', () => {
    const records = [
      sourceRecord('sheet-2', {
        entity_type: 'project',
        project_code: 'FZ001',
        project_name: 'Film project',
        availability: '周末',
      }),
      sourceRecord('sheet-1', {
        entity_type: 'project',
        project_code: 'FZ-1',
        project_name: 'Film project',
        availability: '2026-06-10',
      }),
    ];

    const [deduped] = deduplicateRecords(records);
    expect(deduped).toMatchObject({
      decision: 'NEEDS_REVIEW',
      migration_key: 'project:FZ1',
    });
    expect(deduped.conflicts).toEqual([
      expect.objectContaining({
        field: 'availability',
        values: expect.arrayContaining(['2026-06-10', '周末']),
        chosenSource: 'sheet-1',
        chosen: '2026-06-10',
        alternatives: ['周末'],
      }),
    ]);

    const plan = buildMigrationPlan(inventoryOf(records), { records: [] });
    expect(plan.decisions).toHaveLength(1);
    expect(plan.decisions[0].decision).toBe('NEEDS_REVIEW');
    expect(plan.executable_decisions).toEqual([]);
    expect(plan.executable_batches).toEqual([]);
  });

  it('skips an identical target payload and reviews a changed target payload', () => {
    const inventory = inventoryOf([
      sourceRecord('source-1', {
        entity_type: 'project',
        project_code: 'FZ001',
        project_name: 'Film project',
      }),
    ]);
    const same = buildMigrationPlan(inventory, {
      records: [
        {
          migration_key: 'project:FZ1',
          entity_type: 'project',
          project_code: 'FZ-1',
          project_name: 'Film project',
        },
      ],
    });
    expect(same.decisions[0]).toMatchObject({
      migration_key: 'project:FZ1',
      decision: 'SKIP',
    });

    const changed = buildMigrationPlan(inventory, {
      records: [
        {
          migration_key: 'project:FZ1',
          entity_type: 'project',
          project_code: 'FZ-1',
          project_name: 'Changed project',
        },
      ],
    });
    expect(changed.decisions[0].decision).toBe('NEEDS_REVIEW');
    expect(changed.executable_decisions).toEqual([]);
  });

  it('does not fuzzy-match similar identifiers or broad project prefixes', () => {
    const records = [
      sourceRecord('cthen-record', { entity_type: 'content', content_id: 'cthen' }),
      sourceRecord('cthrn-record', { entity_type: 'content', content_id: 'cthrn' }),
      sourceRecord('xm-short', { entity_type: 'project', project_code: 'XM-1' }),
      sourceRecord('xm-long', {
        entity_type: 'project',
        project_code: 'XM20260610001',
      }),
    ];

    const deduped = deduplicateRecords(records);
    expect(deduped).toHaveLength(4);
    expect(deduped.map((record) => record.migration_key)).toEqual([
      'content:cthen',
      'content:cthrn',
      'project:XM1',
      'project:XM20260610001',
    ]);
    expect(deduped.every((record) => record.decision !== 'NEEDS_REVIEW')).toBe(true);
  });

  it('uses the higher-priority Base value while retaining the lower-priority alternative', () => {
    const deduped = deduplicateRecords([
      sourceRecord('sheet-project', {
        entity_type: 'project',
        project_code: 'FZ001',
        project_name: 'Spreadsheet name',
      }),
      sourceRecord('base-project', {
        entity_type: 'project',
        project_code: 'FZ-1',
        project_name: 'Base name',
      }, 'base:Projects'),
    ]);

    expect(deduped[0]).toMatchObject({
      decision: 'CREATE',
      canonical_target: expect.objectContaining({ project_name: 'Base name' }),
      conflicts: [
        expect.objectContaining({
          field: 'project_name',
          chosen: 'Base name',
          alternatives: ['Spreadsheet name'],
        }),
      ],
    });
  });

  it('does not hash an absent chosen field when a lower-priority source supplies it', () => {
    const deduped = deduplicateRecords([
      sourceRecord('sheet-project', {
        entity_type: 'project',
        project_code: 'FZ001',
        project_name: 'Spreadsheet name',
      }),
      sourceRecord('sheet-project-2', {
        entity_type: 'project',
        project_code: 'FZ001',
        project_name: 'Second spreadsheet name',
      }),
      sourceRecord('base-project', {
        entity_type: 'project',
        project_code: 'FZ-1',
      }, 'base:Projects'),
    ]);

    expect(deduped[0]).toMatchObject({
      migration_key: 'project:FZ1',
      decision: 'CREATE',
    });
    expect(() => buildMigrationPlan(inventoryOf([
      sourceRecord('sheet-project', {
        entity_type: 'project',
        project_code: 'FZ001',
        project_name: 'Spreadsheet name',
      }),
      sourceRecord('sheet-project-2', {
        entity_type: 'project',
        project_code: 'FZ001',
        project_name: 'Second spreadsheet name',
      }),
      sourceRecord('base-project', {
        entity_type: 'project',
        project_code: 'FZ-1',
      }, 'base:Projects'),
    ]), { records: [] })).not.toThrow();
  });

  it('is deterministic when input order changes', () => {
    const records = [
      sourceRecord('b', { entity_type: 'customer', customer_id: 'C-1', name: 'Beta' }),
      sourceRecord('a', { entity_type: 'customer', customer_id: 'C-1', name: 'Alpha' }),
    ];
    const reverse = [...records].reverse();
    const summarize = (items: NormalizedMigrationRecord[]) =>
      items.map(({ migration_key, canonical_target, conflicts, decision }) => ({
        migration_key,
        canonical_target,
        conflicts,
        decision,
      }));

    expect(summarize(deduplicateRecords(records))).toEqual(
      summarize(deduplicateRecords(reverse)),
    );
  });
});
