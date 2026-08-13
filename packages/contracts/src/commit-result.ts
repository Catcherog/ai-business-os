import { z } from 'zod';
import {
  CONTRACT_VERSIONS,
  IdSchema,
  assertWith,
  validateWith,
  type ValidationResult,
} from './common.js';

/**
 * CommitResultV1 — the outcome of persisting an approved business fact.
 *
 * A successful API write is not business success: readback verification of
 * critical fields is required (D019).
 *
 * Authoritative language-neutral shape:
 * contracts/commit_result.v1.schema.json
 */

export const COMMIT_STATUSES = ['COMMITTED', 'FAILED'] as const;
export const CommitStatusSchema = z.enum(COMMIT_STATUSES);
export type CommitStatus = z.infer<typeof CommitStatusSchema>;

export const COMMIT_DOMAIN_OBJECTS = ['lead', 'customer', 'project', 'task', 'asset'] as const;
export const CommitDomainObjectSchema = z.enum(COMMIT_DOMAIN_OBJECTS);
export type CommitDomainObject = z.infer<typeof CommitDomainObjectSchema>;

export const WRITE_STATUSES = ['SUCCESS', 'FAILED'] as const;
export const WriteStatusSchema = z.enum(WRITE_STATUSES);
export type WriteStatus = z.infer<typeof WriteStatusSchema>;

export const READBACK_STATUSES = ['VERIFIED', 'FAILED', 'NOT_RUN'] as const;
export const ReadbackStatusSchema = z.enum(READBACK_STATUSES);
export type ReadbackStatus = z.infer<typeof ReadbackStatusSchema>;

export const CommitResultV1Schema = z
  .object({
    version: z.literal(CONTRACT_VERSIONS.COMMIT_RESULT_V1),
    status: CommitStatusSchema,
    domain_object: CommitDomainObjectSchema,
    domain_id: IdSchema,
    /** Only `feishu` in V1; storage stays behind the adapter (D008/D018). */
    storage: z.literal('feishu'),
    /** `null` when no external record was created (e.g. write failed). */
    external_record_id: z.string().nullable(),
    write_status: WriteStatusSchema,
    readback_status: ReadbackStatusSchema,
    errors: z.array(z.string()),
  })
  .strict();

export type CommitResultV1 = z.infer<typeof CommitResultV1Schema>;

export function validateCommitResultV1(
  input: unknown,
): ValidationResult<CommitResultV1> {
  return validateWith(CommitResultV1Schema, input);
}

export function assertCommitResultV1(input: unknown): CommitResultV1 {
  return assertWith(
    CommitResultV1Schema,
    input,
    CONTRACT_VERSIONS.COMMIT_RESULT_V1,
  );
}

export function isCommitResultV1(input: unknown): input is CommitResultV1 {
  return CommitResultV1Schema.safeParse(input).success;
}

/**
 * Business-level success predicate (D019).
 *
 * Kept in the contract package so no caller can invent a weaker definition of
 * "committed".
 */
export function isBusinessCommitSuccess(result: CommitResultV1): boolean {
  return (
    result.status === 'COMMITTED' &&
    result.write_status === 'SUCCESS' &&
    result.readback_status === 'VERIFIED'
  );
}
