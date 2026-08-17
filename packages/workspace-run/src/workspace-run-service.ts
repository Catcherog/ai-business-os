import type { ProcessRegistryReadPort } from '@busos/orchestrator';
import { toRunDetail, toRunSummary } from './map.js';
import type { RunDetail, RunSummary } from './types.js';

/**
 * `WorkspaceRunService` — the application boundary for the Operator Workspace
 * **Runs** surface (H1-03).
 *
 * It is a thin, READ-ONLY projection over the existing P6 `ProcessRegistryReadPort`
 * (which `InMemoryProcessRegistry` implements). It maps the canonical
 * `ProcessExecutionRecord` / `BusinessProcessResult` into safe presentation view
 * models (`RunSummary` / `RunDetail`) and never:
 *   - executes a business process;
 *   - calls Lumen / Feishu / the orchestrator;
 *   - mutates Project / Task / Asset / Human Review;
 *   - retries / resumes / cancels / reruns / deletes a run;
 *   - builds an observability / logging / metrics pipeline.
 *
 * Boundary discipline (H1-03-G) — verified by the H1-03 smoke + security tests:
 *   - depends only on `@busos/orchestrator` (canonical contract + read port +
 *     existing trace sanitizer). No Feishu/Lumen credential, table id, or raw
 *     payload crosses this boundary; the presentation layer imports only from here.
 *   - it does NOT introduce a second business state machine; the canonical
 *     `BusinessProcessStatus` / stage order / error taxonomy are reused verbatim.
 */
export class WorkspaceRunService {
  constructor(private readonly source: ProcessRegistryReadPort) {}

  /**
   * Runs list, most-recently-active first (delegated to the registry's
   * `listExecutions` ordering). No custom filter framework, no pagination engine.
   */
  async listRuns(opts?: { limit?: number }): Promise<RunSummary[]> {
    const recs = await this.source.listExecutions(opts);
    return recs.map(toRunSummary);
  }

  /** Run Detail — `null` when the process id does not exist (no obscure throw). */
  async getRun(processId: string): Promise<RunDetail | null> {
    const rec = await this.source.getByProcessId(processId);
    if (!rec) return null;
    return toRunDetail(rec);
  }

  /**
   * H1-05 — Project → Related Runs. Filters the same list the Runs surface uses
   * by `output.projectId` (projected onto `RunSummary.projectId`). This is the
   * only addition that lets a Project Detail show its own executions; it reuses
   * the existing read port and adds no second state machine.
   */
  async listRunsByProject(projectId: string): Promise<RunSummary[]> {
    const all = await this.listRuns();
    return all.filter((r) => r.projectId === projectId);
  }
}
