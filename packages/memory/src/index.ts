/**
 * @busos/memory — Canonical governed Memory foundation (R2-H2-01).
 *
 * An intelligence layer over canonical BUSOS entities, NOT a second database:
 *   - every record is ANCHORED to a canonical subject (CUSTOMER / PROJECT);
 *   - every record carries PROVENANCE (source + evidence refs);
 *   - every record has a LIFECYCLE (ACTIVE → SUPERSEDED / INVALIDATED) — no
 *     destructive deletion;
 *   - record ids are DERIVED from canonical input, so reprocessing is idempotent.
 *
 * No LLM, no embeddings, no vector DB. Business logic lives in `MemoryService`,
 * never in the UI.
 */

export { MemoryService } from './memory-service.js';
export type { RecordMemoryInput, SupersedeMemoryInput } from './memory-service.js';
export {
  extractMemoriesFromReviewCase,
  extractMemoriesFromProcessRun,
  type ReviewCaseLike,
  type ProcessRunLike,
} from './memory-service.js';

export { InMemoryMemoryRepository } from './memory-repository.js';
export type { MemoryRepository } from './memory-repository.js';
export { deriveMemoryId, isCanonicalRef, fnv1a64 } from './id.js';

export { seedCanonicalMemory } from './seed.js';
export type { SeedMemoryOptions } from './seed.js';
