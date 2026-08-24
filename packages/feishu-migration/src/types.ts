export interface SourceRecord {
  source_type: string;
  source_id: string;
  fields: Record<string, unknown>;
}

export interface MigrationDecision<T> {
  source: SourceRecord;
  decision: 'CREATE' | 'UPDATE' | 'SKIP' | 'NEEDS_REVIEW';
  canonical_target: T;
  migration_key: string;
  reason: string;
}

export interface MigrationPlan {
  generated_at: string;
  source_count: number;
  decisions: Array<MigrationDecision<unknown>>;
  manifest_hash: string;
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
