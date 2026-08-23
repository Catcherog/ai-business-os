import { randomUUID } from 'node:crypto';

import {
  assertServiceAgentConsultationInput,
  sanitizeServiceAgentContent,
  type ServiceAgentConversationListOptions,
  type ServiceAgentConversationRecord,
  type ServiceAgentConversationRunSummary,
  type ServiceAgentConversationStore,
  type ServiceAgentPort,
} from '@busos/service-agent-port';
import {
  runServiceAgentConsultation,
  sanitizeMessage,
  sanitizeTraceMetadata,
  type BusinessProcessResult,
  type ProcessExecutionRecord,
  type ProcessRegistry,
  type ProcessRegistryReadPort,
} from '@busos/orchestrator';

export interface ServiceAgentRuntimeDeps {
  serviceAgent: ServiceAgentPort;
  conversationStore: ServiceAgentConversationStore;
  processRegistry: ProcessRegistry & ProcessRegistryReadPort;
  now?: () => Date;
}

export interface ServiceAgentConsultationResult {
  run: BusinessProcessResult;
  conversation: ServiceAgentConversationRecord;
}

/** Read-only projection for the Service Agent run endpoint. */
export type ServiceAgentRunRead = Omit<
  BusinessProcessResult,
  'idempotencyKey' | 'output' | 'error' | 'rejection'
> & {
  output?: BusinessProcessResult['output'];
  error?: BusinessProcessResult['error'];
  rejection?: BusinessProcessResult['rejection'];
};

export interface ServiceAgentEndpointRequest {
  method: 'GET' | 'POST';
  pathname: string;
  body?: unknown;
}

export type ServiceAgentEndpointBody =
  | { status: 'READY'; data: unknown }
  | { status: 'ERROR'; error: { code: string; message: string } };

export interface ServiceAgentEndpointResponse {
  statusCode: number;
  body: ServiceAgentEndpointBody;
}

function optionalCustomerId(
  customerId: string | undefined,
): { customerId: string } | Record<string, never> {
  return customerId ? { customerId } : {};
}

function toServiceAgentRunRead(result: BusinessProcessResult): ServiceAgentRunRead {
  const output = result.output
    ? {
        ...optionalCustomerId(result.output.customerId),
        ...(result.output.serviceAgent
          ? {
              serviceAgent: {
                ...result.output.serviceAgent,
                answer: sanitizeServiceAgentContent(result.output.serviceAgent.answer, 1000),
              },
            }
          : {}),
      }
    : undefined;

  const trace = result.trace.map((event) => ({
    ...event,
    ...(event.metadata
      ? { metadata: sanitizeTraceMetadata(event.metadata) }
      : {}),
    ...(event.error
      ? { error: { ...event.error, message: sanitizeMessage(event.error.message) } }
      : {}),
  }));

  return {
    processId: result.processId,
    status: result.status,
    ...('currentStage' in result && result.currentStage
      ? { currentStage: result.currentStage }
      : {}),
    completedStages: [...result.completedStages],
    startedAt: result.startedAt,
    endedAt: result.endedAt,
    durationMs: result.durationMs,
    ...(output ? { output } : {}),
    ...(result.error
      ? { error: { ...result.error, message: sanitizeMessage(result.error.message) } }
      : {}),
    ...(result.rejection
      ? { rejection: { ...result.rejection, message: sanitizeMessage(result.rejection.message) } }
      : {}),
    trace,
  };
}

function runningRead(record: ProcessExecutionRecord): ServiceAgentRunRead {
  return {
    processId: record.processId,
    status: record.status,
    ...(record.currentStage ? { currentStage: record.currentStage } : {}),
    completedStages: [],
    startedAt: record.startedAt,
    endedAt: record.updatedAt,
    durationMs: 0,
    trace: [],
  };
}

function isServiceAgentExecution(record: ProcessExecutionRecord): boolean {
  return record.currentStage === 'SERVICE_AGENT' ||
    record.result?.output?.serviceAgent !== undefined ||
    record.result?.trace.some((event) => event.stage === 'SERVICE_AGENT') === true;
}

function toConversationRunSummary(
  result: BusinessProcessResult,
  conversationId: string,
): ServiceAgentConversationRunSummary {
  const agent = result.output?.serviceAgent;
  return {
    processId: result.processId,
    status: result.status,
    runId: agent?.trace.runId ?? null,
    requestId: agent?.trace.requestId ?? null,
    conversationId: agent?.trace.conversationId ?? conversationId,
    answer: agent ? sanitizeServiceAgentContent(agent.answer, 1000) : null,
    intent: agent?.intent ?? null,
    risk: agent?.risk === 'R0' || agent?.risk === 'R1' || agent?.risk === 'R2' || agent?.risk === 'R3'
      ? agent.risk
      : null,
    route: agent?.route === 'KB_PATH' || agent?.route === 'HUMAN_PATH'
      ? agent.route
      : null,
    handoff: agent?.handoff ?? null,
    evidence: agent
      ? {
          sourceModules: agent.evidence.sourceModules.slice(0, 50),
          retrievalScore: agent.evidence.retrievalScore,
          canonicalAnswerId: agent.evidence.canonicalAnswerId,
          sourceBlockId: agent.evidence.sourceBlockId,
          hasRetrievalEvidence: agent.evidence.hasRetrievalEvidence,
        }
      : null,
  };
}

function cloneTurns(
  turns: ServiceAgentConversationRecord['turns'] | undefined,
): ServiceAgentConversationRecord['turns'] {
  return (turns ?? []).map((turn) => ({
    role: turn.role,
    content: sanitizeServiceAgentContent(turn.content),
  }));
}

export class ServiceAgentRuntime {
  private readonly now: () => Date;

  constructor(private readonly deps: ServiceAgentRuntimeDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async consult(input: unknown): Promise<ServiceAgentConsultationResult> {
    const request = assertServiceAgentConsultationInput(input);
    const existing = request.conversationId
      ? await this.deps.conversationStore.get(request.conversationId)
      : null;
    const requestedConversationId = request.conversationId ?? `conv_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const storedContext = existing?.turns;
    const context = request.conversation ?? storedContext;
    const customerId = request.customerId ?? existing?.customerId;

    const run = await runServiceAgentConsultation(
      {
        query: request.query,
        conversationId: requestedConversationId,
        ...optionalCustomerId(customerId),
        ...(context && context.length > 0 ? { conversation: context } : {}),
        ...(request.topK == null ? {} : { topK: request.topK }),
      },
      {
        serviceAgent: this.deps.serviceAgent,
        processRegistry: this.deps.processRegistry,
      },
      { idempotencyKey: request.idempotencyKey },
    );

    const conversationId = run.output?.serviceAgent?.trace.conversationId ?? requestedConversationId;
    const canonicalExisting = existing ?? (
      conversationId === requestedConversationId
        ? null
        : await this.deps.conversationStore.get(conversationId)
    );
    const canonicalCustomerId = request.customerId ?? canonicalExisting?.customerId;
    let turns = cloneTurns(canonicalExisting?.turns ?? request.conversation);
    if (!run.deduplicated) {
      turns = [
        ...turns,
        { role: 'user' as const, content: sanitizeServiceAgentContent(request.query) },
        ...(run.output?.serviceAgent
          ? [{
              role: 'assistant' as const,
              content: sanitizeServiceAgentContent(run.output.serviceAgent.answer, 2000),
            }]
          : []),
      ].slice(-20);
    }

    const timestamp = this.now().toISOString();
    const conversation: ServiceAgentConversationRecord = {
      conversationId,
      ...optionalCustomerId(canonicalCustomerId),
      turns,
      createdAt: canonicalExisting?.createdAt ?? timestamp,
      updatedAt: timestamp,
      lastRun: toConversationRunSummary(run, conversationId),
    };
    await this.deps.conversationStore.save(conversation);

    return {
      run,
      conversation: (await this.deps.conversationStore.get(conversationId)) ?? conversation,
    };
  }

  listConversations(options?: ServiceAgentConversationListOptions) {
    return this.deps.conversationStore.list(options);
  }

  getConversation(conversationId: string) {
    return this.deps.conversationStore.get(conversationId);
  }

  async listRuns(options?: { limit?: number }): Promise<ServiceAgentRunRead[]> {
    const records = await this.deps.processRegistry.listExecutions(options);
    return records
      .filter(isServiceAgentExecution)
      .map((record) => record.result ? toServiceAgentRunRead(record.result) : runningRead(record));
  }

  async getRun(processId: string): Promise<ServiceAgentRunRead | null> {
    const record = await this.deps.processRegistry.getByProcessId(processId);
    if (!record || !isServiceAgentExecution(record)) return null;
    return record.result ? toServiceAgentRunRead(record.result) : runningRead(record);
  }
}

function ready(data: unknown, statusCode = 200): ServiceAgentEndpointResponse {
  return { statusCode, body: { status: 'READY', data } };
}

function errorResponse(
  statusCode: number,
  code: string,
  message: string,
): ServiceAgentEndpointResponse {
  return { statusCode, body: { status: 'ERROR', error: { code, message } } };
}

function isValidationError(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    Array.isArray((error as { issues?: unknown }).issues);
}

function decodeId(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/**
 * Transport-neutral server feature. The coordinator may register this handler
 * in the shared HTTP router later; this lane deliberately does not edit it.
 */
export function createServiceAgentEndpoint(
  runtime: ServiceAgentRuntime,
): (request: ServiceAgentEndpointRequest) => Promise<ServiceAgentEndpointResponse> {
  return async (request) => {
    const url = new URL(request.pathname, 'http://service-agent.local');
    const parts = url.pathname.split('/').filter(Boolean);

    if (request.method === 'POST' && url.pathname === '/api/service-agent/consultations') {
      try {
        const result = await runtime.consult(request.body);
        return ready({
          run: toServiceAgentRunRead(result.run),
          conversation: result.conversation,
        });
      } catch (error) {
        return isValidationError(error)
          ? errorResponse(422, 'SERVICE_AGENT_INVALID_REQUEST', 'Invalid consultation request.')
          : errorResponse(500, 'SERVICE_AGENT_RUNTIME_ERROR', 'Service Agent consultation failed.');
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/service-agent/conversations') {
      const limitValue = url.searchParams.get('limit');
      const limit = limitValue == null ? undefined : Number(limitValue);
      return ready(await runtime.listConversations({
        customerId: url.searchParams.get('customerId') ?? undefined,
        ...(limit == null || !Number.isFinite(limit) ? {} : { limit }),
      }));
    }

    if (request.method === 'GET' && parts[0] === 'api' && parts[1] === 'service-agent' &&
      parts[2] === 'conversations' && parts.length === 4) {
      const id = decodeId(parts[3]!);
      if (!id) return errorResponse(400, 'SERVICE_AGENT_INVALID_ID', 'Invalid conversation identifier.');
      const conversation = await runtime.getConversation(id);
      return conversation
        ? ready(conversation)
        : errorResponse(404, 'SERVICE_AGENT_NOT_FOUND', 'Conversation not found.');
    }

    if (request.method === 'GET' && url.pathname === '/api/service-agent/runs') {
      return ready(await runtime.listRuns());
    }

    if (request.method === 'GET' && parts[0] === 'api' && parts[1] === 'service-agent' &&
      parts[2] === 'runs' && parts.length === 4) {
      const id = decodeId(parts[3]!);
      if (!id) return errorResponse(400, 'SERVICE_AGENT_INVALID_ID', 'Invalid run identifier.');
      const run = await runtime.getRun(id);
      return run
        ? ready(run)
        : errorResponse(404, 'SERVICE_AGENT_NOT_FOUND', 'Run not found.');
    }

    return errorResponse(404, 'SERVICE_AGENT_ROUTE_NOT_FOUND', 'Service Agent route not found.');
  };
}
