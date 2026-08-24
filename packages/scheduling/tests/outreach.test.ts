import { describe, expect, it } from 'vitest';
import type { CommunicationScript, ProjectRequirement, Resource } from '@busos/contracts';
import { draftAvailabilityOutreach } from '../src/outreach.js';

const resource: Resource = {
  resource_key: 'resource-model-1',
  resource_id: null,
  resource_type: 'MODEL',
  name: 'Alice',
  xiaohongshu_name: null,
  xiaohongshu_profile_url: null,
  wechat: 'alice-wechat',
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

const script: CommunicationScript = {
  script_id: 'script-model-availability',
  scene: 'availability_check',
  audience: 'resource',
  goal: 'confirm availability',
  body: '你好，{{resource_name}}，想确认你是否愿意参与{{project_name}}的拍摄。',
  notes: null,
  effect: null,
  resource_type: 'MODEL',
  customer_stage: 'OTHER',
  version_at: null,
  status: 'ACTIVE',
  source_aliases_json: null,
  migration_key: 'script:model:availability',
};

const requirement: ProjectRequirement = {
  requirement_id: 'requirement-model-1',
  project_id: 'project-1',
  role_type: 'MODEL',
  required_count: 1,
  date_window_start: null,
  date_window_end: null,
  duration_hours: null,
  location: null,
  style_tags: '新中式',
  size_constraint: null,
  budget_max: null,
  required: 'UNKNOWN',
  source_plan_url: null,
  source_excerpt: null,
  parse_status: 'UNPARSED',
  confidence: 'LOW',
  migration_key: 'requirement:model:1',
};

describe('draftAvailabilityOutreach', () => {
  it('uses an active matching script and brackets every missing fact', () => {
    const draft = draftAvailabilityOutreach({
      projectId: 'project-1',
      projectName: '秋季新中式拍摄',
      resource,
      requirement,
      scripts: [script],
      audience: 'resource',
      scene: 'availability_check',
    });
    expect(draft.scriptId).toBe(script.script_id);
    expect(draft.body).toContain('Alice');
    expect(draft.body).toContain('秋季新中式拍摄');
    expect(draft.body).toContain('【请确认预计拍摄时长】');
    expect(draft.body).toContain('【请确认预计拍摄日期】');
    expect(draft.body).toContain('【请确认拍摄地点】');
    expect(draft.body).toContain('【请确认预算范围】');
    expect(draft.body).not.toContain('2026');
    expect(draft.missingFacts).toEqual(expect.arrayContaining(['duration_hours', 'date_window', 'location', 'budget']));
  });

  it('does not invent a script, date, price or commitment when facts are absent', () => {
    const draft = draftAvailabilityOutreach({
      projectId: 'project-2',
      resource,
      requirement: null,
      scripts: [],
    });
    expect(draft.scriptId).toBeNull();
    expect(draft.body).toContain('【缺少可用沟通话术模板】');
    expect(draft.body).toContain('【请确认预计拍摄日期】');
    expect(draft.body).not.toMatch(/承诺|保证|报价/);
  });
});
