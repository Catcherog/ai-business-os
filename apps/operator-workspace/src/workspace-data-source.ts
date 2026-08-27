import type { ProjectWorkspace } from '@busos/workspace-read';
import type { Project } from '@busos/contracts';
import type {
  EditPatch,
  ReviewCase,
} from '@busos/workspace-review';
import type {
  RunDetail,
  RunSummary,
} from '@busos/workspace-run';

export type WorkspaceMode = 'DEMO' | 'CONNECTED' | 'LIVE' | 'BLOCKED';
export type WorkspaceStatus = 'READY' | 'BLOCKED' | 'ERROR';

export interface RuntimeIdentityView {
  mode: WorkspaceMode;
  buildSha: string;
  connectionSummary: string;
}

export interface WorkspaceEnvelope<T> {
  mode: WorkspaceMode;
  buildSha: string;
  status: WorkspaceStatus;
  data?: T;
  error?: { code: string; message: string };
}

export type ReviewDecisionAction = 'APPROVE' | 'EDIT_APPROVE' | 'REJECT';

export interface ReviewDecisionInput {
  caseId: string;
  action: ReviewDecisionAction;
  patch?: EditPatch;
  note?: string | null;
}

export interface WorkspaceDataSource {
  runtime: Promise<WorkspaceEnvelope<RuntimeIdentityView>>;
  listProjects(): Promise<WorkspaceEnvelope<ProjectWorkspace[]>>;
  getProject(projectId: string): Promise<WorkspaceEnvelope<ProjectWorkspace | null>>;
  listReviews(): Promise<WorkspaceEnvelope<ReviewCase[]>>;
  getReview(caseId: string): Promise<WorkspaceEnvelope<ReviewCase | null>>;
  decideReview(input: ReviewDecisionInput): Promise<WorkspaceEnvelope<ReviewCase>>;
  listRuns(): Promise<WorkspaceEnvelope<RunSummary[]>>;
  getRun(processId: string): Promise<WorkspaceEnvelope<RunDetail | null>>;
}

export interface WorkspaceServiceSet {
  read: {
    listProjects(opts?: { limit?: number }): Promise<Project[]>;
    getProjectWorkspace(projectId: string): Promise<ProjectWorkspace | null>;
  };
  review: {
    listReviews(): ReviewCase[];
    getReview(caseId: string): ReviewCase | null;
    approve(caseId: string, note?: string | null): Promise<unknown>;
    editAndApprove(caseId: string, patch: EditPatch, note?: string | null): Promise<unknown>;
    reject(caseId: string, note?: string | null): Promise<unknown>;
  };
  run: {
    listRuns(opts?: { limit?: number }): Promise<RunSummary[]>;
    getRun(processId: string): Promise<RunDetail | null>;
  };
}

export interface DemoWorkspaceServiceSet {
  read: WorkspaceServiceSet['read'];
  review: WorkspaceServiceSet['review'];
  run: WorkspaceServiceSet['run'];
  buildSha: string;
}

function baseEnvelope<T>(
  mode: WorkspaceMode,
  buildSha: string,
  status: WorkspaceStatus,
  data?: T,
): WorkspaceEnvelope<T> {
  return { mode, buildSha, status, ...(data === undefined ? {} : { data }) };
}

export function workspaceReady<T>(
  mode: WorkspaceMode,
  buildSha: string,
  data: T,
): WorkspaceEnvelope<T> {
  return baseEnvelope(mode, buildSha, 'READY', data);
}

export function workspaceBlocked<T>(
  mode: WorkspaceMode,
  buildSha: string,
  message: string,
): WorkspaceEnvelope<T> {
  return {
    ...baseEnvelope<T>(mode, buildSha, 'BLOCKED'),
    error: { code: 'WORKSPACE_CONNECTED_BLOCKED', message },
  };
}

export function workspaceError<T>(
  mode: WorkspaceMode,
  buildSha: string,
  code = 'WORKSPACE_DATA_SOURCE_ERROR',
  message = 'Workspace data source request failed.',
): WorkspaceEnvelope<T> {
  return { ...baseEnvelope<T>(mode, buildSha, 'ERROR'), error: { code, message } };
}

function safeDemoCall<T>(
  buildSha: string,
  call: () => Promise<T> | T,
): Promise<WorkspaceEnvelope<T>> {
  return Promise.resolve()
    .then(call)
    .then((data) => workspaceReady('DEMO', buildSha, data))
    .catch(() => workspaceError('DEMO', buildSha));
}

export async function listProjectWorkspaces(
  read: WorkspaceServiceSet['read'],
): Promise<ProjectWorkspace[]> {
  const projects = await read.listProjects();
  const workspaces = await Promise.all(
    projects.map((project) => read.getProjectWorkspace(project.project_id)),
  );
  return workspaces.filter((workspace): workspace is ProjectWorkspace => workspace !== null);
}

/** Build the browser DEMO source around the existing canonical services. */
export function createDemoWorkspaceDataSource(options: DemoWorkspaceServiceSet): WorkspaceDataSource {
  const { read, review, run, buildSha } = options;
  return {
    runtime: Promise.resolve(workspaceReady('DEMO', buildSha, {
      mode: 'DEMO',
      buildSha,
      connectionSummary: 'In-memory demo data',
    })),
    listProjects: () => safeDemoCall(buildSha, () => listProjectWorkspaces(read)),
    getProject: (projectId) => safeDemoCall(buildSha, () => read.getProjectWorkspace(projectId)),
    listReviews: () => safeDemoCall(buildSha, () => review.listReviews()),
    getReview: (caseId) => safeDemoCall(buildSha, () => review.getReview(caseId)),
    decideReview: (input) => safeDemoCall(buildSha, async () => {
      switch (input.action) {
        case 'APPROVE':
          await review.approve(input.caseId, input.note);
          break;
        case 'EDIT_APPROVE':
          await review.editAndApprove(input.caseId, input.patch ?? {}, input.note);
          break;
        case 'REJECT':
          await review.reject(input.caseId, input.note);
          break;
      }
      const updated = review.getReview(input.caseId);
      if (!updated) throw new Error('Review case not found.');
      return updated;
    }),
    listRuns: () => safeDemoCall(buildSha, () => run.listRuns()),
    getRun: (processId) => safeDemoCall(buildSha, () => run.getRun(processId)),
  };
}

function joinUrl(baseUrl: string, path: string): string {
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

export interface ServerWorkspaceTransportOptions {
  baseUrl?: string;
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
}

/**
 * Browser-side CONNECTED transport. It accepts only canonical envelopes from
 * the server and never attempts a silent DEMO fallback on transport failure.
 */
export function createServerWorkspaceDataSource(
  options: ServerWorkspaceTransportOptions = {},
): WorkspaceDataSource {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const baseUrl = options.baseUrl ?? '';

  async function request<T>(path: string, init?: RequestInit): Promise<WorkspaceEnvelope<T>> {
    try {
      const response = await fetchImpl(joinUrl(baseUrl, path), init);
      const body = await response.json() as Partial<WorkspaceEnvelope<T>>;
      if (!response.ok) return workspaceError('CONNECTED', body.buildSha ?? 'unknown', 'WORKSPACE_HTTP_ERROR');
      if (
        (body.mode !== 'DEMO' && body.mode !== 'CONNECTED' && body.mode !== 'LIVE' && body.mode !== 'BLOCKED') ||
        (body.status !== 'READY' && body.status !== 'BLOCKED' && body.status !== 'ERROR') ||
        typeof body.buildSha !== 'string'
      ) {
        return workspaceError('CONNECTED', 'unknown', 'WORKSPACE_INVALID_ENVELOPE');
      }
      return body as WorkspaceEnvelope<T>;
    } catch {
      return workspaceError('CONNECTED', 'unknown');
    }
  }

  const json = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  return {
    runtime: request('/api/workspace/runtime'),
    listProjects: () => request('/api/workspace/projects'),
    getProject: (projectId) => request(`/api/workspace/projects/${encodeURIComponent(projectId)}`),
    listReviews: () => request('/api/workspace/reviews'),
    getReview: (caseId) => request(`/api/workspace/reviews/${encodeURIComponent(caseId)}`),
    decideReview: (input) => request(
      `/api/workspace/reviews/${encodeURIComponent(input.caseId)}/decision`,
      json({ action: input.action, patch: input.patch, note: input.note ?? null }),
    ),
    listRuns: () => request('/api/workspace/runs'),
    getRun: (processId) => request(`/api/workspace/runs/${encodeURIComponent(processId)}`),
  };
}

/** Convert a successful envelope into a view value; blocked/error stays explicit. */
export function unwrapWorkspaceEnvelope<T>(envelope: WorkspaceEnvelope<T>): T {
  if (envelope.status !== 'READY' || envelope.data === undefined) {
    throw new Error(envelope.error?.message ?? `Workspace data source is ${envelope.status}.`);
  }
  return envelope.data;
}
