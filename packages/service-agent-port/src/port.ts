import type {
  ServiceAgentRunInput,
  ServiceAgentRunResult,
} from './schema.js';

/**
 * ServiceAgentPort — the bounded port BUSOS uses to run the frozen Service
 * Agent as a real AI capability.
 *
 * BUSOS core depends ONLY on this interface (AC-01): it never imports the
 * agent's Python / LangGraph implementation. Adapters that speak to the real
 * agent (or a stand-in for tests) implement this port.
 *
 * The suggested first integration shape is a synchronous call with a
 * structured return:
 *
 *   const result = await port.run({
 *     query, conversation, customerId, conversationId,
 *   });
 *   // result.answer / result.intent / result.risk / result.handoff /
 *   // result.evidence / result.trace
 *
 * BUSOS then maps it into its canonical Run. No async queue, no polling — the
 * agent's `run_graph` is a single synchronous inference.
 */
export interface ServiceAgentPort {
  /** Run one synchronous customer-service inference through the agent. */
  run(input: ServiceAgentRunInput): Promise<ServiceAgentRunResult>;
}
