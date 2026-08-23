import type { ServiceAgentConversationRecord } from '@busos/service-agent-port';
import type { ServiceAgentRunRead } from './service-agent-client.js';

export interface ServiceAgentFeatureContext {
  customerId?: string;
  projectId?: string;
  memoryRefs?: string[];
}

export interface ServiceAgentEvidenceView {
  sourceModules: string[];
  retrievalScore: number;
  canonicalAnswerId: string | null;
  sourceBlockId: string | null;
  hasRetrievalEvidence: boolean;
}

export interface ServiceAgentHandoffView {
  state: string;
  requiresHuman: boolean;
  mustHandoff: boolean;
  needsHumanConfirm: boolean;
  needsClarification: boolean;
}

export interface ServiceAgentConversationViewModel {
  conversationId: string;
  customerId?: string;
  context: ServiceAgentFeatureContext;
  answer: string;
  intent: string | null;
  risk: string | null;
  route: string | null;
  evidence: ServiceAgentEvidenceView;
  handoff: ServiceAgentHandoffView;
  latencyMs: number | null;
  runLink: { processId: string; runId: string | null; href: string } | null;
  status: string;
}

function serviceAgentOutput(run: ServiceAgentRunRead | undefined): Record<string, any> | undefined {
  const output = run?.output;
  if (!output || typeof output !== 'object') return undefined;
  const agent = output.serviceAgent;
  return agent && typeof agent === 'object' ? agent as Record<string, any> : undefined;
}

function fallbackEvidence(lastRun: ServiceAgentConversationRecord['lastRun']): ServiceAgentEvidenceView {
  return lastRun?.evidence ?? {
    sourceModules: [],
    retrievalScore: 0,
    canonicalAnswerId: null,
    sourceBlockId: null,
    hasRetrievalEvidence: false,
  };
}

export function serviceAgentConversationViewModel(
  conversation: ServiceAgentConversationRecord,
  options: { run?: ServiceAgentRunRead; context?: ServiceAgentFeatureContext } = {},
): ServiceAgentConversationViewModel {
  const lastRun = conversation.lastRun;
  const agent = serviceAgentOutput(options.run);
  const handoff = agent?.handoff ?? lastRun?.handoff;
  const status = options.run?.status ?? lastRun?.status ?? 'UNKNOWN';
  const state = status;
  const runId = agent?.trace?.runId ?? lastRun?.runId ?? null;
  const processId = options.run?.processId ?? lastRun?.processId;
  return {
    conversationId: conversation.conversationId,
    ...(conversation.customerId ? { customerId: conversation.customerId } : {}),
    context: {
      ...(conversation.customerId ? { customerId: conversation.customerId } : {}),
      ...(options.context?.projectId ? { projectId: options.context.projectId } : {}),
      ...(options.context?.memoryRefs ? { memoryRefs: [...options.context.memoryRefs] } : {}),
    },
    answer: agent?.answer ?? lastRun?.answer ?? conversation.turns.at(-1)?.content ?? '',
    intent: agent?.intent ?? lastRun?.intent ?? null,
    risk: agent?.risk ?? lastRun?.risk ?? null,
    route: agent?.route ?? lastRun?.route ?? null,
    evidence: agent?.evidence ?? fallbackEvidence(lastRun),
    handoff: {
      state,
      requiresHuman: Boolean(handoff?.mustHandoff || handoff?.needsHumanConfirm || handoff?.needsClarification),
      mustHandoff: Boolean(handoff?.mustHandoff),
      needsHumanConfirm: Boolean(handoff?.needsHumanConfirm),
      needsClarification: Boolean(handoff?.needsClarification),
    },
    latencyMs: agent?.trace?.latencyMs ?? null,
    runLink: processId ? { processId, runId, href: `#/runs/${encodeURIComponent(processId)}` } : null,
    status,
  };
}

export interface CandidateReviewAction {
  kind: 'GENERATE_CANDIDATE';
  entry: 'GOVERNANCE_REVIEW';
  conversationId: string;
  processId: string | null;
  customerId?: string;
  projectId?: string;
  memoryRefs?: string[];
}

export function createCandidateReviewAction(
  model: ServiceAgentConversationViewModel,
  context: ServiceAgentFeatureContext = model.context,
): CandidateReviewAction {
  return {
    kind: 'GENERATE_CANDIDATE',
    entry: 'GOVERNANCE_REVIEW',
    conversationId: model.conversationId,
    processId: model.runLink?.processId ?? null,
    ...(model.customerId ? { customerId: model.customerId } : {}),
    ...(context.projectId ? { projectId: context.projectId } : {}),
    ...(context.memoryRefs ? { memoryRefs: [...context.memoryRefs] } : {}),
  };
}
