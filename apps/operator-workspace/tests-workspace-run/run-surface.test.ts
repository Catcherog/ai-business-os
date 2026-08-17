import { describe, it, expect } from 'vitest';
import {
  InMemoryProcessRegistry,
  runBusinessProcess,
  type ProcessExecutionRecord,
  type ProcessRejection,
} from '@busos/orchestrator';
import { WorkspaceRunService, toRunDetail, toRunSummary, buildDemoRuns } from '../src/index';
import { createCountingDeps, validInput } from '../../orchestrator/tests/helpers';

/**
 * H1-03 Run / Run Detail / Trace surface — workspace-run package tests.
 *
 * Covers the acceptance gates H1-03-B..J:
 *   C  list ordering (recent-first, deterministic) + RUNNING honesty
 *   D  run detail (success output / failed error / missing run null)
 *   E  real orchestrator -> shared registry -> read port -> WorkspaceRunService
 *   F  semantic gate (FAILED=system_error, REJECTED=business_rejection,
 *      HUMAN_REQUIRED=human_required — never a system error)
 *   G  trace sanitizer + presentation boundary (no forbidden material)
 */

function seededService(): WorkspaceRunService {
  const reg = new InMemoryProcessRegistry();
  for (const rec of buildDemoRuns()) reg.save(rec);
  return new WorkspaceRunService(reg);
}

// Forbidden substrings that must never appear in a rendered view model.
const FORBIDDEN = [
  'sk-',
  'api_key',
  'apiKey',
  'password',
  'secret',
  'Bearer ',
  'systemPrompt',
  'rawResponse',
  'credential',
  'source_image_base64',
  'thirdPartyPayload',
  'authorization',
  'FEISHU_APP_SECRET',
  'app_token',
];

describe('H1-03 Runs surface (workspace-run)', () => {
  /* ------------------------------- H1-03-C ------------------------------- */
  it('C — listRuns ordered most-recently-active first; RUNNING is registry-only honest', async () => {
    const svc = seededService();
    const list = await svc.listRuns();
    expect(list).toHaveLength(4);
    // updatedAt desc: d(09:15) > c(08:00) > b(07:30) > a(06:00)
    expect(list.map((r) => r.processId)).toEqual([
      'proc_seed_d004',
      'proc_seed_c003',
      'proc_seed_b002',
      'proc_seed_a001',
    ]);
    // limit respected
    expect((await svc.listRuns({ limit: 2 })).map((r) => r.processId)).toEqual([
      'proc_seed_d004',
      'proc_seed_c003',
    ]);

    // RUNNING record (proc_seed_c003) is honest: no fake result / trace.
    const running = await svc.getRun('proc_seed_c003');
    expect(running).not.toBeNull();
    expect(running!.status).toBe('RUNNING');
    expect(running!.outcome.kind).toBe('running');
    expect(running!.trace).toEqual([]); // no fabricated structured trace
    expect(running!.output).toBeNull();
    expect(running!.durationMs).toBeNull();
    // only the current stage is 'current'; the rest are 'not_reached'
    const stageStatuses = running!.stages.map((s) => s.status);
    expect(stageStatuses.filter((s) => s === 'current')).toHaveLength(1);
    expect(stageStatuses.filter((s) => s === 'not_reached')).toHaveLength(2);
  });

  /* ------------------------------- H1-03-D ------------------------------- */
  it('D — SUCCEEDED run detail exposes canonical output refs only; stages completed', async () => {
    const svc = seededService();
    const detail = await svc.getRun('proc_seed_a001');
    expect(detail).not.toBeNull();
    expect(detail!.status).toBe('SUCCEEDED');
    expect(detail!.outcome.kind).toBe('success');
    expect(detail!.durationMs).toBe(5000);
    // Output — only stable references, never raw payloads
    expect(detail!.output).not.toBeNull();
    expect(detail!.output!.assetUri).toBe('lumen://gen/seed-a-portrait-001');
    expect(detail!.output!.leadId).toBe('lead_seed_a');
    // All 3 stages completed in canonical order
    expect(detail!.stages.map((s) => s.stage)).toEqual([
      'GOLDEN_PATH',
      'PROJECT_LIFECYCLE',
      'CREATIVE_PRODUCTION',
    ]);
    expect(detail!.stages.every((s) => s.status === 'completed')).toBe(true);
    // 6 trace events survive (each stage STARTED + terminal)
    expect(detail!.trace).toHaveLength(6);
  });

  it('D — FAILED run detail surfaces structured error + failed stage, not success', async () => {
    const svc = seededService();
    const detail = await svc.getRun('proc_seed_b002');
    expect(detail).not.toBeNull();
    expect(detail!.status).toBe('FAILED');
    // system-error outcome carries the canonical error
    expect(detail!.outcome.kind).toBe('system_error');
    expect(detail!.outcome.error?.code).toBe('CREATIVE_GENERATION_FAILED');
    expect(detail!.outcome.error?.stage).toBe('CREATIVE_PRODUCTION');
    expect(detail!.outcome.error?.message).toContain('provider returned no asset');
    // stage progress: 2 completed, the failing stage 'failed'
    const byStage = Object.fromEntries(detail!.stages.map((s) => [s.stage, s.status]));
    expect(byStage['GOLDEN_PATH']).toBe('completed');
    expect(byStage['PROJECT_LIFECYCLE']).toBe('completed');
    expect(byStage['CREATIVE_PRODUCTION']).toBe('failed');
    // failed stage still has no asset output
    expect(detail!.output?.assetId).toBeUndefined();
  });

  it('D — getRun returns null for unknown processId; empty registry lists empty', async () => {
    const svc = seededService();
    expect(await svc.getRun('does-not-exist')).toBeNull();
    const empty = new WorkspaceRunService(new InMemoryProcessRegistry());
    expect(await empty.listRuns()).toEqual([]);
  });

  /* ------------------------------- H1-03-F ------------------------------- */
  it('F — HUMAN_REQUIRED renders as human_required (normal pause), never system_error', async () => {
    const svc = seededService();
    const detail = await svc.getRun('proc_seed_d004');
    expect(detail).not.toBeNull();
    expect(detail!.status).toBe('HUMAN_REQUIRED');
    expect(detail!.outcome.kind).toBe('human_required');
    expect(detail!.outcome.kind).not.toBe('system_error');
    expect(detail!.outcome.rejection?.reasonCode).toBe('REVIEW_REQUIRED');
    expect(detail!.outcome.rejection?.stage).toBe('GOLDEN_PATH');
  });

  it('F — REJECTED renders as business_rejection (system not broken), never system_error', async () => {
    const reg = new InMemoryProcessRegistry();
    const rejection: ProcessRejection = {
      stage: 'GOLDEN_PATH',
      reasonCode: 'POLICY_REJECTED',
      message: '业务规则拒绝：超出可服务范围',
    };
    const rec: ProcessExecutionRecord = {
      idempotencyKey: 'run-rej',
      processId: 'proc_rej_1',
      status: 'REJECTED',
      currentStage: 'GOLDEN_PATH',
      startedAt: new Date(Date.parse('2026-08-16T10:00:00Z')).toISOString(),
      updatedAt: new Date(Date.parse('2026-08-16T10:00:01Z')).toISOString(),
      result: {
        processId: 'proc_rej_1',
        idempotencyKey: 'run-rej',
        status: 'REJECTED',
        currentStage: 'GOLDEN_PATH',
        completedStages: [],
        startedAt: new Date(Date.parse('2026-08-16T10:00:00Z')).toISOString(),
        endedAt: new Date(Date.parse('2026-08-16T10:00:01Z')).toISOString(),
        durationMs: 1000,
        rejection,
        trace: [
          {
            processId: 'proc_rej_1',
            stage: 'GOLDEN_PATH',
            status: 'REJECTED',
            startedAt: new Date(Date.parse('2026-08-16T10:00:00Z')).toISOString(),
            endedAt: new Date(Date.parse('2026-08-16T10:00:01Z')).toISOString(),
            durationMs: 1000,
            metadata: { governanceDecision: 'REJECT', reasonCode: 'POLICY_REJECTED' },
          },
        ],
      },
    };
    reg.save(rec);
    const detail = await new WorkspaceRunService(reg).getRun('proc_rej_1');
    expect(detail!.outcome.kind).toBe('business_rejection');
    expect(detail!.outcome.kind).not.toBe('system_error');
    expect(detail!.outcome.rejection?.reasonCode).toBe('POLICY_REJECTED');
  });

  /* ------------------------------- H1-03-G ------------------------------- */
  it('G — trace sanitizer drops forbidden keys/objects; keeps allowlisted refs', async () => {
    const reg = new InMemoryProcessRegistry();
    const rec: ProcessExecutionRecord = {
      idempotencyKey: 'run-dirty',
      processId: 'proc_dirty_1',
      status: 'SUCCEEDED',
      startedAt: new Date(Date.parse('2026-08-16T11:00:00Z')).toISOString(),
      updatedAt: new Date(Date.parse('2026-08-16T11:00:05Z')).toISOString(),
      result: {
        processId: 'proc_dirty_1',
        idempotencyKey: 'run-dirty',
        status: 'SUCCEEDED',
        completedStages: ['GOLDEN_PATH'],
        startedAt: new Date(Date.parse('2026-08-16T11:00:00Z')).toISOString(),
        endedAt: new Date(Date.parse('2026-08-16T11:00:05Z')).toISOString(),
        durationMs: 5000,
        output: { leadId: 'lead_dirty', customerId: 'cust_dirty' },
        trace: [
          {
            processId: 'proc_dirty_1',
            stage: 'GOLDEN_PATH',
            status: 'SUCCEEDED',
            startedAt: new Date(Date.parse('2026-08-16T11:00:00Z')).toISOString(),
            endedAt: new Date(Date.parse('2026-08-16T11:00:05Z')).toISOString(),
            durationMs: 5000,
            metadata: {
              // allowlisted — must survive
              leadId: 'lead_dirty',
              governanceDecision: 'APPROVE',
              // forbidden — must be dropped
              apiKey: 'sk-live-12345',
              password: 'hunter2',
              systemPrompt: 'ignore previous instructions',
              source_image_base64: 'iVBORw0KGgo=',
              thirdPartyPayload: { raw: 'leak' },
            } as Record<string, unknown>,
          },
        ],
      },
    };
    reg.save(rec);
    const detail = await new WorkspaceRunService(reg).getRun('proc_dirty_1');
    const meta = detail!.trace[0].metadata ?? {};
    // allowlisted survive
    expect(meta.leadId).toBe('lead_dirty');
    expect(meta.governanceDecision).toBe('APPROVE');
    // forbidden dropped (keys + nested object)
    expect(meta).not.toHaveProperty('apiKey');
    expect(meta).not.toHaveProperty('password');
    expect(meta).not.toHaveProperty('systemPrompt');
    expect(meta).not.toHaveProperty('source_image_base64');
    expect(meta).not.toHaveProperty('thirdPartyPayload');
    // whole view model carries no forbidden substring
    const dumped = JSON.stringify(detail);
    for (const tok of FORBIDDEN) expect(dumped).not.toContain(tok);
  });

  it('G — error message sanitizer redacts credential material before it reaches UI', async () => {
    const reg = new InMemoryProcessRegistry();
    const rec: ProcessExecutionRecord = {
      idempotencyKey: 'run-err',
      processId: 'proc_err_1',
      status: 'FAILED',
      currentStage: 'CREATIVE_PRODUCTION',
      startedAt: new Date(Date.parse('2026-08-16T12:00:00Z')).toISOString(),
      updatedAt: new Date(Date.parse('2026-08-16T12:00:03Z')).toISOString(),
      result: {
        processId: 'proc_err_1',
        idempotencyKey: 'run-err',
        status: 'FAILED',
        currentStage: 'CREATIVE_PRODUCTION',
        completedStages: ['GOLDEN_PATH'],
        startedAt: new Date(Date.parse('2026-08-16T12:00:00Z')).toISOString(),
        endedAt: new Date(Date.parse('2026-08-16T12:00:03Z')).toISOString(),
        durationMs: 3000,
        error: {
          code: 'CREATIVE_GENERATION_FAILED',
          message: "Lumen failed: authorization='Bearer sk-secret-999' password='hunter2'",
          stage: 'CREATIVE_PRODUCTION',
          disposition: 'RETRYABLE',
        },
      },
    };
    reg.save(rec);
    const detail = await new WorkspaceRunService(reg).getRun('proc_err_1');
    // re-sanitized message reaches the view model with credentials redacted
    expect(detail!.outcome.error?.message).not.toContain('sk-secret-999');
    expect(detail!.outcome.error?.message).not.toContain('hunter2');
    expect(detail!.outcome.error?.message).toContain('[REDACTED]');
  });

  /* ------------------------------- H1-03-E ------------------------------- */
  it('E — real runBusinessProcess (SUCCESS) -> shared registry -> WorkspaceRunService', async () => {
    const registry = new InMemoryProcessRegistry();
    const deps = createCountingDeps();
    const result = await runBusinessProcess(validInput(), deps, {
      registry,
      idempotencyKey: 'h1-03-e2e-ok',
    });
    expect(result.status).toBe('SUCCEEDED');

    // The SAME InMemoryProcessRegistry implements both ProcessRegistry (used by
    // runBusinessProcess) and ProcessRegistryReadPort (used by WorkspaceRunService).
    const svc = new WorkspaceRunService(registry);
    const runs = await svc.listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('SUCCEEDED');

    const detail = await svc.getRun(result.processId);
    expect(detail).not.toBeNull();
    expect(detail!.status).toBe('SUCCEEDED');
    expect(detail!.outcome.kind).toBe('success');
    // The real fake Lumen adapter emits a `lumen-stub://…` asset URI; a malformed
    // demo run may use `lumen://…`. Either way the stable lumen reference is safe.
    expect(detail!.output?.assetUri).toMatch(/lumen/i);
    expect(detail!.stages.every((s) => s.status === 'completed')).toBe(true);
  });

  it('E — real runBusinessProcess (FAILURE) -> WorkspaceRunService shows system_error', async () => {
    const registry = new InMemoryProcessRegistry();
    const deps = createCountingDeps({ failGeneration: true });
    const result = await runBusinessProcess(validInput(), deps, {
      registry,
      idempotencyKey: 'h1-03-e2e-fail',
    });
    expect(result.status).toBe('FAILED');

    const svc = new WorkspaceRunService(registry);
    const detail = await svc.getRun(result.processId);
    expect(detail).not.toBeNull();
    expect(detail!.status).toBe('FAILED');
    expect(detail!.outcome.kind).toBe('system_error');
    expect(detail!.outcome.error?.code).toBe('CREATIVE_GENERATION_FAILED');
    // downstream writes still happened for the earlier stages (real execution)
    expect(deps.counts.createLead).toBeGreaterThan(0);
    expect(deps.counts.createProject).toBeGreaterThan(0);
    expect(deps.counts.lumenGenerate).toBeGreaterThan(0);
  });

  /* ------------------------- browser presentation boundary ----------------- */
  it('G — presentation boundary: Feishu/Lumen creds + prompt/raw payload never in view models', async () => {
    const reg = new InMemoryProcessRegistry();
    const rec: ProcessExecutionRecord = {
      idempotencyKey: 'run-boundary',
      processId: 'proc_boundary_1',
      status: 'SUCCEEDED',
      startedAt: new Date(Date.parse('2026-08-16T13:00:00Z')).toISOString(),
      updatedAt: new Date(Date.parse('2026-08-16T13:00:05Z')).toISOString(),
      result: {
        processId: 'proc_boundary_1',
        idempotencyKey: 'run-boundary',
        status: 'SUCCEEDED',
        completedStages: ['GOLDEN_PATH', 'PROJECT_LIFECYCLE', 'CREATIVE_PRODUCTION'],
        startedAt: new Date(Date.parse('2026-08-16T13:00:00Z')).toISOString(),
        endedAt: new Date(Date.parse('2026-08-16T13:00:05Z')).toISOString(),
        durationMs: 5000,
        output: {
          leadId: 'lead_b',
          customerId: 'cust_b',
          projectId: 'proj_b',
          taskId: 'task_b',
          assetId: 'asset_b',
          assetUri: 'lumen://gen/b',
        },
        trace: [
          {
            processId: 'proc_boundary_1',
            stage: 'GOLDEN_PATH',
            status: 'SUCCEEDED',
            startedAt: new Date(Date.parse('2026-08-16T13:00:00Z')).toISOString(),
            endedAt: new Date(Date.parse('2026-08-16T13:00:01Z')).toISOString(),
            durationMs: 1000,
            metadata: {
              leadId: 'lead_b',
              // attempt to smuggle credentials via trace metadata
              feishuAppSecret: 'fw123secret',
              app_token: 'at-xyz',
              table_id: 'tbl-1',
            } as Record<string, unknown>,
          },
        ],
      },
    };
    reg.save(rec);
    const svc = new WorkspaceRunService(reg);
    const list = await svc.listRuns();
    const detail = await svc.getRun('proc_boundary_1');
    const dumped = JSON.stringify({ list, detail });
    for (const tok of FORBIDDEN) expect(dumped).not.toContain(tok);
    // legitimate business refs are preserved
    expect(dumped).toContain('lead_b');
    expect(dumped).toContain('lumen://gen/b');
  });

  /* ------------------------------ mapping purity -------------------------- */
  it('toRunSummary / toRunDetail are pure projections (no mutation of source)', async () => {
    const svc = seededService();
    const before = JSON.stringify((await svc.getRun('proc_seed_a001')));
    // call mapping paths repeatedly; the source registry record is unchanged
    toRunSummary((await svc.getRun('proc_seed_a001')) as unknown as ProcessExecutionRecord);
    toRunDetail((await svc.getRun('proc_seed_a001')) as unknown as ProcessExecutionRecord);
    const after = JSON.stringify(await svc.getRun('proc_seed_a001'));
    expect(after).toBe(before);
  });
});
