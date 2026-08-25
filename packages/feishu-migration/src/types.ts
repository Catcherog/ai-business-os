export interface SourceRecord {
  source_type: string;
  source_id: string;
  fields: Record<string, unknown>;
}

export interface MigrationConflict {
  field: string;
  /** All distinct values observed for this field, including the chosen value. */
  values: string[];
  /** Source record that supplied the selected value. */
  chosenSource: string;
  /** Structured form retained for callers that need to preserve non-text values. */
  chosen: unknown;
  alternatives: unknown[];
  source_ids: string[];
}

export type MigrationConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface MigrationDecision<T> {
  source: SourceRecord;
  decision: 'CREATE' | 'UPDATE' | 'SKIP' | 'NEEDS_REVIEW';
  canonical_target: T;
  migration_key: string;
  reason: string;
  confidence?: MigrationConfidence;
  conflicts?: MigrationConflict[];
  entity_type?: string;
}

export interface MigrationBatch {
  entity_type: string;
  decisions: Array<MigrationDecision<unknown>>;
}

export type TargetSnapshotEntry = SourceRecord | Record<string, unknown>;

export interface TargetSnapshot {
  records?: TargetSnapshotEntry[];
  customers?: TargetSnapshotEntry[];
  projects?: TargetSnapshotEntry[];
  resources?: TargetSnapshotEntry[];
  content?: TargetSnapshotEntry[];
  [key: string]: unknown;
}

export interface MigrationPlan {
  generated_at: string;
  source_count: number;
  decisions: Array<MigrationDecision<unknown>>;
  manifest_hash: string;
  executable_decisions?: Array<MigrationDecision<unknown>>;
  review_decisions?: Array<MigrationDecision<unknown>>;
  executable_batches?: MigrationBatch[];
}

export interface VerificationReport {
  verified_at: string;
  planned_count: number;
  applied_count: number;
  mismatches: Array<{
    migration_key: string;
    reason: string;
  }>;
}

export { stableHash } from './hash.js';
export { redactForLog } from './redact.js';
export {
  buildMigrationPlan,
  canonicalizeXiaohongshuUrl,
  deduplicateRecords,
  normalizeProjectCode,
} from './dedupe.js';
export type { NormalizedMigrationRecord } from './dedupe.js';
export { bootstrapTargetSchema, getTargetSchemaFingerprint } from './bootstrap.js';
export { TARGET_SCHEMA } from './target-schema.js';
export type {
  AddedSchemaField,
  SchemaBootstrapClient,
  SchemaConflict,
  SchemaDiffResult,
  SchemaDiffStatus,
} from './bootstrap.js';
export type {
  SchemaFieldDefinition,
  SchemaTableDefinition,
} from './target-schema.js';
export { createMigrationManifest, generateMigrationManifest, targetTableName } from './plan.js';
export type {
  CreateManifestOptions,
  MigrationManifest,
  MigrationManifestExpected,
} from './plan.js';
export { applyMigration, selectCanaryDecisions } from './apply.js';
export type {
  ApplyFieldMismatch,
  ApplyOptions,
  ApplyRecordResult,
  ApplyReport,
  CanaryReport,
  MigrationWriteClient,
} from './apply.js';
export { verifyMigration } from './verify-live.js';
export type { LiveVerificationReport, VerifyOptions } from './verify-live.js';
export {
  parseRedactedCanaryArtifact,
  parseRedactedManifestArtifact,
  redactApplyReport,
  redactLiveVerificationReport,
  redactMigrationManifest,
  rehydrateCanaryReport,
  rehydrateMigrationManifest,
} from './artifact.js';
export type {
  RedactedApplyArtifact,
  RedactedCanaryArtifact,
  RedactedManifestArtifact,
  RedactedManifestDecision,
  RedactedVerificationArtifact,
} from './artifact.js';
