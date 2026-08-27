import type {
  AvailabilitySlot,
  Project,
  ProjectAssignment,
  ProjectRequirement,
  Resource,
} from '@busos/contracts';
import {
  createDemoSchedulingConfirmationPort,
  proposeShootSlots,
  type DemoSchedulingConfirmationPort,
  type SchedulingConfirmationInput,
  type SchedulingConfirmationPort,
  type SchedulingConfirmationResult,
  type SchedulingProposal,
  type SchedulingRuntimeMode,
} from '@busos/scheduling';

export interface SchedulingSnapshot {
  mode: SchedulingRuntimeMode;
  project: Project;
  requirements: ProjectRequirement[];
  resources: Resource[];
  availability: AvailabilitySlot[];
  assignments: ProjectAssignment[];
  proposals: SchedulingProposal[];
  lastConfirmation: SchedulingConfirmationResult | null;
}

export interface SchedulingProposalInput {
  start: string;
  end: string;
  location?: string | null;
  preferredResourceKeys?: string[];
}

export interface SchedulingClient {
  readonly mode: SchedulingRuntimeMode;
  getSnapshot(): SchedulingSnapshot;
  propose(input: SchedulingProposalInput): SchedulingProposal[];
  confirm(input: Omit<SchedulingConfirmationInput, 'projectId'>): Promise<SchedulingConfirmationResult>;
}

export interface DemoSchedulingClientOptions {
  projectId?: string;
  projectTitle?: string;
  confirmationPort?: SchedulingConfirmationPort;
}

function demoProject(projectId: string, title: string): Project {
  return {
    project_id: projectId,
    customer_id: 'cust_demo_001',
    lead_id: 'lead_demo_001',
    project_type: '写真',
    title,
    status: 'IN_PROGRESS',
    scheduled_date: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-20T00:00:00.000Z',
  };
}

function demoRequirement(projectId: string): ProjectRequirement {
  return {
    requirement_id: `req_${projectId}`,
    project_id: projectId,
    role_type: 'PHOTOGRAPHER',
    required_count: 1,
    date_window_start: '2026-09-20T01:00:00.000Z',
    date_window_end: '2026-09-20T09:00:00.000Z',
    duration_hours: 2,
    location: '上海',
    style_tags: '新中式, 人像',
    size_constraint: null,
    budget_max: 4000,
    required: 'YES',
    source_plan_url: null,
    source_excerpt: 'DEMO project requirement for a two-hour portrait shoot.',
    parse_status: 'PARSED',
    confidence: 'HIGH',
    migration_key: `demo_requirement:${projectId}`,
  };
}

function demoResource(resourceKey: string, name: string, priority: number): Resource {
  return {
    resource_key: resourceKey,
    resource_id: null,
    resource_type: 'PHOTOGRAPHER',
    name,
    xiaohongshu_name: null,
    xiaohongshu_profile_url: null,
    wechat: null,
    phone: null,
    city: '上海',
    address: '静安区',
    styles: '人像, 新中式',
    size_raw: null,
    quote_raw: 'DEMO 预算范围内',
    quote_min: 1800,
    quote_max: 3200,
    priority,
    cooperation_status: 'ACTIVE',
    rating: 4.8,
    availability_raw: '2026-09-20 上午可用',
    work_url: null,
    source_aliases_json: null,
    migration_key: `demo_resource:${resourceKey}`,
    legacy_updated_at: null,
  };
}

function demoAvailability(resourceKey: string, id: string, start: string, end: string): AvailabilitySlot {
  return {
    availability_id: id,
    resource_key: resourceKey,
    resource_type: 'PHOTOGRAPHER',
    start_at: start,
    end_at: end,
    status: 'AVAILABLE',
    granularity: 'RANGE',
    raw_text: 'DEMO parsed availability',
    parse_status: 'PARSED',
    confidence: 'HIGH',
    source_updated_at: '2026-08-20T00:00:00.000Z',
    expires_at: null,
    migration_key: `demo_availability:${id}`,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Deterministic DEMO scheduling client. It uses the production proposal
 * engine and confirmation port, with a local canonical-like assignment store.
 */
export function createDemoSchedulingClient(options: DemoSchedulingClientOptions = {}): SchedulingClient {
  const projectId = options.projectId ?? 'proj_demo_001';
  const project = demoProject(projectId, options.projectTitle ?? '林晚晴 · 新中式写真');
  const requirements = [demoRequirement(projectId)];
  const resources = [
    demoResource('photographer_demo_001', '顾言 · 人像摄影', 10),
    demoResource('photographer_demo_002', '沈知行 · 人像摄影', 7),
  ];
  const availability = [
    demoAvailability('photographer_demo_001', 'avail_demo_001', '2026-09-20T01:00:00.000Z', '2026-09-20T06:00:00.000Z'),
    demoAvailability('photographer_demo_002', 'avail_demo_002', '2026-09-20T03:00:00.000Z', '2026-09-20T09:00:00.000Z'),
  ];
  const confirmationPort = options.confirmationPort ?? createDemoSchedulingConfirmationPort();
  let proposals: SchedulingProposal[] = [];
  let lastConfirmation: SchedulingConfirmationResult | null = null;

  const listAssignments = (): ProjectAssignment[] => {
    if ('listAssignments' in confirmationPort && typeof confirmationPort.listAssignments === 'function') {
      return (confirmationPort as DemoSchedulingConfirmationPort).listAssignments();
    }
    return [];
  };

  const snapshot = (): SchedulingSnapshot => ({
    mode: 'DEMO',
    project: clone(project),
    requirements: clone(requirements),
    resources: clone(resources),
    availability: clone(availability),
    assignments: clone(listAssignments()),
    proposals: clone(proposals),
    lastConfirmation: clone(lastConfirmation),
  });

  return {
    mode: 'DEMO',
    getSnapshot: snapshot,
    propose(input) {
      proposals = proposeShootSlots({
        projectId,
        window: { start: input.start, end: input.end },
        location: input.location,
        preferredResourceKeys: input.preferredResourceKeys,
        requirements,
        resources,
        availability,
        assignments: snapshot().assignments,
      });
      return clone(proposals);
    },
    async confirm(input) {
      lastConfirmation = await confirmationPort.confirm({
        ...input,
        projectId,
      });
      return clone(lastConfirmation);
    },
  };
}
