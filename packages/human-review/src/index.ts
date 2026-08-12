/**
 * @busos/human-review — BUSOS-P3-01 Minimal Human Review Surface.
 *
 * Approve / Edit+Approve / Reject of REVIEW_REQUIRED Lead candidates.
 * Reuses the P2 golden-path commit path (`commitApprovedCandidate`, `govern`).
 * No Feishu knowledge (D018): depends only on contracts, the golden-path port,
 * and the BusinessRepository boundary.
 */

export type {
  ReviewAction,
  ReviewState,
  AllowedEditField,
  FieldEdit,
  HumanApproval,
  ReviewCase,
  ReviewOutcome,
} from './types.js';

export {
  ALLOWED_EDIT_FIELDS,
  applyEdits,
  cloneCandidate,
  type EditPatch,
  type AppliedEdits,
} from './allowlist.js';

export {
  HumanReviewService,
  type HumanReviewServiceOptions,
} from './review-service.js';

export { InMemoryReviewStore } from './store.js';
