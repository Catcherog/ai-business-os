import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { assertServiceAgentRunResult } from '../src/schema.js';
import type { ServiceAgentRunResult } from '../src/schema.js';

/**
 * BUSOS-R2-SCS-INTEGRATION-01 — REAL local E2E (AC-11).
 *
 * Chain under test:
 *
 *   BUSOS bridge (spawnSync) -> frozen Service Agent LangGraph (real KB
 *   retrieval + reply generation) -> structured JSON -> BUSOS zod schema.
 *
 * The Service Agent is a separate repo pinned to FREEZE_SHA
 * ebb85686de8315bbdb6d8f5d6cd3cb70cf02bb10. Its location is an environment
 * input; when it is not present the suite skips instead of silently passing a
 * fake (same discipline as the P1-02 bridge test).
 *
 * The frozen SHA working copy has no vector_store / model_cache (they are
 * runtime data), so VECTOR_STORE_DIR / EMBEDDING_MODEL_PATH are pointed at the
 * Monorepo working copy's real local data — KB retrieval stays REAL.
 */

const BRIDGE = fileURLToPath(
  new URL('../bridge/run_service_agent.py', import.meta.url),
);

/** Frozen SHA detached working copy (created by the integration task). */
const FROZEN_SHA_WORKTREE =
  'D:\\tmp\\scs-freeze-ebb85686\\src';

/** Monorepo working copy (content-identical to the freeze, CRLF only). */
const DEFAULT_AGENT_SRC =
  'D:\\360Downloads\\Trae 项目\\Monorepo\\service agent\\src';

const AGENT_SRC =
  process.env['BUSOS_SERVICE_AGENT_SRC'] ??
  (existsSync(FROZEN_SHA_WORKTREE) ? FROZEN_SHA_WORKTREE : DEFAULT_AGENT_SRC);
const PYTHON = process.env['BUSOS_PYTHON'] ?? 'D:\\360Downloads\\Trae 项目\\Monorepo\\service agent\\.venv\\Scripts\\python.exe';

// Real local KB data (vector store + embedding model) lives in the Monorepo
// working copy, not in the frozen git tree.
const VECTOR_STORE_DIR =
  process.env['VECTOR_STORE_DIR'] ??
  'D:\\360Downloads\\Trae 项目\\Monorepo\\service agent\\vector_store';
const EMBEDDING_MODEL_PATH =
  process.env['EMBEDDING_MODEL_PATH'] ??
  'D:\\360Downloads\\Trae 项目\\Monorepo\\service agent\\model_cache';

const agentAvailable =
  existsSync(AGENT_SRC) && existsSync(VECTOR_STORE_DIR) && existsSync(EMBEDDING_MODEL_PATH);

function runAgent(
  query: string,
  opts: { conversationId?: string; customerId?: string; topK?: number } = {},
): ServiceAgentRunResult {
  const args = ['--query', query, '--agent-src', AGENT_SRC];
  if (opts.conversationId) args.push('--conversation-id', opts.conversationId);
  if (opts.customerId) args.push('--customer-id', opts.customerId);
  if (opts.topK) args.push('--top-k', String(opts.topK));

  const proc = spawnSync(PYTHON, [BRIDGE, ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 180_000,
    env: {
      ...process.env,
      VECTOR_STORE_DIR,
      EMBEDDING_MODEL_PATH,
    },
  });

  expect(proc.error, `spawn error: ${proc.error?.message}`).toBeUndefined();
  expect(proc.status, `bridge stderr: ${proc.stderr}`).toBe(0);
  return assertServiceAgentRunResult(JSON.parse(proc.stdout));
}

describe.skipIf(!agentAvailable)(
  'REAL frozen Service Agent E2E (BUSOS -> agent -> retrieval -> answer)',
  () => {
    it('canonical path — real retrieval + canonical answer + source refs (AC-06/AC-11)', () => {
      const result = runAgent('我有点胖，适合拍写真吗？', {
        conversationId: 'conv_e2e_canonical',
        customerId: 'cust_e2e_001',
        topK: 3,
      });

      // Structured state maps 1:1 (AC-05), never string-guessed.
      expect(result.intent).toBe('I01');
      expect(result.risk).toBe('R0');
      expect(result.route).toBe('KB_PATH');
      expect(result.handoff).toEqual({
        mustHandoff: false,
        needsClarification: false,
        answerRequiresDisclaimer: false,
        needsHumanConfirm: false,
      });

      // AC-04: a real answer is produced.
      expect(result.answer.length).toBeGreaterThan(0);

      // AC-06: retrieval evidence / source refs reach BUSOS.
      expect(result.evidence.hasRetrievalEvidence).toBe(true);
      expect(result.evidence.sourceModules.length).toBeGreaterThan(0);
      // Provenance: canonical script + source block (AC-13).
      expect(result.evidence.canonicalAnswerId).toBeTruthy();
      expect(result.evidence.sourceBlockId).toBeTruthy();

      // AC-08: run/trace metadata present.
      expect(result.trace.runId).toMatch(/^run_/);
      expect(result.trace.conversationId).toBe('conv_e2e_canonical');
      expect(result.trace.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('R2 risk path — HUMAN_PATH + handoff flags (AC-07 scenario)', () => {
      const result = runAgent('你好，我想咨询新中式写真的价格，预算4000左右，下个月拍', {
        conversationId: 'conv_e2e_r2',
        customerId: 'cust_e2e_002',
      });

      // The agent itself routes price consultation to R2 / HUMAN_PATH.
      expect(result.intent).toBe('I02');
      expect(result.risk).toBe('R2');
      expect(result.route).toBe('HUMAN_PATH');
      expect(result.handoff.mustHandoff).toBe(true);
      expect(result.handoff.needsHumanConfirm).toBe(true);

      // Evidence still structured; the run metadata is present.
      expect(result.trace.runId).toMatch(/^run_/);
    });

    it('unknown intent path — I00 out-of-scope deterministic reply', () => {
      const result = runAgent('工作室在哪里？', {
        conversationId: 'conv_e2e_i00',
        customerId: 'cust_e2e_003',
      });

      expect(result.intent).toBe('I00');
      expect(result.risk).toBe('R0');
      expect(result.route).toBe('KB_PATH');
      // Structured, non-empty reply; no handoff forced by schema.
      expect(result.answer.length).toBeGreaterThan(0);
    });
  },
);

describe('bridge availability', () => {
  it('documents where the frozen Service Agent was located', () => {
    // Fails loudly if the bridge script itself goes missing.
    expect(existsSync(BRIDGE)).toBe(true);
  });
});
