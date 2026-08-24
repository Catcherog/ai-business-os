import type {
  AvailabilitySlot,
  CommunicationScript,
  KnowledgeItem,
  ProjectAssignment,
  ProjectRequirement,
  Project,
  Resource,
} from '@busos/contracts';
import type { FeishuBaseRecord } from './feishu-adapter.js';

export interface OperationsFilters {
  resource?: { type?: string; status?: string; limit?: number };
  availability?: { resourceKeys: string[]; window: { start: string; end: string } };
  scripts?: { audience: string; scene?: string };
  knowledge?: { type?: string; limit?: number };
}

export interface OperationsRepositoryPort {
  listProjects(filter?: { limit?: number }): Promise<Project[]>;
  listResources(filter?: { type?: string; status?: string; limit?: number }): Promise<Resource[]>;
  listAvailability(resourceKeys: string[], window: { start: string; end: string }): Promise<AvailabilitySlot[]>;
  listProjectRequirements(projectId: string): Promise<ProjectRequirement[]>;
  listAssignments(projectId: string): Promise<ProjectAssignment[]>;
  listScripts(filter: { audience: string; scene?: string }): Promise<CommunicationScript[]>;
  listKnowledge(filter?: { type?: string; limit?: number }): Promise<KnowledgeItem[]>;
}

export interface OperationsAdapter extends OperationsRepositoryPort {}

export type OperationsTableName =
  | 'projects'
  | 'resources'
  | 'availability'
  | 'projectRequirements'
  | 'projectAssignments'
  | 'scripts'
  | 'knowledge';

export const OPERATIONS_TABLE_NAMES: Readonly<Record<OperationsTableName, string>> = {
  projects: 'Projects',
  resources: 'Resources',
  availability: 'Resource Availability',
  projectRequirements: 'Project Requirements',
  projectAssignments: 'Project Assignments',
  scripts: 'Communication Scripts',
  knowledge: 'Knowledge',
};

export type OperationsTableIds = Partial<Record<OperationsTableName, string>>;

export interface OperationsAdapterConfig {
  appId: string;
  appSecret: string;
  targetBaseToken: string;
  /** Table ids are optional because the connected adapter discovers them by name. */
  tableIds?: OperationsTableIds;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  maxRetries?: number;
}

/** Safe error boundary: only table and business-key context is exposed. */
export class OperationsAdapterError extends Error {
  readonly table?: string;
  readonly businessKey?: string;

  constructor(message: string, context: { table?: string; businessKey?: string } = {}) {
    super(message);
    this.name = 'OperationsAdapterError';
    this.table = context.table;
    this.businessKey = context.businessKey;
  }
}

export type OperationsRecordMapper<T> = (record: FeishuBaseRecord) => T;
