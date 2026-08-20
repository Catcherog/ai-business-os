import { describe, it, expect } from 'vitest';
import { ContractValidationError, type MemoryRecordV1 } from '@busos/contracts';
import {
  MemoryService,
  InMemoryMemoryRepository,
  assembleMemoryContext,
  toMemoryContextSummary,
  redactSecretContent,
  type RecordMemoryInput,
  type MemoryRepository,
} from '../src/index.js';

const FIXED_NOW = '2026-08-17T08:00:00.000Z';

function makeService(): MemoryService {
  return new MemoryService(new InMemoryMemoryRepository(), { now: () => FIXED_NOW });
}

function pref(customerId: string, content = '客户偏好：新中式风格、偏深色影调。'): RecordMemoryInput {
  return {
    subject_type: 'CUSTOMER',
    subject_id: customerId,
    memory_type: 'PREFERENCE',
    content,
    source_type: 'HUMAN_REVIEW',
    source_ref: `case_${customerId}`,
    evidence_refs: [
      { kind: 'REVIEW_CASE', ref: `case_${customerId}` },
      { kind: 'CUSTOMER', ref: customerId },
    ],
    confidence: 1,
  };
}

function projMem(projectId: string, content: string): RecordMemoryInput {
  return {
    subject_type: 'PROJECT',
    subject_id: projectId,
    memory_type: 'OUTCOME',
    content,
    source_type: 'PROCESS_RUN',
    source_ref: `proc_${projectId}`,
    evidence_refs: [
      { kind: 'PROCESS_RUN', ref: `proc_${projectId}` },
      { kind: 'ASSET', ref: `asset_${projectId}` },
    ],
    confidence: 1,
  };
}

describe('H2-02-B — deterministic context assembly', () => {
  it('produces identical ordering/representation regardless of insertion order', async () => {
    const svcA = makeService();
    await svcA.recordMemory(pref('cust_a', '偏好一'));
    await svcA.recordMemory(pref('cust_a', '偏好二'));
    await svcA.recordMemory(projMem('proj_a', '结果一'));
    const a = await assembleMemoryContext(svcA, { projectId: 'proj_a', customerId: 'cust_a' });

    const svcB = makeService();
    // Insert in reverse order to prove ordering is not insertion-dependent.
    await svcB.recordMemory(projMem('proj_a', '结果一'));
    await svcB.recordMemory(pref('cust_a', '偏好二'));
    await svcB.recordMemory(pref('cust_a', '偏好一'));
    const b = await assembleMemoryContext(svcB, { projectId: 'proj_a', customerId: 'cust_a' });

    expect(JSON.stringify(a.records)).toBe(JSON.stringify(b.records));
    expect(a.records.map((r) => r.memory_id)).toEqual(b.records.map((r) => r.memory_id));
    // CUSTOMER records sort before PROJECT records; stable tie-break by updated_at then id.
    expect(a.records[0].subject_type).toBe('CUSTOMER');
    expect(a.records[2].subject_type).toBe('PROJECT');
  });
});

describe('H2-02-C — scope isolation', () => {
  it('a project reads only its own + its customer memories (no cross-leak)', async () => {
    const svc = makeService();
    await svc.recordMemory(pref('cust_a'));
    await svc.recordMemory(pref('cust_b', '其他客户偏好'));
    await svc.recordMemory(projMem('proj_a', '项目A结果'));
    await svc.recordMemory(projMem('proj_b', '项目B结果'));

    const ctx = await assembleMemoryContext(svc, { projectId: 'proj_a', customerId: 'cust_a' });
    const ids = ctx.records.map((r) => r.memory_id);
    expect(ids).toHaveLength(2);
    expect(ctx.records.every((r) => r.subject_id === 'cust_a' || r.subject_id === 'proj_a')).toBe(true);
    // cust_b / proj_b memories must NOT leak in.
    expect(ctx.records.some((r) => r.subject_id === 'cust_b')).toBe(false);
    expect(ctx.records.some((r) => r.subject_id === 'proj_b')).toBe(false);
  });

  it('omitting customerId excludes customer-wide memories (project-only)', async () => {
    const svc = makeService();
    await svc.recordMemory(pref('cust_a'));
    await svc.recordMemory(projMem('proj_a', '项目A结果'));
    const ctx = await assembleMemoryContext(svc, { projectId: 'proj_a' });
    expect(ctx.records).toHaveLength(1);
    expect(ctx.records[0].subject_id).toBe('proj_a');
  });
});

describe('H2-02-D — lifecycle (non-active excluded)', () => {
  it('superseded memory is hidden, replacement is present', async () => {
    const svc = makeService();
    const first = await svc.recordMemory(pref('cust_a', '旧偏好'));
    const updated = await svc.supersedeMemory(first.memory_id, {
      content: '新偏好',
      memory_type: 'PREFERENCE',
      source_type: 'HUMAN_REVIEW',
      source_ref: 'case_cust_a_v2',
      evidence_refs: [
        { kind: 'REVIEW_CASE', ref: 'case_cust_a_v2' },
        { kind: 'CUSTOMER', ref: 'cust_a' },
      ],
      confidence: 1,
    });
    const ctx = await assembleMemoryContext(svc, { projectId: 'proj_a', customerId: 'cust_a' });
    const ids = ctx.records.map((r) => r.memory_id);
    expect(ids).toContain(updated.memory_id);
    expect(ids).not.toContain(first.memory_id);
    expect(ctx.records).toHaveLength(1);
  });

  it('invalidated memory is excluded', async () => {
    const svc = makeService();
    const rec = await svc.recordMemory(pref('cust_a'));
    await svc.invalidateMemory(rec.memory_id, '不再适用');
    const ctx = await assembleMemoryContext(svc, { projectId: 'proj_a', customerId: 'cust_a' });
    expect(ctx.records).toHaveLength(0);
    expect(ctx.count).toBe(0);
  });
});

describe('H2-02-E — provenance fail-closed', () => {
  it('a record with non-canonical provenance makes assembly throw (never silently included)', async () => {
    const bad: MemoryRecordV1 = {
      version: 'memory_record.v1',
      memory_id: 'mem_bad',
      scope: 'CUSTOMER',
      subject_type: 'CUSTOMER',
      subject_id: 'cust_a',
      memory_type: 'PREFERENCE',
      content: '注入的记忆',
      // non-canonical source_ref — would never pass the write-time gate.
      source_type: 'HUMAN_REVIEW',
      source_ref: 'NOT A CANONICAL REF!!!',
      evidence_refs: [{ kind: 'CUSTOMER', ref: 'cust_a' }],
      confidence: 1,
      status: 'ACTIVE',
      supersedes_memory_id: null,
      superseded_by_memory_id: null,
      invalidation_reason: null,
      created_at: FIXED_NOW,
      updated_at: FIXED_NOW,
    };
    const fakeRepo: MemoryRepository = {
      async get() { return null; },
      async save() {},
      async listBySubject() { return [bad]; },
    };
    const svc = new MemoryService(fakeRepo, { now: () => FIXED_NOW });
    await expect(
      assembleMemoryContext(svc, { projectId: 'proj_a', customerId: 'cust_a' }),
    ).rejects.toBeInstanceOf(ContractValidationError);
  });
});

describe('H2-02-F — bounded context', () => {
  it('enforces maxRecords and marks truncated', async () => {
    const svc = makeService();
    for (let i = 0; i < 5; i++) {
      await svc.recordMemory(pref('cust_a', `偏好${i}`));
    }
    const ctx = await assembleMemoryContext(
      svc,
      { projectId: 'proj_a', customerId: 'cust_a' },
      { limits: { maxRecords: 2, maxContentLength: 500, maxTotalContentLength: 4000 } },
    );
    expect(ctx.records).toHaveLength(2);
    expect(ctx.count).toBe(2);
    expect(ctx.truncated).toBe(true);
  });

  it('clamps per-record content length', async () => {
    const svc = makeService();
    await svc.recordMemory(pref('cust_a', '这是一个明显超过长度限制的长内容用于测试截断行为是否生效'));
    const ctx = await assembleMemoryContext(
      svc,
      { projectId: 'proj_a', customerId: 'cust_a' },
      { limits: { maxRecords: 20, maxContentLength: 10, maxTotalContentLength: 4000 } },
    );
    expect(ctx.records[0].content.length).toBe(11); // 10 chars + '…'
    expect(ctx.records[0].content.endsWith('…')).toBe(true);
  });
});

describe('H2-02 — secret redaction (defense in depth)', () => {
  it('redactSecretContent never carries a credential value', () => {
    expect(redactSecretContent('user password=supersecret123 ok')).toBe('user password=[REDACTED] ok');
    expect(redactSecretContent('api_key: abc123 held')).toBe('api_key=[REDACTED] held');
    // Ordinary business language is untouched.
    expect(redactSecretContent('客户偏好：新中式风格')).toBe('客户偏好：新中式风格');
  });

  it('a memory whose content carries a credential is redacted in the context', async () => {
    const svc = makeService();
    await svc.recordMemory(pref('cust_a', '拍摄注意：password=hunter2 不要外泄'));
    const ctx = await assembleMemoryContext(svc, { projectId: 'proj_a', customerId: 'cust_a' });
    expect(ctx.records[0].content).toContain('password=[REDACTED]');
    expect(ctx.records[0].content).not.toContain('hunter2');
  });

  it('summary is content-free (safe for trace / UI)', async () => {
    const svc = makeService();
    await svc.recordMemory(pref('cust_a'));
    const ctx = await assembleMemoryContext(svc, { projectId: 'proj_a', customerId: 'cust_a' });
    const summary = toMemoryContextSummary(ctx);
    expect(summary.count).toBe(1);
    expect(summary.types).toEqual(['PREFERENCE']);
    expect(summary.refs[0]).toMatch(/^mem_/);
    expect(JSON.stringify(summary)).not.toContain('新中式');
  });
});
