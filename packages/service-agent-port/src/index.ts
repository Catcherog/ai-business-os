/**
 * @busos/service-agent-port — BUSOS-R2-SCS-INTEGRATION-01.
 *
 * The bounded boundary that lets BUSOS run the frozen Service Agent as a real
 * AI capability: a synchronous call with a structured return (query +
 * conversation context in, answer / intent / risk / handoff / evidence /
 * trace out), validated by closed-enum zod schemas. BUSOS core depends only on
 * this port, never on the agent's internal LangGraph implementation (AC-01).
 */

export { ServiceAgentBridgeAdapter } from './bridge-adapter.js';
export type { ServiceAgentPort } from './port.js';

export {
  AGENT_INTENT_IDS,
  AGENT_RISK_LEVELS,
  AGENT_ROUTE_PATHS,
  AgentIntentIdSchema,
  AgentRiskLevelSchema,
  AgentRoutePathSchema,
  ServiceAgentConversationTurnSchema,
  ServiceAgentEvidenceSchema,
  ServiceAgentHandoffSchema,
  ServiceAgentRunInputSchema,
  ServiceAgentRunResultSchema,
  ServiceAgentTraceSchema,
  assertServiceAgentRunInput,
  assertServiceAgentRunResult,
} from './schema.js';

export type {
  AgentIntentId,
  AgentRiskLevel,
  AgentRoutePath,
  ServiceAgentConversationTurn,
  ServiceAgentEvidence,
  ServiceAgentHandoff,
  ServiceAgentRunInput,
  ServiceAgentRunResult,
  ServiceAgentTrace,
} from './schema.js';
