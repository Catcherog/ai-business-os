/**
 * BL-006 V1 date semantics (P4 slice). Resolves the Project.scheduled_date
 * value at conversion time.
 *
 * Rules (explicitly, per task §3):
 *  - An explicitly confirmed calendar date is stored verbatim as "YYYY-MM-DD".
 *  - A relative-only expression ("下个月" / "周末" / "最近") resolves to `null`.
 *  - The original Lead `preferred_date_text` is preserved as-is and is NEVER
 *    used to compute scheduled_date.
 *  - Any non-explicit string supplied as `scheduled_date` is REJECTED (never
 *    silently coerced into a concrete date) — this is the anti-hallucination
 *    guard.
 *
 * This is a documented semantic decision; it does not redesign the date system.
 * The contract layer keeps `scheduled_date` as a nullable string.
 */

const EXPLICIT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True only for a real, parseable "YYYY-MM-DD" calendar date. */
export function isExplicitDate(value: string): boolean {
  if (!EXPLICIT_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  // Reject values like "2026-02-30" that parse to a different normalized date.
  return value === d.toISOString().slice(0, 10);
}

export type ScheduledDateResolution =
  | { ok: true; value: string | null }
  | { ok: false };

/**
 * Resolve the scheduled_date supplied by the (deterministic, non-LLM) caller.
 * `null`/`undefined`/`""` -> null (no confirmed date). A valid YYYY-MM-DD ->
 * that date. Anything else (relative expression or arbitrary text) -> not ok.
 */
export function resolveScheduledDate(input?: string | null): ScheduledDateResolution {
  if (input == null || input === '') return { ok: true, value: null };
  if (isExplicitDate(input)) return { ok: true, value: input };
  // A non-explicit string (relative or hallucinated) is rejected, never coerced.
  return { ok: false };
}
