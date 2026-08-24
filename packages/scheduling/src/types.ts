import type {
  AvailabilitySlot,
  CommunicationScript,
  ProjectAssignment,
  ProjectRequirement,
  Resource,
} from '@busos/contracts';

export interface SchedulingWindow {
  start: string;
  end: string;
}

export interface SchedulingInput {
  projectId: string;
  window: SchedulingWindow;
  /** Used when a requirement does not carry a duration_hours value. */
  durationHours?: number | null;
  /** Used when a requirement does not carry a location value. */
  location?: string | null;
  requirements: readonly ProjectRequirement[];
  resources: readonly Resource[];
  availability: readonly AvailabilitySlot[];
  assignments?: readonly ProjectAssignment[];
  preferredResourceKeys?: readonly string[];
  /** Optional lower-is-nearer travel estimate, in arbitrary stable units. */
  travelRiskByResourceKey?: Readonly<Record<string, number>>;
}

export interface SchedulingProposal {
  proposalId: string;
  projectId: string;
  requirementId: string;
  resourceKey: string;
  resourceType: Resource['resource_type'];
  availabilityId: string;
  startAt: string;
  endAt: string;
  score: number;
  reasons: string[];
  warnings: string[];
}

export interface OutreachInput {
  projectId: string;
  projectName?: string | null;
  resource: Resource;
  requirement?: ProjectRequirement | null;
  proposal?: SchedulingProposal | null;
  scripts: readonly CommunicationScript[];
  audience?: string;
  scene?: string;
}

export interface OutreachDraft {
  draftId: string;
  projectId: string;
  resourceKey: string;
  resourceType: Resource['resource_type'];
  scriptId: string | null;
  body: string;
  missingFacts: string[];
  warnings: string[];
}

export class SchedulingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchedulingInputError';
  }
}
