import type {
  AvailabilitySlot,
  CommunicationScript,
  KnowledgeItem,
  ProjectAssignment,
  ProjectRequirement,
  Resource,
} from '@busos/contracts';
import { createOperationsAdapterFromEnv } from './operations-adapter.js';
import type { OperationsAdapter, OperationsRepositoryPort } from './operations-types.js';

/** Domain-facing read repository; no Feishu record shape crosses this port. */
export class OperationsRepository implements OperationsRepositoryPort {
  constructor(private readonly adapter: OperationsAdapter) {}

  listResources(filter?: { type?: string; status?: string; limit?: number }): Promise<Resource[]> {
    return this.adapter.listResources(filter);
  }

  listAvailability(resourceKeys: string[], window: { start: string; end: string }): Promise<AvailabilitySlot[]> {
    return this.adapter.listAvailability(resourceKeys, window);
  }

  listProjectRequirements(projectId: string): Promise<ProjectRequirement[]> {
    return this.adapter.listProjectRequirements(projectId);
  }

  listAssignments(projectId: string): Promise<ProjectAssignment[]> {
    return this.adapter.listAssignments(projectId);
  }

  listScripts(filter: { audience: string; scene?: string }): Promise<CommunicationScript[]> {
    return this.adapter.listScripts(filter);
  }

  listKnowledge(filter?: { type?: string; limit?: number }): Promise<KnowledgeItem[]> {
    return this.adapter.listKnowledge(filter);
  }
}

export function createOperationsRepository(adapter: OperationsAdapter): OperationsRepository {
  return new OperationsRepository(adapter);
}

export function createOperationsRepositoryFromEnv(
  env: Record<string, string | undefined> = process.env,
): OperationsRepository {
  return new OperationsRepository(createOperationsAdapterFromEnv(env));
}
