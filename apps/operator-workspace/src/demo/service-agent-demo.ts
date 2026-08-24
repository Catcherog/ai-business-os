/**
 * Service Agent — browser DEMO data channel (BUSOS-R2-BATCH1-PRODUCT-INTEGRATION-CORR-01).
 *
 * The Operator Workspace SPA runs entirely in-browser against the in-memory
 * Fake adapters; the real Service Agent (LangGraph / SCS) is a server-only
 * boundary that this batch is NOT authorized to bind to production. To make the
 * Service Agent surface a *real, clickable, verifiable* product surface in DEMO
 * mode, this module:
 *
 *   1. reuses the real orchestrator `runServiceAgentConsultation` (no second
 *      implementation of the consultation pipeline), and
 *   2. feeds it a deterministic, browser-safe `ServiceAgentPort` stand-in whose
 *      structured output honours every closed enum the consumer expects
 *      (intent / risk / route / handoff / evidence / trace).
 *
 * The shared `ProcessRegistry` (from `getActionRegistry()`) backs the run, so a
 * consultation produces a canonical Run that is visible on the Runs surface and
 * the conversation's Run link (`#/runs/<processId>`) resolves for real.
 */
import { runServiceAgentConsultation, InMemoryProcessRegistry, type ProcessRegistry, type ProcessRegistryReadPort } from '@busos/orchestrator';
import type {
  ServiceAgentPort,
  ServiceAgentRunInput,
  ServiceAgentRunResult,
  ServiceAgentConversationRecord,
  ServiceAgentConversationRunSummary,
  ServiceAgentConversationListOptions,
} from '@busos/service-agent-port';
import type {
  ServiceAgentClient,
  ServiceAgentConsultationInput,
  ServiceAgentConsultationResult,
  ServiceAgentRunRead,
} from '../features/service-agent/index.js';
import { getActionRegistry } from '../api.js';

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString().padStart(4, '0')}`;
}

/** Deterministic DEMO port — no network, no credentials, no Python bridge. */
export function createDemoServiceAgentPort(): ServiceAgentPort {
  return {
    async run(input: ServiceAgentRunInput): Promise<ServiceAgentRunResult> {
      const q = input.query.toLowerCase();
      const wantsHandoff = /退款|投诉|隐私|人工|account|refund|complaint|human|删除|注销/.test(q);
      const runId = nextId('sa_run');
      const requestId = nextId('sa_req');
      const conversationId = input.conversationId ?? `conv_demo`;
      if (wantsHandoff) {
        return {
          answer: '该问题需要转人工处理，已为您生成工单，请等待专员跟进。',
          intent: 'I03',
          risk: 'R3',
          route: 'HUMAN_PATH',
          handoff: {
            mustHandoff: true,
            needsClarification: false,
            answerRequiresDisclaimer: false,
            needsHumanConfirm: true,
          },
          evidence: {
            sourceModules: ['governance.handoff'],
            sourceRefs: [],
            retrievalScore: 0,
            canonicalAnswerId: null,
            sourceBlockId: null,
            hasRetrievalEvidence: false,
          },
          trace: {
            runId,
            requestId,
            conversationId,
            latencyMs: 42,
            modelName: 'demo-port',
            llmUsed: false,
            promptVersion: 'demo-v1',
          },
        };
      }
      return {
        answer: `根据知识库，关于「${input.query}」的标准回复如下：本服务为演示数据，最终以人工复核为准。`,
        intent: 'I05',
        risk: 'R1',
        route: 'KB_PATH',
        handoff: {
          mustHandoff: false,
          needsClarification: false,
          answerRequiresDisclaimer: false,
          needsHumanConfirm: false,
        },
        evidence: {
          sourceModules: ['kb.product', 'kb.policy'],
          sourceRefs: [],
          retrievalScore: 0.87,
          canonicalAnswerId: 'ca_001',
          sourceBlockId: 'sb_001',
          hasRetrievalEvidence: true,
        },
        trace: {
          runId,
          requestId,
          conversationId,
          latencyMs: 31,
          modelName: 'demo-port',
          llmUsed: false,
          promptVersion: 'demo-v1',
        },
      };
    },
  };
}

function toRunRead(result: {
  processId: string;
  status: string;
  trace?: unknown[];
  output?: unknown;
}): ServiceAgentRunRead {
  return {
    processId: result.processId,
    status: result.status,
    completedStages: [],
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: 0,
    trace: Array.isArray(result.trace) ? result.trace : [],
    ...(result.output ? { output: result.output as Record<string, unknown> } : {}),
  } as ServiceAgentRunRead;
}

function toConversationRecord(
  input: ServiceAgentConsultationInput,
  run: ReturnType<typeof runServiceAgentConsultation> extends Promise<infer R> ? R : never,
  answer: string,
): ServiceAgentConversationRecord {
  const agent = run.output?.serviceAgent;
  const conversationId = agent?.trace.conversationId ?? `conv_demo`;
  // Narrow cast (per the task's permitted pattern): the runtime contract already
  // guarantees the structure — the orchestrator's `ServiceAgentOutputSummary` is
  // projected from the port's closed-enum `ServiceAgentRunResult`, and the DEMO
  // port only emits valid enums — but `ServiceAgentOutputSummary` types risk /
  // route as plain strings, so TypeScript cannot infer the port's closed enum
  // types. The narrow cast is applied to the whole, otherwise-exact object.
  const lastRun: ServiceAgentConversationRunSummary | null = agent
    ? ({
        processId: run.processId,
        status: run.status,
        runId: agent.trace.runId,
        requestId: agent.trace.requestId,
        conversationId: agent.trace.conversationId,
        answer: agent.answer,
        intent: agent.intent,
        risk: agent.risk,
        route: agent.route,
        handoff: agent.handoff,
        evidence: agent.evidence,
      } as ServiceAgentConversationRunSummary)
    : null;
  return {
    conversationId,
    ...(input.customerId ? { customerId: input.customerId } : {}),
    turns: [
      { role: 'user', content: input.query },
      { role: 'assistant', content: answer },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastRun,
  };
}

/**
 * In-browser Service Agent client. Implements the exact `ServiceAgentClient`
 * contract consumed by `createServiceAgentFeature`, so the existing feature /
 * model / view code is reused unchanged — only the transport is an in-page
 * deterministic run instead of an HTTP call.
 */
export function createDemoServiceAgentClient(): ServiceAgentClient {
  const conversations = new Map<string, ServiceAgentConversationRecord>();
  // Real narrowing: the shared registry is created as `InMemoryProcessRegistry`
  // (implements BOTH the writable and the read port), so `instanceof` proves the
  // read-side methods without any cast.
  const actionRegistry = getActionRegistry();
  if (!(actionRegistry instanceof InMemoryProcessRegistry)) {
    throw new Error('DEMO Service Agent requires the shared InMemoryProcessRegistry (initWorkspace first).');
  }
  const registry: ProcessRegistry & ProcessRegistryReadPort = actionRegistry;
  const port = createDemoServiceAgentPort();

  return {
    async consult(input: ServiceAgentConsultationInput): Promise<ServiceAgentConsultationResult> {
      const run = await runServiceAgentConsultation(
        {
          query: input.query,
          ...(input.customerId ? { customerId: input.customerId } : {}),
        },
        { serviceAgent: port, processRegistry: registry },
        { idempotencyKey: input.idempotencyKey },
      );
      const answer = run.output?.serviceAgent?.answer ?? '';
      const record = toConversationRecord(input, run, answer);
      conversations.set(record.conversationId, record);
      return {
        run: toRunRead(run),
        conversation: record,
      };
    },
    async listConversations(options?: ServiceAgentConversationListOptions) {
      const all = [...conversations.values()];
      const filtered = options?.customerId
        ? all.filter((c) => c.customerId === options.customerId)
        : all;
      return filtered.slice(0, options?.limit ?? filtered.length);
    },
    async getConversation(conversationId: string) {
      return conversations.get(conversationId) ?? null;
    },
    async listRuns() {
      const records = await registry.listExecutions();
      const runs: ServiceAgentRunRead[] = [];
      for (const rec of records) {
        if (rec.result) runs.push(toRunRead(rec.result));
      }
      return runs;
    },
    async getRun(processId: string) {
      const rec = await registry.getByProcessId(processId);
      return rec?.result ? toRunRead(rec.result) : null;
    },
  };
}
