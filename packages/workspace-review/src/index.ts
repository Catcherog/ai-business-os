/**
 * @busos/workspace-review — Operator Workspace review-surface boundary (H1-02).
 *
 * The workspace UI imports only from here. It delegates human review decisions
 * to the existing `@busos/human-review` HumanReviewService; no Feishu
 * specifics ever cross this boundary (D017 / D018).
 */

export { WorkspaceReviewService } from './workspace-review-service.js';
export type {
  WorkspaceReviewServiceOptions,
} from './workspace-review-service.js';

export { buildSeedReviewCases } from './seed.js';

// Re-export the canonical review types so the UI never imports @busos/human-review
// or @busos/contracts directly.
export type {
  ReviewCase,
  ReviewState,
  ReviewAction,
  ReviewOutcome,
  FieldEdit,
  HumanApproval,
  AllowedEditField,
  EditPatch,
} from '@busos/human-review';
