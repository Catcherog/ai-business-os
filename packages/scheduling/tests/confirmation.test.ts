import { describe, expect, it } from 'vitest';
import type { ProjectAssignment } from '@busos/contracts';
import type { SchedulingProposal } from '../src/types.js';
import {
  createBlockedSchedulingConfirmationPort,
  createDemoSchedulingConfirmationPort,
  type SchedulingConfirmationInput,
} from '../src/confirmation.js';

const PROPOSAL: SchedulingProposal = {
  proposalId: 'proposal:proj_001:req_001:model_001:2026-09-01T01:00:00.000Z',
  projectId: 'proj_001',
  requirementId: 'req_001',
  resourceKey: 'model_001',
  resourceType: 'MODEL',
  availabilityId: 'avail_001',
  startAt: '2026-09-01T01:00:00.000Z',
  endAt: '2026-09-01T03:00:00.000Z',
  score: 500,
  reasons: ['availability is parsed'],
  warnings: [],
};

function input(overrides: Partial<SchedulingConfirmationInput> = {}): SchedulingConfirmationInput {
  return {
    projectId: PROPOSAL.projectId,
    proposal: PROPOSAL,
    idempotencyKey: 'idem_001',
    actor: 'operator_demo',
    ...overrides,
  };
}

describe('scheduling confirmation port', () => {
  it('confirms a proposal by writing and reading back a canonical-shaped assignment', async () => {
    const port = createDemoSchedulingConfirmationPort();

    const result = await port.confirm(input());

    expect(result.mode).toBe('DEMO');
    expect(result.status).toBe('CONFIRMED');
    expect(result.readbackStatus).toBe('VERIFIED');
    expect(result.assignment).toMatchObject<Partial<ProjectAssignment>>({
      project_id: 'proj_001',
      resource_key: 'model_001',
      role: 'MODEL',
      proposed_start: PROPOSAL.startAt,
      proposed_end: PROPOSAL.endAt,
      status: 'CONFIRMED',
      source: 'DEMO_SCHEDULING_CONFIRMATION',
    });
  });

  it('is idempotent and returns the same readback without creating a duplicate assignment', async () => {
    const port = createDemoSchedulingConfirmationPort();

    const first = await port.confirm(input());
    const second = await port.confirm(input());

    expect(second.status).toBe('ALREADY_CONFIRMED');
    expect(second.readbackStatus).toBe('VERIFIED');
    expect(second.assignment?.assignment_id).toBe(first.assignment?.assignment_id);
    expect(port.listAssignments()).toHaveLength(1);
  });

  it('rejects an overlapping confirmation for the same resource', async () => {
    const port = createDemoSchedulingConfirmationPort();
    await port.confirm(input());

    const conflict = await port.confirm(input({
      idempotencyKey: 'idem_002',
      projectId: 'proj_002',
      proposal: {
        ...PROPOSAL,
        projectId: 'proj_002',
        proposalId: 'proposal:proj_002:req_002:model_001:2026-09-01T02:00:00.000Z',
        startAt: '2026-09-01T02:00:00.000Z',
        endAt: '2026-09-01T04:00:00.000Z',
      },
    }));

    expect(conflict.status).toBe('CONFLICT');
    expect(conflict.readbackStatus).toBe('NOT_RUN');
    expect(port.listAssignments()).toHaveLength(1);
  });

  it('keeps an unavailable connected write visibly blocked', async () => {
    const port = createBlockedSchedulingConfirmationPort('Canonical assignment write mapping is not authorized.');

    const result = await port.confirm(input());

    expect(result.mode).toBe('BLOCKED');
    expect(result.status).toBe('BLOCKED');
    expect(result.readbackStatus).toBe('NOT_RUN');
    expect(result.assignment).toBeUndefined();
    expect(result.message).toContain('not authorized');
  });
});
