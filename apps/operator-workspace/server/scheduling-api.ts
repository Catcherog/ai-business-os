import type { AvailabilitySlot, ProjectAssignment, ProjectRequirement, Resource } from '@busos/contracts';
import type { OperationsRepositoryPort } from '@busos/business-repository';
import { draftAvailabilityOutreach, proposeShootSlots, type OutreachDraft, type SchedulingProposal } from '@busos/scheduling';
import { SchedulingInputError } from '@busos/scheduling';

const SOURCE = 'FEISHU_NEW_BASE' as const;
const MAX_FACTS = 100;

export interface SchedulingApiResponse<T> {
  statusCode: number;
  body:
    | { mode: 'CONNECTED'; source: typeof SOURCE; data: T }
    | { mode: 'CONNECTED'; source: typeof SOURCE; error: { code: string; message: string } }
    | { mode: 'BLOCKED'; reason: string };
}

export interface SchedulingApi {
  proposals(body: unknown): Promise<SchedulingApiResponse<SchedulingProposal[]>>;
  draft(body: unknown): Promise<SchedulingApiResponse<OutreachDraft>>;
}

export interface SchedulingApiOptions {
  repository: OperationsRepositoryPort | null;
}

function invalid<T>(message: string): SchedulingApiResponse<T> {
  return { statusCode: 422, body: { mode: 'CONNECTED', source: SOURCE, error: { code: 'INVALID_REQUEST', message } } };
}

function failed<T>(): SchedulingApiResponse<T> {
  return { statusCode: 503, body: { mode: 'CONNECTED', source: SOURCE, error: { code: 'BUSINESS_DATA_READ_FAILED', message: 'Connected business data read failed.' } } };
}

function blocked<T>(): SchedulingApiResponse<T> {
  return { statusCode: 200, body: { mode: 'BLOCKED', reason: 'Server-side Feishu target Base configuration is unavailable.' } };
}

function objectBody(body: unknown): Record<string, unknown> | null {
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
}

function canonicalId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || /\s/.test(value) || /^rec[a-z0-9]/i.test(value)) {
    throw new SchedulingInputError(`${label} must be a canonical id`);
  }
  return value.trim();
}

function stringValue(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return value === undefined || value === null ? null : typeof value === 'string' ? value : null;
}

function timestamp(body: Record<string, unknown>, key: string): string {
  const value = stringValue(body, key);
  if (!value || !Number.isFinite(Date.parse(value))) throw new SchedulingInputError(`${key} must be a valid timestamp`);
  return value;
}

function numberOrNull(body: Record<string, unknown>, key: string): number | null {
  const value = body[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new SchedulingInputError(`${key} must be a positive number`);
  }
  return value;
}

function stringArray(body: Record<string, unknown>, key: string): string[] {
  const value = body[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new SchedulingInputError(`${key} must contain canonical ids`);
  }
  return value.map((item) => canonicalId(item, key));
}

async function loadSchedulingFacts(repository: OperationsRepositoryPort, projectId: string, start: string, end: string): Promise<{
  requirements: ProjectRequirement[];
  resources: Resource[];
  assignments: ProjectAssignment[];
  availability: AvailabilitySlot[];
}> {
  const [requirements, resources, assignments] = await Promise.all([
    repository.listProjectRequirements(projectId),
    repository.listResources({ limit: MAX_FACTS }),
    repository.listAssignments(projectId),
  ]);
  const availability = await repository.listAvailability(
    resources.map((resource) => resource.resource_key),
    { start, end },
  );
  return {
    requirements: requirements.slice(0, MAX_FACTS),
    resources: resources.slice(0, MAX_FACTS),
    assignments: assignments.slice(0, MAX_FACTS),
    availability,
  };
}

export function createSchedulingApi(options: SchedulingApiOptions): SchedulingApi {
  return {
    proposals: async (body) => {
      if (!options.repository) return blocked<SchedulingProposal[]>();
      try {
        const input = objectBody(body);
        if (!input) throw new SchedulingInputError('JSON object body is required');
        const projectId = canonicalId(input.projectId, 'projectId');
        const window = { start: timestamp(input, 'start'), end: timestamp(input, 'end') };
        const durationHours = numberOrNull(input, 'durationHours');
        const location = input.location === undefined || input.location === null ? null : typeof input.location === 'string' ? input.location : (() => { throw new SchedulingInputError('location must be text'); })();
        const preferredResourceKeys = stringArray(input, 'preferredResourceKeys');
        const facts = await loadSchedulingFacts(options.repository, projectId, window.start, window.end);
        const proposals = proposeShootSlots({
          projectId,
          window,
          durationHours,
          location,
          requirements: facts.requirements,
          resources: facts.resources,
          availability: facts.availability,
          assignments: facts.assignments,
          preferredResourceKeys,
        });
        return { statusCode: 200, body: { mode: 'CONNECTED', source: SOURCE, data: proposals.slice(0, MAX_FACTS) } };
      } catch (error) {
        if (error instanceof SchedulingInputError) return invalid<SchedulingProposal[]>(error.message);
        return failed<SchedulingProposal[]>();
      }
    },
    draft: async (body) => {
      if (!options.repository) return blocked<OutreachDraft>();
      try {
        const input = objectBody(body);
        if (!input) throw new SchedulingInputError('JSON object body is required');
        const projectId = canonicalId(input.projectId, 'projectId');
        const resourceKey = canonicalId(input.resourceKey, 'resourceKey');
        const requirementId = input.requirementId === undefined || input.requirementId === null ? null : canonicalId(input.requirementId, 'requirementId');
        const audience = input.audience === undefined ? 'resource' : canonicalId(input.audience, 'audience');
        const scene = input.scene === undefined || input.scene === null ? undefined : canonicalId(input.scene, 'scene');
        const [projects, resources, requirements, scripts] = await Promise.all([
          options.repository.listProjects({ limit: MAX_FACTS }),
          options.repository.listResources({ limit: MAX_FACTS }),
          options.repository.listProjectRequirements(projectId),
          options.repository.listScripts({ audience, scene }),
        ]);
        const resource = resources.find((item) => item.resource_key === resourceKey);
        if (!resource) throw new SchedulingInputError('resourceKey is not present in the connected Base');
        const requirement = requirementId
          ? requirements.find((item) => item.requirement_id === requirementId) ?? null
          : requirements.find((item) => item.role_type === resource.resource_type) ?? null;
        if (requirementId && !requirement) throw new SchedulingInputError('requirementId is not present for projectId');
        const project = projects.find((item) => item.project_id === projectId);
        const draft = draftAvailabilityOutreach({
          projectId,
          projectName: project?.title ?? null,
          resource,
          requirement,
          scripts,
          audience,
          scene,
        });
        return { statusCode: 200, body: { mode: 'CONNECTED', source: SOURCE, data: draft } };
      } catch (error) {
        if (error instanceof SchedulingInputError) return invalid<OutreachDraft>(error.message);
        return failed<OutreachDraft>();
      }
    },
  };
}
