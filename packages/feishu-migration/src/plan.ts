import { buildMigrationPlan } from './dedupe.js';
import { stableHash } from './hash.js';
import type {
  MigrationDecision,
  MigrationPlan,
  TargetSnapshot,
} from './types.js';
import type { SourceInventory } from './inventory.js';

export interface MigrationManifestExpected {
  creates: string[];
  updates: string[];
  skips: string[];
  needs_review: string[];
}

export interface MigrationManifest {
  run_id: string;
  generated_at: string;
  source_count: number;
  target_before_counts: Record<string, number>;
  target_schema_fingerprint: string;
  expected: MigrationManifestExpected;
  payload_hashes: Record<string, string>;
  source_payload_hashes: Record<string, string>;
  plan: MigrationPlan;
  manifest_hash: string;
}

export interface CreateManifestOptions {
  run_id: string;
  target_schema_fingerprint: string;
}

export function targetTableName(decision: MigrationDecision<unknown>): string {
  const explicit = (decision as MigrationDecision<unknown> & { target_table?: unknown }).target_table;
  if (typeof explicit === 'string' && explicit.trim()) return explicit;
  switch ((decision.entity_type ?? '').toLowerCase()) {
    case 'customer':
      return 'Customers';
    case 'project':
      return 'Projects';
    case 'resource':
      return 'Resources';
    case 'availability':
      return 'Resource Availability';
    case 'publish_item':
      return 'Publish Items';
    case 'media_asset':
      return 'Media Assets';
    case 'research':
    case 'content':
      return 'Content Research';
    case 'script':
      return 'Communication Scripts';
    case 'knowledge':
      return 'Knowledge';
    default:
      return decision.entity_type || 'Unknown';
  }
}

function sourcePayloadHash(decision: MigrationDecision<unknown>): string {
  const sourceHash = decision.source.fields.source_payload_hash;
  return typeof sourceHash === 'string' && sourceHash.trim()
    ? sourceHash
    : stableHash(decision.source.fields);
}

function targetBeforeCounts(snapshot: TargetSnapshot): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (Array.isArray(value)) counts[key] = value.length;
  }
  return counts;
}

function decisionKey(decision: MigrationDecision<unknown>): string {
  return decision.migration_key;
}

function expectedActions(decisions: MigrationDecision<unknown>[]): MigrationManifestExpected {
  const expected: MigrationManifestExpected = {
    creates: [],
    updates: [],
    skips: [],
    needs_review: [],
  };
  for (const decision of decisions) {
    if (decision.decision === 'CREATE') expected.creates.push(decisionKey(decision));
    if (decision.decision === 'UPDATE') expected.updates.push(decisionKey(decision));
    if (decision.decision === 'SKIP') expected.skips.push(decisionKey(decision));
    if (decision.decision === 'NEEDS_REVIEW') expected.needs_review.push(decisionKey(decision));
  }
  for (const values of Object.values(expected)) values.sort();
  return expected;
}

export function createMigrationManifest(
  inventory: SourceInventory,
  targetSnapshot: TargetSnapshot,
  options: CreateManifestOptions,
): MigrationManifest {
  if (!options.run_id.trim()) throw new Error('createMigrationManifest requires run_id');
  if (!options.target_schema_fingerprint.trim()) {
    throw new Error('createMigrationManifest requires target_schema_fingerprint');
  }
  const plan = buildMigrationPlan(inventory, targetSnapshot);
  const decisions = [...plan.decisions].sort((left, right) =>
    left.migration_key < right.migration_key ? -1 : left.migration_key > right.migration_key ? 1 : 0,
  );
  const payload_hashes: Record<string, string> = {};
  const source_payload_hashes: Record<string, string> = {};
  for (const decision of decisions) {
    payload_hashes[decision.migration_key] = stableHash(decision.canonical_target);
    source_payload_hashes[decision.migration_key] = sourcePayloadHash(decision);
  }
  const manifestWithoutHash = {
    run_id: options.run_id,
    generated_at: plan.generated_at,
    source_count: plan.source_count,
    target_before_counts: targetBeforeCounts(targetSnapshot),
    target_schema_fingerprint: options.target_schema_fingerprint,
    expected: expectedActions(decisions),
    payload_hashes,
    source_payload_hashes,
    plan: { ...plan, decisions },
  };
  return {
    ...manifestWithoutHash,
    manifest_hash: stableHash(manifestWithoutHash),
  };
}

export const generateMigrationManifest = createMigrationManifest;

export function manifestDecisions(manifest: MigrationManifest): MigrationDecision<unknown>[] {
  return [...manifest.plan.decisions].sort((left, right) =>
    left.migration_key < right.migration_key ? -1 : left.migration_key > right.migration_key ? 1 : 0,
  );
}
