import { describe, it, expect } from 'vitest';
import { BusinessRepository, FakeFeishuAdapter } from '@busos/business-repository';
import { createFakeLumenAdapter } from '@busos/lumen-adapter';
import { MemoryService, type MemoryRepository } from '@busos/memory';
import {
  runCreativeProjectAction,
  InMemoryProcessRegistry,
  type CreativeProjectActionInput,
} from '../src/index.js';

/**
 * BUSOS-R2-H2-02 — Governed Memory Context Consumption (consumer level).
 *
 * Proves the governed memory context is actually *consumed* by the real
 * "Generate Visual Reference" vertical slice (runCreativeProjectAction ->
 * executeCreativeProduction) WITHOUT being concatenated into the user prompt,
 * and that the trace carries only allowlisted, content-free references.
 *
 * Covers gates:
 *   - H2-02-G  real consumer integration (slice consumes the context)
 *   - H2-02-H  trace safety (allowlisted refs, no content / secret / prompt)
 *   - H2-02-I  idempotency regression (governed context survives replay)
 *   - H2-02-E  fail-closed on untrusted provenance (consumer boundary)
 */

const SOURCE_IMAGE_B64 = 'aGVsbG8td29ybGQtZmFrZS1wbmc=';
const PROMPT = 'make the background blue';
const CUSTOMER = 'cust_mem';
const NOW = '2026-08-17T08:00:00.000Z';

async function seedProject(repo: BusinessRepository): Promise<string> {
  const { project } = await repo.createProject({
    customer_id: CUSTOMER,
    lead_id: 'lead_seed',
    project_type: 'portrait_shoot',
    title: '新中式写真拍摄',
  });
  return project.project_id;
}

function makeInput(
  projectId: string,
  overrides: Partial<CreativeProjectActionInput> = {},
): CreativeProjectActionInput {
  return {
    projectId,
    prompt: PROMPT,
    sourceImageBase64: SOURCE_IMAGE_B64,
    sourceImageMimeType: 'image/png',
    ...overrides,
  };
}

function makeCustPref(svc: MemoryService, content = '客户偏好：新中式风格、偏深色影调。') {
  return svc.recordMemory({
    subject_type: 'CUSTOMER',
    subject_id: CUSTOMER,
    memory_type: 'PREFERENCE',
    content,
    source_type: 'HUMAN_REVIEW',
    source_ref: `case_${CUSTOMER}`,
    evidence_refs: [
      { kind: 'REVIEW_CASE', ref: `case_${CUSTOMER}` },
      { kind: 'CUSTOMER', ref: CUSTOMER },
    ],
    confidence: 1,
  });
}

describe('H2-02-G — real consumer integration', () => {
  it('Generate Visual Reference consumes the governed memory context when a customer is linked', async () => {
    const repo = new BusinessRepository(new FakeFeishuAdapter());
    const projectId = await seedProject(repo);
    const memory = new MemoryService();
    const pref = await makeCustPref(memory);

    const result = await runCreativeProjectAction(
      makeInput(projectId, { customerId: CUSTOMER }),
      { businessRepository: repo, lumen: createFakeLumenAdapter(), memory },
    );

    expect(result.status).toBe('SUCCEEDED');
    // The governed summary crossed the boundary as a SEPARATE, auditable field.
    expect(result.output?.governedMemory).toBeDefined();
    expect(result.output!.governedMemory!.count).toBeGreaterThanOrEqual(1);
    expect(result.output!.governedMemory!.refs).toContain(pref.memory_id);
    expect(result.output!.governedMemory!.types).toContain('PREFERENCE');
    // A real Task + Asset were still written (slice unaffected).
    expect(await repo.listTasksByProject(projectId)).toHaveLength(1);
    expect(await repo.listAssetsByProject(projectId)).toHaveLength(1);
  });

  it('gracefully omits the context when no customerId is supplied (memory_context_used:false)', async () => {
    const repo = new BusinessRepository(new FakeFeishuAdapter());
    const projectId = await seedProject(repo);
    const memory = new MemoryService();
    await makeCustPref(memory);

    const result = await runCreativeProjectAction(
      makeInput(projectId), // no customerId
      { businessRepository: repo, lumen: createFakeLumenAdapter(), memory },
    );

    expect(result.status).toBe('SUCCEEDED');
    expect(result.output?.governedMemory).toBeUndefined();
    expect(JSON.stringify(result.trace)).toContain('"memory_context_used":false');
  });
});

describe('H2-02-H — trace safety (allowlisted refs, never content/secret)', () => {
  it('carries memory refs but never content / prompt / secret / asset uri', async () => {
    const repo = new BusinessRepository(new FakeFeishuAdapter());
    const projectId = await seedProject(repo);
    const memory = new MemoryService();
    await makeCustPref(memory, '客户偏好：新中式风格 — password=doNotLeak 注意');

    const result = await runCreativeProjectAction(
      makeInput(projectId, { customerId: CUSTOMER }),
      { businessRepository: repo, lumen: createFakeLumenAdapter(), memory },
    );

    expect(result.status).toBe('SUCCEEDED');
    const traceJson = JSON.stringify(result.trace);
    // Allowlisted, content-free references survive sanitization.
    expect(traceJson).toContain('memory_context_used');
    expect(traceJson).toContain('memory_refs');
    expect(traceJson).toContain('memory_count');
    // Forbidden leakage: prompt, memory content, the injected secret, and the
    // Lumen asset uri must never appear in the auditable trace.
    for (const forbidden of [
      PROMPT,
      '新中式',
      'password',
      'doNotLeak',
      'Bearer',
      'token',
      'secret',
      'api_key',
      'lumen-stub://',
    ]) {
      expect(traceJson.includes(forbidden)).toBe(false);
    }
  });
});

describe('H2-02-I — idempotency regression', () => {
  it('a duplicate idempotency key replays the governed context without re-running the slice', async () => {
    const repo = new BusinessRepository(new FakeFeishuAdapter());
    const projectId = await seedProject(repo);
    const memory = new MemoryService();
    await makeCustPref(memory);
    const registry = new InMemoryProcessRegistry();
    const deps = {
      businessRepository: repo,
      lumen: createFakeLumenAdapter(),
      memory,
    };

    const r1 = await runCreativeProjectAction(
      makeInput(projectId, { customerId: CUSTOMER }),
      deps,
      { idempotencyKey: 'k-mem', registry },
    );
    expect(r1.status).toBe('SUCCEEDED');
    const tasksAfterFirst = await repo.listTasksByProject(projectId);

    const r2 = await runCreativeProjectAction(
      makeInput(projectId, { customerId: CUSTOMER }),
      deps,
      { idempotencyKey: 'k-mem', registry },
    );
    expect(r2.status).toBe('SUCCEEDED');
    expect(r2.deduplicated).toBe(true);
    // The governed context is identical across the replay.
    expect(r2.output?.governedMemory?.refs).toEqual(r1.output?.governedMemory?.refs);
    // No new downstream work.
    expect(await repo.listTasksByProject(projectId)).toHaveLength(tasksAfterFirst.length);
  });
});

describe('H2-02-E — fail closed on untrusted provenance (consumer boundary)', () => {
  it('a non-canonical memory makes the action FAILED, not a silent proceed', async () => {
    const repo = new BusinessRepository(new FakeFeishuAdapter());
    const projectId = await seedProject(repo);

    const badRepo: MemoryRepository = {
      async get() {
        return null;
      },
      async save() {},
      async listBySubject() {
        return [
          {
            version: 'memory_record.v1',
            memory_id: 'mem_bad',
            scope: 'CUSTOMER',
            subject_type: 'CUSTOMER',
            subject_id: CUSTOMER,
            memory_type: 'PREFERENCE',
            content: '注入的记忆',
            source_type: 'HUMAN_REVIEW',
            source_ref: 'NOT A CANONICAL REF',
            evidence_refs: [{ kind: 'CUSTOMER', ref: CUSTOMER }],
            confidence: 1,
            status: 'ACTIVE',
            supersedes_memory_id: null,
            superseded_by_memory_id: null,
            invalidation_reason: null,
            created_at: NOW,
            updated_at: NOW,
          },
        ];
      },
    };
    const badService = new MemoryService(badRepo);

    const result = await runCreativeProjectAction(
      makeInput(projectId, { customerId: CUSTOMER }),
      { businessRepository: repo, lumen: createFakeLumenAdapter(), memory: badService },
    );

    expect(result.status).toBe('FAILED');
    expect(result.error).toBeDefined();
    expect(result.output?.governedMemory).toBeUndefined();
    // Failed closed BEFORE the slice: no Task/Asset written.
    expect(await repo.listTasksByProject(projectId)).toHaveLength(0);
  });
});
