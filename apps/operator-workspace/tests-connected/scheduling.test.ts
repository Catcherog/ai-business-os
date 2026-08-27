import { describe, expect, it } from 'vitest';
import type { AvailabilitySlot, CommunicationScript, Project, ProjectRequirement, Resource } from '@busos/contracts';
import { FakeOperationsAdapter, OperationsRepository } from '@busos/business-repository';
import { createSchedulingApi } from '../server/scheduling-api.js';

const project: Project = {
  project_id: 'project-1',
  customer_id: 'customer-1',
  lead_id: 'lead-1',
  project_type: 'portrait',
  title: 'Connected project',
  status: 'CONFIRMED',
  scheduled_date: null,
  created_at: '2026-08-20T00:00:00.000Z',
  updated_at: '2026-08-20T00:00:00.000Z',
};

const resource: Resource = {
  resource_key: 'resource-model-1', resource_id: null, resource_type: 'MODEL', name: 'Alice',
  xiaohongshu_name: null, xiaohongshu_profile_url: null, wechat: null, phone: null, city: '上海', address: null,
  styles: '新中式', size_raw: null, quote_raw: null, quote_min: null, quote_max: null, priority: 10,
  cooperation_status: 'ACTIVE', rating: null, availability_raw: null, work_url: null,
  source_aliases_json: null, migration_key: 'resource:model:1', legacy_updated_at: null,
};

const requirement: ProjectRequirement = {
  requirement_id: 'requirement-1', project_id: 'project-1', role_type: 'MODEL', required_count: 1,
  date_window_start: null, date_window_end: null, duration_hours: 2, location: '上海', style_tags: '新中式',
  size_constraint: null, budget_max: 5000, required: 'YES', source_plan_url: null, source_excerpt: null,
  parse_status: 'PARSED', confidence: 'HIGH', migration_key: 'requirement:1',
};

const availability: AvailabilitySlot = {
  availability_id: 'availability-1', resource_key: 'resource-model-1', resource_type: 'MODEL',
  start_at: '2026-08-25T08:00:00.000Z', end_at: '2026-08-25T12:00:00.000Z', status: 'AVAILABLE',
  granularity: 'RANGE', raw_text: '2026-08-25 08:00-12:00', parse_status: 'PARSED', confidence: 'HIGH',
  source_updated_at: null, expires_at: null, migration_key: 'availability:1',
};

const script: CommunicationScript = {
  script_id: 'script-1', scene: 'availability_check', audience: 'resource', goal: 'confirm',
  body: '你好，{{resource_name}}，想确认合作。', notes: null, effect: null, resource_type: 'MODEL',
  customer_stage: 'OTHER', version_at: null, status: 'ACTIVE', source_aliases_json: null, migration_key: 'script:1',
};

function api() {
  return createSchedulingApi({
    repository: new OperationsRepository(new FakeOperationsAdapter({
      projects: [project], resources: [resource], projectRequirements: [requirement],
      availability: [availability], scripts: [script],
    })),
  });
}

describe('connected scheduling routes', () => {
  it('reads canonical facts and returns connected proposals', async () => {
    const result = await api().proposals({
      projectId: 'project-1',
      start: '2026-08-25T08:00:00.000Z',
      end: '2026-08-25T12:00:00.000Z',
      preferredResourceKeys: ['resource-model-1'],
    });
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ mode: 'CONNECTED', source: 'FEISHU_NEW_BASE' });
    if (result.body.mode === 'CONNECTED' && 'data' in result.body) {
      expect(result.body.data[0]?.resourceKey).toBe('resource-model-1');
    }
  });

  it('rejects missing IDs and never treats Feishu record IDs as scheduling input', async () => {
    const missing = await api().proposals({ start: '2026-08-25T08:00:00.000Z', end: '2026-08-25T12:00:00.000Z' });
    expect(missing.statusCode).toBe(422);
    const feishu = await api().draft({ projectId: 'project-1', resourceKey: 'recABC123' });
    expect(feishu.statusCode).toBe(422);
  });

  it('returns a text-only availability draft from the connected script', async () => {
    const result = await api().draft({
      projectId: 'project-1', resourceKey: 'resource-model-1', requirementId: 'requirement-1',
      audience: 'resource', scene: 'availability_check',
    });
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ mode: 'CONNECTED', source: 'FEISHU_NEW_BASE' });
    if (result.body.mode === 'CONNECTED' && 'data' in result.body) {
      expect(result.body.data.body).toContain('Alice');
      expect(result.body.data.scriptId).toBe('script-1');
    }
  });

  it('fails closed when confirmation has no authorized canonical assignment mapping', async () => {
    const result = await api().confirm({
      projectId: 'project-1',
      idempotencyKey: 'schedule-idem-1',
      proposal: {
        proposalId: 'proposal-1',
        projectId: 'project-1',
        requirementId: 'requirement-1',
        resourceKey: 'resource-model-1',
        resourceType: 'MODEL',
        availabilityId: 'availability-1',
        startAt: availability.start_at!,
        endAt: availability.end_at!,
        score: 1000,
        reasons: [],
        warnings: [],
      },
    });
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ mode: 'BLOCKED' });
    if (result.body.mode === 'BLOCKED') expect(result.body.reason).toContain('assignment mapping');
  });
});
