import { describe, it, expect } from 'vitest';
import { ContractValidationError, isActiveMemory } from '@busos/contracts';
import {
  MemoryService,
  InMemoryMemoryRepository,
  extractMemoriesFromReviewCase,
  extractMemoriesFromProcessRun,
  type RecordMemoryInput,
} from '../src/index.js';

const FIXED_NOW = '2026-08-17T08:00:00.000Z';

function makeService(): MemoryService {
  return new MemoryService(new InMemoryMemoryRepository(), { now: () => FIXED_NOW });
}

function preference(customerId: string): RecordMemoryInput {
  return {
    subject_type: 'CUSTOMER',
    subject_id: customerId,
    memory_type: 'PREFERENCE',
    content: '客户偏好：新中式风格、偏深色影调，避免过度磨皮。',
    source_type: 'HUMAN_REVIEW',
    source_ref: 'case_0001',
    evidence_refs: [
      { kind: 'REVIEW_CASE', ref: 'case_0001' },
      { kind: 'CUSTOMER', ref: customerId },
    ],
    confidence: 1,
  };
}

describe('MemoryService — lifecycle (gate C)', () => {
  it('records an ACTIVE memory with full provenance', async () => {
    const svc = makeService();
    const rec = await svc.recordMemory(preference('cust_0001'));
    expect(rec.status).toBe('ACTIVE');
    expect(isActiveMemory(rec)).toBe(true);
    expect(rec.scope).toBe('CUSTOMER');
    expect(rec.subject_id).toBe('cust_0001');
    expect(rec.memory_id).toMatch(/^mem_/);
    expect(rec.created_at).toBe(FIXED_NOW);
    expect(rec.updated_at).toBe(FIXED_NOW);

    const fetched = await svc.getMemory(rec.memory_id);
    expect(fetched).not.toBeNull();
    expect(fetched!.content).toBe(rec.content);
  });

  it('getMemory returns null for an unknown id', async () => {
    const svc = makeService();
    expect(await svc.getMemory('mem_doesnotexist')).toBeNull();
  });
});

describe('MemoryService — provenance fail-closed (gate D)', () => {
  it('rejects a memory with an empty source_ref', async () => {
    const svc = makeService();
    await expect(
      svc.recordMemory({ ...preference('cust_0001'), source_ref: '' }),
    ).rejects.toBeInstanceOf(ContractValidationError);
  });

  it('rejects a memory with no evidence_refs', async () => {
    const svc = makeService();
    await expect(
      svc.recordMemory({ ...preference('cust_0001'), evidence_refs: [] }),
    ).rejects.toBeInstanceOf(ContractValidationError);
  });

  it('rejects a memory whose evidence ref is not a canonical reference', async () => {
    const svc = makeService();
    await expect(
      svc.recordMemory({
        ...preference('cust_0001'),
        evidence_refs: [{ kind: 'CUSTOMER', ref: 'not a canonical ref!!' }],
      }),
    ).rejects.toBeInstanceOf(ContractValidationError);
  });

  it('rejects a memory with empty content (contract guard)', async () => {
    const svc = makeService();
    await expect(
      svc.recordMemory({ ...preference('cust_0001'), content: '' }),
    ).rejects.toBeInstanceOf(ContractValidationError);
  });
});

describe('MemoryService — idempotency (gate E)', () => {
  it('reprocessing the identical source does not create a duplicate', async () => {
    const svc = makeService();
    const first = await svc.recordMemory(preference('cust_0001'));
    const second = await svc.recordMemory(preference('cust_0001'));

    expect(second.memory_id).toBe(first.memory_id);
    const all = await svc.listMemoriesForSubject('CUSTOMER', 'cust_0001', {
      activeOnly: false,
    });
    expect(all).toHaveLength(1);
  });

  it('a changed content (same source identity) is a distinct record, never a duplicate id', async () => {
    const svc = makeService();
    const first = await svc.recordMemory(preference('cust_0001'));
    const changed = await svc.recordMemory({
      ...preference('cust_0001'),
      content: '客户偏好：新中式风格、偏浅色影调。',
    });
    expect(changed.memory_id).not.toBe(first.memory_id);

    // No two records share an id — reprocessing can never create a duplicate.
    const full = await svc.listMemoriesForSubject('CUSTOMER', 'cust_0001', {
      activeOnly: false,
    });
    expect(full).toHaveLength(2);
    expect(new Set(full.map((m) => m.memory_id)).size).toBe(full.length);

    // An operator corrects knowledge explicitly via supersedeMemory (gate F),
    // which hides the stale record from active reads.
    const corrected = await svc.supersedeMemory(first.memory_id, preference('cust_0001'));
    const active = await svc.listMemoriesForSubject('CUSTOMER', 'cust_0001', {
      activeOnly: true,
    });
    expect(active).toHaveLength(2);
    expect(active.some((m) => m.memory_id === corrected.memory_id)).toBe(true);
  });
});

describe('MemoryService — supersede / invalidate (gate F)', () => {
  it('supersede hides the stale record and keeps the audit trail', async () => {
    const svc = makeService();
    const old = await svc.recordMemory(preference('cust_0001'));
    const updated = await svc.supersedeMemory(old.memory_id, {
      content: '客户偏好：新中式风格、偏深色影调，保留皮肤质感（已确认）。',
      memory_type: 'PREFERENCE',
      source_type: 'HUMAN_REVIEW',
      source_ref: 'case_0001',
      evidence_refs: [
        { kind: 'REVIEW_CASE', ref: 'case_0001' },
        { kind: 'CUSTOMER', ref: 'cust_0001' },
      ],
      confidence: 1,
    });

    expect(updated.status).toBe('ACTIVE');
    expect(updated.supersedes_memory_id).toBe(old.memory_id);

    const stale = await svc.getMemory(old.memory_id);
    expect(stale!.status).toBe('SUPERSEDED');
    expect(stale!.superseded_by_memory_id).toBe(updated.memory_id);

    // Active reads hide the stale record.
    const active = await svc.listMemoriesForSubject('CUSTOMER', 'cust_0001', {
      activeOnly: true,
    });
    expect(active).toHaveLength(1);
    expect(active[0]!.memory_id).toBe(updated.memory_id);
  });

  it('invalidate marks a record INVALIDATED with a mandatory reason', async () => {
    const svc = makeService();
    const rec = await svc.recordMemory(preference('cust_0001'));
    const invalidated = await svc.invalidateMemory(rec.memory_id, '客户已明确表示不再需要该偏好');

    expect(invalidated.status).toBe('INVALIDATED');
    expect(invalidated.invalidation_reason).toBe('客户已明确表示不再需要该偏好');
    expect(isActiveMemory(invalidated)).toBe(false);

    const active = await svc.listMemoriesForSubject('CUSTOMER', 'cust_0001', {
      activeOnly: true,
    });
    expect(active).toHaveLength(0);
  });

  it('rejects superseding / invalidating a non-active memory', async () => {
    const svc = makeService();
    const rec = await svc.recordMemory(preference('cust_0001'));
    await svc.invalidateMemory(rec.memory_id, 'reason');
    await expect(
      svc.supersedeMemory(rec.memory_id, preference('cust_0001')),
    ).rejects.toBeInstanceOf(ContractValidationError);
    await expect(
      svc.invalidateMemory(rec.memory_id, 'again'),
    ).rejects.toBeInstanceOf(ContractValidationError);
  });
});

describe('MemoryService — subject-scoped reads (gate G)', () => {
  it('separates memories by subject and scope', async () => {
    const svc = makeService();
    await svc.recordMemory(preference('cust_0001'));
    await svc.recordMemory(preference('cust_0002'));
    await svc.recordMemory({
      ...preference('cust_0001'),
      subject_type: 'PROJECT',
      subject_id: 'proj_0001',
    });

    const cust1 = await svc.listMemoriesForSubject('CUSTOMER', 'cust_0001');
    expect(cust1).toHaveLength(1);
    const proj1 = await svc.listMemoriesForSubject('PROJECT', 'proj_0001');
    expect(proj1).toHaveLength(1);
    expect(proj1[0]!.scope).toBe('PROJECT');
  });

  it('listForContext merges project + customer memories and dedupes', async () => {
    const svc = makeService();
    await svc.recordMemory(preference('cust_0001'));
    await svc.recordMemory({
      ...preference('cust_0001'),
      subject_type: 'PROJECT',
      subject_id: 'proj_0001',
    });
    const ctx = await svc.listForContext('proj_0001', 'cust_0001');
    expect(ctx).toHaveLength(2);
    // Customer-wide memory shows inside the project context.
    expect(ctx.some((m) => m.subject_type === 'CUSTOMER')).toBe(true);
  });
});

describe('MemoryService — canonical scenario (gate J)', () => {
  it('seed preference → read → supersede hides stale → audit intact', async () => {
    const svc = makeService();
    const seeded = await svc.recordMemory(preference('cust_0001'));

    // Project Detail reads the active customer memory for this project/customer.
    const ctx = await svc.listForContext('proj_linwanqing', 'cust_0001');
    expect(ctx).toHaveLength(1);
    expect(ctx[0]!.content).toContain('新中式');
    expect(ctx[0]!.memory_id).toBe(seeded.memory_id);

    // The preference is corrected → supersede.
    const corrected = await svc.supersedeMemory(seeded.memory_id, {
      content: '客户偏好：新中式风格、偏深色影调（最终确认，避免过度磨皮）。',
      memory_type: 'PREFERENCE',
      source_type: 'HUMAN_REVIEW',
      source_ref: 'case_0001',
      evidence_refs: [
        { kind: 'REVIEW_CASE', ref: 'case_0001' },
        { kind: 'CUSTOMER', ref: 'cust_0001' },
      ],
      confidence: 1,
    });

    // Stale preference is hidden from the Project Detail read.
    const ctxAfter = await svc.listForContext('proj_linwanqing', 'cust_0001');
    expect(ctxAfter).toHaveLength(1);
    expect(ctxAfter[0]!.content).toContain('最终确认');
    expect(ctxAfter[0]!.memory_id).toBe(corrected.memory_id);

    // Audit: the original record is preserved and linked.
    const original = await svc.getMemory(seeded.memory_id);
    expect(original!.status).toBe('SUPERSEDED');
    expect(original!.superseded_by_memory_id).toBe(corrected.memory_id);
    expect(corrected.supersedes_memory_id).toBe(seeded.memory_id);
  });
});

describe('MemoryService — deterministic extraction (no LLM)', () => {
  it('extractMemoriesFromReviewCase derives a DECISION memory with provenance', () => {
    const out = extractMemoriesFromReviewCase(
      {
        case_id: 'case_0001',
        approval: { action: 'EDIT_APPROVE' },
        original_candidate: { candidate_id: 'cand_rev_r1' },
      },
      'cust_0001',
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.memory_type).toBe('DECISION');
    expect(out[0]!.subject_type).toBe('CUSTOMER');
    expect(out[0]!.subject_id).toBe('cust_0001');
    expect(out[0]!.content).toContain('EDIT_APPROVE');
    expect(out[0]!.source_ref).toBe('case_0001');
  });

  it('extraction fails closed when provenance cannot be resolved', () => {
    expect(extractMemoriesFromReviewCase({ case_id: '', approval: null }, 'cust_0001')).toEqual([]);
    expect(
      extractMemoriesFromReviewCase({ case_id: 'case_0001', approval: null }, 'cust_0001'),
    ).toEqual([]);
  });

  it('extractMemoriesFromProcessRun derives an OUTCOME memory for a successful run', () => {
    const out = extractMemoriesFromProcessRun({
      processId: 'proc_abc',
      status: 'SUCCEEDED',
      result: { output: { projectId: 'proj_0001', assetId: 'asset_xyz' } },
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.memory_type).toBe('OUTCOME');
    expect(out[0]!.subject_type).toBe('PROJECT');
    expect(out[0]!.subject_id).toBe('proj_0001');
    expect(out[0]!.evidence_refs.map((e) => e.ref)).toEqual(['proc_abc', 'asset_xyz']);
  });

  it('extraction ignores non-successful runs', () => {
    expect(
      extractMemoriesFromProcessRun({
        processId: 'proc_abc',
        status: 'FAILED',
        result: { output: { projectId: 'proj_0001', assetId: 'asset_xyz' } },
      }),
    ).toEqual([]);
  });
});
