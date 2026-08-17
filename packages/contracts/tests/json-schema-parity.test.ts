import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import type { ZodTypeAny } from 'zod';
import commitResultSchemaJson from '../../../contracts/commit_result.v1.schema.json';
import governanceResultSchemaJson from '../../../contracts/governance_result.v1.schema.json';
import leadCandidateSchemaJson from '../../../contracts/lead_candidate.v1.schema.json';
import memoryRecordSchemaJson from '../../../contracts/memory_record.v1.schema.json';
import {
  CommitResultV1Schema,
  GovernanceResultV1Schema,
  LeadCandidateV1Schema,
  MemoryRecordV1Schema,
} from '../src/index.js';
import {
  canonicalCommitResult,
  canonicalGovernanceResult,
  canonicalLeadCandidate,
  canonicalMemoryRecord,
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

/**
 * H2-01 — memory_record.v1 samples. The lifecycle invariants (scope vs anchor,
 * ACTIVE/SUPERSEDED/INVALIDATED consistency) are part of the contract, so the
 * JSON Schema `allOf/if-then` rules and the Zod `superRefine` rules must agree
 * sample by sample, exactly like the other three contracts.
 */
const memoryRecordSamples: Sample[] = [
  { name: 'canonical', value: canonicalMemoryRecord, valid: true },
  {
    name: 'project-scoped outcome memory',
    value: mutate(canonicalMemoryRecord, (m) => {
      m.scope = 'PROJECT';
      m.subject_type = 'PROJECT';
      m.subject_id = 'proj_0001';
      m.memory_type = 'OUTCOME';
      m.content = '视觉参考生成成功，产出 1 个素材';
      m.source_type = 'PROCESS_RUN';
      m.source_ref = 'proc_0001';
      m.evidence_refs = [
        { kind: 'PROCESS_RUN', ref: 'proc_0001' },
        { kind: 'ASSET', ref: 'asset_0001' },
      ];
    }),
    valid: true,
  },
  {
    name: 'superseded memory references its replacement',
    value: mutate(canonicalMemoryRecord, (m) => {
      m.status = 'SUPERSEDED';
      m.superseded_by_memory_id = 'mem_ffffffffffffffff';
    }),
    valid: true,
  },
  {
    name: 'invalidated memory states a reason',
    value: mutate(canonicalMemoryRecord, (m) => {
      m.status = 'INVALIDATED';
      m.invalidation_reason = 'customer withdrew the preference';
    }),
    valid: true,
  },
  {
    name: 'wrong version',
    value: mutate(canonicalMemoryRecord, (m) => {
      m.version = 'memory_record.v2';
    }),
    valid: false,
  },
  {
    name: 'scope contradicts subject_type',
    value: mutate(canonicalMemoryRecord, (m) => {
      m.subject_type = 'PROJECT';
      m.subject_id = 'proj_0001';
      // scope stays CUSTOMER -> customer-wide claim from a project anchor
    }),
    valid: false,
  },
  {
    name: 'empty evidence_refs (provenance missing)',
    value: mutate(canonicalMemoryRecord, (m) => {
      m.evidence_refs = [];
    }),
    valid: false,
  },
  {
    name: 'unknown memory_type',
    value: mutate(canonicalMemoryRecord, (m) => {
      m.memory_type = 'VIBE';
    }),
    valid: false,
  },
  {
    name: 'unknown source_type',
    value: mutate(canonicalMemoryRecord, (m) => {
      m.source_type = 'LLM_GUESS';
    }),
    valid: false,
  },
  {
    name: 'unknown evidence kind',
    value: mutate(canonicalMemoryRecord, (m) => {
      m.evidence_refs = [{ kind: 'CHAT_MESSAGE', ref: 'msg_1' }];
    }),
    valid: false,
  },
  {
    name: 'confidence out of range',
    value: mutate(canonicalMemoryRecord, (m) => {
      m.confidence = 1.4;
    }),
    valid: false,
  },
  {
    name: 'empty content',
    value: mutate(canonicalMemoryRecord, (m) => {
      m.content = '';
    }),
    valid: false,
  },
  {
    name: 'ACTIVE but superseded',
    value: mutate(canonicalMemoryRecord, (m) => {
      m.superseded_by_memory_id = 'mem_ffffffffffffffff';
    }),
    valid: false,
  },
  {
    name: 'ACTIVE but carries invalidation_reason',
    value: mutate(canonicalMemoryRecord, (m) => {
      m.invalidation_reason = 'stale';
    }),
    valid: false,
  },
  {
    name: 'SUPERSEDED without replacement reference',
    value: mutate(canonicalMemoryRecord, (m) => {
      m.status = 'SUPERSEDED';
    }),
    valid: false,
  },
  {
    name: 'INVALIDATED without reason',
    value: mutate(canonicalMemoryRecord, (m) => {
      m.status = 'INVALIDATED';
    }),
    valid: false,
  },
  {
    name: 'missing subject_id',
    value: mutate(canonicalMemoryRecord, (m) => {
      delete m.subject_id;
    }),
    valid: false,
  },
  {
    name: 'extra property',
    value: mutate(canonicalMemoryRecord, (m) => {
      m.embedding = [0.1, 0.2];
    }),
    valid: false,
  },
  {
    name: 'non ISO created_at',
    value: mutate(canonicalMemoryRecord, (m) => {
      m.created_at = '2026/08/17 10:00';
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
  {
    contract: 'memory_record.v1',
    jsonSchema: memoryRecordSchemaJson,
    zodSchema: MemoryRecordV1Schema as ZodTypeAny,
    samples: memoryRecordSamples,
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
