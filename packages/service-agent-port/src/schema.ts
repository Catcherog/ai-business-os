import { z } from 'zod';

/**
 * BUSOS-R2-SCS-INTEGRATION-01 — ServiceAgentPort schema.
 *
 * The bounded cross-boundary contract between BUSOS and the frozen Service
 * Agent (`Catcherog/service-agent`, FREEZE_SHA ebb85686). BUSOS core depends
 * ONLY on this port — never on the agent's internal LangGraph implementation
 * (AC-01).
 *
 * Field provenance — Service Agent `AgentState`
 * (`src/langgraph/types/state.py`, 51 fields) and the 16-field API response
 * of `run_graph` (`src/langgraph/graph.py`) / `exit_node`
 * (`src/langgraph/nodes/n08_exit.py`):
 *
 *   AgentState.message            -> ServiceAgentRunInput.query
 *   AgentState.conversation_id    -> ServiceAgentRunInput.conversationId (passthrough)
 *   AgentState.customer_id        -> ServiceAgentRunInput.customerId (passthrough)
 *   AgentState.conversation_history -> ServiceAgentRunInput.conversation (bounded turns)
 *   AgentState.suggested_reply    -> ServiceAgentRunResult.answer
 *   AgentState.intent             -> ServiceAgentRunResult.intent (I00..I12)
 *   AgentState.risk_level         -> ServiceAgentRunResult.risk (R0..R3)
 *   AgentState.route_path         -> ServiceAgentRunResult.route (KB_PATH/HUMAN_PATH)
 *   AgentState.must_handoff       -> ServiceAgentRunResult.handoff.mustHandoff
 *   AgentState.needs_clarification -> ServiceAgentRunResult.handoff.needsClarification
 *   AgentState.answer_requires_disclaimer -> ServiceAgentRunResult.handoff.answerRequiresDisclaimer
 *   AgentState.needs_human_confirm -> ServiceAgentRunResult.handoff.needsHumanConfirm
 *   AgentState.review_reasons     -> ServiceAgentRunResult.reviewReasons
 *   AgentState.source_modules     -> ServiceAgentRunResult.evidence.sourceModules
 *   AgentState.source_refs        -> ServiceAgentRunResult.evidence.sourceRefs
 *   AgentState.retrieval_score    -> ServiceAgentRunResult.evidence.retrievalScore
 *   AgentState.canonical_answer_id -> ServiceAgentRunResult.evidence.canonicalAnswerId
 *   AgentState.source_block_id    -> ServiceAgentRunResult.evidence.sourceBlockId
 *   AgentState.run_id             -> ServiceAgentRunResult.trace.runId
 *   AgentState.request_id         -> ServiceAgentRunResult.trace.requestId
 *   AgentState.conversation_id    -> ServiceAgentRunResult.trace.conversationId
 *   AgentState.latency_ms         -> ServiceAgentRunResult.trace.latencyMs
 *   AgentState.model_name         -> ServiceAgentRunResult.trace.modelName
 *   AgentState.llm_used           -> ServiceAgentRunResult.trace.llmUsed
 *   AgentState.prompt_version     -> ServiceAgentRunResult.trace.promptVersion
 *
 * Structured, closed enums only — no string-guessing in BUSOS (AC-05). The
 * agent stays the single source of truth for intent / risk / handoff /
 * evidence; BUSOS maps but never re-derives them.
 */

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

/** One conversation turn (bounded, untrusted context — the agent filters
 * prompt-injection entries itself before LLM use). */
export const ServiceAgentConversationTurnSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(2000),
  })
  .strict();

export type ServiceAgentConversationTurn = z.infer<
  typeof ServiceAgentConversationTurnSchema
>;

/** BUSOS -> Service Agent request (AC-03: query + conversation context arrive intact). */
export const ServiceAgentRunInputSchema = z
  .object({
    /** The customer message exactly as written (AgentState.message). */
    query: z.string().min(1).max(2000),
    /**
     * Optional caller-supplied conversation id. When omitted the agent mints
     * `conv_<12hex>`. Passed through untouched (AgentState.conversation_id).
     */
    conversationId: z.string().min(1).optional(),
    /** Optional customer id (AgentState.customer_id). */
    customerId: z.string().min(1).optional(),
    /**
     * Optional bounded multi-turn context (AgentState.conversation_history,
     * W48). Kept separate from `query` — the agent uses `message` for KB
     * retrieval and only feeds history to the LLM after filtering.
     */
    conversation: z.array(ServiceAgentConversationTurnSchema).max(20).optional(),
    /** Retrieval breadth (AgentState.top_k, 1..10). */
    topK: z.number().int().min(1).max(10).optional(),
  })
  .strict();

export type ServiceAgentRunInput = z.infer<typeof ServiceAgentRunInputSchema>;

// ---------------------------------------------------------------------------
// Result contract
// ---------------------------------------------------------------------------

/** Intent IDs owned by the agent's taxonomy (I00..I12). Closed enum: an
 * unknown intent fails loudly instead of silently producing an unmapped value. */
export const AGENT_INTENT_IDS = [
  'I00',
  'I01',
  'I02',
  'I03',
  'I04',
  'I05',
  'I06',
  'I07',
  'I08',
  'I09',
  'I10',
  'I11',
  'I12',
] as const;
export const AgentIntentIdSchema = z.enum(AGENT_INTENT_IDS);
export type AgentIntentId = z.infer<typeof AgentIntentIdSchema>;

/** Risk levels owned by the agent's taxonomy (R0..R3). Closed enum. */
export const AGENT_RISK_LEVELS = ['R0', 'R1', 'R2', 'R3'] as const;
export const AgentRiskLevelSchema = z.enum(AGENT_RISK_LEVELS);
export type AgentRiskLevel = z.infer<typeof AgentRiskLevelSchema>;

/** Route paths owned by the agent (KB_PATH / HUMAN_PATH). */
export const AGENT_ROUTE_PATHS = ['KB_PATH', 'HUMAN_PATH'] as const;
export const AgentRoutePathSchema = z.enum(AGENT_ROUTE_PATHS);
export type AgentRoutePath = z.infer<typeof AgentRoutePathSchema>;

/**
 * Human-review / handoff status, split into semantically independent booleans
 * (Workstream C). `needsHumanConfirm` is the backward-compatible OR of
 * mustHandoff | needsClarification.
 */
export const ServiceAgentHandoffSchema = z
  .object({
    /** Must go to a human (refund/complaint/privacy/real-operation). */
    mustHandoff: z.boolean(),
    /** Needs clarification — prefer asking instead of direct handoff. */
    needsClarification: z.boolean(),
    /** The answer requires a disclaimer (e.g. price may change). */
    answerRequiresDisclaimer: z.boolean(),
    /** Backward-compatible aggregate. */
    needsHumanConfirm: z.boolean(),
  })
  .strict();
export type ServiceAgentHandoff = z.infer<typeof ServiceAgentHandoffSchema>;

/** Retrieval evidence / source refs (AC-06: evidence must reach BUSOS). */
export const ServiceAgentEvidenceSchema = z
  .object({
    /** Hit knowledge module names (AgentState.source_modules). */
    sourceModules: z.array(z.string()),
    /** Source refs with source_id / version / synced_at / invalid. */
    sourceRefs: z.array(z.record(z.string(), z.unknown())),
    /** Retrieval score 0..1 (AgentState.retrieval_score). */
    retrievalScore: z.number().min(0).max(1),
    /** Canonical answer id when a standard script was used (AC-13 provenance). */
    canonicalAnswerId: z.string().nullable(),
    /** Source block id when a canonical answer was used (AC-13 provenance). */
    sourceBlockId: z.string().nullable(),
    /** True when N04 accepted retrieval evidence exists. */
    hasRetrievalEvidence: z.boolean(),
  })
  .strict();
export type ServiceAgentEvidence = z.infer<typeof ServiceAgentEvidenceSchema>;

/** Run / trace metadata (AC-08 invocation/run id). */
export const ServiceAgentTraceSchema = z
  .object({
    runId: z.string().min(1),
    requestId: z.string().min(1),
    conversationId: z.string().min(1),
    latencyMs: z.number().min(0),
    modelName: z.string().nullable(),
    llmUsed: z.boolean(),
    promptVersion: z.string(),
  })
  .strict();
export type ServiceAgentTrace = z.infer<typeof ServiceAgentTraceSchema>;

/** Service Agent -> BUSOS result (AC-04: answer + structured state). */
export const ServiceAgentRunResultSchema = z
  .object({
    /** The agent's final reply (AgentState.suggested_reply, already fail-safe). */
    answer: z.string(),
    /** Intent decided by the agent's own classifier — never re-derived. */
    intent: AgentIntentIdSchema,
    /** Reply-safety risk level (R0..R3) — a DIFFERENT axis from lead-data risk. */
    risk: AgentRiskLevelSchema,
    /** Route the agent took (KB_PATH vs HUMAN_PATH). */
    route: AgentRoutePathSchema,
    /** Human-review / handoff status. */
    handoff: ServiceAgentHandoffSchema,
    /** Retrieval evidence / source refs. */
    evidence: ServiceAgentEvidenceSchema,
    /** Run / trace metadata. */
    trace: ServiceAgentTraceSchema,
  })
  .strict();

export type ServiceAgentRunResult = z.infer<typeof ServiceAgentRunResultSchema>;

/** Validate an untrusted cross-boundary payload (throws on violation). */
export function assertServiceAgentRunResult(
  input: unknown,
): ServiceAgentRunResult {
  return ServiceAgentRunResultSchema.parse(input);
}

/** Validate a BUSOS -> agent request before handing it to the bridge. */
export function assertServiceAgentRunInput(
  input: unknown,
): ServiceAgentRunInput {
  return ServiceAgentRunInputSchema.parse(input);
}
