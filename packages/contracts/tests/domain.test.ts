import { describe, expect, it } from 'vitest';
import {
  AGENT_RUN_STATUSES,
  AgentRunSchema,
  CUSTOMER_STATUSES,
  CustomerSchema,
  LEAD_STATUSES,
  LeadSchema,
  PROJECT_STATUSES,
  ProjectSchema,
  SESSION_STATUSES,
  SessionSchema,
} from '../src/index.js';
import {
  canonicalAgentRun,
  canonicalCustomer,
  canonicalLead,
  canonicalProject,
  canonicalSession,
  clone,
} from './fixtures.js';

describe('Domain objects exist and validate canonical samples', () => {
  it('Session', () => {
    expect(SessionSchema.safeParse(canonicalSession).success).toBe(true);
    expect(SESSION_STATUSES).toEqual(['OPEN', 'CLOSED']);
  });

  it('AgentRun', () => {
    expect(AgentRunSchema.safeParse(canonicalAgentRun).success).toBe(true);
    expect(AGENT_RUN_STATUSES).toEqual([
      'RUNNING',
      'SUCCEEDED',
      'FAILED',
      'HANDED_OFF',
    ]);
  });

  it('Lead', () => {
    expect(LeadSchema.safeParse(canonicalLead).success).toBe(true);
    expect(LEAD_STATUSES).toEqual(['NEW', 'QUALIFIED', 'CONVERTED', 'LOST']);
  });

  it('Customer', () => {
    expect(CustomerSchema.safeParse(canonicalCustomer).success).toBe(true);
    expect(CUSTOMER_STATUSES).toEqual(['ACTIVE', 'ARCHIVED']);
  });

  it('Project', () => {
    expect(ProjectSchema.safeParse(canonicalProject).success).toBe(true);
    expect(PROJECT_STATUSES).toEqual([
      'DRAFT',
      'CONFIRMED',
      'IN_PROGRESS',
      'DELIVERED',
      'CANCELLED',
    ]);
  });
});

describe('Domain rules from frozen decisions', () => {
  it('allows an anonymous lead with customer_id = null (D010)', () => {
    expect(canonicalLead.customer_id).toBeNull();
    expect(LeadSchema.safeParse(canonicalLead).success).toBe(true);
  });

  it('allows an anonymous session with user_id = null', () => {
    expect(SessionSchema.safeParse(canonicalSession).success).toBe(true);
  });

  it('allows an in-progress AgentRun with completed_at = null', () => {
    const run = clone(canonicalAgentRun);
    run.status = 'RUNNING';
    run.completed_at = null;
    expect(AgentRunSchema.safeParse(run).success).toBe(true);
  });

  it('keeps Lead free of storage-specific fields (D008/D017/D018)', () => {
    const lead = clone(canonicalLead) as Record<string, unknown>;
    lead.feishu_record_id = 'recABC123';
    expect(LeadSchema.safeParse(lead).success).toBe(false);
  });
});

describe('Domain objects — clearly invalid samples', () => {
  it('rejects an unknown Lead status', () => {
    const lead = clone(canonicalLead) as Record<string, unknown>;
    lead.status = 'ARCHIVED';
    expect(LeadSchema.safeParse(lead).success).toBe(false);
  });

  it('rejects a Lead without traceability to its source candidate', () => {
    const lead = clone(canonicalLead) as Record<string, unknown>;
    delete lead.source_candidate_id;
    expect(LeadSchema.safeParse(lead).success).toBe(false);
  });

  it('rejects a Customer without a display name', () => {
    const customer = clone(canonicalCustomer);
    customer.display_name = '';
    expect(CustomerSchema.safeParse(customer).success).toBe(false);
  });

  it('rejects a Project without a customer', () => {
    const project = clone(canonicalProject) as Record<string, unknown>;
    project.customer_id = '';
    expect(ProjectSchema.safeParse(project).success).toBe(false);
  });

  it('rejects a non ISO-8601 timestamp', () => {
    const session = clone(canonicalSession);
    session.created_at = 'yesterday';
    expect(SessionSchema.safeParse(session).success).toBe(false);
  });
});
