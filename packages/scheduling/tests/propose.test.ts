import { describe, expect, it } from 'vitest';
import type { AvailabilitySlot, ProjectAssignment, ProjectRequirement, Resource } from '@busos/contracts';
import { proposeShootSlots } from '../src/propose.js';

const requirement: ProjectRequirement = {
  requirement_id: 'requirement:model:1',
  project_id: 'project-1',
  role_type: 'MODEL',
  required_count: 1,
  date_window_start: null,
  date_window_end: null,
  duration_hours: 2,
  location: '上海',
  style_tags: '新中式',
  size_constraint: null,
  budget_max: 5000,
  required: 'YES',
  source_plan_url: null,
  source_excerpt: null,
  parse_status: 'PARSED',
  confidence: 'HIGH',
  migration_key: 'requirement:model:1',
};

const resource = (key: string, priority: number | null, city: string | null = '上海'): Resource => ({
  resource_key: key,
  resource_id: null,
  resource_type: 'MODEL',
  name: key,
  xiaohongshu_name: null,
  xiaohongshu_profile_url: null,
  wechat: null,
  phone: null,
  city,
  address: null,
  styles: '新中式',
  size_raw: null,
  quote_raw: null,
  quote_min: null,
  quote_max: null,
  priority,
  cooperation_status: 'ACTIVE',
  rating: null,
  availability_raw: null,
  work_url: null,
  source_aliases_json: null,
  migration_key: `resource:${key}`,
  legacy_updated_at: null,
});

const slot = (id: string, resourceKey: string, parseStatus: AvailabilitySlot['parse_status'] = 'PARSED', endAt = '2026-08-25T12:00:00.000Z'): AvailabilitySlot => ({
  availability_id: id,
  resource_key: resourceKey,
  resource_type: 'MODEL',
  start_at: '2026-08-25T08:00:00.000Z',
  end_at: endAt,
  status: 'AVAILABLE',
  granularity: 'RANGE',
  raw_text: '2026-08-25 08:00-12:00',
  parse_status: parseStatus,
  confidence: parseStatus === 'PARSED' ? 'HIGH' : 'LOW',
  source_updated_at: null,
  expires_at: null,
  migration_key: `availability:${id}`,
});

describe('proposeShootSlots', () => {
  it('keeps exact interval intersections and ranks deterministically', () => {
    const proposals = proposeShootSlots({
      projectId: 'project-1',
      window: { start: '2026-08-25T08:00:00.000Z', end: '2026-08-25T12:00:00.000Z' },
      requirements: [requirement],
      resources: [resource('resource-low', 2), resource('resource-high', 10)],
      availability: [slot('slot-low', 'resource-low'), slot('slot-high', 'resource-high')],
      preferredResourceKeys: ['resource-high'],
    });

    expect(proposals).toHaveLength(2);
    expect(proposals[0]?.resourceKey).toBe('resource-high');
    expect(proposals[0]?.startAt).toBe('2026-08-25T08:00:00.000Z');
    expect(proposals[0]?.endAt).toBe('2026-08-25T10:00:00.000Z');
    expect(proposals[0]?.reasons.length).toBeGreaterThan(0);
    expect(proposals[0]?.proposalId).toContain('project-1');
  });

  it('eliminates no-overlap, insufficient, location-conflict and unparsed availability', () => {
    const base = {
      projectId: 'project-1',
      window: { start: '2026-08-26T08:00:00.000Z', end: '2026-08-26T12:00:00.000Z' },
      requirements: [requirement],
      resources: [resource('resource-a', 1), resource('resource-wrong-city', 20, '北京')],
      availability: [
        slot('slot-no-overlap', 'resource-a'),
        slot('slot-wrong-city', 'resource-wrong-city', 'PARSED', '2026-08-26T12:00:00.000Z'),
        slot('slot-unparsed', 'resource-a', 'UNPARSED', '2026-08-26T12:00:00.000Z'),
      ],
    };
    expect(proposeShootSlots(base)).toEqual([]);

    const short = proposeShootSlots({
      ...base,
      window: { start: '2026-08-25T08:00:00.000Z', end: '2026-08-25T12:00:00.000Z' },
      availability: [slot('slot-short', 'resource-a', 'PARSED', '2026-08-25T09:00:00.000Z')],
    });
    expect(short).toEqual([]);
  });

  it('eliminates a confirmed assignment conflict', () => {
    const conflict: ProjectAssignment = {
      assignment_id: 'assignment-1',
      project_id: 'other-project',
      resource_key: 'resource-high',
      role: 'MODEL',
      proposed_start: '2026-08-25T08:30:00.000Z',
      proposed_end: '2026-08-25T10:30:00.000Z',
      status: 'CONFIRMED',
      conflict_reason: null,
      confirmed_at: '2026-08-20T00:00:00.000Z',
      source: 'calendar',
      migration_key: 'assignment:1',
    };
    const proposals = proposeShootSlots({
      projectId: 'project-1',
      window: { start: '2026-08-25T08:00:00.000Z', end: '2026-08-25T12:00:00.000Z' },
      requirements: [requirement],
      resources: [resource('resource-high', 10)],
      availability: [slot('slot-high', 'resource-high')],
      assignments: [conflict],
    });
    expect(proposals).toEqual([]);
  });
});
