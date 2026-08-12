/**
 * @busos/golden-path — BUSOS-P2-GP-001 Golden Path vertical slice.
 *
 * Thin orchestration only. It wires the frozen P1 building blocks
 * (Service Agent candidate -> Governance -> BusinessRepository -> FeishuAdapter
 * -> readback) into one deterministic chain. No Feishu knowledge, no new
 * architecture, no UI, no framework.
 */

export type {
  GoldenPathRepository,
  GoldenPathStatus,
  WriteCounts,
  GoldenPathResult,
  GoldenPathInput,
  GoldenPathDeps,
  CandidateBuilder,
  GovernanceFn,
} from './types.js';

export {
  buildCandidateFromInput,
  DEFAULT_AGENT_INTENT,
  DEFAULT_INTENT_CONFIDENCE,
} from './candidate.js';

export { govern, governancePermitsWrite } from './governance.js';

export { executeGoldenPath } from './execute-golden-path.js';
