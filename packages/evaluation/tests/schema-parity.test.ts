import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  EVALUATION_DOMAINS,
  PROVENANCE_TYPES,
  REVIEW_STATUSES,
} from '../src/case-schema.js';
import { EVALUATION_CASE_VERSION } from '../src/versions.js';

/**
 * Language-neutral schema parity guard (repo convention, mirroring
 * @busos/contracts json-schema-parity.test.ts): the JSON Schema file and the
 * Zod schema must agree on version, required fields and enum domains — the
 * drift guard for the canonical Golden Set contract.
 */

const SCHEMA_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'schemas',
  'evaluation_case.v1.schema.json',
);

function loadJsonSchema(): Record<string, unknown> {
  return JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as Record<string, unknown>;
}

describe('evaluation_case.v1 JSON schema parity', () => {
  const schema = loadJsonSchema();

  it('exists and declares the canonical version const', () => {
    expect(schema.$id).toBe(EVALUATION_CASE_VERSION);
    const props = schema.properties as Record<string, unknown>;
    expect((props.version as Record<string, unknown>).const).toBe(EVALUATION_CASE_VERSION);
  });

  it('requires the same top-level fields as the zod schema', () => {
    const required = (schema.required as string[]).sort();
    expect(required).toEqual(['case_id', 'domain', 'provenance_type', 'query', 'review_status', 'synthetic', 'version']);
  });

  it('domain enum matches the zod EVALUATION_DOMAINS', () => {
    const props = schema.properties as Record<string, unknown>;
    const domain = props.domain as Record<string, unknown>;
    expect([...(domain.enum as string[])].sort()).toEqual([...EVALUATION_DOMAINS].sort());
  });

  it('provenance enum matches the zod PROVENANCE_TYPES', () => {
    const props = schema.properties as Record<string, unknown>;
    const prov = props.provenance_type as Record<string, unknown>;
    expect([...(prov.enum as string[])].sort()).toEqual([...PROVENANCE_TYPES].sort());
  });

  it('review_status enum matches the zod REVIEW_STATUSES', () => {
    const props = schema.properties as Record<string, unknown>;
    const rs = props.review_status as Record<string, unknown>;
    expect([...(rs.enum as string[])].sort()).toEqual([...REVIEW_STATUSES].sort());
  });

  it('is strict (additionalProperties false) at top level and nested objects', () => {
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, unknown>;
    for (const key of ['expected', 'source']) {
      const sub = props[key] as Record<string, unknown>;
      if (sub && typeof sub === 'object' && 'additionalProperties' in sub) {
        expect(sub.additionalProperties).toBe(false);
      }
    }
  });
});
