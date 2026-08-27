import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { validateLeadCandidateV1 } from '@busos/contracts';
import { describe, expect, it } from 'vitest';

import { buildLeadCandidate } from '../src/candidate-builder.js';
import { assertConsultationContextV1 } from '../src/consultation-context.js';
import { CANONICAL_MESSAGE } from './fixtures.js';

/**
 * End-to-end check across the language boundary:
 *
 *   real Service Agent (Python)  ->  ConsultationContextV1  ->  Candidate
 *   Builder (TypeScript)         ->  @busos/contracts validation
 *
 * This is what makes BUSOS-P1-02 an integration rather than a stand-alone
 * re-implementation: `intent`, `intent_confidence`, `run_id` and
 * `conversation_id` are produced by the agent's own production modules.
 *
 * The Service Agent lives in a separate repository, so its location is an
 * environment input. When it is not present the suite skips instead of
 * silently passing a fake.
 */

const BRIDGE = fileURLToPath(
  new URL('../bridge/service_agent_context.py', import.meta.url),
);

/**
 * Working copy of `Catcherog/service-agent` used for BUSOS-P1-02.
 * Override with BUSOS_SERVICE_AGENT_SRC on another machine.
 */
const DEFAULT_AGENT_SRC =
  'D:\\360Downloads\\Trae 项目\\Monorepo\\service agent\\src';

const AGENT_SRC = process.env['BUSOS_SERVICE_AGENT_SRC'] ?? DEFAULT_AGENT_SRC;
const PYTHON = process.env['BUSOS_PYTHON'] ?? 'python';

const agentAvailable = existsSync(AGENT_SRC);

describe.skipIf(!agentAvailable)(
  'real Service Agent -> Candidate Builder integration',
  () => {
    const run = spawnSync(
      PYTHON,
      [BRIDGE, '--message', CANONICAL_MESSAGE, '--agent-src', AGENT_SRC],
      { encoding: 'utf8' },
    );

    it('runs the bridge against the real agent modules', () => {
      expect(run.error).toBeUndefined();
      expect(run.status).toBe(0);
    });

    it('returns a valid consultation context from the live classifier', () => {
      const context = assertConsultationContextV1(JSON.parse(run.stdout));

      expect(context.message).toBe(CANONICAL_MESSAGE);
      // The agent's own taxonomy: "预算" hits I02 (price) and outranks the
      // I01 hit from "写真". Asserted here so a change in the agent's
      // classifier surfaces as a failing integration test.
      expect(context.intent).toBe('I02');
      expect(context.intent_confidence).toBe(1);
      // The agent's own ID shapes, carried through untouched.
      expect(context.conversation_id).toMatch(/^conv_[0-9a-f]{12}$/);
      expect(context.run_id).toMatch(/^run_[0-9a-f]{16}$/);
    });

    it('builds a contract-valid candidate from live agent output', () => {
      const context = assertConsultationContextV1(JSON.parse(run.stdout));
      const candidate = buildLeadCandidate(context);

      expect(validateLeadCandidateV1(candidate).ok).toBe(true);
      expect(candidate.session_id).toBe(context.conversation_id);
      expect(candidate.agent_run_id).toBe(context.run_id);
      expect(candidate.requirement.service_type).toBe('新中式写真');
      expect(candidate.requirement.budget_max).toBe(4000);
      expect(candidate.requirement.preferred_date_text).toBe('下个月');
      expect(candidate.customer_candidate).toEqual({
        name: null,
        phone: null,
        wechat: null,
      });
      expect(candidate.governance.status).toBe('PENDING_REVIEW');
    });

    it('keeps non-ASCII consultation text intact under a legacy Windows stdout encoding', () => {
      const encodedRun = spawnSync(
        PYTHON,
        [BRIDGE, '--message', CANONICAL_MESSAGE, '--agent-src', AGENT_SRC],
        {
          encoding: 'utf8',
          env: { ...process.env, PYTHONIOENCODING: 'cp936' },
        },
      );

      expect(encodedRun.error).toBeUndefined();
      expect(encodedRun.status).toBe(0);
      expect(JSON.parse(encodedRun.stdout).message).toBe(CANONICAL_MESSAGE);
    });
  },
);

describe('bridge availability', () => {
  it('documents where the Service Agent was located', () => {
    // Fails loudly if the bridge script itself goes missing.
    expect(existsSync(BRIDGE)).toBe(true);
  });
});
