import { describe, it, expect } from 'vitest';
import { isBusinessCommitSuccess } from '@busos/contracts';
import { BusinessRepository } from '@busos/business-repository';
import { convertLeadToProject } from '../src/index.js';
import {
  CountingBusinessRepository,
  makeRealAdapter,
  newFeishuStub,
  createFeishuAdapterFromEnv,
} from './testkit.js';

/**
 * §12 — RealFeishuAdapter + in-memory Feishu simulator (P4 Project/Task tables).
 *
 * Exercises the PRODUCTION adapter code path (auth -> create -> readback ->
 * map -> verify -> CommitResultV1) for Project and Task through the real
 * adapter, against an in-memory Feishu bitable simulator.
 *
 * Explicitly NOT a live Feishu E2E: the stub transport stands in for the API.
 * Per task §19 the report must say
 *   "RealFeishuAdapter via in-memory Feishu simulator: PASS"
 * and must NOT say "Real Feishu E2E: PASS".
 */
const MARKER = `P4-TEST-${Date.now()}`;

function realDeps() {
  const adapter = makeRealAdapter(newFeishuStub().fetchFn);
  const repo = new BusinessRepository(adapter);
  const counts = new CountingBusinessRepository(repo);
  return { deps: { businessRepository: counts }, counts, repo };
}

describe('RealFeishuAdapter via in-memory Feishu simulator (Project/Task)', () => {
  it('full lifecycle: Project write+readback VERIFIED, Task write+readback VERIFIED, Lead CONVERTED', async () => {
    const { deps, counts, repo } = realDeps();

    // Seed a Customer + Lead through the same production adapter pipeline.
    const customer = await repo.createCustomer({
      display_name: `${MARKER}-cust`,
      phone: '13900000001',
      wechat: 'p4testcust',
      status: 'ACTIVE',
    });
    expect(isBusinessCommitSuccess(customer.commit)).toBe(true);
    const lead = await repo.createLead({
      customer_id: customer.customer.customer_id,
      source_session_id: 'sess_p4',
      source_candidate_id: 'cand_p4',
      service_type: `${MARKER}-svc`,
      budget_max: 4000,
      preferred_date_text: '下个月',
      status: 'QUALIFIED',
    });
    expect(isBusinessCommitSuccess(lead.commit)).toBe(true);

    const r = await convertLeadToProject(
      {
        lead_id: lead.lead.lead_id,
        project_type: 'portrait_shoot',
        title: `${MARKER}-project`,
        scheduled_date: '2030-01-01',
        initial_task: { task_type: 'CONSULT', title: `${MARKER}-task` },
      },
      deps,
    );

    expect(r.status).toBe('LIFECYCLE_SUCCESS');
    expect(counts.writes.project).toBe(1);
    expect(counts.writes.task).toBe(1);
    expect(r.project!.customer_id).toBe(customer.customer.customer_id);
    expect(r.project!.lead_id).toBe(lead.lead.lead_id);
    expect(r.projectCommit!.readback_status).toBe('VERIFIED');
    expect(isBusinessCommitSuccess(r.projectCommit!)).toBe(true);
    expect(r.task!.project_id).toBe(r.project!.project_id);
    expect(r.taskCommit!.readback_status).toBe('VERIFIED');
    expect(isBusinessCommitSuccess(r.taskCommit!)).toBe(true);
    expect(r.leadReadback!.status).toBe('CONVERTED');
    expect(r.leadCommit!.readback_status).toBe('VERIFIED');
  });
});

/* ---------------------------------------------------------------------- LIVE */

/**
 * PL-H — LIVE Feishu vertical slice (requires FEISHU_* + FEISHU_PROJECT_TABLE_ID
 * + FEISHU_TASK_TABLE_ID env). Runs only when those are present. The real
 * Base's Project/Task tables must satisfy DEFAULT_FIELD_MAP (missing fields are
 * additively provisioned, never renamed/deleted). Exercises the real Base
 * end-to-end (Lead -> Customer -> Project(DRAFT) -> Task(TODO) -> Lead
 * CONVERTED) with real readback VERIFIED, then cleans up every record this run
 * created by its exact record id.
 */
const liveAdapter = createFeishuAdapterFromEnv();
const describeLive = liveAdapter ? describe : describe.skip;

describeLive('LIVE Feishu Base E2E (requires FEISHU_* + Project/Task tables)', () => {
  it('Lead -> Customer -> Project -> Task on live Base, cleanup by exact record id', async () => {
    const repo = new BusinessRepository(liveAdapter!);
    const counts = new CountingBusinessRepository(repo);
    const marker = `P4LIVE-${Date.now()}`;

    // 1) Customer (test-dedicated id + marker)
    const cust = await repo.createCustomer({
      display_name: `${marker}-cust`,
      phone: '13900000002',
      wechat: 'p4livecust',
      status: 'ACTIVE',
    });
    expect(isBusinessCommitSuccess(cust.commit)).toBe(true);
    const custRecordId = cust.commit.external_record_id;

    // 2) Lead linked to Customer
    const lead = await repo.createLead({
      customer_id: cust.customer.customer_id,
      source_session_id: 'sess_p4live',
      source_candidate_id: 'cand_p4live',
      service_type: `${marker}-svc`,
      budget_max: 4000,
      preferred_date_text: '下个月',
      status: 'QUALIFIED',
    });
    expect(isBusinessCommitSuccess(lead.commit)).toBe(true);
    const leadRecordId = lead.commit.external_record_id;
    await repo.linkLeadCustomer(lead.lead.lead_id, cust.customer.customer_id);

    // 3) Full conversion chain
    const r = await convertLeadToProject(
      {
        lead_id: lead.lead.lead_id,
        project_type: 'portrait_shoot',
        title: `${marker}-project`,
        scheduled_date: '2030-01-01',
        initial_task: { task_type: 'CONSULT', title: `${marker}-task` },
      },
      { businessRepository: counts },
    );
    expect(r.status).toBe('LIFECYCLE_SUCCESS');
    expect(r.projectCommit!.readback_status).toBe('VERIFIED');
    expect(r.taskCommit!.readback_status).toBe('VERIFIED');
    expect(r.leadCommit!.readback_status).toBe('VERIFIED');

    // 4) Cleanup by exact record id — ONLY this run's generated records (Section D).
    // Project/Task via the BusinessRepository compensation API; the test-dedicated
    // Lead/Customer via the adapter's existing deleteLead/deleteCustomer (exact
    // record id, no new domain API added). No delete-all / truncate / fuzzy delete.
    if (r.taskCommit) await repo.deleteTask(r.taskCommit.external_record_id!);
    if (r.projectCommit) await repo.deleteProject(r.projectCommit.external_record_id!);
    const delLead = await liveAdapter!.deleteLead(leadRecordId!);
    const delCust = await liveAdapter!.deleteCustomer(custRecordId!);
    console.log(
      '[LIVE-CLEANUP]',
      JSON.stringify({
        project: r.projectCommit?.external_record_id ?? null,
        task: r.taskCommit?.external_record_id ?? null,
        lead: leadRecordId,
        customer: custRecordId,
        delLead,
        delCust,
      }),
    );
    expect(delLead).toBe(true);
    expect(delCust).toBe(true);
  }, 60000);
});
