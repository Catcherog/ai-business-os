import type {
  AvailabilitySlot,
  CommunicationScript,
  KnowledgeItem,
  ProjectAssignment,
  ProjectRequirement,
  Resource,
} from '@busos/contracts';
import {
  FeishuBaseClient,
  type FeishuBaseClientConfig,
  type FeishuBaseRecord,
} from './feishu-adapter.js';
import {
  mapAvailabilityRecord,
  mapCommunicationScriptRecord,
  mapKnowledgeRecord,
  mapProjectAssignmentRecord,
  mapProjectRequirementRecord,
  mapResourceRecord,
} from './operations-mapping.js';
import {
  OPERATIONS_TABLE_NAMES,
  OperationsAdapterError,
  type OperationsAdapter,
  type OperationsAdapterConfig,
  type OperationsTableIds,
  type OperationsTableName,
} from './operations-types.js';

if (typeof globalThis !== 'undefined' && 'window' in globalThis) {
  throw new Error('OperationsAdapter is server-only');
}

const TABLE_ENV_NAMES: Readonly<Record<OperationsTableName, readonly string[]>> = {
  resources: ['FEISHU_TARGET_TABLE_RESOURCES_ID', 'FEISHU_TARGET_RESOURCES_TABLE_ID'],
  availability: [
    'FEISHU_TARGET_TABLE_RESOURCE_AVAILABILITY_ID',
    'FEISHU_TARGET_RESOURCE_AVAILABILITY_TABLE_ID',
  ],
  projectRequirements: [
    'FEISHU_TARGET_TABLE_PROJECT_REQUIREMENTS_ID',
    'FEISHU_TARGET_PROJECT_REQUIREMENTS_TABLE_ID',
  ],
  projectAssignments: [
    'FEISHU_TARGET_TABLE_PROJECT_ASSIGNMENTS_ID',
    'FEISHU_TARGET_PROJECT_ASSIGNMENTS_TABLE_ID',
  ],
  scripts: [
    'FEISHU_TARGET_TABLE_COMMUNICATION_SCRIPTS_ID',
    'FEISHU_TARGET_COMMUNICATION_SCRIPTS_TABLE_ID',
  ],
  knowledge: ['FEISHU_TARGET_TABLE_KNOWLEDGE_ID', 'FEISHU_TARGET_KNOWLEDGE_TABLE_ID'],
};

function requiredEnv(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new OperationsAdapterError(`Missing required environment variable: ${name}`);
  return value;
}

export function resolveOperationsTargetToken(env: Record<string, string | undefined>): string {
  const target = env.FEISHU_TARGET_BASE_TOKEN?.trim();
  const legacy = env.FEISHU_BASE_APP_TOKEN?.trim();
  if (target && legacy && target !== legacy) {
    throw new OperationsAdapterError('FEISHU_TARGET_BASE_TOKEN and FEISHU_BASE_APP_TOKEN differ');
  }
  if (target || legacy) return target ?? legacy!;
  throw new OperationsAdapterError(
    'Missing required environment variable: FEISHU_TARGET_BASE_TOKEN',
  );
}

function tableIdsFromEnv(env: Record<string, string | undefined>): OperationsTableIds {
  const result: OperationsTableIds = {};
  for (const tableName of Object.keys(TABLE_ENV_NAMES) as OperationsTableName[]) {
    const id = TABLE_ENV_NAMES[tableName].map((name) => env[name]?.trim()).find(Boolean);
    if (id) result[tableName] = id;
  }
  return result;
}

function validateLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) return undefined;
  if (!Number.isInteger(limit) || limit < 0) {
    throw new OperationsAdapterError('Operations list limit must be a non-negative integer');
  }
  return limit;
}

function parseWindow(window: { start: string; end: string }): { start: number; end: number } {
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    throw new OperationsAdapterError('Operations availability window is invalid');
  }
  return { start, end };
}

function sortByKey<T extends { resource_key?: string; availability_id?: string; requirement_id?: string; assignment_id?: string; script_id?: string; knowledge_id?: string }>(items: T[], key: keyof T): T[] {
  return items.sort((left, right) => String(left[key] ?? '').localeCompare(String(right[key] ?? '')));
}

export class ConnectedOperationsAdapter implements OperationsAdapter {
  private readonly client: FeishuBaseClient;
  private readonly tableIds: OperationsTableIds;
  private readonly tableCache = new Map<OperationsTableName, string>();

  constructor(config: OperationsAdapterConfig) {
    const clientConfig: FeishuBaseClientConfig = {
      appId: config.appId,
      appSecret: config.appSecret,
      baseAppToken: config.targetBaseToken,
      baseUrl: config.baseUrl,
      fetchImpl: config.fetchImpl,
      sleep: config.sleep,
      maxRetries: config.maxRetries,
    };
    this.client = new FeishuBaseClient(clientConfig);
    this.tableIds = { ...(config.tableIds ?? {}) };
  }

  async listResources(filter?: { type?: string; status?: string; limit?: number }): Promise<Resource[]> {
    const limit = validateLimit(filter?.limit);
    const resources = (await this.records('resources')).map(mapResourceRecord).filter((resource) => {
      if (filter?.type && resource.resource_type !== filter.type.toUpperCase()) return false;
      if (filter?.status && resource.cooperation_status !== filter.status.toUpperCase()) return false;
      return true;
    });
    sortByKey(resources, 'resource_key');
    return limit === undefined ? resources : resources.slice(0, limit);
  }

  async listAvailability(resourceKeys: string[], window: { start: string; end: string }): Promise<AvailabilitySlot[]> {
    const parsedWindow = parseWindow(window);
    const keys = new Set(resourceKeys.map((key) => key.trim()).filter(Boolean));
    if (keys.size === 0) return [];
    const slots = (await this.records('availability')).map(mapAvailabilityRecord).filter((slot) => {
      if (!keys.has(slot.resource_key) || !slot.start_at || !slot.end_at) return false;
      const start = Date.parse(slot.start_at);
      const end = Date.parse(slot.end_at);
      return Number.isFinite(start) && Number.isFinite(end) && start <= parsedWindow.end && end >= parsedWindow.start;
    });
    slots.sort((left, right) => {
      const byStart = Date.parse(left.start_at ?? '') - Date.parse(right.start_at ?? '');
      return byStart || left.availability_id.localeCompare(right.availability_id);
    });
    return slots;
  }

  async listProjectRequirements(projectId: string): Promise<ProjectRequirement[]> {
    const project = projectId.trim();
    if (!project) throw new OperationsAdapterError('Project id is required');
    const requirements = (await this.records('projectRequirements'))
      .map(mapProjectRequirementRecord)
      .filter((requirement) => requirement.project_id === project);
    return sortByKey(requirements, 'requirement_id');
  }

  async listAssignments(projectId: string): Promise<ProjectAssignment[]> {
    const project = projectId.trim();
    if (!project) throw new OperationsAdapterError('Project id is required');
    const assignments = (await this.records('projectAssignments'))
      .map(mapProjectAssignmentRecord)
      .filter((assignment) => assignment.project_id === project);
    return sortByKey(assignments, 'assignment_id');
  }

  async listScripts(filter: { audience: string; scene?: string }): Promise<CommunicationScript[]> {
    const audience = filter.audience.trim();
    if (!audience) throw new OperationsAdapterError('Script audience is required');
    const scripts = (await this.records('scripts'))
      .map(mapCommunicationScriptRecord)
      .filter((script) => script.audience === audience && (filter.scene === undefined || script.scene === filter.scene));
    return sortByKey(scripts, 'script_id');
  }

  async listKnowledge(filter?: { type?: string; limit?: number }): Promise<KnowledgeItem[]> {
    const limit = validateLimit(filter?.limit);
    const knowledge = (await this.records('knowledge')).map(mapKnowledgeRecord).filter((item) => {
      return !filter?.type || item.knowledge_type === filter.type.toUpperCase();
    });
    sortByKey(knowledge, 'knowledge_id');
    return limit === undefined ? knowledge : knowledge.slice(0, limit);
  }

  private async records(tableName: OperationsTableName): Promise<FeishuBaseRecord[]> {
    try {
      return await this.client.listAllRecords(await this.resolveTableId(tableName));
    } catch (error) {
      if (error instanceof OperationsAdapterError) throw error;
      throw new OperationsAdapterError(`Failed to read ${OPERATIONS_TABLE_NAMES[tableName]}`, {
        table: OPERATIONS_TABLE_NAMES[tableName],
      });
    }
  }

  private async resolveTableId(tableName: OperationsTableName): Promise<string> {
    const configured = this.tableIds[tableName]?.trim();
    if (configured) return configured;
    const cached = this.tableCache.get(tableName);
    if (cached) return cached;
    const expectedName = OPERATIONS_TABLE_NAMES[tableName];
    const tables = await this.client.listAllTables();
    const matches = tables.filter((table) => table.name === expectedName && table.table_id);
    if (matches.length !== 1) {
      throw new OperationsAdapterError(
        matches.length === 0 ? `Target table is missing: ${expectedName}` : `Target table is ambiguous: ${expectedName}`,
        { table: expectedName },
      );
    }
    this.tableCache.set(tableName, matches[0].table_id);
    return matches[0].table_id;
  }
}

export function createOperationsAdapter(config: OperationsAdapterConfig): OperationsAdapter {
  return new ConnectedOperationsAdapter(config);
}

export function createOperationsAdapterFromEnv(
  env: Record<string, string | undefined> = process.env,
): OperationsAdapter {
  return new ConnectedOperationsAdapter({
    appId: requiredEnv(env, 'FEISHU_APP_ID'),
    appSecret: requiredEnv(env, 'FEISHU_APP_SECRET'),
    targetBaseToken: resolveOperationsTargetToken(env),
    tableIds: tableIdsFromEnv(env),
    baseUrl: env.FEISHU_BASE_URL?.trim() || undefined,
  });
}
