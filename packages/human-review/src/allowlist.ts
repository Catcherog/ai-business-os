import type { LeadCandidateV1, EvidenceItem } from '@busos/contracts';
import type { AllowedEditField, FieldEdit } from './types.js';

/**
 * Allowlisted editable LeadCandidate fields (task §5 Flow C).
 *
 * The reviewer may edit ONLY these. Nothing else in the candidate can be
 * changed through the review surface — this is the fixed reviewer scope (D004).
 */
export const ALLOWED_EDIT_FIELDS: readonly AllowedEditField[] = [
  'customer_candidate.name',
  'customer_candidate.phone',
  'customer_candidate.wechat',
  'requirement.service_type',
  'requirement.budget_min',
  'requirement.budget_max',
  'requirement.preferred_date_text',
  'requirement.notes',
];

/** A partial patch over the allowlisted fields. */
export type EditPatch = Partial<Record<AllowedEditField, unknown>>;

/** Deep clone a candidate so the original AI snapshot stays immutable. */
export function cloneCandidate(c: LeadCandidateV1): LeadCandidateV1 {
  return structuredClone(c);
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function readPath(c: LeadCandidateV1, field: AllowedEditField): unknown {
  switch (field) {
    case 'customer_candidate.name':
      return c.customer_candidate.name;
    case 'customer_candidate.phone':
      return c.customer_candidate.phone;
    case 'customer_candidate.wechat':
      return c.customer_candidate.wechat;
    case 'requirement.service_type':
      return c.requirement.service_type;
    case 'requirement.budget_min':
      return c.requirement.budget_min;
    case 'requirement.budget_max':
      return c.requirement.budget_max;
    case 'requirement.preferred_date_text':
      return c.requirement.preferred_date_text;
    case 'requirement.notes':
      return c.requirement.notes;
  }
}

function writePath(c: LeadCandidateV1, field: AllowedEditField, value: unknown): void {
  switch (field) {
    case 'customer_candidate.name':
      c.customer_candidate.name = value as string | null;
      break;
    case 'customer_candidate.phone':
      c.customer_candidate.phone = value as string | null;
      break;
    case 'customer_candidate.wechat':
      c.customer_candidate.wechat = value as string | null;
      break;
    case 'requirement.service_type':
      c.requirement.service_type = value as string | null;
      break;
    case 'requirement.budget_min':
      c.requirement.budget_min = value as number | null;
      break;
    case 'requirement.budget_max':
      c.requirement.budget_max = value as number | null;
      break;
    case 'requirement.preferred_date_text':
      c.requirement.preferred_date_text = value as string | null;
      break;
    case 'requirement.notes':
      c.requirement.notes = value as string | null;
      break;
  }
}

export interface AppliedEdits {
  reviewed: LeadCandidateV1;
  edits: FieldEdit[];
}

/**
 * Apply an allowlisted patch to a clone of the original candidate.
 *
 * Evidence rule (task §5 Flow C): the ORIGINAL AI candidate/evidence snapshot is
 * preserved by the caller (ReviewCase.original_candidate). Here we produce the
 * *reviewed* copy and, for every edited field, replace the AI evidence entry
 * with a HUMAN_EDIT marker. We deliberately do NOT reuse the AI source text for
 * the edited value — e.g. an AI evidence "预算大概4000" is never rewritten to
 * imply support for a human-set 4500.
 */
export function applyEdits(original: LeadCandidateV1, patch: EditPatch): AppliedEdits {
  const reviewed = cloneCandidate(original);
  const edits: FieldEdit[] = [];
  const editedFields = new Set<AllowedEditField>();

  for (const field of ALLOWED_EDIT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    const before = readPath(original, field);
    const after = patch[field] ?? null;
    if (jsonEqual(before, after)) continue;
    writePath(reviewed, field, after);
    edits.push({ field, before, after });
    editedFields.add(field);
  }

  if (editedFields.size > 0) {
    const humanEvidence: EvidenceItem[] = [...editedFields].map((f) => {
      const edit = edits.find((e) => e.field === f)!;
      return {
        field: f,
        source_text: `HUMAN_EDIT:${f}:${stringify(edit.before)}→${stringify(edit.after)}`,
      };
    });
    // Drop the AI evidence entries for edited fields; keep the rest.
    reviewed.evidence = reviewed.evidence
      .filter((e) => !editedFields.has(e.field as AllowedEditField))
      .concat(humanEvidence);
  }

  return { reviewed, edits };
}

export { stringify };
