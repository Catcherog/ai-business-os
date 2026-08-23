import { describe, expect, it } from 'vitest';

import type { ServiceAgentPort, ServiceAgentRunResult } from '@busos/service-agent-port';
import { InMemoryProcessRegistry } from '../src/process-registry.js';
import { runServiceAgentConsultation } from '../src/run-service-agent-consultation.js';
import type { ProcessRegistry } from '../src/process-registry.js';

/**
 * BUSOS-R2-SCS-INTEGRATION-01 — orchestrator narrow-entry tests.
 *
 * Verifies the BUSOS-side mapping (AC-04 / AC-05 / AC-07 / AC-08) with a
 * deterministic in-memory ServiceAgentPort: structured result -> canonical
 * Run, human-review signals -> HUMAN_REQUIRED (never a plain success),
 * idempotency replay without re-running the agent, and allowlist-only trace
 * metadata.
 */

function makeResult(patch: Partial<ServiceAgentRunResult> = {}): ServiceAgentRunResult {
  return {
    answer: '哈喽～完全不用担心呀！',
    intent: 'I01',
    risk: 'R0',
    route: 'KB_PATH',
    handoff: {
      mustHandoff: false,
      needsClarification: false,
      answerRequiresDisclaimer: false,
      needsHumanConfirm: false,
    },
    evidence: {
      sourceModules: ['customer_service_scripts'],
      sourceRefs: [{ source_id: 'doc_1' }],
      retrievalScore: 0.459,
      canonicalAnswerId: 'CA-001',
      sourceBlockId: '🎯 三、接客话术（面向客户）',
      hasRetrievalEvidence: true,
    },
    trace: {
      runId: 'run_fake_001',
      requestId: 'req_fake_001',
      conversationId: 'conv_fake_001',
      latencyMs: 42,
      modelName: 'canonical',
      llmUsed: false,
      promptVersion: 'v1',
    },
    ...patch,
  };
}

function fakePort(results: ServiceAgentRunResult[]): {
  port: ServiceAgentPort;
  calls: { query: string; customerId?: string }[];
} {
  const calls: { query: string; customerId?: string }[] = [];
  let i = 0;
  return {
    calls,
    port: {
      async run(input) {
        calls.push({ query: input.query, customerId: input.customerId });
        const r = results[i] ?? makeResult();
        i += 1;
        return r;
      },
    },
  };
}

describe('runServiceAgentConsultation — success path', () => {
  it('maps a structured plain answer to SUCCEEDED with output summary', async () => {
    const { port } = fakePort([makeResult()]);
    const registry = new InMemoryProcessRegistry();

    const result = await runServiceAgentConsultation(
      { query: '我有点胖，适合拍写真吗？', customerId: 'cust_1' },
      { serviceAgent: port, processRegistry: registry },
    );

    expect(result.status).toBe('SUCCEEDED');
    expect(result.completedStages).toEqual(['SERVICE_AGENT']);
    expect(result.currentStage).toBeUndefined();
    // AC-04: answer is written back to the BUSOS Run result.
    expect(result.output?.serviceAgent?.answer).toBe('哈喽～完全不用担心呀！');
    // AC-05: structured status, no string-guessing.
    expect(result.output?.serviceAgent?.intent).toBe('I01');
    expect(result.output?.serviceAgent?.risk).toBe('R0');
    expect(result.output?.serviceAgent?.handoff.mustHandoff).toBe(false);
    // AC-06: evidence refs reach the result.
    expect(result.output?.serviceAgent?.evidence.canonicalAnswerId).toBe('CA-001');
    expect(result.output?.serviceAgent?.evidence.sourceModules).toContain(
      'customer_service_scripts',
    );
    // AC-08/AC-13: agent run id carried for provenance.
    expect(result.output?.serviceAgent?.trace.runId).toBe('run_fake_001');
    // customerId passed through the port (AC-03 context).
    expect(result.output?.customerId).toBe('cust_1');

    // Trace: exactly one SERVICE_AGENT stage with STARTED + terminal event.
    const terminal = result.trace.filter((e) => e.status !== 'STARTED');
    expect(terminal).toHaveLength(1);
    expect(terminal[0]!.stage).toBe('SERVICE_AGENT');
    expect(terminal[0]!.status).toBe('SUCCEEDED');
    // Allowlist-only metadata: agent run id / intent / risk present; no raw
    // answer text, no prompt, no secret.
    const meta = terminal[0]!.metadata ?? {};
    expect(meta['serviceAgentRunId']).toBe('run_fake_001');
    expect(meta['serviceAgentIntent']).toBe('I01');
    expect(meta['answer']).toBeUndefined();
    expect(meta['query']).toBeUndefined();
  });
});

describe('runServiceAgentConsultation — human-review mapping (AC-07)', () => {
  it('maps must_handoff to HUMAN_REQUIRED, never SUCCEEDED', async () => {
    const { port } = fakePort([
      makeResult({
        risk: 'R2',
        route: 'HUMAN_PATH',
        handoff: {
          mustHandoff: true,
          needsClarification: false,
          answerRequiresDisclaimer: true,
          needsHumanConfirm: true,
        },
      }),
    ]);

    const result = await runServiceAgentConsultation(
      { query: '我想咨询价格', customerId: 'cust_2' },
      { serviceAgent: port },
    );

    expect(result.status).toBe('HUMAN_REQUIRED');
    expect(result.currentStage).toBe('SERVICE_AGENT');
    expect(result.rejection?.stage).toBe('SERVICE_AGENT');
    expect(result.rejection?.reasonCode).toBe('SERVICE_AGENT_HANDOFF');
    // The answer is still surfaced on the run (the human sees what the agent said).
    expect(result.output?.serviceAgent?.answer.length).toBeGreaterThan(0);
    expect(result.output?.serviceAgent?.handoff.mustHandoff).toBe(true);
    // Trace settles as HUMAN_REQUIRED — a normal business pause, not a fault.
    const terminal = result.trace.filter((e) => e.status !== 'STARTED');
    expect(terminal[0]!.status).toBe('HUMAN_REQUIRED');
  });

  it('maps needs_clarification to HUMAN_REQUIRED', async () => {
    const { port } = fakePort([
      makeResult({
        handoff: {
          mustHandoff: false,
          needsClarification: true,
          answerRequiresDisclaimer: false,
          needsHumanConfirm: true,
        },
      }),
    ]);

    const result = await runServiceAgentConsultation(
      { query: '你们有什么服务？', customerId: 'cust_3' },
      { serviceAgent: port },
    );

    expect(result.status).toBe('HUMAN_REQUIRED');
    expect(result.rejection?.reasonCode).toBe('SERVICE_AGENT_NEEDS_CLARIFICATION');
  });

  it('maps needs_human_confirm to HUMAN_REQUIRED (backward-compatible flag)', async () => {
    const { port } = fakePort([
      makeResult({
        handoff: {
          mustHandoff: false,
          needsClarification: false,
          answerRequiresDisclaimer: false,
          needsHumanConfirm: true,
        },
      }),
    ]);

    const result = await runServiceAgentConsultation(
      { query: '再确认一下', customerId: 'cust_4' },
      { serviceAgent: port },
    );

    expect(result.status).toBe('HUMAN_REQUIRED');
    expect(result.rejection?.reasonCode).toBe('SERVICE_AGENT_NEEDS_HUMAN_CONFIRM');
  });
});

describe('runServiceAgentConsultation — failure handling', () => {
  it('classifies an agent fault as FAILED, never throws', async () => {
    const port: ServiceAgentPort = {
      async run() {
        throw new Error('bridge exited 1: AGENT_RUN_FAILED');
      },
    };

    const result = await runServiceAgentConsultation(
      { query: '你好', customerId: 'cust_5' },
      { serviceAgent: port },
    );

    expect(result.status).toBe('FAILED');
    expect(result.error?.stage).toBe('SERVICE_AGENT');
    expect(result.error?.disposition).toBe('RETRYABLE');
    const terminal = result.trace.filter((e) => e.status !== 'STARTED');
    expect(terminal[0]!.status).toBe('FAILED');
  });

  it('rejects an empty query as INVALID_INPUT (TERMINAL)', async () => {
    const { port, calls } = fakePort([makeResult()]);

    const result = await runServiceAgentConsultation(
      { query: '   ' },
      { serviceAgent: port },
    );

    expect(result.status).toBe('FAILED');
    expect(result.error?.code).toBe('INVALID_INPUT');
    expect(result.error?.disposition).toBe('TERMINAL');
    expect(calls).toHaveLength(0); // agent never invoked
  });
});

describe('runServiceAgentConsultation — idempotency (AC-08)', () => {
  it('replays the recorded outcome on duplicate key without re-running the agent', async () => {
    const registry = new InMemoryProcessRegistry();
    const { port, calls } = fakePort([makeResult()]);

    const first = await runServiceAgentConsultation(
      { query: '重复问题', customerId: 'cust_6' },
      { serviceAgent: port, processRegistry: registry },
      { idempotencyKey: 'dup-key-1' },
    );
    const second = await runServiceAgentConsultation(
      { query: '重复问题', customerId: 'cust_6' },
      { serviceAgent: port, processRegistry: registry },
      { idempotencyKey: 'dup-key-1' },
    );

    expect(first.status).toBe('SUCCEEDED');
    expect(second.status).toBe('SUCCEEDED');
    expect(second.deduplicated).toBe(true);
    // The agent ran exactly once — no duplicate inference side effect.
    expect(calls).toHaveLength(1);
    // The replayed result carries the same output summary.
    expect(second.output?.serviceAgent?.trace.runId).toBe('run_fake_001');
  });

  it('fails closed when a key is supplied without a registry', async () => {
    const { port } = fakePort([makeResult()]);

    const result = await runServiceAgentConsultation(
      { query: '幂等测试', customerId: 'cust_7' },
      { serviceAgent: port },
      { idempotencyKey: 'no-registry-key' },
    );

    expect(result.status).toBe('FAILED');
    expect(result.error?.code).toBe('INVALID_INPUT');
    expect(result.error?.disposition).toBe('TERMINAL');
  });
});

describe('runServiceAgentConsultation — conversation context passthrough (AC-03)', () => {
  it('delivers query + conversation context to the port intact', async () => {
    const { port, calls } = fakePort([makeResult()]);
    const conversation = [
      { role: 'user' as const, content: '你们有什么套餐？' },
      { role: 'assistant' as const, content: '有基础款和标准款。' },
    ];

    await runServiceAgentConsultation(
      {
        query: '那价格呢？',
        conversationId: 'conv_ctx_1',
        customerId: 'cust_ctx',
        conversation,
        topK: 5,
      },
      { serviceAgent: port },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]!.query).toBe('那价格呢？');
    expect(calls[0]!.customerId).toBe('cust_ctx');
  });
});
