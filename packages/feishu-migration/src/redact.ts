const REDACTED = '[REDACTED]';
const SENSITIVE_KEY = /(secret|token|password|authorization|api[-_]?key)/i;
const GENERIC_SENSITIVE_KEY =
  /\b([A-Za-z0-9_.-]*(?:secret|token|password|api[-_]?key)[A-Za-z0-9_.-]*)(\s*[:=]\s*)([^\s,;]+)/gi;
const AUTHORIZATION_BEARER =
  /\b(Authorization)(\s*:\s*)(Bearer)(\s+)([^\s,;]+)/gi;
const AUTHORIZATION_VALUE =
  /\b(Authorization)(\s*[:=]\s*)(?!Bearer\b)([^\s,;]+)/gi;

function redactObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactObject(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : redactObject(entry),
      ]),
    );
  }

  return value;
}

export function redactForLog(value: unknown): string {
  if (typeof value === 'string') {
    return value
      .replace(
        AUTHORIZATION_BEARER,
        (_match, key: string, separator: string, scheme: string, gap: string) =>
          `${key}${separator}${scheme}${gap}${REDACTED}`,
      )
      .replace(
        AUTHORIZATION_VALUE,
        (_match, key: string, separator: string) =>
          `${key}${separator}${REDACTED}`,
      )
      .replace(
        GENERIC_SENSITIVE_KEY,
        (_match, key: string, separator: string) =>
          `${key}${separator}${REDACTED}`,
      );
  }

  return JSON.stringify(redactObject(value));
}
