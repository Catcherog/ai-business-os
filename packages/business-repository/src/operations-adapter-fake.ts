import type {
  AvailabilitySlot,
  CommunicationScript,
  KnowledgeItem,
  ProjectAssignment,
  ProjectRequirement,
  Resource,
} from '@busos/contracts';
import { OperationsAdapterError, type OperationsAdapter } from './operations-types.js';

export interface FakeOperationsAdapterOptions {
  resources?: Resource[];
  availability?: AvailabilitySlot[];
  projectRequirements?: ProjectRequirement[];
  assignments?: ProjectAssignment[];
  scripts?: CommunicationScript[];
  knowledge?: KnowledgeItem[];
}

function limitValue(limit: number | undefined): number | undefined {
  if (limit === undefined) return undefined;
  if (!Number.isInteger(limit) || limit < 0) {
    throw new OperationsAdapterError('Operations list limit must be a non-negative integer');
  }
  return limit;
}

function overlap(slot: AvailabilitySlot, start: number, end: number): boolean {
  if (!slot.start_at || !slot.end_at) return false;
  const slotStart = Date.parse(slot.start_at);
  const slotEnd = Date.parse(slot.end_at);
  return Number.isFinite(slotStart) && Number.isFinite(slotEnd) && slotStart <= end && slotEnd >= start;
}

export class FakeOperationsAdapter implements OperationsAdapter {
  private readonly data: Required<FakeOperationsAdapterOptions>;

  constructor(options: FakeOperationsAdapterOptions = {}) {
    this.data = {
      resources: options.resources ?? [],
      availability: options.availability ?? [],
      projectRequirements: options.projectRequirements ?? [],
      assignments: options.assignments ?? [],
      scripts: options.scripts ?? [],
      knowledge: options.knowledge ?? [],
    };
  }

  async listResources(filter?: { type?: string; status?: string; limit?: number }): Promise<Resource[]> {
    const limit = limitValue(filter?.limit);
    const result = this.data.resources
      .filter((resource) => !filter?.type || resource.resource_type === filter.type.toUpperCase())
      .filter((resource) => !filter?.status || resource.cooperation_status === filter.status.toUpperCase())
      .slice()
      .sort((left, right) => left.resource_key.localeCompare(right.resource_key));
    return limit === undefined ? result : result.slice(0, limit);
  }

  async listAvailability(resourceKeys: string[], window: { start: string; end: string }): Promise<AvailabilitySlot[]> {
    const start = Date.parse(window.start);
    const end = Date.parse(window.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
      throw new OperationsAdapterError('Operations availability window is invalid');
    }
    const keys = new Set(resourceKeys.map((key) => key.trim()).filter(Boolean));
    return this.data.availability
      .filter((slot) => keys.has(slot.resource_key) && overlap(slot, start, end))
      .slice()
      .sort((left, right) => {
        const byStart = Date.parse(left.start_at ?? '') - Date.parse(right.start_at ?? '');
        return byStart || left.availability_id.localeCompare(right.availability_id);
      });
  }

  async listProjectRequirements(projectId: string): Promise<ProjectRequirement[]> {
    const project = projectId.trim();
    if (!project) throw new OperationsAdapterError('Project id is required');
    return this.data.projectRequirements
      .filter((requirement) => requirement.project_id === project)
      .slice()
      .sort((left, right) => left.requirement_id.localeCompare(right.requirement_id));
  }

  async listAssignments(projectId: string): Promise<ProjectAssignment[]> {
    const project = projectId.trim();
    if (!project) throw new OperationsAdapterError('Project id is required');
    return this.data.assignments
      .filter((assignment) => assignment.project_id === project)
      .slice()
      .sort((left, right) => left.assignment_id.localeCompare(right.assignment_id));
  }

  async listScripts(filter: { audience: string; scene?: string }): Promise<CommunicationScript[]> {
    const audience = filter.audience.trim();
    if (!audience) throw new OperationsAdapterError('Script audience is required');
    return this.data.scripts
      .filter((script) => script.audience === audience && (filter.scene === undefined || script.scene === filter.scene))
      .slice()
      .sort((left, right) => left.script_id.localeCompare(right.script_id));
  }

  async listKnowledge(filter?: { type?: string; limit?: number }): Promise<KnowledgeItem[]> {
    const limit = limitValue(filter?.limit);
    const result = this.data.knowledge
      .filter((item) => !filter?.type || item.knowledge_type === filter.type.toUpperCase())
      .slice()
      .sort((left, right) => left.knowledge_id.localeCompare(right.knowledge_id));
    return limit === undefined ? result : result.slice(0, limit);
  }
}

export function createFakeOperationsAdapter(options: FakeOperationsAdapterOptions = {}): OperationsAdapter {
  return new FakeOperationsAdapter(options);
}
