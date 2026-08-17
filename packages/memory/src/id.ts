/**
 * Isomorphic, dependency-free deterministic helpers for the Memory package.
 *
 * We deliberately avoid `node:crypto` randomBytes here so the exact same source
 * can be bundled into the browser Operator Workspace without a crypto shim.
 * Memory ids are DERIVED from their canonical inputs (provenance + content),
 * which is what makes reprocessing idempotent — there is no randomness to
 * collide with (gate E).
 */

/** FNV-1a 64-bit hash, returned as a zero-padded 16-char lowercase hex string. */
export function fnv1a64(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i) & 0xff);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Canonical reference shape. A memory must only ever point at a stable BUSOS
 * reference — an id like `case_...` / `proj_...` / `asset_...` / `rec_...`, or a
 * known stable URI (`lumen://`, `lumen-stub://`, `feishu-drive://`). It must
 * NEVER be a payload, a prompt, a base64 blob, or a credential (governance rule).
 */
const CANONICAL_REF_RE =
  /^(?:[a-z][a-z0-9_]*_[A-Za-z0-9]+|lumen:\/\/\S+|lumen-stub:\/\/\S+|feishu-drive:\/\/\S+)$/;

export function isCanonicalRef(ref: string): boolean {
  return CANONICAL_REF_RE.test(ref);
}

/**
 * A canonical, stable memory id derived from the FULL canonical input. Two
 * reprocessings of the identical source + content yield the identical id — that
 * is the basis of idempotency (gate E): no duplicate record is ever created.
 */
export function deriveMemoryId(params: {
  subject_type: string;
  subject_id: string;
  memory_type: string;
  source_type: string;
  source_ref: string;
  content: string;
}): string {
  const key =
    `${params.subject_type}|${params.subject_id}|${params.memory_type}|` +
    `${params.source_type}|${params.source_ref}|${params.content}`;
  return `mem_${fnv1a64(key)}`;
}
