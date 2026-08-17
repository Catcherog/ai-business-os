import type { MemoryRecordV1 } from '@busos/contracts';

/**
 * Persistence port for memory records (H2-01). Narrow on purpose: a durable
 * backend (a table partitioned on `scope`, later) can be dropped in behind this
 * same port without touching `MemoryService` or the UI. H2-01 introduces NO
 * Redis / Postgres / vector DB / CloudBase / Feishu table.
 */
export interface MemoryRepository {
  get(memoryId: string): Promise<MemoryRecordV1 | null>;
  /** Idempotent upsert. Callers are expected to have resolved the id first. */
  save(record: MemoryRecordV1): Promise<void>;
  listBySubject(
    subjectType: MemoryRecordV1['subject_type'],
    subjectId: string,
  ): Promise<MemoryRecordV1[]>;
}

export class InMemoryMemoryRepository implements MemoryRepository {
  private readonly byId = new Map<string, MemoryRecordV1>();

  async get(memoryId: string): Promise<MemoryRecordV1 | null> {
    const found = this.byId.get(memoryId);
    return found ? cloneRecord(found) : null;
  }

  async save(record: MemoryRecordV1): Promise<void> {
    this.byId.set(record.memory_id, cloneRecord(record));
  }

  async listBySubject(
    subjectType: MemoryRecordV1['subject_type'],
    subjectId: string,
  ): Promise<MemoryRecordV1[]> {
    const all = [...this.byId.values()].filter(
      (r) => r.subject_type === subjectType && r.subject_id === subjectId,
    );
    return all
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map(cloneRecord);
  }
}

function cloneRecord(r: MemoryRecordV1): MemoryRecordV1 {
  return JSON.parse(JSON.stringify(r)) as MemoryRecordV1;
}
