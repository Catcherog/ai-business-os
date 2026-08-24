import { createHash } from 'node:crypto';

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

function toCanonicalValue(
  value: unknown,
  seen: WeakSet<object>,
  path: string,
): CanonicalValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`stableHash does not support non-finite numbers at ${path}`);
    }
    return value;
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError(`stableHash does not support ${typeof value} values at ${path}`);
  }

  if (typeof value === 'bigint' || typeof value === 'undefined') {
    throw new TypeError(`stableHash does not support ${typeof value} values at ${path}`);
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      toCanonicalValue(entry, seen, `${path}[${index}]`),
    );
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      throw new TypeError(`stableHash does not support cyclic values at ${path}`);
    }

    seen.add(value);
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    const canonical: Record<string, CanonicalValue> = {};
    for (const [key, entry] of entries) {
      canonical[key] = toCanonicalValue(entry, seen, `${path}.${key}`);
    }
    seen.delete(value);
    return canonical;
  }

  throw new TypeError(`stableHash encountered an unsupported value at ${path}`);
}

export function stableHash(value: unknown): string {
  const canonical = toCanonicalValue(value, new WeakSet<object>(), '$');
  return createHash('sha256')
    .update(JSON.stringify(canonical))
    .digest('hex');
}
