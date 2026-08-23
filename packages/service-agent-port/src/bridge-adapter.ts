import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { ServiceAgentPort } from './port.js';
import {
  assertServiceAgentRunResult,
  type ServiceAgentRunInput,
  type ServiceAgentRunResult,
} from './schema.js';

/** Absolute path to the Python bridge script (this package's bridge/). */
const BRIDGE = fileURLToPath(
  new URL('../bridge/run_service_agent.py', import.meta.url),
);

/**
 * Default working copy of the frozen Service Agent (`Catcherog/service-agent`).
 *
 * FREEZE_SHA = ebb85686de8315bbdb6d8f5d6cd3cb70cf02bb10
 * The Monorepo submodule working copy tracks that freeze (verified identical
 * modulo CRLF); override with BUSOS_SERVICE_AGENT_SRC for another checkout.
 */
const DEFAULT_AGENT_SRC =
  'D:\\360Downloads\\Trae 项目\\Monorepo\\service agent\\src';

/**
 * Bridge adapter — the REAL Service Agent behind the ServiceAgentPort.
 *
 * Synchronous call + structured JSON return (the suggested first integration
 * shape). The Python bridge imports the frozen agent's own LangGraph graph and
 * emits one JSON document; this adapter validates it against the zod schema so
 * an unparsable / unmappable result fails loudly (never string-guessed).
 */
export class ServiceAgentBridgeAdapter implements ServiceAgentPort {
  constructor(
    private readonly options: {
      agentSrc?: string;
      python?: string;
      /**
       * Extra env vars forwarded to the Python bridge process. The frozen
       * agent's KB reads VECTOR_STORE_DIR / EMBEDDING_MODEL_PATH from the
       * environment (the git tree carries no vector store / model cache), so
       * real local retrieval requires pointing them at the runtime data.
       */
      env?: Record<string, string>;
      /** Injected clock for tests. */
      now?: () => number;
    } = {},
  ) {}

  async run(input: ServiceAgentRunInput): Promise<ServiceAgentRunResult> {
    const agentSrc = this.options.agentSrc ?? process.env['BUSOS_SERVICE_AGENT_SRC'] ?? DEFAULT_AGENT_SRC;
    if (!existsSync(agentSrc)) {
      throw new Error(
        `Service Agent src not found: ${agentSrc}. Set BUSOS_SERVICE_AGENT_SRC.`,
      );
    }
    const python = this.options.python ?? process.env['BUSOS_PYTHON'] ?? 'python';

    const args = ['--query', input.query, '--agent-src', agentSrc];
    if (input.conversationId) args.push('--conversation-id', input.conversationId);
    if (input.customerId) args.push('--customer-id', input.customerId);
    if (input.topK != null) args.push('--top-k', String(input.topK));
    if (input.conversation && input.conversation.length > 0) {
      args.push('--conversation', JSON.stringify(input.conversation));
    }

    const proc = spawnSync(python, [BRIDGE, ...args], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
      env: this.options.env ? { ...process.env, ...this.options.env } : process.env,
    });

    if (proc.error) {
      throw new Error(`Service Agent bridge spawn failed: ${proc.error.message}`);
    }
    if (proc.status !== 0) {
      const detail = (proc.stderr || '').trim().split('\n').slice(-3).join(' | ');
      throw new Error(
        `Service Agent bridge exited ${proc.status}${detail ? `: ${detail}` : ''}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(proc.stdout);
    } catch {
      throw new Error('Service Agent bridge returned non-JSON stdout');
    }

    // Structured validation — unknown intent / risk / route / handoff shape
    // fails loudly here (AC-05), never silently coerced.
    return assertServiceAgentRunResult(parsed);
  }
}
