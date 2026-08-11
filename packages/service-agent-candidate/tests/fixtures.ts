import type { ConsultationContextV1 } from '../src/consultation-context.js';

/**
 * The canonical BUSOS-P1-02 consultation input, byte-for-byte as specified in
 * project-control/05-TEST-GATES.md (P1-02 gate) and 00-CHARTER.md (GP-001).
 *
 * Must be tested verbatim, including the trailing full-width period.
 */
export const CANONICAL_MESSAGE = '我想下个月拍一套新中式写真，预算大概4000。';

/**
 * Consultation context for the canonical message.
 *
 * `intent` / `intent_confidence` are the values the *real* Service Agent
 * classifier returns for this message (verified in
 * tests/service-agent-bridge.test.ts, which runs the actual Python modules):
 * "预算" hits I02 (price), which outranks the I01 hit from "写真".
 * IDs use the agent's own `conv_<12hex>` / `run_<16hex>` shapes.
 */
export const CANONICAL_CONTEXT: ConsultationContextV1 = {
  conversation_id: 'conv_6f42baebac98',
  run_id: 'run_e3cb2ca839a543cb',
  message: CANONICAL_MESSAGE,
  intent: 'I02',
  intent_confidence: 1.0,
};

/** Fixed clock + ID so a full-payload assertion is deterministic. */
export const FIXED_NOW = new Date('2026-08-11T15:00:00.000Z');
export const FIXED_CANDIDATE_ID = 'cand_0123456789abcdef';
