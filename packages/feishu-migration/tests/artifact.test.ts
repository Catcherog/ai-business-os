import { describe, expect, it } from 'vitest';
import { createMigrationManifest } from '../src/plan.js';
import {
  redactApplyReport,
  redactLiveVerificationReport,
  redactMigrationManifest,
  rehydrateMigrationManifest,
  type RedactedManifestArtifact,
} from '../src/artifact.js';
import type { ApplyReport } from '../src/apply.js';
import type { SourceInventory } from '../src/inventory.js';
import type { LiveVerificationReport } from '../src/verify-live.js';

const FINGERPRINT = 'target-schema-fingerprint';
const PHONE = 'SYNTHETIC_PHONE_SENTINEL';
const URL = 'https://example.invalid/synthetic-profile';

function inventory(): SourceInventory {
  return {
    base: { tables: [] },
    spreadsheets: [
      {
        key: 'CUSTOMERS',
        sheets: [
          {
            sheet: { sheet_id: 'sheet-customers', title: 'Customers' },
            rows: [
              ['entity_type', 'customer_id', 'customer_name', 'phone'],
              ['customer', 'legacy-customer-42', 'Synthetic Private Name', PHONE],
            ],
          },
        ],
      },
      {
        key: 'CONTENT',
        sheets: [
          {
            sheet: { sheet_id: 'sheet-content', title: 'Content' },
            rows: [
              ['entity_type', 'content_id', 'url', 'title'],
              ['content', 'note-7', URL, 'Private campaign title'],
            ],
          },
        ],
      },
    ],
  };
}

function manifest() {
  return createMigrationManifest(inventory(), { records: [] }, {
    run_id: 'run-artifact-test',
    target_schema_fingerprint: FINGERPRINT,
  });
}

describe('migration artifacts', () => {
  it('writes only hashes, counts and structural metadata for a manifest', () => {
    const sourceManifest = manifest();
    const artifact = redactMigrationManifest(sourceManifest);
    const serialized = JSON.stringify(artifact);

    expect(serialized).not.toContain(PHONE);
    expect(serialized).not.toContain(URL);
    expect(serialized).not.toContain('Synthetic Private Name');
    expect(serialized).not.toContain('customer:legacy-customer-42');
    expect(artifact.source_count).toBe(sourceManifest.source_count);
    expect(artifact.decisions).toHaveLength(sourceManifest.plan.decisions.length);
    expect(artifact.decisions[0]).toMatchObject({
      migration_key_hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      source_payload_hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      payload_hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
  });

  it('rehydrates the private in-memory manifest from a read-only source inventory', () => {
    const sourceManifest = manifest();
    const artifact = redactMigrationManifest(sourceManifest);
    const rehydrated = rehydrateMigrationManifest(artifact, inventory());

    expect(rehydrated.run_id).toBe(sourceManifest.run_id);
    expect(rehydrated.target_schema_fingerprint).toBe(FINGERPRINT);
    expect(rehydrated.plan.decisions).toHaveLength(2);
    expect(rehydrated.plan.decisions.map((item) => item.migration_key)).toEqual(
      expect.arrayContaining(['customer:legacy-customer-42', 'content:note-7']),
    );
    expect(JSON.stringify(artifact)).not.toContain(PHONE);
    expect(JSON.stringify(artifact)).not.toContain(URL);
  });

  it('blocks source drift before a manifest can be rehydrated', () => {
    const artifact = redactMigrationManifest(manifest());
    const changed = inventory();
    changed.spreadsheets[0].sheets[0].rows[1][2] = 'Changed Private Name';

    expect(() => rehydrateMigrationManifest(artifact, changed)).toThrow('SOURCE_PAYLOAD_DRIFT');
  });

  it('redacts apply and verification reports before persistence or stdout', () => {
    const applyReport: ApplyReport = {
      run_id: 'run-artifact-test',
      mode: 'canary',
      status: 'PASS',
      results: [{
        migration_key: `customer:phone:${PHONE}`,
        target_table: 'Customers',
        status: 'APPLIED',
        target_record_id: 'rec-private-1',
        reason: 'written for Synthetic Private Name',
      }],
      field_mismatches: [],
      untracked_writes: 0,
      schema_conflicts: [],
      business_writes: 1,
      registry_writes: 1,
      canary_report: {
        run_id: 'run-artifact-test',
        status: 'PASS',
        selected_keys: [`customer:phone:${PHONE}`],
        field_mismatches: [],
        untracked_writes: 0,
        schema_conflicts: [],
        results: [],
      },
    };
    const verifyReport: LiveVerificationReport = {
      verified_at: '2026-08-25T00:00:00.000Z',
      planned_count: 1,
      applied_count: 1,
      mismatches: [{ migration_key: `customer:phone:${PHONE}`, reason: `private ${URL}` }],
      status: 'FAIL',
      target_counts: { Customers: 1 },
      unique_migration_keys: true,
      payload_hashes_verified: false,
      required_fields_verified: true,
      dangling_canonical_ids: [`customer:phone:${PHONE}:customer_id:secret`],
      sample_readbacks: [`customer:phone:${PHONE}`],
      schema_fingerprint_verified: true,
    };

    const redactedApply = redactApplyReport(applyReport);
    const redactedVerify = redactLiveVerificationReport(verifyReport);
    const serialized = `${JSON.stringify(redactedApply)}${JSON.stringify(redactedVerify)}`;
    expect(serialized).not.toContain(PHONE);
    expect(serialized).not.toContain(URL);
    expect(serialized).not.toContain('rec-private-1');
    expect(serialized).not.toContain('Synthetic Private Name');
    expect(redactedApply.canary?.selected_key_hashes).toHaveLength(1);
    expect(redactedVerify.sample_readback_hashes).toHaveLength(1);
  });

  it('rejects an artifact that contains raw migration keys', () => {
    const artifact = redactMigrationManifest(manifest()) as unknown as RedactedManifestArtifact & Record<string, unknown>;
    artifact.raw_migration_key = 'customer:legacy-customer-42';

    expect(() => rehydrateMigrationManifest(artifact, inventory())).toThrow('UNSAFE_MANIFEST_ARTIFACT');
  });
});
