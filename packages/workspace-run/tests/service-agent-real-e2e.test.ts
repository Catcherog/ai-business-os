import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { ServiceAgentPort } from '@busos/service-agent-port';
import { InMemoryProcessRegistry, runServiceAgentConsultation } from '@busos/orchestrator';
import { WorkspaceRunService } from '@busos/workspace-run';

/**
 * BUSOS-R2-SCS-INTEGRATION-01 — AC-11 full local E2E.
 *
 *   BUSOS orchestrator -> REAL frozen Service Agent (bridge) -> retrieval ->
 *   answer -> registry -> BUSOS Run Detail (WorkspaceRunService.getRun).
 *
 * Same environment discipline as the service-agent-port real E2E: the frozen
 * Service Agent location is an env input; when absent the suite skips rather
 * than faking.
 */

const FROZEN_SHA_WORKTREE = 'D:\\tmp\\scs-freeze-ebb85686\\src';
const DEFAULT_AGENT_SRC =
  'D:\\360Downloads\\Trae 项目\\Monorepo\\service agent\\src';
const AGENT_SRC =
  process.env['BUSOS_SERVICE_AGENT_SRC'] ??
  (existsSync(FROZEN_SHA_WORKTREE) ? FROZEN_SHA_WORKTREE : DEFAULT_AGENT_SRC);
const VECTOR_STORE_DIR =
  process.env['VECTOR_STORE_DIR'] ??
  'D:\\360Downloads\\Trae 项目\\Monorepo\\service agent\\vector_store';
const EMBEDDING_MODEL_PATH =
  process.env['EMBEDDING_MODEL_PATH'] ??
  'D:\\360Downloads\\Trae 项目\\Monorepo\\service agent\\model_cache';
const PYTHON =
  process.env['BUSOS_PYTHON'] ??
  'D:\\360Downloads\\Trae 项目\\Monorepo\\service agent\\.venv\\Scripts\\python.exe';

const agentAvailable =
  existsSync(AGENT_SRC) && existsSync(VECTOR_STORE_DIR) && existsSync(EMBEDDING_MODEL_PATH);

async function bridgePort(): Promise<ServiceAgentPort> {
  const { ServiceAgentBridgeAdapter } = await import('@busos/service-agent-port');
  return new ServiceAgentBridgeAdapter({
    agentSrc: AGENT_SRC,
    python: PYTHON,
    // Point the frozen agent's KB at the real local runtime data (the git
    // tree carries no vector store / model cache).
    env: { VECTOR_STORE_DIR, EMBEDDING_MODEL_PATH },
  });
}

describe.skipIf(!agentAvailable)(
  'AC-11 — full local E2E: BUSOS -> Service Agent -> retrieval -> answer -> Run Detail',
  () => {
    it('writes a real Service Agent run and exposes it on Run Detail', async () => {
      const port = await bridgePort();
      const registry = new InMemoryProcessRegistry();
      const runSvc = new WorkspaceRunService(registry);

      const result = await runServiceAgentConsultation(
        {
          query: '我有点胖，适合拍写真吗？',
          conversationId: 'conv_e2e_full',
          customerId: 'cust_e2e_full_001',
          topK: 3,
        },
        { serviceAgent: port, processRegistry: registry },
        { idempotencyKey: 'scs-integration-e2e-001' },
      );

      // The run reached a terminal state through the REAL agent.
      expect(result.status).toBe('SUCCEEDED');
      expect(result.output?.serviceAgent?.answer.length).toBeGreaterThan(0);
      expect(result.output?.serviceAgent?.intent).toBe('I01');
      expect(result.output?.serviceAgent?.evidence.hasRetrievalEvidence).toBe(true);

      // BUSOS Run Detail exposes the real execution (AC-11).
      const detail = await runSvc.getRun(result.processId);
      expect(detail).not.toBeNull();
      expect(detail!.status).toBe('SUCCEEDED');
      expect(detail!.output?.serviceAgent?.trace.runId).toMatch(/^run_/);
      expect(detail!.output?.serviceAgent?.evidence.canonicalAnswerId).toBeTruthy();
      // SERVICE_AGENT stage shows up on the detail view.
      expect(detail!.stages.some((s: { stage: string }) => s.stage === 'SERVICE_AGENT')).toBe(true);
      const saStage = detail!.stages.find((s: { stage: string }) => s.stage === 'SERVICE_AGENT');
      expect(saStage!.status).toBe('completed');

      // Idempotent replay produces NO second agent run.
      const replay = await runServiceAgentConsultation(
        {
          query: '我有点胖，适合拍写真吗？',
          conversationId: 'conv_e2e_full',
          customerId: 'cust_e2e_full_001',
        },
        { serviceAgent: port, processRegistry: registry },
        { idempotencyKey: 'scs-integration-e2e-001' },
      );
      expect(replay.deduplicated).toBe(true);
    });

    it('HUMAN_REQUIRED run is exposed honestly on Run Detail (AC-07)', async () => {
      const port = await bridgePort();
      const registry = new InMemoryProcessRegistry();
      const runSvc = new WorkspaceRunService(registry);

      const result = await runServiceAgentConsultation(
        {
          query: '你好，我想咨询新中式写真的价格，预算4000左右，下个月拍',
          conversationId: 'conv_e2e_hr',
          customerId: 'cust_e2e_hr_001',
        },
        { serviceAgent: port, processRegistry: registry },
        { idempotencyKey: 'scs-integration-e2e-hr-001' },
      );

      // R2 price consultation -> the agent routes to HUMAN_PATH.
      expect(result.status).toBe('HUMAN_REQUIRED');
      expect(result.rejection?.reasonCode).toBe('SERVICE_AGENT_HANDOFF');

      const detail = await runSvc.getRun(result.processId);
      expect(detail).not.toBeNull();
      expect(detail!.status).toBe('HUMAN_REQUIRED');
      // Semantic gate: a human pause is NEVER a system error.
      expect(detail!.outcome.kind).toBe('human_required');
      expect(detail!.outcome.kind).not.toBe('system_error');
      // The agent's structured answer is still visible for the reviewer.
      expect(detail!.output?.serviceAgent?.handoff.mustHandoff).toBe(true);
    });
  },
);
