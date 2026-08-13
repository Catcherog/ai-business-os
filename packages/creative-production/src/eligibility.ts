import type { Project } from '@busos/contracts';
import type { BlockedReason } from './types.js';

/**
 * Creative-production eligibility (P5-D). Evaluated after the Project is loaded,
 * BEFORE any write. Fail closed, zero writes.
 *
 *  - Project missing      -> BLOCKED PROJECT_NOT_FOUND
 *  - Project CANCELLED    -> BLOCKED PROJECT_CANCELLED
 *  - Project DELIVERED    -> BLOCKED PROJECT_DELIVERED
 *  - empty prompt         -> BLOCKED PROMPT_EMPTY
 *  - empty source image   -> BLOCKED SOURCE_IMAGE_EMPTY
 *
 * A CANCELLED/DELIVERED Project is never re-eligible, and the caller must NOT
 * auto-create anything or double-write (no generic dedup engine, per task §6).
 */
export type Eligibility =
  | { kind: 'ALLOWED' }
  | { kind: 'BLOCKED'; reason: BlockedReason };

export function checkCreativeEligibility(
  project: Project | null,
  prompt: string,
  sourceImageBase64: string,
): Eligibility {
  if (project == null) return { kind: 'BLOCKED', reason: 'PROJECT_NOT_FOUND' };
  if (project.status === 'CANCELLED') return { kind: 'BLOCKED', reason: 'PROJECT_CANCELLED' };
  if (project.status === 'DELIVERED') return { kind: 'BLOCKED', reason: 'PROJECT_DELIVERED' };
  if (!prompt || prompt.trim().length === 0) return { kind: 'BLOCKED', reason: 'PROMPT_EMPTY' };
  if (!sourceImageBase64 || sourceImageBase64.length === 0) {
    return { kind: 'BLOCKED', reason: 'SOURCE_IMAGE_EMPTY' };
  }
  return { kind: 'ALLOWED' };
}
