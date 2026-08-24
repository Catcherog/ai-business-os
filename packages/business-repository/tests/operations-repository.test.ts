import { describe, expect, it } from 'vitest';
import type {
  AvailabilitySlot,
  CommunicationScript,
  KnowledgeItem,
  ProjectAssignment,
  ProjectRequirement,
  Resource,
} from '@busos/contracts';
import { FakeOperationsAdapter } from '../src/operations-adapter-fake.js';
import { OperationsRepository } from '../src/operations-repository.js';

const resource = (key: string, type: Resource['resource_type'], status: Resource['cooperation_status']): Resource => ({
  resource_key: key,
  resource_id: null,
  resource_type: type,
  name: key,
  xiaohongshu_name: null,
  xiaohongshu_profile_url: null,
  wechat: null,
  phone: null,
  city: null,
  address: null,
  styles: null,
  size_raw: null,
  quote_raw: null,
  quote_min: null,
  quote_max: null,
  priority: null,
  cooperation_status: status,
  rating: null,
  availability_raw: null,
  work_url: null,
  source_aliases_json: null,
  migration_key: `migration:${key}`,
  legacy_updated_at: null,
});

const slot: AvailabilitySlot = {
  availability_id: 'availability-1',
  resource_key: 'resource-a',
  resource_type: 'MODEL',
  start_at: '2026-08-25T00:00:00.000Z',
  end_at: '2026-08-26T00:00:00.000Z',
  status: 'AVAILABLE',
  granularity: 'RANGE',
  raw_text: '2026-08-25 to 2026-08-26',
  parse_status: 'PARSED',
  confidence: 'HIGH',
  source_updated_at: null,
  expires_at: null,
  migration_key: 'availability:1',
};

const requirement: ProjectRequirement = {
  requirement_id: 'requirement-1',
  project_id: 'project-1',
  role_type: 'MODEL',
  required_count: 1,
  date_window_start: null,
  date_window_end: null,
  duration_hours: null,
  location: null,
  style_tags: null,
  size_constraint: null,
  budget_max: null,
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
  resource_key: 'resource-a',
  role: 'MODEL',
  proposed_start: null,
  proposed_end: null,
  status: 'PROPOSED',
  conflict_reason: null,
  confirmed_at: null,
  source: 'operator',
  migration_key: 'assignment:1',
};

const script: CommunicationScript = {
  script_id: 'script-1',
  scene: 'first_reply',
  audience: 'lead',
  goal: 'qualify',
  body: '你好，请告诉我拍摄日期和预算。',
  notes: null,
  effect: null,
  resource_type: null,
  customer_stage: 'LEAD',
  version_at: null,
  status: 'ACTIVE',
  source_aliases_json: null,
  migration_key: 'script:1',
};

const knowledge: KnowledgeItem = {
  knowledge_id: 'knowledge-1',
  knowledge_type: 'SYSTEM_RULE',
  title: 'Availability rule',
  detail: null,
  keywords: 'availability',
  scenario: null,
  source_url: null,
  owner_raw: null,
  workflow_status: 'ACTIVE',
  due_at: null,
  version_at: null,
  migration_key: 'knowledge:1',
};

describe('OperationsRepository over the adapter port', () => {
  const repository = new OperationsRepository(
    new FakeOperationsAdapter({
      resources: [resource('resource-b', 'STUDIO', 'INACTIVE'), resource('resource-a', 'MODEL', 'ACTIVE')],
      availability: [slot],
      projectRequirements: [requirement],
      assignments: [assignment],
      scripts: [script],
      knowledge: [knowledge],
    }),
  );

  it('filters and bounds resources without exposing Feishu records', async () => {
    const result = await repository.listResources({ type: 'model', status: 'active', limit: 1 });
    expect(result.map((item) => item.resource_key)).toEqual(['resource-a']);
    expect(result[0]).not.toHaveProperty('record_id');
  });

  it('supports availability overlap and project-scoped reads', async () => {
    const availability = await repository.listAvailability(
      ['resource-a'],
      { start: '2026-08-25T12:00:00.000Z', end: '2026-08-25T13:00:00.000Z' },
    );
    expect(availability).toHaveLength(1);
    expect(await repository.listProjectRequirements('project-1')).toHaveLength(1);
    expect(await repository.listAssignments('project-2')).toEqual([]);
  });

  it('filters scripts and knowledge through canonical fields', async () => {
    expect(await repository.listScripts({ audience: 'lead', scene: 'first_reply' })).toHaveLength(1);
    expect(await repository.listKnowledge({ type: 'system_rule', limit: 1 })).toHaveLength(1);
  });
});
