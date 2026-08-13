import type { Lead, Customer, Project, Task } from '@busos/contracts';

/**
 * Readback verification (D019). A successful API write is NOT business success;
 * the canonical object written must be re-read from the store and its critical
 * fields must match. These pure functions are the single source of truth for
 * `readback_status` and are unit-tested directly (matching -> VERIFIED,
 * mismatch -> FAILED).
 *
 * Critical fields intentionally exclude `created_at` / `updated_at`: Feishu
 * date precision can differ on round-trip, but those timestamps are not
 * business-critical identity/intent fields.
 */

export const LEAD_CRITICAL_FIELDS = [
  'lead_id',
  'customer_id',
  'service_type',
  'budget_min',
  'budget_max',
  'preferred_date_text',
  'status',
] as const;

export const CUSTOMER_CRITICAL_FIELDS = [
  'customer_id',
  'display_name',
  'phone',
  'wechat',
  'status',
] as const;

export function verifyLeadCriticalFields(written: Lead, read: Lead): boolean {
  for (const k of LEAD_CRITICAL_FIELDS) {
    if (written[k] !== read[k]) return false;
  }
  return true;
}

export function verifyCustomerCriticalFields(written: Customer, read: Customer): boolean {
  for (const k of CUSTOMER_CRITICAL_FIELDS) {
    if (written[k] !== read[k]) return false;
  }
  return true;
}

/* ----------------------------------------------------------- Project/Task */

export const PROJECT_CRITICAL_FIELDS = [
  'project_id',
  'customer_id',
  'lead_id',
  'project_type',
  'title',
  'status',
  'scheduled_date',
] as const;

export const TASK_CRITICAL_FIELDS = [
  'task_id',
  'project_id',
  'task_type',
  'title',
  'status',
  'due_date',
] as const;

export function verifyProjectCriticalFields(written: Project, read: Project): boolean {
  for (const k of PROJECT_CRITICAL_FIELDS) {
    if (written[k] !== read[k]) return false;
  }
  return true;
}

export function verifyTaskCriticalFields(written: Task, read: Task): boolean {
  for (const k of TASK_CRITICAL_FIELDS) {
    if (written[k] !== read[k]) return false;
  }
  return true;
}
