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
  TASK_STATUSES,
  TaskSchema,
} from '../src/index.js';
import {
  canonicalAgentRun,
  canonicalCustomer,
  canonicalLead,
  canonicalProject,
  canonicalSession,
  canonicalTask,
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

  it('Task (additive, P4 BUSOS-P4-01)', () => {
    expect(TaskSchema.safeParse(canonicalTask).success).toBe(true);
    expect(TASK_STATUSES).toEqual(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']);
  });
});

describe('P4 additive contract — no breaking change to existing objects (PL-A)', () => {
  it('Project.scheduled_date stays an unconstrained nullable string (BL-006 unresolved -> no redesign)', () => {
    // null remains valid
    const p1 = clone(canonicalProject) as Record<string, unknown>;
    p1.scheduled_date = null;
    expect(ProjectSchema.safeParse(p1).success).toBe(true);
    // an arbitrary (even relative) string is still accepted at the contract layer;
    // the V1 *resolution* rule (explicit YYYY-MM-DD vs null) lives in the
    // project-lifecycle package, not in the frozen contract schema.
    const p2 = clone(canonicalProject) as Record<string, unknown>;
    p2.scheduled_date = '下个月';
    expect(ProjectSchema.safeParse(p2).success).toBe(true);
  });

  it('Task keeps the exact P4 canonical shape', () => {
    const t = clone(canonicalTask);
    expect(TaskSchema.safeParse(t).success).toBe(true);
    // minimal required fields only — no assignee/priority/dependencies etc.
    const requiredKeys = Object.keys(TaskSchema.parse(canonicalTask)).sort();
    expect(requiredKeys).toEqual(
      ['created_at', 'due_date', 'project_id', 'status', 'task_id', 'task_type', 'title', 'updated_at'].sort(),
    );
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
