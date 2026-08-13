import { describe, it, expect } from 'vitest';
import { isBusinessCommitSuccess } from '@busos/contracts';
import { BusinessRepository, FakeFeishuAdapter } from '@busos/business-repository';
import { convertLeadToProject, resolveScheduledDate, isExplicitDate } from '../src/index.js';
import { fakeDeps } from './testkit.js';

/** Seed a Customer + Lead directly via the underlying repo (shares the fake). */
async function seed(
  repo: BusinessRepository,
  opts: { customerId?: string; leadId?: string; leadStatus?: 'NEW' | 'QUALIFIED' | 'CONVERTED' | 'LOST'; customerIdOnLead?: string | null } = {},
) {
  const customer = await repo.createCustomer({
    display_name: 'Test Customer',
    phone: '13900000000',
    wechat: 'testcust',
    status: 'ACTIVE',
  });
  const lead = await repo.createLead({
    customer_id: opts.customerIdOnLead !== undefined ? opts.customerIdOnLead : customer.customer.customer_id,
    source_session_id: 'sess_seed',
    source_candidate_id: 'cand_seed',
    service_type: '新中式写真',
    budget_max: 4000,
    preferred_date_text: '下个月',
    status: opts.leadStatus ?? 'QUALIFIED',
  });
  return { customerId: customer.customer.customer_id, leadId: lead.lead.lead_id };
}

describe('BUSOS-P4-01 — PL-B Happy lifecycle', () => {
  it('converts an eligible Lead into Project + Task and marks Lead CONVERTED', async () => {
    const { deps, counts, repo } = fakeDeps();
    const { leadId, customerId } = await seed(repo as any);

    const r = await convertLeadToProject(
      {
        lead_id: leadId,
        project_type: 'portrait_shoot',
        title: '新中式写真拍摄',
        scheduled_date: '2026-09-01',
        initial_task: { task_type: 'CONSULT', title: 'Consult call' },
      },
      deps,
    );

    expect(r.status).toBe('LIFECYCLE_SUCCESS');
    expect(r.reason).toBeUndefined();
    // Project ownership
    expect(r.project!.customer_id).toBe(customerId);
    expect(r.project!.lead_id).toBe(leadId);
    expect(r.project!.status).toBe('DRAFT'); // DRAFT, not IN_PROGRESS
    expect(r.project!.scheduled_date).toBe('2026-09-01'); // BL-006 explicit date
    // Task ownership + readback
    expect(r.task!.project_id).toBe(r.project!.project_id);
    expect(r.task!.task_type).toBe('CONSULT');
    expect(r.task!.title).toBe('Consult call');
    expect(r.task!.status).toBe('TODO');
    expect(isBusinessCommitSuccess(r.projectCommit!)).toBe(true);
    expect(r.projectCommit!.readback_status).toBe('VERIFIED');
    expect(isBusinessCommitSuccess(r.taskCommit!)).toBe(true);
    expect(r.taskCommit!.readback_status).toBe('VERIFIED');
    // Lead CONVERTED + readback
    expect(r.leadReadback!.status).toBe('CONVERTED');
    expect(isBusinessCommitSuccess(r.leadCommit!)).toBe(true);
    // Write counts
    expect(counts.writes.project).toBe(1);
    expect(counts.writes.task).toBe(1);
    expect(counts.writes.leadUpdate).toBe(1);

    // Independent readback across the repository boundary confirms persistence.
    const proj = await repo.getProject(r.project!.project_id);
    expect(proj!.customer_id).toBe(customerId);
    const task = await repo.getTask(r.task!.task_id);
    expect(task!.project_id).toBe(r.project!.project_id);
    const lead = await repo.getLead(leadId);
    expect(lead!.status).toBe('CONVERTED');
  });

  it('defaults to a deterministic generic init task when none supplied (PROJECT_SETUP)', async () => {
    const { deps, repo } = fakeDeps();
    const { leadId } = await seed(repo as any);
    const r = await convertLeadToProject(
      { lead_id: leadId, project_type: 'portrait_shoot', title: 'P' },
      deps,
    );
    expect(r.status).toBe('LIFECYCLE_SUCCESS');
    expect(r.task!.task_type).toBe('PROJECT_SETUP');
    expect(r.task!.title).toBe('Project setup');
    expect(r.task!.status).toBe('TODO');
  });

  it('BL-006: relative-only preferred_date_text -> scheduled_date null (no hallucination)', async () => {
    const { deps, repo } = fakeDeps();
    const { leadId } = await seed(repo as any);
    const r = await convertLeadToProject(
      { lead_id: leadId, project_type: 'portrait_shoot', title: 'P' },
      deps,
    );
    expect(r.status).toBe('LIFECYCLE_SUCCESS');
    expect(r.project!.scheduled_date).toBeNull();
  });
});

describe('BUSOS-P4-01 — PL-C Anonymous Lead', () => {
  it('BLOCKED / CUSTOMER_REQUIRED, zero Project/Task writes, Lead unchanged', async () => {
    const { deps, counts, repo } = fakeDeps();
    const { leadId } = await seed(repo as any, { customerIdOnLead: null });

    const r = await convertLeadToProject(
      { lead_id: leadId, project_type: 'portrait_shoot', title: 'P' },
      deps,
    );

    expect(r.status).toBe('BLOCKED');
    expect(r.reason).toBe('CUSTOMER_REQUIRED');
    expect(counts.writes.project).toBe(0);
    expect(counts.writes.task).toBe(0);
    const lead = await repo.getLead(leadId);
    expect(lead!.customer_id).toBeNull();
    expect(lead!.status).toBe('QUALIFIED');
  });
});

describe('BUSOS-P4-01 — PL-D Invalid lifecycle (fail closed)', () => {
  it('dangling customer_id (Customer missing) -> BLOCKED, zero writes', async () => {
    const { deps, counts, repo } = fakeDeps();
    const { leadId } = await seed(repo as any, { customerIdOnLead: 'cust_does_not_exist' });
    const r = await convertLeadToProject(
      { lead_id: leadId, project_type: 'portrait_shoot', title: 'P' },
      deps,
    );
    expect(r.status).toBe('BLOCKED');
    expect(r.reason).toBe('DANGLING_CUSTOMER');
    expect(counts.writes.project).toBe(0);
    expect(counts.writes.task).toBe(0);
    const lead = await repo.getLead(leadId);
    expect(lead!.status).toBe('QUALIFIED');
  });

  it('already CONVERTED Lead -> BLOCKED, zero new writes (no dedup engine)', async () => {
    const { deps, counts, repo } = fakeDeps();
    const { leadId } = await seed(repo as any, { leadStatus: 'CONVERTED' });
    const r = await convertLeadToProject(
      { lead_id: leadId, project_type: 'portrait_shoot', title: 'P' },
      deps,
    );
    expect(r.status).toBe('BLOCKED');
    expect(r.reason).toBe('ALREADY_CONVERTED');
    expect(counts.writes.project).toBe(0);
    expect(counts.writes.task).toBe(0);
  });

  it('LOST Lead -> BLOCKED, zero writes', async () => {
    const { deps, counts, repo } = fakeDeps();
    const { leadId } = await seed(repo as any, { leadStatus: 'LOST' });
    const r = await convertLeadToProject(
      { lead_id: leadId, project_type: 'portrait_shoot', title: 'P' },
      deps,
    );
    expect(r.status).toBe('BLOCKED');
    expect(r.reason).toBe('LEAD_LOST');
    expect(counts.writes.project).toBe(0);
    expect(counts.writes.task).toBe(0);
  });
});

describe('BUSOS-P4-01 — PL-E Partial failure + exact-record-id compensation', () => {
  it('Project readback failure -> FAILED, Project cleaned by exact record id', async () => {
    const adapter = new FakeFeishuAdapter({ corruptReadbackProject: { status: 'CONFIRMED' } });
    const { deps, counts, repo } = fakeDeps(adapter);
    const { leadId } = await seed(repo as any);

    const r = await convertLeadToProject(
      { lead_id: leadId, project_type: 'portrait_shoot', title: 'P', scheduled_date: '2026-09-01' },
      deps,
    );

    expect(r.status).toBe('FAILED');
    expect(r.reason).toBe('PROJECT_WRITE_FAILED');
    expect(counts.writes.project).toBe(1);
    expect(counts.writes.task).toBe(0);
    expect(r.compensation.deletedProject).toBe(true);
    expect(r.compensation.deletedTask).toBe(false);
    expect(await repo.getProject(r.project!.project_id)).toBeNull();
  });

  it('Task create/readback failure -> FAILED, Task + Project cleaned by exact ids', async () => {
    const adapter = new FakeFeishuAdapter({ corruptReadbackTask: { status: 'IN_PROGRESS' } });
    const { deps, counts, repo } = fakeDeps(adapter);
    const { leadId } = await seed(repo as any);

    const r = await convertLeadToProject(
      { lead_id: leadId, project_type: 'portrait_shoot', title: 'P', scheduled_date: '2026-09-01' },
      deps,
    );

    expect(r.status).toBe('FAILED');
    expect(r.reason).toBe('TASK_WRITE_FAILED');
    expect(counts.writes.project).toBe(1);
    expect(counts.writes.task).toBe(1);
    expect(r.compensation.deletedTask).toBe(true);
    expect(r.compensation.deletedProject).toBe(true);
    expect(await repo.getTask(r.task!.task_id)).toBeNull();
    expect(await repo.getProject(r.project!.project_id)).toBeNull();
    // Lead must NOT be reported CONVERTED (update never ran)
    const lead = await repo.getLead(leadId);
    expect(lead!.status).toBe('QUALIFIED');
  });

  it('Lead CONVERTED update/readback failure -> FAILED, Task + Project cleaned, Lead unchanged', async () => {
    const adapter = new FakeFeishuAdapter({ failLeadStatusUpdate: true });
    const { deps, counts, repo } = fakeDeps(adapter);
    const { leadId } = await seed(repo as any);

    const r = await convertLeadToProject(
      { lead_id: leadId, project_type: 'portrait_shoot', title: 'P', scheduled_date: '2026-09-01' },
      deps,
    );

    expect(r.status).toBe('FAILED');
    expect(r.reason).toBe('LEAD_CONVERTED_UPDATE_FAILED');
    expect(counts.writes.project).toBe(1);
    expect(counts.writes.task).toBe(1);
    expect(counts.writes.leadUpdate).toBe(1);
    expect(r.compensation.deletedTask).toBe(true);
    expect(r.compensation.deletedProject).toBe(true);
    expect(await repo.getTask(r.task!.task_id)).toBeNull();
    expect(await repo.getProject(r.project!.project_id)).toBeNull();
    // Lead must NOT be reported CONVERTED
    expect(r.leadReadback!.status).not.toBe('CONVERTED');
    const lead = await repo.getLead(leadId);
    expect(lead!.status).toBe('QUALIFIED');
  });
});

describe('BUSOS-P4-01 — BL-006 scheduled_date resolution (unit)', () => {
  it('accepts explicit YYYY-MM-DD', () => {
    expect(isExplicitDate('2026-09-01')).toBe(true);
    const r = resolveScheduledDate('2026-09-01');
    expect(r.ok && r.value).toBe('2026-09-01');
  });
  it('stores null for empty/undefined', () => {
    const rNull = resolveScheduledDate(null);
    expect(rNull.ok ? rNull.value : null).toBeNull();
    const rEmpty = resolveScheduledDate('');
    expect(rEmpty.ok ? rEmpty.value : null).toBeNull();
  });
  it('rejects relative/hallucinated strings', () => {
    expect(resolveScheduledDate('下个月').ok).toBe(false);
    expect(resolveScheduledDate('周末').ok).toBe(false);
    expect(resolveScheduledDate('2026-02-30').ok).toBe(false); // impossible calendar date
  });
});
