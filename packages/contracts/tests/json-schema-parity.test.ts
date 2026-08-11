import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import type { ZodTypeAny } from 'zod';
import commitResultSchemaJson from '../../../contracts/commit_result.v1.schema.json';
import governanceResultSchemaJson from '../../../contracts/governance_result.v1.schema.json';
import leadCandidateSchemaJson from '../../../contracts/lead_candidate.v1.schema.json';
import {
  CommitResultV1Schema,
  GovernanceResultV1Schema,
  LeadCandidateV1Schema,
} from '../src/index.js';
import {
  canonicalCommitResult,
  canonicalGovernanceResult,
  canonicalLeadCandidate,
  clone,
} from './fixtures.js';

/**
 * Contract drift guard.
 *
 * `contracts/*.schema.json` is the language-neutral definition; the Zod schemas
 * are the TypeScript runtime validators. 04-INTERFACES.md states contracts may
 * not be silently changed, so the two must agree sample by sample.
 */

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

type Sample = { name: string; value: unknown; valid: boolean };

function mutate(
  base: unknown,
  change: (target: Record<string, unknown>) => void,
): unknown {
  const copy = clone(base) as Record<string, unknown>;
  change(copy);
  return copy;
}

const leadCandidateSamples: Sample[] = [
  { name: 'canonical', value: canonicalLeadCandidate, valid: true },
  {
    name: 'all-null business values',
    value: mutate(canonicalLeadCandidate, (c) => {
      c.customer_candidate = { name: null, phone: null, wechat: null };
      c.requirement = {
        service_type: null,
        budget_min: null,
        budget_max: null,
        preferred_date_text: null,
        notes: null,
      };
    }),
    valid: true,
  },
  {
    name: 'wrong version',
    value: mutate(canonicalLeadCandidate, (c) => {
      c.version = 'lead_candidate.v2';
    }),
    valid: false,
  },
  {
    name: 'missing session_id',
    value: mutate(canonicalLeadCandidate, (c) => {
      delete c.session_id;
    }),
    valid: false,
  },
  {
    name: 'extra property',
    value: mutate(canonicalLeadCandidate, (c) => {
      c.unexpected_field = 'x';
    }),
    valid: false,
  },
  {
    name: 'confidence out of range',
    value: mutate(canonicalLeadCandidate, (c) => {
      c.intent = { type: 'portrait_consultation', confidence: 1.5 };
    }),
    valid: false,
  },
  {
    name: 'negative budget',
    value: mutate(canonicalLeadCandidate, (c) => {
      c.requirement = {
        ...(c.requirement as Record<string, unknown>),
        budget_max: -1,
      };
    }),
    valid: false,
  },
  {
    name: 'unknown risk level',
    value: mutate(canonicalLeadCandidate, (c) => {
      c.governance = {
        status: 'PENDING_REVIEW',
        risk_level: 'R9',
        missing_fields: [],
      };
    }),
    valid: false,
  },
  {
    name: 'non ISO created_at',
    value: mutate(canonicalLeadCandidate, (c) => {
      c.created_at = '2026/08/11 10:00';
    }),
    valid: false,
  },
];

const governanceResultSamples: Sample[] = [
  { name: 'canonical', value: canonicalGovernanceResult, valid: true },
  {
    name: 'approved + resolved customer',
    value: mutate(canonicalGovernanceResult, (g) => {
      g.decision = 'APPROVE';
      g.issues = [];
      g.customer_resolution = { status: 'RESOLVED', customer_id: 'cust_0001' };
    }),
    valid: true,
  },
  {
    name: 'unknown decision',
    value: mutate(canonicalGovernanceResult, (g) => {
      g.decision = 'MAYBE';
    }),
    valid: false,
  },
  {
    name: 'issue without code',
    value: mutate(canonicalGovernanceResult, (g) => {
      g.issues = [{ field: 'customer_candidate' }];
    }),
    valid: false,
  },
  {
    name: 'normalized_data is an array',
    value: mutate(canonicalGovernanceResult, (g) => {
      g.normalized_data = [];
    }),
    valid: false,
  },
  {
    name: 'extra property',
    value: mutate(canonicalGovernanceResult, (g) => {
      g.approved_by = 'someone';
    }),
    valid: false,
  },
];

const commitResultSamples: Sample[] = [
  { name: 'canonical', value: canonicalCommitResult, valid: true },
  {
    name: 'failed write',
    value: mutate(canonicalCommitResult, (c) => {
      c.status = 'FAILED';
      c.external_record_id = null;
      c.write_status = 'FAILED';
      c.readback_status = 'NOT_RUN';
      c.errors = ['FEISHU_WRITE_TIMEOUT'];
    }),
    valid: true,
  },
  {
    name: 'unknown readback status',
    value: mutate(canonicalCommitResult, (c) => {
      c.readback_status = 'SKIPPED';
    }),
    valid: false,
  },
  {
    name: 'unsupported storage',
    value: mutate(canonicalCommitResult, (c) => {
      c.storage = 'postgres';
    }),
    valid: false,
  },
  {
    name: 'missing errors',
    value: mutate(canonicalCommitResult, (c) => {
      delete c.errors;
    }),
    valid: false,
  },
  {
    name: 'extra property',
    value: mutate(canonicalCommitResult, (c) => {
      c.feishu_table_id = 'tblXXX';
    }),
    valid: false,
  },
];

const contracts = [
  {
    contract: 'lead_candidate.v1',
    jsonSchema: leadCandidateSchemaJson,
    zodSchema: LeadCandidateV1Schema as ZodTypeAny,
    samples: leadCandidateSamples,
  },
  {
    contract: 'governance_result.v1',
    jsonSchema: governanceResultSchemaJson,
    zodSchema: GovernanceResultV1Schema as ZodTypeAny,
    samples: governanceResultSamples,
  },
  {
    contract: 'commit_result.v1',
    jsonSchema: commitResultSchemaJson,
    zodSchema: CommitResultV1Schema as ZodTypeAny,
    samples: commitResultSamples,
  },
];

describe.each(contracts)(
  '$contract — JSON Schema and Zod agree',
  ({ contract, jsonSchema, zodSchema, samples }) => {
    const validateJson = ajv.compile(jsonSchema);

    it('declares the expected $id', () => {
      expect((jsonSchema as { $id: string }).$id).toBe(contract);
    });

    it.each(samples)('$name', ({ value, valid }) => {
      const jsonValid = validateJson(value);
      const zodValid = zodSchema.safeParse(value).success;

      expect(
        { jsonSchema: jsonValid, zod: zodValid },
        `${contract} sample disagreement: ${JSON.stringify(
          validateJson.errors,
        )}`,
      ).toEqual({ jsonSchema: valid, zod: valid });
    });
  },
);
