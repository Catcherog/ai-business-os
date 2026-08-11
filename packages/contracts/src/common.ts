import { z } from 'zod';

/**
 * Explicit contract version identifiers.
 *
 * Frozen by project-control/04-INTERFACES.md. A new shape requires a new
 * version string (e.g. `lead_candidate.v2`), never a silent change of v1.
 */
export const CONTRACT_VERSIONS = {
  LEAD_CANDIDATE_V1: 'lead_candidate.v1',
  GOVERNANCE_RESULT_V1: 'governance_result.v1',
  COMMIT_RESULT_V1: 'commit_result.v1',
} as const;

export type ContractVersion =
  (typeof CONTRACT_VERSIONS)[keyof typeof CONTRACT_VERSIONS];

/** Non-empty identifier string (candidate_id, session_id, domain ids, ...). */
export const IdSchema = z.string().min(1);

/**
 * ISO-8601 timestamp.
 *
 * `offset: true` keeps both `...Z` and `...+08:00` valid, which matters because
 * the JSON Schema files use `format: date-time`.
 */
export const IsoDateTimeSchema = z.string().datetime({ offset: true });

/**
 * Unknown optional business values are `null`, never a fabricated default.
 * (project-control/04-INTERFACES.md, BUSOS-P1-01 requirements)
 */
export const nullable = <T extends z.ZodTypeAny>(schema: T) =>
  schema.nullable();

/** Result of a runtime contract validation. */
export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: string[] };

/** Flatten a ZodError into stable `path: message` strings. */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });
}

/**
 * Validate external input without throwing.
 *
 * Used at module boundaries (D014): contracts are validated on the way in and
 * on the way out, so a malformed payload can never become a business fact.
 */
export function validateWith<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
): ValidationResult<z.infer<T>> {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }
  return { ok: false, errors: formatIssues(parsed.error) };
}

/** Validate external input, throwing on violation. */
export function assertWith<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
  contractName: string,
): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ContractValidationError(contractName, formatIssues(parsed.error));
  }
  return parsed.data;
}

export class ContractValidationError extends Error {
  readonly contract: string;
  readonly errors: string[];

  constructor(contract: string, errors: string[]) {
    super(`${contract} validation failed: ${errors.join('; ')}`);
    this.name = 'ContractValidationError';
    this.contract = contract;
    this.errors = errors;
  }
}
