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
 * In-memory `ProcessRegistry`. Correct for a single process; intentionally NOT
 * durable and NOT cross-instance safe. Injected explicitly so no hidden global
 * state leaks between callers or tests.
 */
export class InMemoryProcessRegistry implements ProcessRegistry {
  private readonly byKey = new Map<string, ProcessExecutionRecord>();

  async getByIdempotencyKey(key: string): Promise<ProcessExecutionRecord | null> {
    const found = this.byKey.get(key);
    return found ? { ...found } : null;
  }

  async save(record: ProcessExecutionRecord): Promise<void> {
    this.byKey.set(record.idempotencyKey, { ...record });
  }

  /** Test/diagnostic helper — number of tracked executions. */
  get size(): number {
    return this.byKey.size;
  }
}
