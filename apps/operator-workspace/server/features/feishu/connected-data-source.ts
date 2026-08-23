import {
  BusinessRepository,
  createFeishuAdapterFromEnv,
  type AssetCreateInput,
  type CustomerCreateInput,
  type FeishuAdapter,
  type LeadCreateInput,
  type ProjectCreateInput,
  type TaskCreateInput,
} from '@busos/business-repository';
import {
  isBusinessCommitSuccess,
  type Asset,
  type CommitResultV1,
  type Customer,
  type Lead,
  type LeadStatus,
  type Project,
  type Task,
  type TaskStatus,
} from '@busos/contracts';
import {
  WorkspaceReadService,
  type ProjectWorkspace,
} from '@busos/workspace-read';
import type {
  RuntimeIdentityView,
  WorkspaceEnvelope,
} from '../../../src/workspace-data-source.js';

const CONNECTED_MODE = 'CONNECTED' as const;
const REQUIRED_CONFIG_KEYS = [
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
  'FEISHU_BASE_APP_TOKEN',
  'FEISHU_LEAD_TABLE_ID',
  'FEISHU_CUSTOMER_TABLE_ID',
  'FEISHU_PROJECT_TABLE_ID',
  'FEISHU_TASK_TABLE_ID',
  'FEISHU_ASSET_TABLE_ID',
] as const;

export type FeishuReadbackStatus = 'VERIFIED' | 'FAILED' | 'NOT_RUN';
export type FeishuLatencyBucket = 'UNKNOWN' | 'FAST' | 'MEDIUM' | 'SLOW';

export interface FeishuHealthView {
  mode: typeof CONNECTED_MODE;
  connected: boolean;
  configuredResourceCount: number;
  lastSuccessfulReadAt: string | null;
  lastSuccessfulWriteAt: string | null;
  lastReadbackStatus: FeishuReadbackStatus;
  latencyBucket: FeishuLatencyBucket;
  error?: { code: string; message: string };
}

export type ConnectedEnvelope<T> = WorkspaceEnvelope<T> & {
  health: FeishuHealthView;
};

export interface ConnectedWriteData<T> {
  value?: T;
  commit: CommitResultV1;
}

export interface ConnectedFeishuDataSourceOptions {
  /** Server-only environment. Never pass browser environment or browser input here. */
  env?: NodeJS.ProcessEnv;
  buildSha?: string;
  /** Tests and local stubs inject the adapter; it is never exposed by the source. */
  adapter?: FeishuAdapter;
  /** Writes require both an injected adapter and this explicit test/live gate. */
  allowWrites?: boolean;
  configuredResourceCount?: number;
  now?: () => Date;
}

export interface ConnectedFeishuDataSource {
  readonly runtime: Promise<ConnectedEnvelope<RuntimeIdentityView>>;
  health(): FeishuHealthView;
  listProjects(opts?: { limit?: number }): Promise<ConnectedEnvelope<ProjectWorkspace[]>>;
  getProject(projectId: string): Promise<ConnectedEnvelope<ProjectWorkspace | null>>;
  getProjectAggregate(projectId: string): Promise<ConnectedEnvelope<ProjectWorkspace | null>>;
  getProjectRecord(projectId: string): Promise<ConnectedEnvelope<Project | null>>;
  getCustomer(customerId: string): Promise<ConnectedEnvelope<Customer | null>>;
  getLead(leadId: string): Promise<ConnectedEnvelope<Lead | null>>;
  getTask(taskId: string): Promise<ConnectedEnvelope<Task | null>>;
  getAsset(assetId: string): Promise<ConnectedEnvelope<Asset | null>>;
  createCustomer(input: CustomerCreateInput): Promise<ConnectedEnvelope<ConnectedWriteData<Customer>>>;
  createLead(input: LeadCreateInput): Promise<ConnectedEnvelope<ConnectedWriteData<Lead>>>;
  createProject(input: ProjectCreateInput): Promise<ConnectedEnvelope<ConnectedWriteData<Project>>>;
  createTask(input: TaskCreateInput): Promise<ConnectedEnvelope<ConnectedWriteData<Task>>>;
  createAsset(input: AssetCreateInput): Promise<ConnectedEnvelope<ConnectedWriteData<Asset>>>;
  updateLeadStatus(leadId: string, status: LeadStatus): Promise<ConnectedEnvelope<ConnectedWriteData<Lead>>>;
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<ConnectedEnvelope<ConnectedWriteData<Task>>>;
}

function resolveBuildSha(env: NodeJS.ProcessEnv, explicit?: string): string {
  const sha = (explicit ?? env.VERCEL_GIT_COMMIT_SHA ?? env.BUSOS_BUILD_SHA ?? '').trim();
  return sha ? sha.slice(0, 7) : 'unknown';
}

function countConfiguredResources(env: NodeJS.ProcessEnv): number {
  return REQUIRED_CONFIG_KEYS.reduce((count, key) => count + (env[key] ? 1 : 0), 0);
}

function latencyBucket(elapsedMs: number): FeishuLatencyBucket {
  if (!Number.isFinite(elapsedMs)) return 'UNKNOWN';
  if (elapsedMs < 100) return 'FAST';
  if (elapsedMs < 500) return 'MEDIUM';
  return 'SLOW';
}

function safeError(code: string, message: string): { code: string; message: string } {
  return { code, message };
}

function cloneHealth(health: FeishuHealthView): FeishuHealthView {
  return {
    ...health,
    ...(health.error ? { error: { ...health.error } } : {}),
  };
}

export function createConnectedFeishuDataSource(
  options: ConnectedFeishuDataSourceOptions = {},
): ConnectedFeishuDataSource {
  const env = options.env ?? process.env;
  const injectedAdapter = options.adapter;
  const adapter = injectedAdapter ?? createFeishuAdapterFromEnv(env);
  const repo = adapter ? new BusinessRepository(adapter) : null;
  const read = repo ? new WorkspaceReadService(repo) : null;
  const buildSha = resolveBuildSha(env, options.buildSha);
  const now = options.now ?? (() => new Date());
  const writesEnabled = injectedAdapter !== undefined && options.allowWrites === true;
  const initialError = adapter
    ? undefined
    : safeError(
        'FEISHU_CONFIGURATION_MISSING',
        'Connected Feishu configuration is unavailable.',
      );
  const state: FeishuHealthView = {
    mode: CONNECTED_MODE,
    connected: adapter !== null,
    configuredResourceCount: options.configuredResourceCount ?? (
      injectedAdapter ? REQUIRED_CONFIG_KEYS.length : countConfiguredResources(env)
    ),
    lastSuccessfulReadAt: null,
    lastSuccessfulWriteAt: null,
    lastReadbackStatus: 'NOT_RUN',
    latencyBucket: 'UNKNOWN',
    ...(initialError ? { error: initialError } : {}),
  };

  const health = (): FeishuHealthView => cloneHealth(state);

  const blocked = <T>(
    code: string,
    message: string,
  ): ConnectedEnvelope<T> => ({
    mode: CONNECTED_MODE,
    buildSha,
    status: 'BLOCKED',
    error: safeError(code, message),
    health: health(),
  });

  const ready = <T>(data: T): ConnectedEnvelope<T> => ({
    mode: CONNECTED_MODE,
    buildSha,
    status: 'READY',
    data,
    health: health(),
  });

  const failed = <T>(
    code: string,
    message: string,
    data?: T,
  ): ConnectedEnvelope<T> => ({
    mode: CONNECTED_MODE,
    buildSha,
    status: 'ERROR',
    ...(data === undefined ? {} : { data }),
    error: safeError(code, message),
    health: health(),
  });

  const unavailableRead = <T>(): ConnectedEnvelope<T> => blocked(
    'FEISHU_CONFIGURATION_MISSING',
    'Connected Feishu configuration is unavailable.',
  );

  async function runRead<T>(call: () => Promise<T>): Promise<ConnectedEnvelope<T>> {
    if (!repo) return unavailableRead<T>();
    const startedAt = Date.now();
    try {
      const data = await call();
      state.lastSuccessfulReadAt = now().toISOString();
      state.latencyBucket = latencyBucket(Date.now() - startedAt);
      delete state.error;
      return ready(data);
    } catch {
      state.latencyBucket = latencyBucket(Date.now() - startedAt);
      state.error = safeError('FEISHU_READ_FAILED', 'Connected Feishu read failed.');
      return failed('FEISHU_READ_FAILED', 'Connected Feishu read failed.');
    }
  }

  function blockedWrite<T>(): ConnectedEnvelope<ConnectedWriteData<T>> {
    return blocked(
      'FEISHU_WRITE_BLOCKED',
      'Connected Feishu writes are disabled for this server boundary.',
    );
  }

  function writeResult<T>(
    value: T,
    commit: CommitResultV1,
    startedAt: number,
  ): ConnectedEnvelope<ConnectedWriteData<T>> {
    state.latencyBucket = latencyBucket(Date.now() - startedAt);
    state.lastReadbackStatus = commit.readback_status;
    const safeCommit: CommitResultV1 = {
      ...commit,
      external_record_id: null,
      errors: isBusinessCommitSuccess(commit)
        ? []
        : [
            commit.readback_status === 'FAILED'
              ? 'Feishu readback verification failed.'
              : 'Feishu write failed.',
          ],
    };
    if (isBusinessCommitSuccess(safeCommit)) {
      state.lastSuccessfulWriteAt = now().toISOString();
      delete state.error;
      return ready({ value, commit: safeCommit });
    }
    state.error = safeError(
      safeCommit.readback_status === 'FAILED' ? 'FEISHU_READBACK_FAILED' : 'FEISHU_WRITE_FAILED',
      safeCommit.readback_status === 'FAILED'
        ? 'Connected Feishu readback verification failed.'
        : 'Connected Feishu write failed.',
    );
    return failed(state.error.code, state.error.message, { commit: safeCommit });
  }

  async function runWrite<T>(
    call: () => Promise<{ value: T; commit: CommitResultV1 }>,
  ): Promise<ConnectedEnvelope<ConnectedWriteData<T>>> {
    if (!repo || !writesEnabled) return blockedWrite<T>();
    const startedAt = Date.now();
    try {
      const result = await call();
      return writeResult(result.value, result.commit, startedAt);
    } catch {
      state.latencyBucket = latencyBucket(Date.now() - startedAt);
      state.lastReadbackStatus = 'NOT_RUN';
      state.error = safeError('FEISHU_WRITE_FAILED', 'Connected Feishu write failed.');
      return failed('FEISHU_WRITE_FAILED', 'Connected Feishu write failed.');
    }
  }

  const runtime: Promise<ConnectedEnvelope<RuntimeIdentityView>> = Promise.resolve(
    adapter
      ? ready({
          mode: CONNECTED_MODE,
          buildSha,
          connectionSummary: 'Server-side Connected Feishu data source',
        })
      : blocked(
          'FEISHU_CONFIGURATION_MISSING',
          'Connected Feishu configuration is unavailable.',
        ),
  );

  const source: ConnectedFeishuDataSource = {
    runtime,
    health,
    listProjects: (opts) => runRead(async () => {
      const projects = await read!.listProjects(opts);
      const workspaces = await Promise.all(
        projects.map((project) => read!.getProjectWorkspace(project.project_id)),
      );
      return workspaces.filter((workspace): workspace is ProjectWorkspace => workspace !== null);
    }),
    getProject: (projectId) => runRead(() => read!.getProjectWorkspace(projectId)),
    getProjectAggregate: (projectId) => runRead(() => read!.getProjectWorkspace(projectId)),
    getProjectRecord: (projectId) => runRead(() => repo!.getProject(projectId)),
    getCustomer: (customerId) => runRead(() => repo!.getCustomer(customerId)),
    getLead: (leadId) => runRead(() => repo!.getLead(leadId)),
    getTask: (taskId) => runRead(() => repo!.getTask(taskId)),
    getAsset: (assetId) => runRead(() => repo!.getAsset(assetId)),
    createCustomer: (input) => runWrite(async () => {
      const result = await repo!.createCustomer(input);
      return { value: result.customer, commit: result.commit };
    }),
    createLead: (input) => runWrite(async () => {
      const result = await repo!.createLead(input);
      return { value: result.lead, commit: result.commit };
    }),
    createProject: (input) => runWrite(async () => {
      const result = await repo!.createProject(input);
      return { value: result.project, commit: result.commit };
    }),
    createTask: (input) => runWrite(async () => {
      const result = await repo!.createTask(input);
      return { value: result.task, commit: result.commit };
    }),
    createAsset: (input) => runWrite(async () => {
      const result = await repo!.createAsset(input);
      return { value: result.asset, commit: result.commit };
    }),
    updateLeadStatus: (leadId, status) => runWrite(async () => {
      const result = await repo!.updateLeadStatus(leadId, status);
      return { value: result.lead, commit: result.commit };
    }),
    updateTaskStatus: (taskId, status) => runWrite(async () => {
      const result = await repo!.updateTaskStatus(taskId, status);
      return { value: result.task, commit: result.commit };
    }),
  };

  return source;
}
