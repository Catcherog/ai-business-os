/**
 * @busos/workspace-run — Operator Workspace run surface (H1-03).
 *
 * The workspace UI imports only from here. It is a read-only projection of the
 * existing P6 orchestrator execution contract; no Feishu/Lumen credential, table
 * id, or raw payload crosses this boundary, and no second business state machine
 * is introduced. The presentation layer should never import `@busos/orchestrator`
 * directly.
 */

export { WorkspaceRunService } from './workspace-run-service.js';
export { toRunSummary, toRunDetail } from './map.js';
export { buildDemoRuns } from './seed.js';

export type {
  RunSummary,
  RunDetail,
  RunStageView,
  RunStageViewStatus,
  RunTraceEventView,
  RunOutcomeView,
  RunOutcomeKind,
} from './types.js';
