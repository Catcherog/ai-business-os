import { z } from 'zod';

/**
 * ConsultationContextV1 — the minimal cross-boundary payload the existing
 * Service Agent hands to the Candidate Builder (BUSOS-P1-02).
 *
 * Why a boundary payload exists at all
 * -----------------------------------
 * The existing Service Agent is Python + LangGraph
 * (repo `Catcherog/service-agent`, working copy `Monorepo/service agent`),
 * while the frozen contracts (`@busos/contracts`, BUSOS-P1-01) are
 * TypeScript + zod. BUSOS-P1-02 crosses that boundary with this small,
 * explicit payload instead of migrating a language or re-declaring the frozen
 * contract in Python (which would be free to drift). D014: modules interact
 * through contracts, not internal cross-imports.
 *
 * Field provenance — Service Agent `AgentState`
 * (`src/langgraph/types/state.py`) and node N02
 * (`src/langgraph/nodes/n02_intent_classifier.py`):
 *
 *   AgentState.conversation_id   -> LeadCandidateV1.session_id
 *   AgentState.run_id            -> LeadCandidateV1.agent_run_id
 *   AgentState.message           -> extraction source and evidence source_text
 *   AgentState.intent            -> IntentID I00..I12
 *   AgentState.intent_confidence -> LeadCandidateV1.intent.confidence
 *
 * Deliberately NOT part of this payload: retrieval results, suggested_reply,
 * risk/route decisions, handoff flags. The Candidate Builder extracts business
 * requirement data; it does not consume or influence the agent's reply path.
 */

/**
 * Intent IDs owned by the Service Agent's own taxonomy
 * (`src/langgraph/types/intent.py`, IntentID I00..I12).
 *
 * Declared as a closed enum on purpose: if the agent introduces a new intent,
 * this boundary fails loudly instead of silently producing an unmapped intent.
 */
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

export const ConsultationContextV1Schema = z
  .object({
    /** Service Agent AgentState.conversation_id (e.g. `conv_6f42baebac98`). */
    conversation_id: z.string().min(1),
    /** Service Agent AgentState.run_id (e.g. `run_e3cb2ca839a543cb`). */
    run_id: z.string().min(1),
    /** The consultation message exactly as the customer wrote it. */
    message: z.string().min(1),
    /** Intent decided by the agent's own classifier, never re-derived here. */
    intent: AgentIntentIdSchema,
    /** Confidence reported by the agent's classifier, already 0..1. */
    intent_confidence: z.number().min(0).max(1),
  })
  .strict();

export type ConsultationContextV1 = z.infer<typeof ConsultationContextV1Schema>;

/**
 * Service Agent intent ID -> `LeadCandidateV1.intent.type`.
 *
 * The agent's taxonomy is customer-service oriented and its IDs (`I02`) are
 * opaque outside that codebase. The contract only requires a non-empty string,
 * so this table exposes a stable, readable business intent name in the shape
 * suggested by project-control/04-INTERFACES.md ("portrait_consultation").
 *
 * This is a pure renaming: the agent stays the single source of truth for
 * *which* intent was detected. No intent is inferred or overridden here.
 */
export const AGENT_INTENT_TO_CANDIDATE_INTENT: Record<AgentIntentId, string> = {
  I00: 'unknown_consultation',
  I01: 'general_consultation',
  I02: 'price_consultation',
  I03: 'schedule_consultation',
  I04: 'booking_consultation',
  I05: 'reschedule_request',
  I06: 'cancellation_request',
  I07: 'order_progress_inquiry',
  I08: 'after_sales_request',
  I09: 'complaint',
  I10: 'refund_request',
  I11: 'privacy_request',
  I12: 'human_handoff_request',
};

/** Validate an untrusted cross-boundary payload (throws on violation). */
export function assertConsultationContextV1(
  input: unknown,
): ConsultationContextV1 {
  return ConsultationContextV1Schema.parse(input);
}
