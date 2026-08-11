import { randomBytes } from 'node:crypto';

/** Canonical domain id, e.g. `lead_0a1b2c3d4e5f6a7b` (16 hex). */
export function generateDomainId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

/** ISO-8601 timestamp (Feishu bitable date fields expect this shape). */
export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}

/** Feishu-like record id for the fake adapter, e.g. `rec_ab12cd34ef`. */
export function generateRecordId(prefix = 'rec'): string {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}
