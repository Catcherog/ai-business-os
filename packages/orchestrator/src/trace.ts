import type { ProcessStage, ProcessStageEvent, ProcessTrace } from './types.js';

/**
 * Minimal in-memory execution trace collector.
 *
 * Observability for the composed business process: every stage is recorded with
 * start/end/duration and an OK/FAILED status. A stage is marked FAILED either
 * when the wrapped call throws (exception) or when the supplied `isSuccess`
 * predicate reports a business-level failure (e.g. a slice returning a
 * non-SUCCESS status). This is what makes the (otherwise silent) deferred live
 * CREATIVE_SUCCESS rerun observable once CloudBase quota is available (BL-016).
 */
export class TraceCollector {
  private readonly stages: ProcessStageEvent[] = [];
  private readonly startedAtMs = Date.now();

  async stage<T>(
    stage: ProcessStage,
    fn: () => Promise<T>,
    isSuccess?: (value: T) => boolean,
  ): Promise<T> {
    const startedAtMs = Date.now();
    try {
      const value = await fn();
      const ok = isSuccess ? isSuccess(value) : true;
      const endedAtMs = Date.now();
      this.stages.push({
        stage,
        status: ok ? 'OK' : 'FAILED',
        startedAtMs,
        endedAtMs,
        durationMs: endedAtMs - startedAtMs,
      });
      return value;
    } catch (e) {
      const endedAtMs = Date.now();
      this.stages.push({
        stage,
        status: 'FAILED',
        startedAtMs,
        endedAtMs,
        durationMs: endedAtMs - startedAtMs,
        detail: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  snapshot(): ProcessTrace {
    return {
      stages: [...this.stages],
      startedAtMs: this.startedAtMs,
      endedAtMs: Date.now(),
    };
  }
}
