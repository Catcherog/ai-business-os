import type { AvailabilitySlot, ProjectAssignment, ProjectRequirement, Resource } from '@busos/contracts';
import {
  SchedulingInputError,
  type SchedulingInput,
  type SchedulingProposal,
  type SchedulingWindow,
} from './types.js';

interface ParsedWindow {
  startMs: number;
  endMs: number;
}

interface Candidate {
  proposal: SchedulingProposal;
  warningCount: number;
  travelRisk: number;
}

const ACTIVE_ASSIGNMENT_STATUSES = new Set<ProjectAssignment['status']>([
  'PROPOSED',
  'CONFIRMED',
  'CONFLICT',
]);

function parseWindow(window: SchedulingWindow, label: string): ParsedWindow {
  const startMs = Date.parse(window.start);
  const endMs = Date.parse(window.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
    throw new SchedulingInputError(`${label} is invalid`);
  }
  return { startMs, endMs };
}

function maximum(...values: number[]): number {
  return Math.max(...values);
}

function minimum(...values: number[]): number {
  return Math.min(...values);
}

function normalizeLocation(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLocaleLowerCase().replaceAll(/\s+/g, '');
  return normalized || null;
}

function locationsMatch(requested: string, resource: Resource): boolean {
  const expected = normalizeLocation(requested);
  const actual = normalizeLocation([resource.city, resource.address].filter(Boolean).join(' '));
  if (!expected || !actual) return true;
  return expected.includes(actual) || actual.includes(expected);
}

function resourceLocationKnown(resource: Resource): boolean {
  return Boolean(normalizeLocation([resource.city, resource.address].filter(Boolean).join(' ')));
}

function overlaps(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean {
  return leftStart <= rightEnd && leftEnd >= rightStart;
}

function conflictsWithAssignment(
  resourceKey: string,
  startMs: number,
  endMs: number,
  assignments: readonly ProjectAssignment[],
): boolean {
  return assignments.some((assignment) => {
    if (assignment.resource_key !== resourceKey || !ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status)) return false;
    if (!assignment.proposed_start || !assignment.proposed_end) return true;
    const assignmentStart = Date.parse(assignment.proposed_start);
    const assignmentEnd = Date.parse(assignment.proposed_end);
    return (
      !Number.isFinite(assignmentStart) ||
      !Number.isFinite(assignmentEnd) ||
      overlaps(startMs, endMs, assignmentStart, assignmentEnd)
    );
  });
}

function requirementWindow(
  inputWindow: ParsedWindow,
  requirement: ProjectRequirement,
): ParsedWindow | null {
  const startMs = requirement.date_window_start ? Date.parse(requirement.date_window_start) : inputWindow.startMs;
  const endMs = requirement.date_window_end ? Date.parse(requirement.date_window_end) : inputWindow.endMs;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  const start = maximum(inputWindow.startMs, startMs);
  const end = minimum(inputWindow.endMs, endMs);
  return start <= end ? { startMs: start, endMs: end } : null;
}

function durationMs(input: SchedulingInput, requirement: ProjectRequirement): number | null {
  const durationHours = requirement.duration_hours ?? input.durationHours ?? null;
  if (durationHours === null || !Number.isFinite(durationHours) || durationHours <= 0) return null;
  return durationHours * 60 * 60 * 1000;
}

function chooseTravelRisk(
  input: SchedulingInput,
  resource: Resource,
  requestedLocation: string | null,
): number {
  const configured = input.travelRiskByResourceKey?.[resource.resource_key];
  if (configured !== undefined && Number.isFinite(configured) && configured >= 0) return configured;
  if (!requestedLocation || !resourceLocationKnown(resource)) return 1;
  return 0;
}

function buildCandidate(
  input: SchedulingInput,
  inputWindow: ParsedWindow,
  requirement: ProjectRequirement,
  resource: Resource,
  slot: AvailabilitySlot,
  preferredKeys: ReadonlySet<string>,
): Candidate | null {
  if (resource.resource_type !== requirement.role_type || slot.resource_type !== requirement.role_type) return null;
  if (resource.cooperation_status === 'INACTIVE') return null;
  if (slot.status !== 'AVAILABLE' || slot.parse_status !== 'PARSED' || !slot.start_at || !slot.end_at) return null;

  const duration = durationMs(input, requirement);
  if (duration === null) return null;
  const usableWindow = requirementWindow(inputWindow, requirement);
  if (!usableWindow) return null;

  const requestedLocation = normalizeLocation(input.location ?? requirement.location);
  if (requestedLocation && !locationsMatch(requestedLocation, resource)) return null;

  const slotStart = Date.parse(slot.start_at);
  const slotEnd = Date.parse(slot.end_at);
  if (!Number.isFinite(slotStart) || !Number.isFinite(slotEnd)) return null;
  const startMs = maximum(usableWindow.startMs, slotStart);
  const latestEndMs = minimum(usableWindow.endMs, slotEnd);
  const endMs = startMs + duration;
  if (startMs > latestEndMs || endMs > latestEndMs) return null;
  if (conflictsWithAssignment(resource.resource_key, startMs, endMs, input.assignments ?? [])) return null;

  const warnings: string[] = [];
  const reasons = [
    `availability ${slot.availability_id} is PARSED and AVAILABLE`,
    `duration ${duration / (60 * 60 * 1000)}h fits the interval`,
  ];
  if (resource.priority === null) {
    warnings.push('RESOURCE_PRIORITY_UNKNOWN');
  } else {
    reasons.push(`resource priority ${resource.priority}`);
  }
  if (resource.cooperation_status !== 'ACTIVE') warnings.push('COOPERATION_STATUS_UNRESOLVED');
  if (requestedLocation && !resourceLocationKnown(resource)) {
    warnings.push('RESOURCE_LOCATION_UNKNOWN');
  } else if (!requestedLocation) {
    warnings.push('REQUEST_LOCATION_UNKNOWN');
  } else {
    reasons.push('resource location is compatible');
  }
  if (preferredKeys.has(resource.resource_key)) reasons.push('resource is explicitly preferred');
  else if (preferredKeys.size > 0) warnings.push('RESOURCE_NOT_IN_PREFERRED_SET');
  if (requirement.required_count > 1) warnings.push('MULTIPLE_RESOURCES_REQUIRED');
  if (slot.confidence === 'LOW') warnings.push('AVAILABILITY_CONFIDENCE_LOW');

  const travelRisk = chooseTravelRisk(input, resource, requestedLocation);
  const priorityScore = resource.priority ?? 0;
  const preferenceScore = preferredKeys.has(resource.resource_key) ? 500 : 0;
  const score = priorityScore * 100 + preferenceScore - warnings.length * 25 - travelRisk * 10;
  const startAt = new Date(startMs).toISOString();
  const endAt = new Date(endMs).toISOString();
  const proposalId = `proposal:${input.projectId}:${requirement.requirement_id}:${resource.resource_key}:${startAt}`;
  return {
    proposal: {
      proposalId,
      projectId: input.projectId,
      requirementId: requirement.requirement_id,
      resourceKey: resource.resource_key,
      resourceType: resource.resource_type,
      availabilityId: slot.availability_id,
      startAt,
      endAt,
      score,
      reasons,
      warnings,
    },
    warningCount: warnings.length,
    travelRisk,
  };
}

/**
 * Produce deterministic, explainable shoot-slot candidates. This function is
 * pure: it reads canonical facts only and never writes or sends a message.
 */
export function proposeShootSlots(input: SchedulingInput): SchedulingProposal[] {
  if (!input.projectId.trim()) throw new SchedulingInputError('project id is required');
  const inputWindow = parseWindow(input.window, 'shoot window');
  const preferredKeys = new Set((input.preferredResourceKeys ?? []).map((key) => key.trim()).filter(Boolean));
  const resources = [...input.resources].sort((left, right) => left.resource_key.localeCompare(right.resource_key));
  const slots = [...input.availability].sort((left, right) => left.availability_id.localeCompare(right.availability_id));
  const requirements = [...input.requirements].filter((requirement) => requirement.project_id === input.projectId).sort((left, right) => left.requirement_id.localeCompare(right.requirement_id));
  const candidates: Candidate[] = [];

  for (const requirement of requirements) {
    for (const resource of resources) {
      for (const slot of slots) {
        if (slot.resource_key !== resource.resource_key) continue;
        const candidate = buildCandidate(input, inputWindow, requirement, resource, slot, preferredKeys);
        if (candidate) candidates.push(candidate);
      }
    }
  }

  candidates.sort((left, right) => {
    if (right.proposal.score !== left.proposal.score) return right.proposal.score - left.proposal.score;
    if (left.warningCount !== right.warningCount) return left.warningCount - right.warningCount;
    if (left.travelRisk !== right.travelRisk) return left.travelRisk - right.travelRisk;
    return (
      left.proposal.requirementId.localeCompare(right.proposal.requirementId) ||
      left.proposal.startAt.localeCompare(right.proposal.startAt) ||
      left.proposal.resourceKey.localeCompare(right.proposal.resourceKey) ||
      left.proposal.availabilityId.localeCompare(right.proposal.availabilityId)
    );
  });
  return candidates.map((candidate) => candidate.proposal);
}
