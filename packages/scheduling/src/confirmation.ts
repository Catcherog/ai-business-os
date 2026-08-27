import {
  ProjectAssignmentSchema,
  type ProjectAssignment,
} from '@busos/contracts';
import type { SchedulingProposal } from './types.js';

export type SchedulingRuntimeMode = 'DEMO' | 'CONNECTED' | 'LIVE' | 'BLOCKED';
export type SchedulingConfirmationStatus =
  | 'CONFIRMED'
  | 'ALREADY_CONFIRMED'
  | 'CONFLICT'
  | 'BLOCKED'
  | 'READBACK_FAILED';
export type SchedulingReadbackStatus = 'VERIFIED' | 'FAILED' | 'NOT_RUN';

export interface SchedulingConfirmationInput {
  projectId: string;
  proposal: SchedulingProposal;
  idempotencyKey: string;
  actor?: string;
}

export interface SchedulingConfirmationResult {
  mode: SchedulingRuntimeMode;
  status: SchedulingConfirmationStatus;
  readbackStatus: SchedulingReadbackStatus;
  idempotencyKey: string;
  assignment?: ProjectAssignment;
  message: string;
}

export interface SchedulingConfirmationPort {
  confirm(input: SchedulingConfirmationInput): Promise<SchedulingConfirmationResult>;
}

export interface DemoSchedulingConfirmationPort extends SchedulingConfirmationPort {
  listAssignments(): ProjectAssignment[];
}

export interface DemoSchedulingConfirmationOptions {
  assignments?: readonly ProjectAssignment[];
  now?: () => string;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function overlaps(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string): boolean {
  const leftStartMs = Date.parse(leftStart);
  const leftEndMs = Date.parse(leftEnd);
  const rightStartMs = Date.parse(rightStart);
  const rightEndMs = Date.parse(rightEnd);
  return Number.isFinite(leftStartMs)
    && Number.isFinite(leftEndMs)
    && Number.isFinite(rightStartMs)
    && Number.isFinite(rightEndMs)
    && leftStartMs <= rightEndMs
    && leftEndMs >= rightStartMs;
}

function validateInput(input: SchedulingConfirmationInput): string | null {
  if (!input.projectId.trim()) return 'projectId is required.';
  if (!input.idempotencyKey.trim()) return 'idempotencyKey is required.';
  if (input.proposal.projectId !== input.projectId) return 'proposal project does not match projectId.';
  if (!Number.isFinite(Date.parse(input.proposal.startAt)) || !Number.isFinite(Date.parse(input.proposal.endAt))) {
    return 'proposal time range is invalid.';
  }
  if (Date.parse(input.proposal.startAt) > Date.parse(input.proposal.endAt)) {
    return 'proposal end must not precede proposal start.';
  }
  return null;
}

function result(
  input: SchedulingConfirmationInput,
  values: Omit<SchedulingConfirmationResult, 'idempotencyKey'>,
): SchedulingConfirmationResult {
  return { ...values, idempotencyKey: input.idempotencyKey };
}

/**
 * Deterministic local canonical-like confirmation store used by the DEMO
 * journey. It writes a ProjectAssignment-shaped record, then reads it back
 * before returning CONFIRMED. The port shape is deliberately shared with the
 * connected boundary so the UI cannot mistake a button state for a write.
 */
export function createDemoSchedulingConfirmationPort(
  options: DemoSchedulingConfirmationOptions = {},
): DemoSchedulingConfirmationPort {
  const assignments = new Map<string, ProjectAssignment>();
  const idempotency = new Map<string, string>();
  const now = options.now ?? (() => new Date(0).toISOString());
  for (const assignment of options.assignments ?? []) assignments.set(assignment.assignment_id, clone(assignment));

  return {
    async confirm(input) {
      const invalid = validateInput(input);
      if (invalid) {
        return result(input, {
          mode: 'DEMO',
          status: 'READBACK_FAILED',
          readbackStatus: 'FAILED',
          message: invalid,
        });
      }

      const previousAssignmentId = idempotency.get(input.idempotencyKey);
      if (previousAssignmentId) {
        const previous = assignments.get(previousAssignmentId);
        if (previous) {
          return result(input, {
            mode: 'DEMO',
            status: 'ALREADY_CONFIRMED',
            readbackStatus: 'VERIFIED',
            assignment: clone(previous),
            message: 'This confirmation was already applied and read back.',
          });
        }
      }

      const conflict = [...assignments.values()].find((assignment) => (
        assignment.resource_key === input.proposal.resourceKey
        && assignment.status !== 'CANCELLED'
        && assignment.project_id !== input.projectId
        && assignment.proposed_start !== null
        && assignment.proposed_end !== null
        && overlaps(
          input.proposal.startAt,
          input.proposal.endAt,
          assignment.proposed_start,
          assignment.proposed_end,
        )
      ));
      if (conflict) {
        return result(input, {
          mode: 'DEMO',
          status: 'CONFLICT',
          readbackStatus: 'NOT_RUN',
          message: `Resource ${input.proposal.resourceKey} is already assigned during this interval.`,
        });
      }

      const assignmentId = `assignment:${input.projectId}:${input.proposal.resourceKey}:${input.proposal.startAt}`;
      const assignment = ProjectAssignmentSchema.parse({
        assignment_id: assignmentId,
        project_id: input.projectId,
        resource_key: input.proposal.resourceKey,
        role: input.proposal.resourceType,
        proposed_start: input.proposal.startAt,
        proposed_end: input.proposal.endAt,
        status: 'CONFIRMED',
        conflict_reason: null,
        confirmed_at: now(),
        source: 'DEMO_SCHEDULING_CONFIRMATION',
        migration_key: `demo_assignment:${input.projectId}:${input.proposal.resourceKey}`,
      });
      assignments.set(assignmentId, assignment);
      idempotency.set(input.idempotencyKey, assignmentId);

      const readback = assignments.get(assignmentId);
      if (!readback || readback.status !== 'CONFIRMED' || readback.proposed_start !== input.proposal.startAt || readback.proposed_end !== input.proposal.endAt) {
        return result(input, {
          mode: 'DEMO',
          status: 'READBACK_FAILED',
          readbackStatus: 'FAILED',
          message: 'Confirmation was not verified by the canonical-style readback.',
        });
      }
      return result(input, {
        mode: 'DEMO',
        status: 'CONFIRMED',
        readbackStatus: 'VERIFIED',
        assignment: clone(readback),
        message: 'Slot confirmed and read back from the demo canonical store.',
      });
    },
    listAssignments: () => [...assignments.values()].map(clone),
  };
}

/** Connected/LIVE composition seam until an authorized assignment mapping exists. */
export function createBlockedSchedulingConfirmationPort(
  reason = 'Canonical assignment write mapping is not authorized.',
): SchedulingConfirmationPort {
  return {
    async confirm(input) {
      return result(input, {
        mode: 'BLOCKED',
        status: 'BLOCKED',
        readbackStatus: 'NOT_RUN',
        message: reason,
      });
    },
  };
}
