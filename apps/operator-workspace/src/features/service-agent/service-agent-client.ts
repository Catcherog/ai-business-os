import type {
  ServiceAgentConversationListOptions,
  ServiceAgentConversationRecord,
} from '@busos/service-agent-port';

export interface ServiceAgentRunRead {
  processId: string;
  status: string;
  completedStages: string[];
  startedAt: string;
  endedAt?: string | null;
  durationMs?: number | null;
  output?: Record<string, unknown>;
  trace: unknown[];
  [key: string]: unknown;
}

export interface ServiceAgentConsultationInput {
  query: string;
  idempotencyKey: string;
  customerId?: string;
}

export interface ServiceAgentConsultationResult {
  run: ServiceAgentRunRead;
  conversation: ServiceAgentConversationRecord;
}

export class ServiceAgentClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ServiceAgentClientError';
  }
}

export interface ServiceAgentClientOptions {
  baseUrl?: string;
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
}

export interface ServiceAgentClient {
  listConversations(options?: ServiceAgentConversationListOptions): Promise<ServiceAgentConversationRecord[]>;
  getConversation(conversationId: string): Promise<ServiceAgentConversationRecord | null>;
  consult(input: ServiceAgentConsultationInput): Promise<ServiceAgentConsultationResult>;
  listRuns(): Promise<ServiceAgentRunRead[]>;
  getRun(processId: string): Promise<ServiceAgentRunRead | null>;
}

interface ServiceAgentResponse {
  status?: 'READY' | 'ERROR';
  data?: unknown;
  error?: { code?: string; message?: string };
}

function joinUrl(baseUrl: string, path: string): string {
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new ServiceAgentClientError(
    'Service Agent response failed contract validation.',
    'SERVICE_AGENT_INVALID_RESPONSE',
  );
  return value;
}

function assertConversation(value: unknown): ServiceAgentConversationRecord {
  const record = assertRecord(value);
  if (typeof record.conversationId !== 'string' || !Array.isArray(record.turns)) {
    throw new ServiceAgentClientError(
      'Service Agent response failed contract validation.',
      'SERVICE_AGENT_INVALID_RESPONSE',
    );
  }
  return record as unknown as ServiceAgentConversationRecord;
}

function assertRun(value: unknown): ServiceAgentRunRead {
  const record = assertRecord(value);
  if (typeof record.processId !== 'string' || typeof record.status !== 'string') {
    throw new ServiceAgentClientError(
      'Service Agent response failed contract validation.',
      'SERVICE_AGENT_INVALID_RESPONSE',
    );
  }
  return record as ServiceAgentRunRead;
}

function assertConsultation(value: unknown): ServiceAgentConsultationResult {
  const record = assertRecord(value);
  return {
    run: assertRun(record.run),
    conversation: assertConversation(record.conversation),
  };
}

function assertArray<T>(value: unknown, item: (value: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new ServiceAgentClientError(
    'Service Agent response failed contract validation.',
    'SERVICE_AGENT_INVALID_RESPONSE',
  );
  return value.map(item);
}

export function createServiceAgentClient(
  options: ServiceAgentClientOptions = {},
): ServiceAgentClient {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const baseUrl = options.baseUrl ?? '';

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    let body: ServiceAgentResponse;
    try {
      response = await fetchImpl(joinUrl(baseUrl, path), init);
      body = await response.json() as ServiceAgentResponse;
    } catch {
      throw new ServiceAgentClientError(
        'Service Agent request failed.',
        'SERVICE_AGENT_TRANSPORT_ERROR',
      );
    }
    if (body.status === 'ERROR' || !response.ok) {
      throw new ServiceAgentClientError(
        body.error?.message ?? 'Service Agent request failed.',
        body.error?.code ?? 'SERVICE_AGENT_REQUEST_ERROR',
      );
    }
    if (body.status !== 'READY' || body.data === undefined) {
      throw new ServiceAgentClientError(
        'Service Agent response failed contract validation.',
        'SERVICE_AGENT_INVALID_RESPONSE',
      );
    }
    return body.data as T;
  }

  const json = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  return {
    listConversations: async (options = {}) => {
      const query = new URLSearchParams();
      if (options.customerId) query.set('customerId', options.customerId);
      if (options.limit != null) query.set('limit', String(options.limit));
      const suffix = query.toString() ? `?${query.toString()}` : '';
      return assertArray(await request<unknown[]>(`/api/service-agent/conversations${suffix}`), assertConversation);
    },
    getConversation: async (conversationId) => {
      try {
        return assertConversation(await request(`/api/service-agent/conversations/${encodeURIComponent(conversationId)}`));
      } catch (error) {
        if (error instanceof ServiceAgentClientError && error.code === 'SERVICE_AGENT_NOT_FOUND') return null;
        throw error;
      }
    },
    consult: async (input) => assertConsultation(await request(
      '/api/service-agent/consultations',
      json({ query: input.query, customerId: input.customerId, idempotencyKey: input.idempotencyKey }),
    )),
    listRuns: async () => assertArray(await request<unknown[]>('/api/service-agent/runs'), assertRun),
    getRun: async (processId) => {
      try {
        const data = await request<unknown>(`/api/service-agent/runs/${encodeURIComponent(processId)}`);
        return data === null ? null : assertRun(data);
      } catch (error) {
        if (error instanceof ServiceAgentClientError && error.code === 'SERVICE_AGENT_NOT_FOUND') return null;
        throw error;
      }
    },
  };
}
