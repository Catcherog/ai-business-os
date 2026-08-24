import { describe, expect, it } from 'vitest';
import { AvailabilitySchema } from '../src/availability.js';
import { ProjectAssignmentSchema } from '../src/project-assignment.js';
import { ProjectRequirementSchema } from '../src/project-requirement.js';
import { ResourceSchema } from '../src/resource.js';
import { PublishItemSchema } from '../src/publish-item.js';
import { CommunicationScriptSchema, KnowledgeItemSchema } from '../src/knowledge-item.js';

const time = '2026-06-10T09:00:00.000Z';

describe('operations canonical contracts', () => {
  it('parses valid resource, availability and project requirement examples', () => {
    expect(
      ResourceSchema.parse({
        resource_key: 'resource:model:lin',
        resource_id: 'legacy-1',
        resource_type: 'MODEL',
        name: 'Lin',
        xiaohongshu_name: null,
        xiaohongshu_profile_url: null,
        wechat: null,
        phone: null,
        city: 'Shanghai',
        address: null,
        styles: '新中式',
        size_raw: null,
        quote_raw: null,
        quote_min: null,
        quote_max: null,
        priority: 1,
        cooperation_status: 'ACTIVE',
        rating: 5,
        availability_raw: '2026-06-10',
        work_url: null,
        source_aliases_json: '{}',
        migration_key: 'resource:model:lin',
        legacy_updated_at: time,
      }),
    ).toMatchObject({ resource_key: 'resource:model:lin' });

    expect(
      AvailabilitySchema.parse({
        availability_id: 'availability-1',
        resource_key: 'resource:model:lin',
        resource_type: 'MODEL',
        start_at: time,
        end_at: '2026-06-10T18:00:00.000Z',
        status: 'AVAILABLE',
        granularity: 'DATETIME',
        raw_text: '2026-06-10 09:00-18:00',
        parse_status: 'PARSED',
        confidence: 'HIGH',
        source_updated_at: time,
        expires_at: null,
        migration_key: 'availability:resource:model:lin:1',
      }),
    ).toHaveProperty('availability_id', 'availability-1');

    expect(
      ProjectRequirementSchema.parse({
        requirement_id: 'requirement-1',
        project_id: 'project-1',
        role_type: 'MODEL',
        required_count: 1,
        date_window_start: time,
        date_window_end: null,
        duration_hours: 4,
        location: 'Shanghai',
        style_tags: '新中式',
        size_constraint: null,
        budget_max: 4000,
        required: 'YES',
        source_plan_url: null,
        source_excerpt: null,
        parse_status: 'PARSED',
        confidence: 'HIGH',
        migration_key: 'requirement:project-1:model',
      }),
    ).toHaveProperty('project_id', 'project-1');
  });

  it('parses the remaining canonical operations records', () => {
    expect(
      ProjectAssignmentSchema.parse({
        assignment_id: 'assignment-1',
        project_id: 'project-1',
        resource_key: 'resource:model:lin',
        role: 'MODEL',
        proposed_start: time,
        proposed_end: null,
        status: 'PROPOSED',
        conflict_reason: null,
        confirmed_at: null,
        source: 'operator',
        migration_key: 'assignment:project-1:resource:model:lin',
      }),
    ).toHaveProperty('assignment_id', 'assignment-1');

    expect(
      PublishItemSchema.parse({
        publish_item_id: 'publish-1',
        project_id: 'project-1',
        platform: 'XIAOHONGSHU',
        account: 'brand',
        material_type: 'PHOTO',
        title: 'Title',
        copy: 'Copy',
        tags: null,
        planned_at: time,
        published_at: null,
        status: 'PLANNED',
        publish_url: null,
        metrics_json: null,
        source_aliases_json: '{}',
        migration_key: 'publish:project-1:xhs:1',
      }),
    ).toHaveProperty('publish_item_id', 'publish-1');

    expect(
      KnowledgeItemSchema.parse({
        knowledge_id: 'knowledge-1',
        knowledge_type: 'KNOWLEDGE_INDEX',
        title: 'SOP',
        detail: 'Detail',
        keywords: 'sop',
        scenario: 'operations',
        source_url: null,
        owner_raw: null,
        workflow_status: 'ACTIVE',
        due_at: null,
        version_at: time,
        migration_key: 'knowledge:1',
      }),
    ).toHaveProperty('knowledge_id', 'knowledge-1');

    expect(
      CommunicationScriptSchema.parse({
        script_id: 'script-1',
        scene: 'availability',
        audience: 'model',
        goal: 'confirm',
        body: 'Please confirm.',
        notes: null,
        effect: null,
        resource_type: 'MODEL',
        customer_stage: 'QUALIFIED',
        version_at: time,
        status: 'ACTIVE',
        source_aliases_json: '{}',
        migration_key: 'script:1',
      }),
    ).toHaveProperty('script_id', 'script-1');
  });

  it('rejects unknown keys, empty IDs, reversed availability and invalid enums', () => {
    const valid = {
      availability_id: 'availability-1',
      resource_key: 'resource-1',
      resource_type: 'MODEL',
      start_at: '2026-06-11T09:00:00.000Z',
      end_at: '2026-06-10T09:00:00.000Z',
      status: 'AVAILABLE',
      granularity: 'DATETIME',
      raw_text: 'range',
      parse_status: 'PARSED',
      confidence: 'HIGH',
      source_updated_at: time,
      expires_at: null,
      migration_key: 'availability-1',
    };
    expect(AvailabilitySchema.safeParse(valid).success).toBe(false);
    expect(
      AvailabilitySchema.safeParse({ ...valid, end_at: null, unknown_key: true }).success,
    ).toBe(false);
    expect(
      AvailabilitySchema.safeParse({ ...valid, end_at: null, confidence: 'UNSURE' }).success,
    ).toBe(false);
    expect(
      ResourceSchema.safeParse({ resource_key: '', resource_id: null }).success,
    ).toBe(false);
    expect(
      ResourceSchema.safeParse({ resource_key: 'resource-1', resource_id: '   ' }).success,
    ).toBe(false);
    expect(
      ResourceSchema.safeParse({
        resource_key: 'resource-1',
        resource_id: null,
        resource_type: 'MODEL',
        name: 'Lin',
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
        cooperation_status: 'BROKEN',
        rating: null,
        availability_raw: null,
        work_url: null,
        source_aliases_json: null,
        migration_key: 'resource-1',
        legacy_updated_at: null,
      }).success,
    ).toBe(false);
    expect(
      ProjectAssignmentSchema.safeParse({
        assignment_id: 'a',
        project_id: 'p',
        resource_key: 'r',
        role: 'MODEL',
        proposed_start: null,
        proposed_end: null,
        status: 'UNKNOWN_STATUS',
        conflict_reason: null,
        confirmed_at: null,
        source: null,
        migration_key: 'm',
      }).success,
    ).toBe(false);
    expect(
      ProjectRequirementSchema.safeParse({
        requirement_id: 'r',
        project_id: 'p',
        role_type: 'MODEL',
        required_count: 1,
        date_window_start: '2026-06-11T00:00:00.000Z',
        date_window_end: '2026-06-10T00:00:00.000Z',
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
        migration_key: 'm',
      }).success,
    ).toBe(false);
    expect(
      ProjectAssignmentSchema.safeParse({
        assignment_id: 'a',
        project_id: 'p',
        resource_key: 'r',
        role: 'MODEL',
        proposed_start: '2026-06-11T00:00:00.000Z',
        proposed_end: '2026-06-10T00:00:00.000Z',
        status: 'PROPOSED',
        conflict_reason: null,
        confirmed_at: null,
        source: null,
        migration_key: 'm',
      }).success,
    ).toBe(false);
    expect(
      PublishItemSchema.safeParse({
        publish_item_id: 'p',
        project_id: 'project',
        platform: 'XIAOHONGSHU',
        account: null,
        material_type: 'PHOTO',
        title: null,
        copy: null,
        tags: null,
        planned_at: null,
        published_at: null,
        status: 'BROKEN',
        publish_url: null,
        metrics_json: null,
        source_aliases_json: null,
        migration_key: 'm',
      }).success,
    ).toBe(false);
  });
});
