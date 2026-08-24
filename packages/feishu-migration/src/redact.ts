const REDACTED = '[REDACTED]';
const SENSITIVE_KEY = /(secret|token|password|authorization)/i;
const KEY_VALUE_PATTERN =
  /\b([A-Za-z0-9_.-]*(?:secret|token|password|authorization)[A-Za-z0-9_.-]*)=([^\s]+)/gi;

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
    return value.replace(KEY_VALUE_PATTERN, (_match, key: string) => {
      return `${key}=${REDACTED}`;
    });
  }

  return JSON.stringify(redactObject(value));
}
