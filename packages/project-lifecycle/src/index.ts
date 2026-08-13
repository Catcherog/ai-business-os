/**
 * @busos/project-lifecycle — BUSOS-P4-01 Project Lifecycle vertical slice.
 *
 * Scope: convert an eligible Lead into a Project + initial Task and mark the
 * Lead CONVERTED, with readback verification (D019) and minimal compensation.
 * This is a lifecycle slice, NOT a project-management platform.
 *
 * The application layer depends only on the canonical repository port
 * (`ProjectLifecycleRepository`). It never imports Feishu tokens, table ids,
 * field names, or SDK types (D017/D018). All Feishu specifics stay behind
 * `@busos/business-repository` -> `FeishuAdapter`.
 */

export {
  convertLeadToProject,
} from './convert-lead-to-project.js';

export {
  checkConversionEligibility,
  type Eligibility,
} from './eligibility.js';

export {
  resolveScheduledDate,
  isExplicitDate,
  type ScheduledDateResolution,
} from './scheduled-date.js';

export type {
  ProjectLifecycleRepository,
  ProjectLifecycleDeps,
  LifecycleStatus,
  LifecycleWrites,
  LifecycleCompensation,
  InitialTaskInput,
  ConvertLeadToProjectInput,
  ConvertLeadToProjectResult,
  BlockedReason,
  FailedReason,
} from './types.js';
