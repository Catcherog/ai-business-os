/**
 * BUSOS-P6-02 — Process execution registry (idempotency boundary).
 *
 * Scope discipline: P6-02 only fixes the *boundary* and the orchestrator-level
 * behaviour. No CloudBase / Feishu / Postgres binding, no distributed lock, no
 * leader election, no MQ. A durable implementation can be dropped in later
 * behind this same port without touching `runBusinessProcess`.
 */
import type {
  BusinessProcessResult,
  BusinessProcessStage,
  BusinessProcessStatus,
} from './process-contract.js';

/** One recorded execution, keyed by idempotency key. */
export interface ProcessExecutionRecord {
  idempotencyKey: string;
  processId: string;
  status: BusinessProcessStatus;
  /** ISO-8601 UTC. */
  startedAt: string;
  updatedAt: string;
  currentStage?: BusinessProcessStage;
  /** Absent while `RUNNING`; present once the execution reached a terminal state. */
  result?: BusinessProcessResult;
}

/**
 * Minimal persistence port. Two operations are enough for P6-02 semantics:
 * look up by idempotency key, and upsert the record.
 */
export interface ProcessRegistry {
  getByIdempotencyKey(key: string): Promise<ProcessExecutionRecord | null>;
  save(record: ProcessExecutionRecord): Promise<void>;
}

/**
 * BUSOS-R2-H1-03 — additive READ boundary (H1-03-B).
 *
 * Read-side capability only. It is intentionally a SEPARATE interface from the
 * frozen `ProcessRegistry` execution/idempotency port so that:
 *   - `runBusinessProcess()` still depends only on `ProcessRegistry`;
 *   - existing custom / test `ProcessRegistry` implementations are NOT forced to
 *     implement a list API;
 *   - no persistent run database, Redis, MQ, or CloudBase binding is introduced.
 *
 * `InMemoryProcessRegistry` implements BOTH ports. A durable H3 registry can be
 * dropped in later behind this same read port without touching the orchestrator
 * or the workspace run surface.
 */
export interface ProcessRegistryReadPort {
  /** List recorded executions, most-recently-active first. Optional `limit`. */
  listExecutions(opts?: { limit?: number }): Promise<ProcessExecutionRecord[]>;
  /** Look up a single execution by its `processId`. */
  getByProcessId(processId: string): Promise<ProcessExecutionRecord | null>;
}

/**
 * In-memory `ProcessRegistry`. Correct for a single process; intentionally NOT
 * durable and NOT cross-instance safe. Injected explicitly so no hidden global
 * state leaks between callers or tests.
 */
export class InMemoryProcessRegistry implements ProcessRegistry, ProcessRegistryReadPort {
  private readonly byKey = new Map<string, ProcessExecutionRecord>();

  async getByIdempotencyKey(key: string): Promise<ProcessExecutionRecord | null> {
    const found = this.byKey.get(key);
    return found ? { ...found } : null;
  }

  async save(record: ProcessExecutionRecord): Promise<void> {
    this.byKey.set(record.idempotencyKey, { ...record });
  }

  /**
   * H1-03 read port. Most-recently-active first, by `updatedAt` then `startedAt`,
   * with a stable `processId` tiebreak. Optional bounded `limit`.
   */
  async listExecutions(opts?: { limit?: number }): Promise<ProcessExecutionRecord[]> {
    const all = [...this.byKey.values()].sort((a, b) => {
      const byUpdated = b.updatedAt.localeCompare(a.updatedAt);
      if (byUpdated !== 0) return byUpdated;
      const byStarted = b.startedAt.localeCompare(a.startedAt);
      if (byStarted !== 0) return byStarted;
      return a.processId.localeCompare(b.processId);
    });
    return opts?.limit != null ? all.slice(0, opts.limit) : all;
  }

  async getByProcessId(processId: string): Promise<ProcessExecutionRecord | null> {
    for (const rec of this.byKey.values()) {
      if (rec.processId === processId) return { ...rec };
    }
    return null;
  }

  /** Test/diagnostic helper — number of tracked executions. */
  get size(): number {
    return this.byKey.size;
  }
}
