/**
 * @busos/creative-production — BUSOS-P5-01 Creative Production vertical slice.
 *
 * Scope: drive the bounded path Project -> Creative Task -> Lumen -> Asset (and
 * mark the Task DONE), with readback verification (D019) and minimal
 * compensation. This is a creative-production slice, NOT a DAM, workflow
 * engine, or multi-agent orchestrator.
 *
 * The application layer depends only on the canonical repository port
 * (`CreativeProductionRepository`) and `LumenPort`. It never imports Feishu
 * tokens, table ids, field names, or Lumen HTTP paths / provider key
 * (D017/D018). All Feishu specifics stay behind `@busos/business-repository`;
 * all Lumen specifics stay behind `@busos/lumen-adapter`.
 */

export { executeCreativeProduction } from './execute.js';

export {
  checkCreativeEligibility,
  type Eligibility,
} from './eligibility.js';

export type {
  CreativeProductionRepository,
  CreativeProductionDeps,
  CreativeProductionInput,
  CreativeProductionResult,
  CreativeProductionWrites,
  CreativeProductionCompensation,
  CreativeStatus,
  BlockedReason,
  FailedReason,
} from './types.js';
