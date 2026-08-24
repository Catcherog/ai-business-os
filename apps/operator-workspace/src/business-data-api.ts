import type {
  AvailabilitySlot,
  Project,
  ProjectAssignment,
  ProjectRequirement,
  Resource,
} from '@busos/contracts';

export const CONNECTED_SOURCE = 'FEISHU_NEW_BASE' as const;

export interface ProjectContext {
  project: Project;
  requirements: ProjectRequirement[];
  assignments: ProjectAssignment[];
  resources: Resource[];
}

export type ApiEnvelope<T> =
  | { mode: 'BLOCKED'; reason: string }
  | { mode: 'CONNECTED'; source: typeof CONNECTED_SOURCE; data: T; nextCursor?: string | null }
  | { mode: 'CONNECTED'; source: typeof CONNECTED_SOURCE; error: { code: string; message: string } };

export class ConnectedApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectedApiError';
  }
}

export interface BusinessDataClient {
  listProjects(query?: { limit?: number; cursor?: string }): Promise<ApiEnvelope<Project[]>>;
  listResources(query?: { type?: string; status?: string; limit?: number; cursor?: string }): Promise<ApiEnvelope<Resource[]>>;
  listAvailability(resourceKey: string, query: { start: string; end: string; limit?: number }): Promise<ApiEnvelope<AvailabilitySlot[]>>;
  getProjectContext(projectId: string): Promise<ApiEnvelope<ProjectContext | null>>;
  propose(body: {
    projectId: string;
    start: string;
    end: string;
    durationHours?: number;
    location?: string;
    preferredResourceKeys?: string[];
  }): Promise<ApiEnvelope<import('@busos/scheduling').SchedulingProposal[]>>;
  draft(body: {
    projectId: string;
    resourceKey: string;
    requirementId?: string;
    audience?: string;
    scene?: string;
  }): Promise<ApiEnvelope<import('@busos/scheduling').OutreachDraft>>;
}

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export function createBusinessDataClient(baseUrl = ''): BusinessDataClient {
  async function request<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, init);
    } catch {
      throw new ConnectedApiError('Connected API unavailable.');
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ConnectedApiError('Connected API returned an invalid response.');
    }
    if (!response.ok) {
      const error = body && typeof body === 'object' && 'error' in body
        ? (body as { error?: { message?: unknown } }).error?.message
        : undefined;
      throw new ConnectedApiError(typeof error === 'string' ? error : `Connected API request failed (${response.status}).`);
    }
    return body as ApiEnvelope<T>;
  }

  return {
    listProjects: (query = {}) => request<Project[]>(`/api/business-data/projects${queryString(query)}`),
    listResources: (query = {}) => request<Resource[]>(`/api/business-data/resources${queryString(query)}`),
    listAvailability: (resourceKey, query) => request<AvailabilitySlot[]>(
      `/api/business-data/resources/${encodeURIComponent(resourceKey)}/availability${queryString(query)}`,
    ),
    getProjectContext: (projectId) => request<ProjectContext | null>(
      `/api/business-data/projects/${encodeURIComponent(projectId)}/context`,
    ),
    propose: (body) => request<import('@busos/scheduling').SchedulingProposal[]>('/api/scheduling/proposals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    draft: (body) => request<import('@busos/scheduling').OutreachDraft>('/api/outreach/draft', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  };
}
