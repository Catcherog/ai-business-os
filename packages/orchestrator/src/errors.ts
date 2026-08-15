/**
 * BUSOS-P6-02 — Orchestrator error classification.
 *
 * One place decides whether a system fault is RETRYABLE, TERMINAL, or an
 * EXTERNAL_DEPENDENCY problem. The classification drives idempotency policy: a
 * TERMINAL failure must never be automatically re-executed, while RETRYABLE /
 * EXTERNAL_DEPENDENCY failures are legitimately re-runnable later (explicitly,
 * by the owner — P6-02 does not auto-retry).
 *
 * Business rejections are NOT routed through this module: they are expressed as
 * `BusinessProcessStatus = REJECTED | HUMAN_REQUIRED` with a `ProcessRejection`.
 */
import type {
  BusinessProcessStage,
  ProcessError,
  ProcessErrorCode,
  ProcessErrorDisposition,
} from './process-contract.js';

/** Third-party capacity exhaustion (e.g. CloudBase NoSQL read quota, 429). */
const QUOTA_PATTERN =
  /quota|resource[_\s-]?exhaust|rate[_\s-]?limit|too many requests|\b429\b|limit exceeded|out of capacity|insufficient balance/i;

/** Transient upstream faults: gateway 5xx, timeouts, socket/network errors. */
const TRANSIENT_PATTERN =
  /timed?[_\s-]?out|etimedout|econnreset|econnrefused|econnaborted|enotfound|eai_again|socket hang ?up|network (?:error|failure)|temporar|unavailable|bad gateway|gateway time|service unavailable|\b50[0234]\b/i;

/** Contract / schema / field-conversion rejections — retrying cannot help. */
const VALIDATION_PATTERN =
  /schema|validation|zod|invalid|malformed|required field|not a valid|convfail|conversion fail|unsupported/i;

/** A write landed but its readback could not confirm it (D019). */
const NOT_VERIFIED_PATTERN = /not verified|readback/i;

/**
 * Documented slice reason codes -> default disposition, used when the message
 * carries no clearer signal. Persistence/transport failures are re-runnable;
 * anything unknown falls through to TERMINAL (fail closed).
 */
const REASON_CODE_DEFAULTS: Record<
  string,
  { code: ProcessErrorCode; disposition: ProcessErrorDisposition }
> = {
  // project-lifecycle
  PROJECT_WRITE_FAILED: { code: 'UPSTREAM_TEMPORARY_FAILURE', disposition: 'RETRYABLE' },
  TASK_WRITE_FAILED: { code: 'UPSTREAM_TEMPORARY_FAILURE', disposition: 'RETRYABLE' },
  LEAD_CONVERTED_UPDATE_FAILED: { code: 'UPSTREAM_TEMPORARY_FAILURE', disposition: 'RETRYABLE' },
  LEAD_LOOKUP_FAILED: { code: 'UPSTREAM_TEMPORARY_FAILURE', disposition: 'RETRYABLE' },
  // creative-production
  LUMEN_GENERATION_FAILED: { code: 'CREATIVE_GENERATION_FAILED', disposition: 'RETRYABLE' },
  ASSET_WRITE_FAILED: { code: 'UPSTREAM_TEMPORARY_FAILURE', disposition: 'RETRYABLE' },
  TASK_DONE_UPDATE_FAILED: { code: 'UPSTREAM_TEMPORARY_FAILURE', disposition: 'RETRYABLE' },
  PROJECT_LOOKUP_FAILED: { code: 'UPSTREAM_TEMPORARY_FAILURE', disposition: 'RETRYABLE' },
};

const MAX_MESSAGE_LENGTH = 300;

/** Extract a message from an unknown thrown value without leaking structure. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return String(e);
}

/**
 * Redact obvious credential material and clamp length. Defence in depth: the
 * orchestrator never intentionally puts secrets in messages, but slice/adapter
 * messages are third-party text.
 */
export function sanitizeMessage(raw: string): string {
  const redacted = raw
    .replace(/(bearer\s+)[A-Za-z0-9._~+/-]{8,}=*/gi, '$1[REDACTED]')
    .replace(
      /((?:password|passwd|secret|token|api[_-]?key|authorization|auth[_-]?password|access[_-]?key)["'\s]*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi,
      '$1[REDACTED]',
    );
  return redacted.length > MAX_MESSAGE_LENGTH
    ? `${redacted.slice(0, MAX_MESSAGE_LENGTH)}…`
    : redacted;
}

/** Leading `SOME_REASON_CODE` of a documented `REASON:detail` reason string. */
function reasonCodeOf(text: string): string | undefined {
  const m = /^([A-Z][A-Z0-9_]{3,})/.exec(text.trim());
  return m ? m[1] : undefined;
}

/**
 * Classify a fault into a `ProcessError`.
 *
 * Precedence is message-signal first (most specific evidence available), then the
 * documented reason-code default, then TERMINAL as the fail-closed fallback.
 */
export function classifyFailure(
  stage: BusinessProcessStage,
  raw: string,
  opts: { code?: ProcessErrorCode; disposition?: ProcessErrorDisposition } = {},
): ProcessError {
  const message = sanitizeMessage(raw || 'unknown failure');

  if (opts.code && opts.disposition) {
    return { code: opts.code, message, stage, disposition: opts.disposition };
  }

  let code: ProcessErrorCode;
  let disposition: ProcessErrorDisposition;

  if (QUOTA_PATTERN.test(message)) {
    // CloudBase quota exhausted / provider rate limit — nothing to fix in code.
    code = 'EXTERNAL_QUOTA_EXHAUSTED';
    disposition = 'EXTERNAL_DEPENDENCY';
  } else if (VALIDATION_PATTERN.test(message)) {
    // Contract validation failure — deterministic, re-running changes nothing.
    code = 'CONTRACT_VALIDATION_FAILED';
    disposition = 'TERMINAL';
  } else if (NOT_VERIFIED_PATTERN.test(message)) {
    code = 'PERSISTENCE_NOT_VERIFIED';
    disposition = 'RETRYABLE';
  } else if (TRANSIENT_PATTERN.test(message)) {
    // Lumen / Feishu temporary 5xx, timeout, network failure.
    code = 'UPSTREAM_TEMPORARY_FAILURE';
    disposition = 'RETRYABLE';
  } else {
    const fallback = REASON_CODE_DEFAULTS[reasonCodeOf(message) ?? ''];
    if (fallback) {
      code = fallback.code;
      disposition = fallback.disposition;
    } else {
      // Fail closed: unknown faults are TERMINAL so idempotency never
      // auto-re-executes something we do not understand.
      code = 'UNCLASSIFIED_FAILURE';
      disposition = 'TERMINAL';
    }
  }

  return {
    code: opts.code ?? code,
    message,
    stage,
    disposition: opts.disposition ?? disposition,
  };
}

/** Structurally invalid orchestrator input — always TERMINAL. */
export function invalidInputError(
  stage: BusinessProcessStage,
  message: string,
): ProcessError {
  return {
    code: 'INVALID_INPUT',
    message: sanitizeMessage(message),
    stage,
    disposition: 'TERMINAL',
  };
}
