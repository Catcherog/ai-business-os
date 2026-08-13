import type { Lead, Customer } from '@busos/contracts';

/**
 * Conversion eligibility (task §6). Evaluated after the Lead and (optional)
 * Customer are loaded, BEFORE any write.
 *
 * Case 1 — Normal: Lead exists, customer_id != null, Customer exists,
 *          status != CONVERTED, status != LOST  -> ALLOWED
 * Case 2 — Anonymous: customer_id == null         -> ANONYMOUS  (CUSTOMER_REQUIRED)
 * Case 3 — Dangling: customer_id set, Customer missing -> DANGLING_CUSTOMER
 * Case 4 — Already converted: status == CONVERTED -> ALREADY_CONVERTED
 *          LOST Lead                                 -> LEAD_LOST
 *
 * Cases 2-4 are all fail-closed: the caller must NOT write any Project/Task
 * and must NOT auto-create a Customer (Case 2) or re-create Project/Task
 * (Case 4). This slice uses the simplest ALREADY_CONVERTED -> BLOCKED /
 * zero new writes (no generic dedup engine, per task §6).
 */
export type Eligibility =
  | { kind: 'ALLOWED' }
  | { kind: 'ANONYMOUS' }
  | { kind: 'DANGLING_CUSTOMER' }
  | { kind: 'ALREADY_CONVERTED' }
  | { kind: 'LEAD_LOST' };

export function checkConversionEligibility(
  lead: Lead,
  customer: Customer | null,
): Eligibility {
  // Status rejections take priority: a CONVERTED/LOST Lead is never re-eligible.
  if (lead.status === 'CONVERTED') return { kind: 'ALREADY_CONVERTED' };
  if (lead.status === 'LOST') return { kind: 'LEAD_LOST' };
  // D010: anonymous Lead (customer_id == null) is a hard BLOCK, never auto-filled.
  if (lead.customer_id == null) return { kind: 'ANONYMOUS' };
  // D009: Lead != Customer. If the referenced Customer does not exist, fail closed.
  if (customer == null) return { kind: 'DANGLING_CUSTOMER' };
  return { kind: 'ALLOWED' };
}
