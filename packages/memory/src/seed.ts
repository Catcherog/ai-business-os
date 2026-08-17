import type { MemoryService, RecordMemoryInput } from './memory-service.js';

export interface SeedMemoryOptions {
  /** The canonical customer id the primary preference is anchored to. */
  customerId: string;
  /** The originating review case id (provenance). Defaults to `case_0001`. */
  sourceCaseId?: string;
  /** Optional second demo customer to also seed a preference for. */
  secondCustomerId?: string;
}

const LINWANQING_PREFERENCE =
  '客户偏好：新中式风格、偏深色影调，避免过度磨皮（保留皮肤自然质感）。';
const CHENSIYUAN_PREFERENCE =
  '客户偏好：婚纱套系、偏好自然光与柔和影调，注重情绪表达。';

/**
 * Seed the canonical demo memory used by the H2-01 acceptance scenario:
 * a CUSTOMER PREFERENCE for 林晚晴 anchored to `case_0001` with full provenance.
 *
 * Deterministic + provenance-complete, so re-running the seed is idempotent
 * (gate E) — it never creates a duplicate record.
 */
export async function seedCanonicalMemory(
  svc: MemoryService,
  opts: SeedMemoryOptions,
): Promise<void> {
  const caseId = opts.sourceCaseId ?? 'case_0001';
  const primary: RecordMemoryInput = {
    subject_type: 'CUSTOMER',
    subject_id: opts.customerId,
    memory_type: 'PREFERENCE',
    content: LINWANQING_PREFERENCE,
    source_type: 'HUMAN_REVIEW',
    source_ref: caseId,
    evidence_refs: [
      { kind: 'REVIEW_CASE', ref: caseId },
      { kind: 'CUSTOMER', ref: opts.customerId },
    ],
    confidence: 1,
  };
  await svc.recordMemory(primary);

  if (opts.secondCustomerId) {
    const case2 = opts.sourceCaseId ? `${opts.sourceCaseId}b` : 'case_0002';
    await svc.recordMemory({
      subject_type: 'CUSTOMER',
      subject_id: opts.secondCustomerId,
      memory_type: 'PREFERENCE',
      content: CHENSIYUAN_PREFERENCE,
      source_type: 'HUMAN_REVIEW',
      source_ref: case2,
      evidence_refs: [
        { kind: 'REVIEW_CASE', ref: case2 },
        { kind: 'CUSTOMER', ref: opts.secondCustomerId },
      ],
      confidence: 1,
    });
  }
}
