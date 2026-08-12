import { randomUUID } from 'node:crypto';
import { buildLeadCandidate } from '@busos/service-agent-candidate';
import type { AgentIntentId } from '@busos/service-agent-candidate';
import type { GoldenPathInput, CandidateBuilder } from './types.js';

/**
 * Default candidate builder for the golden path.
 *
 * BUSOS-P2-GP-001 takes a raw user consultation (`text`). The real Service
 * Agent (Python/LangGraph) would emit a `ConsultationContextV1` at its
 * boundary; here we replay that boundary by constructing the context and
 * delegating to the FROZEN P1-02 `buildLeadCandidate`, which performs all
 * requirement/identity extraction. This reuses P1-02 verbatim — no second
 * extraction implementation is introduced.
 */

/** Price/booking consultation is the natural fit for a budget-bearing inquiry. */
export const DEFAULT_AGENT_INTENT: AgentIntentId = 'I02';
export const DEFAULT_INTENT_CONFIDENCE = 1.0;

export const buildCandidateFromInput: CandidateBuilder = (input) => {
  const conversationId =
    input.session?.conversationId ?? `conv_${randomUUID().slice(0, 8)}`;
  const runId = input.session?.runId ?? `run_${randomUUID().slice(0, 8)}`;

  // Construct the Service Agent boundary payload, then let P1-02 validate +
  // extract. `buildLeadCandidate` throws (ContractValidationError) on any
  // malformed context, which the orchestration treats as a fail-closed BLOCK.
  return buildLeadCandidate({
    conversation_id: conversationId,
    run_id: runId,
    message: input.text,
    intent: input.intent ?? DEFAULT_AGENT_INTENT,
    intent_confidence: input.intentConfidence ?? DEFAULT_INTENT_CONFIDENCE,
  });
};
