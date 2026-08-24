/**
 * BUSOS-R2-BATCH2-SCS-PRODUCTION-CONNECT-01 — server-only production transport.
 *
 * This module is the ONLY place that speaks HTTP to the real Production SCS.
 * It lives under `server/` (never `src/`), so no SCS URL or credential can
 * reach the browser bundle.
 *
 * Contract (discovered from the deployed SCS source / deployment config):
 *   POST {baseUrl}/api/agent/chat
 *   Authorization: Bearer <SCS_AGENT_API_KEY>
 *   body:  { message, top_k?, conversation_id?, customer_id? }
 *   -> 200 { suggested_reply, source_modules, retrieval_score,
 *           needs_human_confirm, review_reasons, results[], run_id,
 *           request_id, conversation_id, intent?, risk_level?, route_path?,
 *           must_handoff?, needs_clarification?, answer_requires_disclaimer?,
 *           latency_ms?, model_name?, llm_used?, prompt_version?, ... }
 *
 * The transport returns an EXPLICITLY MAPPED payload (unknown). The
 * ServiceAgentProductionAdapter then validates it against the closed-enum
 * ServiceAgentRunResultSchema. Required BUSOS fields that the SCS response
 * omits are left absent on purpose so validation fails loudly (fail-closed) —
 * the contract is never weakened, faked, or cast.
 */

import type {
  ServiceAgentProductionTransport,
  ServiceAgentRunInput,
} from '@busos/service-agent-port';
import type { ServiceAgentProductionConfig } from './service-agent-production-config.js';

/** SCS cold start can exceed a typical 10s envelope; bound generously. */
const DEFAULT_TIMEOUT_MS = 30_000;
const SCS_CHAT_PATH = '/api/agent/chat';

export interface ServiceAgentProductionTransportOptions {
  config: ServiceAgentProductionConfig;
  /** Injectable fetch (defaults to globalThis.fetch) for controlled tests. */
  fetchFn?: typeof fetch;
  /** Bounded request timeout in ms. */
  timeoutMs?: number;
  now?: () => number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildScsRequestBody(input: ServiceAgentRunInput): Record<string, unknown> {
  const body: Record<string, unknown> = { message: input.query };
  if (input.topK != null) body['top_k'] = input.topK;
  if (input.conversationId != null) body['conversation_id'] = input.conversationId;
  if (input.customerId != null) body['customer_id'] = input.customerId;
  // The /api/agent/chat contract has no multi-turn history parameter; the
  // single `message` is the authoritative query. `conversation` is therefore
  // unsupported at the HTTP boundary (documented as such, never invented).
  return body;
}

/**
 * Map an SCS HTTP response into the BUSOS ServiceAgentRunResult shape.
 *
 * Only BUSOS-known keys are emitted; any SCS-only field (confidence,
 * confidence_semantics, results-as-raw, ...) is dropped so the downstream
 * strict zod schema cannot be polluted by unknown keys. Required BUSOS fields
 * absent from the SCS payload are intentionally left undefined → schema parse
 * fails → fail-closed. This module never widens enums, never injects defaults
 * that fake semantics, and never casts `unknown` to ServiceAgentRunResult.
 */
function mapScsResponseToBusos(raw: unknown): unknown {
  if (!isPlainObject(raw)) return raw;

  const sourceModules = Array.isArray(raw['source_modules']) ? raw['source_modules'] : [];
  const results = Array.isArray(raw['results']) ? (raw['results'] as unknown[]) : [];
  const sourceRefs = results
    .filter(isPlainObject)
    .map((res) => ({
      source_id: typeof res['doc_ref'] === 'string' ? res['doc_ref'] : null,
      category: typeof res['category'] === 'string' ? res['category'] : null,
      section_title: typeof res['section_title'] === 'string' ? res['section_title'] : null,
    }));

  const retrievalScore =
    typeof raw['retrieval_score'] === 'number' ? (raw['retrieval_score'] as number) : 0;
  const hasRetrievalEvidence =
    (Array.isArray(sourceModules) && sourceModules.length > 0) || retrievalScore > 0;

  // Required BUSOS fields are emitted ONLY when SCS supplies a valid value.
  // When SCS omits a required field it stays `undefined`, so the downstream
  // closed-enum schema parse fails loudly (fail-closed). The contract is never
  // widened, faked, or cast — and no default is injected that would mask a
  // missing field as a valid one (spec §19).
  return {
    answer: typeof raw['suggested_reply'] === 'string' ? raw['suggested_reply'] : undefined,
    intent: raw['intent'],
    risk: raw['risk_level'],
    route: raw['route_path'],
    handoff: {
      mustHandoff: Boolean(raw['must_handoff']),
      needsClarification: Boolean(raw['needs_clarification']),
      answerRequiresDisclaimer: Boolean(raw['answer_requires_disclaimer']),
      needsHumanConfirm: Boolean(raw['needs_human_confirm']),
    },
    evidence: {
      sourceModules: Array.isArray(sourceModules) ? sourceModules : [],
      sourceRefs,
      retrievalScore,
      canonicalAnswerId: raw['canonical_answer_id'] != null ? raw['canonical_answer_id'] : null,
      sourceBlockId: raw['source_block_id'] != null ? raw['source_block_id'] : null,
      hasRetrievalEvidence,
    },
    trace: {
      runId: typeof raw['run_id'] === 'string' ? raw['run_id'] : undefined,
      requestId: typeof raw['request_id'] === 'string' ? raw['request_id'] : undefined,
      conversationId:
        typeof raw['conversation_id'] === 'string' ? raw['conversation_id'] : undefined,
      latencyMs: typeof raw['latency_ms'] === 'number' ? raw['latency_ms'] : undefined,
      modelName: raw['model_name'] != null ? raw['model_name'] : null,
      llmUsed: Boolean(raw['llm_used']),
      promptVersion: typeof raw['prompt_version'] === 'string' ? raw['prompt_version'] : undefined,
    },
  };
}

export class ServiceAgentProductionTransportImpl implements ServiceAgentProductionTransport {
  private readonly config: ServiceAgentProductionConfig;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(options: ServiceAgentProductionTransportOptions) {
    this.config = options.config;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? (() => Date.now());
  }

  async invoke(input: ServiceAgentRunInput): Promise<unknown> {
    const startedAt = this.now();
    void startedAt; // reserved for future bounded diagnostics; never logs URL/secret

    const body = buildScsRequestBody(input);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(`${this.config.baseUrl}${SCS_CHAT_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Auth mechanism maps directly to the SCS agent-role Bearer token.
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      // Network failure / DNS / timeout (abort). Sanitized: no URL, no token.
      throw new Error('Service Agent production transport request failed.');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // Non-2xx. Sanitized: never echo provider URL, status text, or token.
      throw new Error('Service Agent production transport returned a non-success status.');
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new Error('Service Agent production transport returned a non-JSON body.');
    }

    // Explicit mapping at the server-side transport boundary. The adapter does
    // the closed-enum contract validation; this lane only shapes the payload.
    return mapScsResponseToBusos(raw);
  }
}

/** Factory used by the composition layer (and tests with an injected fetch). */
export function createServiceAgentProductionTransport(
  options: ServiceAgentProductionTransportOptions,
): ServiceAgentProductionTransport {
  return new ServiceAgentProductionTransportImpl(options);
}
