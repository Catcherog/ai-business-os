import { describe, expect, it } from 'vitest';
import type { AvailabilitySlot, CommunicationScript, Project, ProjectAssignment, ProjectRequirement, Resource } from '@busos/contracts';
import { FakeOperationsAdapter, OperationsRepository } from '@busos/business-repository';
import { createBusinessDataApi } from '../server/business-data.js';

const project: Project = {
  project_id: 'project-1',
  customer_id: 'customer-1',
  lead_id: 'lead-1',
  project_type: 'portrait',
  title: '秋季新中式拍摄',
  status: 'CONFIRMED',
  scheduled_date: null,
  created_at: '2026-08-20T00:00:00.000Z',
  updated_at: '2026-08-20T00:00:00.000Z',
};

const resource: Resource = {
  resource_key: 'resource-model-1',
  resource_id: null,
  resource_type: 'MODEL',
  name: 'Alice',
  xiaohongshu_name: null,
  xiaohongshu_profile_url: null,
  wechat: null,
  phone: null,
  city: '上海',
  address: null,
  styles: '新中式',
  size_raw: null,
  quote_raw: null,
  quote_min: null,
  quote_max: null,
  priority: 10,
  cooperation_status: 'ACTIVE',
  rating: null,
  availability_raw: null,
  work_url: null,
  source_aliases_json: null,
  migration_key: 'resource:model:1',
  legacy_updated_at: null,
};

const requirement: ProjectRequirement = {
  requirement_id: 'requirement-1',
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
  migration_key: 'requirement:1',
};

const assignment: ProjectAssignment = {
  assignment_id: 'assignment-1',
  project_id: 'project-1',
  resource_key: 'resource-model-1',
  role: 'MODEL',
  proposed_start: null,
  proposed_end: null,
  status: 'PROPOSED',
  conflict_reason: null,
  confirmed_at: null,
  source: 'operator',
  migration_key: 'assignment:1',
};

const availability: AvailabilitySlot = {
  availability_id: 'availability-1',
  resource_key: 'resource-model-1',
  resource_type: 'MODEL',
  start_at: '2026-08-25T08:00:00.000Z',
  end_at: '2026-08-25T12:00:00.000Z',
  status: 'AVAILABLE',
  granularity: 'RANGE',
  raw_text: '2026-08-25 08:00-12:00',
  parse_status: 'PARSED',
  confidence: 'HIGH',
  source_updated_at: null,
  expires_at: null,
  migration_key: 'availability:1',
};

const script: CommunicationScript = {
  script_id: 'script-1',
  scene: 'availability_check',
  audience: 'resource',
  goal: 'confirm',
  body: '你好，{{resource_name}}，想确认合作。',
  notes: null,
  effect: null,
  resource_type: 'MODEL',
  customer_stage: 'OTHER',
  version_at: null,
  status: 'ACTIVE',
  source_aliases_json: null,
  migration_key: 'script:1',
};

function connectedApi() {
  return createBusinessDataApi({
    repository: new OperationsRepository(new FakeOperationsAdapter({
      projects: [project],
      resources: [resource],
      projectRequirements: [requirement],
      assignments: [assignment],
      availability: [availability],
      scripts: [script],
    })),
  });
}

describe('connected business-data routes', () => {
  it('fails closed without credentials and does not seed demo data', async () => {
    const result = await createBusinessDataApi({ env: {} }).listProjects();
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ mode: 'BLOCKED' });
    expect(result.body).not.toHaveProperty('data');
  });

  it('returns connected target-Base data with bounded paging and filters', async () => {
    const api = connectedApi();
    const projects = await api.listProjects({ limit: 1 });
    expect(projects.body).toMatchObject({ mode: 'CONNECTED', source: 'FEISHU_NEW_BASE', data: [project] });
    const resources = await api.listResources({ type: 'model', limit: 1 });
    expect(resources.body).toMatchObject({ mode: 'CONNECTED', source: 'FEISHU_NEW_BASE', data: [resource] });
    const slots = await api.listAvailability('resource-model-1', {
      start: '2026-08-25T09:00:00.000Z',
      end: '2026-08-25T10:00:00.000Z',
    });
    expect(slots.body).toMatchObject({ mode: 'CONNECTED', source: 'FEISHU_NEW_BASE', data: [availability] });
  });

  it('returns a project context from canonical IDs only', async () => {
    const context = await connectedApi().getProjectContext('project-1');
    expect(context.body).toMatchObject({
      mode: 'CONNECTED',
      source: 'FEISHU_NEW_BASE',
      data: { project, requirements: [requirement], assignments: [assignment], resources: [resource] },
    });
    const invalid = await connectedApi().getProjectContext('recFeishuId');
    expect(invalid.statusCode).toBe(400);
  });
});
