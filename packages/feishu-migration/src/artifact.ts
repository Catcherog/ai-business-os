import type {
  ApplyFieldMismatch,
  ApplyRecordResult,
  ApplyReport,
  CanaryReport,
} from './apply.js';
import type { SourceInventory } from './inventory.js';
import {
  manifestDecisions,
  targetTableName,
  type MigrationManifest,
} from './plan.js';
import { stableHash } from './hash.js';
import type { MigrationBatch, MigrationDecision } from './types.js';
import type { LiveVerificationReport, VerificationMismatch } from './verify-live.js';
import { createMigrationManifest } from './plan.js';

const ARTIFACT_VERSION = 1 as const;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_TARGET_TABLES = new Set([
  'Customers',
  'Projects',
  'Resources',
  'Resource Availability',
  'Publish Items',
  'Media Assets',
  'Content Research',
  'Communication Scripts',
  'Knowledge',
  'Migration Registry',
  'Unknown',
]);

export interface RedactedManifestDecision {
  migration_key_hash: string;
  decision: MigrationDecision<unknown>['decision'];
  entity_type: string;
  confidence: NonNullable<MigrationDecision<unknown>['confidence']>;
  target_table: string;
  payload_hash: string;
  source_payload_hash: string;
}

export interface RedactedManifestArtifact {
  artifact_type: 'feishu-migration-manifest';
  artifact_version: typeof ARTIFACT_VERSION;
  run_id: string;
  generated_at: string;
  source_count: number;
  target_before_counts: Record<string, number>;
  target_schema_fingerprint: string;
  expected_counts: Record<'creates' | 'updates' | 'skips' | 'needs_review', number>;
  decision_count: number;
  decisions: RedactedManifestDecision[];
  manifest_hash: string;
  artifact_hash: string;
}

export interface RedactedCanaryArtifact {
  artifact_type: 'feishu-migration-canary-report';
  artifact_version: typeof ARTIFACT_VERSION;
  run_id: string;
  status: CanaryReport['status'];
  selected_key_hashes: string[];
  field_mismatch_count: number;
  untracked_writes: number;
  schema_conflict_count: number;
  result_counts: Record<ApplyRecordResult['status'], number>;
  artifact_hash: string;
}

export interface RedactedApplyArtifact {
  artifact_type: 'feishu-migration-apply-report';
  artifact_version: typeof ARTIFACT_VERSION;
  run_id: string;
  mode: ApplyReport['mode'];
  status: ApplyReport['status'];
  result_counts: Record<ApplyRecordResult['status'], number>;
  result_key_hashes: Array<{
    migration_key_hash: string;
    target_table: string;
    status: ApplyRecordResult['status'];
    target_record_id_hash?: string;
    reason_hash: string;
  }>;
  field_mismatch_count: number;
  field_mismatch_hashes: Array<{
    migration_key_hash: string;
    field_hash: string;
    reason_hash: string;
  }>;
  untracked_writes: number;
  schema_conflict_count: number;
  schema_conflict_hashes: string[];
  business_writes: number;
  registry_writes: number;
  canary?: RedactedCanaryArtifact;
  artifact_hash: string;
}

export interface RedactedVerificationArtifact {
  artifact_type: 'feishu-migration-verification-report';
  artifact_version: typeof ARTIFACT_VERSION;
  verified_at: string;
  planned_count: number;
  applied_count: number;
  status: LiveVerificationReport['status'];
  target_counts: Record<string, number>;
  unique_migration_keys: boolean;
  payload_hashes_verified: boolean;
  required_fields_verified: boolean;
  schema_fingerprint_verified: boolean;
  mismatch_count: number;
  mismatch_hashes: Array<{ migration_key_hash: string; reason_hash: string }>;
  dangling_canonical_id_count: number;
  dangling_canonical_id_hashes: string[];
  sample_readback_hashes: string[];
  artifact_hash: string;
}

type ExpectedAction = keyof RedactedManifestArtifact['expected_counts'];

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

function structuralTargetTable(decision: MigrationDecision<unknown>): string {
  const table = targetTableName(decision);
  return SAFE_TARGET_TABLES.has(table) ? table : 'Unknown';
}

function increment<T extends string>(counts: Record<T, number>, key: T): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function expectedCounts(decisions: MigrationDecision<unknown>[]): RedactedManifestArtifact['expected_counts'] {
  const counts: RedactedManifestArtifact['expected_counts'] = {
    creates: 0,
    updates: 0,
    skips: 0,
    needs_review: 0,
  };
  for (const decision of decisions) {
    const action: ExpectedAction = decision.decision === 'CREATE'
      ? 'creates'
      : decision.decision === 'UPDATE'
        ? 'updates'
        : decision.decision === 'SKIP'
          ? 'skips'
          : 'needs_review';
    counts[action] += 1;
  }
  return counts;
}

function withArtifactHash<T extends object>(value: T): T & { artifact_hash: string } {
  return { ...value, artifact_hash: stableHash(value) } as T & { artifact_hash: string };
}

function assertSafeKeys(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafeKeys(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (/^(?:raw_migration_key|migration_key|selected_keys|source|source_id|record_id|target_record_id|canonical_target|phone|wechat|url)$/iu.test(key)) {
      throw new Error(`UNSAFE_MANIFEST_ARTIFACT: forbidden field ${path}.${key}`);
    }
    assertSafeKeys(entry, `${path}.${key}`);
  }
}

function assertHash(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    throw new Error(`UNSAFE_MANIFEST_ARTIFACT: invalid ${field}`);
  }
}

function assertManifestArtifact(value: unknown): asserts value is RedactedManifestArtifact {
  assertSafeKeys(value);
  if (!value || typeof value !== 'object') throw new Error('UNSAFE_MANIFEST_ARTIFACT: expected object');
  const artifact = value as Partial<RedactedManifestArtifact>;
  if (artifact.artifact_type !== 'feishu-migration-manifest' || artifact.artifact_version !== ARTIFACT_VERSION) {
    throw new Error('UNSAFE_MANIFEST_ARTIFACT: unsupported artifact type or version');
  }
  if (typeof artifact.run_id !== 'string' || typeof artifact.generated_at !== 'string') {
    throw new Error('UNSAFE_MANIFEST_ARTIFACT: missing run metadata');
  }
  const sourceCount = artifact.source_count;
  const decisionCount = artifact.decision_count;
  const decisions = artifact.decisions;
  if (typeof sourceCount !== 'number' || !Number.isInteger(sourceCount) || sourceCount < 0 ||
      typeof decisionCount !== 'number' || !Number.isInteger(decisionCount) || decisionCount < 0 ||
      !Array.isArray(decisions) || decisions.length !== decisionCount) {
    throw new Error('UNSAFE_MANIFEST_ARTIFACT: invalid counts or decisions');
  }
  if (!artifact.target_before_counts || typeof artifact.target_before_counts !== 'object' ||
      !artifact.expected_counts || typeof artifact.expected_counts !== 'object') {
    throw new Error('UNSAFE_MANIFEST_ARTIFACT: missing count metadata');
  }
  if (typeof artifact.target_schema_fingerprint !== 'string' || !artifact.target_schema_fingerprint.trim()) {
    throw new Error('UNSAFE_MANIFEST_ARTIFACT: invalid target_schema_fingerprint');
  }
  assertHash(artifact.manifest_hash, 'manifest_hash');
  assertHash(artifact.artifact_hash, 'artifact_hash');
  const { artifact_hash: _ignored, ...payload } = artifact;
  if (stableHash(payload) !== artifact.artifact_hash) {
    throw new Error('UNSAFE_MANIFEST_ARTIFACT: artifact hash mismatch');
  }
  const keys = new Set<string>();
  for (const decision of decisions) {
    if (!decision || typeof decision !== 'object') throw new Error('UNSAFE_MANIFEST_ARTIFACT: invalid decision');
    assertHash(decision.migration_key_hash, 'migration_key_hash');
    assertHash(decision.payload_hash, 'payload_hash');
    assertHash(decision.source_payload_hash, 'source_payload_hash');
    if (keys.has(decision.migration_key_hash)) {
      throw new Error('UNSAFE_MANIFEST_ARTIFACT: duplicate migration key hash');
    }
    keys.add(decision.migration_key_hash);
  }
}

function expectedActions(decisions: MigrationDecision<unknown>[]): Record<'creates' | 'updates' | 'skips' | 'needs_review', string[]> {
  const result: Record<'creates' | 'updates' | 'skips' | 'needs_review', string[]> = {
    creates: [],
    updates: [],
    skips: [],
    needs_review: [],
  };
  for (const decision of decisions) {
    const key = decision.migration_key;
    if (decision.decision === 'CREATE') result.creates.push(key);
    else if (decision.decision === 'UPDATE') result.updates.push(key);
    else if (decision.decision === 'SKIP') result.skips.push(key);
    else result.needs_review.push(key);
  }
  for (const values of Object.values(result)) values.sort();
  return result;
}

function executable(decision: MigrationDecision<unknown>): boolean {
  return decision.decision === 'CREATE' || decision.decision === 'UPDATE';
}

function batches(decisions: MigrationDecision<unknown>[]): MigrationBatch[] {
  const grouped = new Map<string, MigrationDecision<unknown>[]>();
  for (const decision of decisions.filter(executable)) {
    const entityType = decision.entity_type ?? 'unknown';
    const current = grouped.get(entityType) ?? [];
    current.push(decision);
    grouped.set(entityType, current);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([entity_type, group]) => {
      const result: MigrationBatch[] = [];
      for (let index = 0; index < group.length; index += 100) {
        result.push({ entity_type, decisions: group.slice(index, index + 100) });
      }
      return result;
    });
}

export function redactMigrationManifest(manifest: MigrationManifest): RedactedManifestArtifact {
  const decisions = manifestDecisions(manifest);
  const redacted: Omit<RedactedManifestArtifact, 'artifact_hash'> = {
    artifact_type: 'feishu-migration-manifest',
    artifact_version: ARTIFACT_VERSION,
    run_id: manifest.run_id,
    generated_at: manifest.generated_at,
    source_count: manifest.source_count,
    target_before_counts: sortRecord({ ...manifest.target_before_counts }),
    target_schema_fingerprint: manifest.target_schema_fingerprint,
    expected_counts: expectedCounts(decisions),
    decision_count: decisions.length,
    decisions: decisions.map((decision) => ({
      migration_key_hash: stableHash(decision.migration_key),
      decision: decision.decision,
      entity_type: decision.entity_type ?? 'unknown',
      confidence: decision.confidence ?? 'LOW',
      target_table: structuralTargetTable(decision),
      payload_hash: manifest.payload_hashes[decision.migration_key],
      source_payload_hash: manifest.source_payload_hashes[decision.migration_key],
    })).sort((left, right) => left.migration_key_hash.localeCompare(right.migration_key_hash)),
    manifest_hash: manifest.manifest_hash,
  };
  const artifact = withArtifactHash(redacted);
  assertManifestArtifact(artifact);
  return artifact;
}

export function parseRedactedManifestArtifact(value: unknown): RedactedManifestArtifact {
  assertManifestArtifact(value);
  return value;
}

function sourceDecisionMap(manifest: MigrationManifest): Map<string, MigrationDecision<unknown>> {
  const result = new Map<string, MigrationDecision<unknown>>();
  for (const decision of manifestDecisions(manifest)) {
    const hash = stableHash(decision.migration_key);
    if (result.has(hash)) throw new Error('SOURCE_INVENTORY_DRIFT: duplicate migration key hash');
    result.set(hash, decision);
  }
  return result;
}

export function rehydrateMigrationManifest(
  artifact: RedactedManifestArtifact,
  inventory: SourceInventory,
): MigrationManifest {
  assertManifestArtifact(artifact);
  const sourceManifest = createMigrationManifest(inventory, { records: [] }, {
    run_id: artifact.run_id,
    target_schema_fingerprint: artifact.target_schema_fingerprint,
  });
  if (sourceManifest.source_count !== artifact.source_count) {
    throw new Error('SOURCE_INVENTORY_DRIFT: source count changed');
  }
  const current = sourceDecisionMap(sourceManifest);
  const artifactByKey = new Map(artifact.decisions.map((decision) => [decision.migration_key_hash, decision]));
  if (current.size !== artifactByKey.size) {
    throw new Error('SOURCE_INVENTORY_DRIFT: migration key set changed');
  }
  const decisions = manifestDecisions(sourceManifest).map((decision) => {
    const keyHash = stableHash(decision.migration_key);
    const saved = artifactByKey.get(keyHash);
    if (!saved) throw new Error('SOURCE_INVENTORY_DRIFT: migration key set changed');
    const currentPayloadHash = sourceManifest.payload_hashes[decision.migration_key];
    const currentSourcePayloadHash = sourceManifest.source_payload_hashes[decision.migration_key];
    if (currentPayloadHash !== saved.payload_hash || currentSourcePayloadHash !== saved.source_payload_hash) {
      throw new Error('SOURCE_PAYLOAD_DRIFT: source payload hash changed');
    }
    if (saved.entity_type !== (decision.entity_type ?? 'unknown')) {
      throw new Error('SOURCE_PAYLOAD_DRIFT: source entity type changed');
    }
    return {
      ...decision,
      decision: saved.decision,
      confidence: saved.confidence,
      entity_type: saved.entity_type,
    };
  });
  const executableDecisions = decisions.filter(executable);
  const reviewDecisions = decisions.filter((decision) => decision.decision === 'NEEDS_REVIEW');
  const expected = expectedActions(decisions);
  return {
    run_id: artifact.run_id,
    generated_at: artifact.generated_at,
    source_count: artifact.source_count,
    target_before_counts: { ...artifact.target_before_counts },
    target_schema_fingerprint: artifact.target_schema_fingerprint,
    expected,
    payload_hashes: Object.fromEntries(decisions.map((decision) => [decision.migration_key, sourceManifest.payload_hashes[decision.migration_key]])),
    source_payload_hashes: Object.fromEntries(decisions.map((decision) => [decision.migration_key, sourceManifest.source_payload_hashes[decision.migration_key]])),
    plan: {
      ...sourceManifest.plan,
      generated_at: artifact.generated_at,
      source_count: artifact.source_count,
      decisions,
      executable_decisions: executableDecisions,
      review_decisions: reviewDecisions,
      executable_batches: batches(decisions),
    },
    manifest_hash: artifact.manifest_hash,
  };
}

function redactedFieldMismatch(mismatch: ApplyFieldMismatch): RedactedApplyArtifact['field_mismatch_hashes'][number] {
  return {
    migration_key_hash: stableHash(mismatch.migration_key),
    field_hash: stableHash(mismatch.field),
    reason_hash: stableHash(mismatch.reason),
  };
}

function redactedResult(result: ApplyRecordResult): RedactedApplyArtifact['result_key_hashes'][number] {
  return {
    migration_key_hash: stableHash(result.migration_key),
    target_table: SAFE_TARGET_TABLES.has(result.target_table) ? result.target_table : 'Unknown',
    status: result.status,
    ...(result.target_record_id ? { target_record_id_hash: stableHash(result.target_record_id) } : {}),
    reason_hash: stableHash(result.reason),
  };
}

function resultCounts(results: ApplyRecordResult[]): Record<ApplyRecordResult['status'], number> {
  const counts: Record<ApplyRecordResult['status'], number> = {
    APPLIED: 0,
    SKIP: 0,
    NEEDS_REVIEW: 0,
    FAILED: 0,
  };
  for (const result of results) increment(counts, result.status);
  return counts;
}

function redactCanaryReport(report: CanaryReport): RedactedCanaryArtifact {
  const payload: Omit<RedactedCanaryArtifact, 'artifact_hash'> = {
    artifact_type: 'feishu-migration-canary-report',
    artifact_version: ARTIFACT_VERSION,
    run_id: report.run_id,
    status: report.status,
    selected_key_hashes: report.selected_keys.map((key) => stableHash(key)).sort(),
    field_mismatch_count: report.field_mismatches.length,
    untracked_writes: report.untracked_writes,
    schema_conflict_count: report.schema_conflicts.length,
    result_counts: resultCounts(report.results),
  };
  return withArtifactHash(payload);
}

export function redactApplyReport(report: ApplyReport): RedactedApplyArtifact {
  const payload: Omit<RedactedApplyArtifact, 'artifact_hash'> = {
    artifact_type: 'feishu-migration-apply-report',
    artifact_version: ARTIFACT_VERSION,
    run_id: report.run_id,
    mode: report.mode,
    status: report.status,
    result_counts: resultCounts(report.results),
    result_key_hashes: report.results.map(redactedResult),
    field_mismatch_count: report.field_mismatches.length,
    field_mismatch_hashes: report.field_mismatches.map(redactedFieldMismatch),
    untracked_writes: report.untracked_writes,
    schema_conflict_count: report.schema_conflicts.length,
    schema_conflict_hashes: report.schema_conflicts.map((value) => stableHash(value)).sort(),
    business_writes: report.business_writes,
    registry_writes: report.registry_writes,
    ...(report.canary_report ? { canary: redactCanaryReport(report.canary_report) } : {}),
  };
  return withArtifactHash(payload);
}

export function redactLiveVerificationReport(report: LiveVerificationReport): RedactedVerificationArtifact {
  const payload: Omit<RedactedVerificationArtifact, 'artifact_hash'> = {
    artifact_type: 'feishu-migration-verification-report',
    artifact_version: ARTIFACT_VERSION,
    verified_at: report.verified_at,
    planned_count: report.planned_count,
    applied_count: report.applied_count,
    status: report.status,
    target_counts: sortRecord({ ...report.target_counts }),
    unique_migration_keys: report.unique_migration_keys,
    payload_hashes_verified: report.payload_hashes_verified,
    required_fields_verified: report.required_fields_verified,
    schema_fingerprint_verified: report.schema_fingerprint_verified,
    mismatch_count: report.mismatches.length,
    mismatch_hashes: report.mismatches.map((mismatch: VerificationMismatch) => ({
      migration_key_hash: stableHash(mismatch.migration_key),
      reason_hash: stableHash(mismatch.reason),
    })),
    dangling_canonical_id_count: report.dangling_canonical_ids.length,
    dangling_canonical_id_hashes: report.dangling_canonical_ids.map((value) => stableHash(value)).sort(),
    sample_readback_hashes: report.sample_readbacks.map((value) => stableHash(value)).sort(),
  };
  return withArtifactHash(payload);
}

function assertCanaryArtifact(value: unknown): asserts value is RedactedCanaryArtifact {
  assertSafeKeys(value);
  if (!value || typeof value !== 'object') throw new Error('UNSAFE_CANARY_ARTIFACT: expected object');
  const artifact = value as Partial<RedactedCanaryArtifact>;
  if (artifact.artifact_type !== 'feishu-migration-canary-report' || artifact.artifact_version !== ARTIFACT_VERSION) {
    throw new Error('UNSAFE_CANARY_ARTIFACT: unsupported artifact type or version');
  }
  assertHash(artifact.artifact_hash, 'canary artifact_hash');
  if (!Array.isArray(artifact.selected_key_hashes)) throw new Error('UNSAFE_CANARY_ARTIFACT: selected keys missing');
  for (const hash of artifact.selected_key_hashes) assertHash(hash, 'selected_key_hash');
  const { artifact_hash: _ignored, ...payload } = artifact;
  if (stableHash(payload) !== artifact.artifact_hash) throw new Error('UNSAFE_CANARY_ARTIFACT: artifact hash mismatch');
}

export function parseRedactedCanaryArtifact(value: unknown): RedactedCanaryArtifact {
  assertCanaryArtifact(value);
  return value;
}

export function rehydrateCanaryReport(
  artifact: RedactedCanaryArtifact,
  manifest: MigrationManifest,
): CanaryReport {
  assertCanaryArtifact(artifact);
  if (artifact.run_id !== manifest.run_id) throw new Error('CANARY_ARTIFACT_DRIFT: run_id mismatch');
  const decisions = new Map(manifestDecisions(manifest).map((decision) => [stableHash(decision.migration_key), decision.migration_key]));
  const selectedKeys = artifact.selected_key_hashes.map((hash) => {
    const key = decisions.get(hash);
    if (!key) throw new Error('CANARY_ARTIFACT_DRIFT: selected migration key is absent from manifest');
    return key;
  });
  const placeholderMismatches = (count: number): ApplyFieldMismatch[] => Array.from(
    { length: count },
    () => ({ migration_key: '__redacted__', field: '__redacted__', reason: 'redacted canary mismatch' }),
  );
  return {
    run_id: artifact.run_id,
    status: artifact.status,
    selected_keys: selectedKeys,
    field_mismatches: placeholderMismatches(artifact.field_mismatch_count),
    untracked_writes: artifact.untracked_writes,
    schema_conflicts: Array.from({ length: artifact.schema_conflict_count }, () => 'redacted schema conflict'),
    results: [],
  };
}
