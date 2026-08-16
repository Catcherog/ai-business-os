import { describe, it, expect } from 'vitest';
import { BusinessRepository, createFakeFeishuAdapter } from '@busos/business-repository';
import { WorkspaceReviewService, buildSeedReviewCases } from '../src/index';

/**
 * H1-02 workspace-review vertical-slice E2E.
 *
 * Exercises the Operator Workspace review surface exactly as the UI consumes it
 * (through `WorkspaceReviewService` only — never touching HumanReviewService or
 * the repository directly). Covers gates B–G.
 */

function makeSvc(): WorkspaceReviewService {
  const repo = new BusinessRepository(createFakeFeishuAdapter());
  const svc = new WorkspaceReviewService(repo);
  svc.seedCases(buildSeedReviewCases());
  return svc;
}

describe('H1-02 Reviews surface (workspace-review)', () => {
  /* ----------------------------- H1-02-B ----------------------------- */
  it('B — deterministic seeded reviews visible, pending first, no Feishu leak', () => {
    const svc = makeSvc();
    const list = svc.listReviews();
    expect(list).toHaveLength(3);
    // all seeded cases are pending → pending-first ordering keeps rev_r1 first
    expect(list.every((c) => c.state === 'PENDING_REVIEW')).toBe(true);
    expect(list[0].case_id).toBe('rev_r1');
    expect(list[1].case_id).toBe('rev_r2');
    expect(list[2].case_id).toBe('rev_r3');
    // every item is a canonical ReviewCase with original candidate + governance
    for (const c of list) {
      expect(c.original_candidate.version).toBe('lead_candidate.v1');
      expect(c.original_governance.decision).toBe('REVIEW_REQUIRED');
    }
    // no raw Feishu structures / credentials escape the boundary
    const dumped = JSON.stringify(list);
    expect(dumped).not.toContain('FEISHU_APP_SECRET');
    expect(dumped).not.toContain('app_token');
    expect(dumped).not.toContain('table_id');
    expect(dumped).not.toContain('record_id');
  });

  /* ----------------------------- H1-02-C ----------------------------- */
  it('C — review detail exposes original candidate / governance / evidence; snapshot retained', () => {
    const svc = makeSvc();
    const rc = svc.getReview('rev_r1');
    expect(rc).not.toBeNull();
    // A. current state
    expect(rc!.state).toBe('PENDING_REVIEW');
    // B. original AI candidate
    const cand = rc!.original_candidate;
    expect(cand.requirement.service_type).toBe('新中式写真');
    expect(cand.requirement.budget_max).toBe(4000);
    expect(cand.requirement.preferred_date_text).toBe('下个月');
    // C. governance decision + issues
    expect(rc!.original_governance.decision).toBe('REVIEW_REQUIRED');
    expect(rc!.original_governance.issues.map((i) => i.code)).toContain(
      'CUSTOMER_IDENTITY_MISSING',
    );
    // D. evidence present (AI source texts)
    const fields = cand.evidence.map((e) => e.field);
    expect(fields).toContain('requirement.service_type');
    expect(fields).toContain('requirement.budget_max');
    // original snapshot retained verbatim (reviewed == original at start)
    expect(rc!.reviewed_candidate).toEqual(rc!.original_candidate);
  });

  /* ----------------------------- H1-02-D ----------------------------- */
  it('D — APPROVE commits via existing HumanReviewService (COMMITTED)', async () => {
    const svc = makeSvc();
    const outcome = await svc.approve('rev_r1', '匿名线索确认通过');
    // final state COMMITTED on success
    expect(outcome.state).toBe('COMMITTED');
    expect(outcome.commit_status).toBe('SUCCESS');
    // canonical commit path used; readback verified
    expect(outcome.commit).not.toBeNull();
    expect(outcome.commit!.write_status).toBe('SUCCESS');
    expect(outcome.commit!.readback_status).toBe('VERIFIED');
    // committed Lead reflects the ORIGINAL AI value (no edit)
    expect(outcome.lead).not.toBeNull();
    expect(outcome.lead!.budget_max).toBe(4000);
    // anonymous lead → only a lead write, no customer/link
    expect(outcome.writes.lead).toBe(1);
    expect(outcome.writes.customer).toBe(0);
    expect(outcome.writes.link).toBe(0);
    // store reflects terminal COMMITTED
    expect(svc.getReview('rev_r1')!.state).toBe('COMMITTED');
  });

  /* ---------------------------- H1-02-E ----------------------------- */
  it('E — EDIT+APPROVE budget 4000→4500; snapshot retained; committed=4500; stale evidence not reused', async () => {
    const svc = makeSvc();
    const patch = { 'requirement.budget_max': 4500 } as const;
    const outcome = await svc.editAndApprove('rev_r2', patch, '客户已确认上浮预算');

    expect(outcome.state).toBe('COMMITTED');
    expect(outcome.commit_status).toBe('SUCCESS');

    // committed / readback value == 4500 (the human-edited value)
    expect(outcome.lead).not.toBeNull();
    expect(outcome.lead!.budget_max).toBe(4500);

    const rc = svc.getReview('rev_r2')!;
    // original AI candidate snapshot remains unchanged (4000)
    expect(rc.original_candidate.requirement.budget_max).toBe(4000);
    // reviewed candidate contains the edited value (4500)
    expect(rc.reviewed_candidate.requirement.budget_max).toBe(4500);
    // human before/after retained
    expect(rc.edits).toHaveLength(1);
    expect(rc.edits[0].field).toBe('requirement.budget_max');
    expect(rc.edits[0].before).toBe(4000);
    expect(rc.edits[0].after).toBe(4500);
    // customer present (wechat) → customer + link writes
    expect(outcome.writes.customer).toBe(1);
    expect(outcome.writes.link).toBe(1);

    // stale AI evidence must NOT be presented as evidence for the edited value
    const staleEntry = rc.reviewed_candidate.evidence.find(
      (e) => e.field === 'requirement.budget_max' && e.source_text === '预算大概4000',
    );
    expect(staleEntry).toBeUndefined();
    // a HUMAN_EDIT marker replaces it
    expect(rc.reviewed_candidate.evidence.some((e) => e.source_text.startsWith('HUMAN_EDIT'))).toBe(
      true,
    );
    expect(outcome.evidence_notes.some((n) => n.includes('HUMAN_EDIT'))).toBe(true);
  });

  /* ----------------------------- H1-02-F ----------------------------- */
  it('F — REJECT zero business writes, no COMMITTED result', async () => {
    const svc = makeSvc();
    const outcome = await svc.reject('rev_r3', '疑似风险，拒绝');
    expect(outcome.state).toBe('REJECTED');
    expect(outcome.commit).toBeNull();
    expect(outcome.commit_status).toBeNull();
    // zero repository writes
    expect(outcome.writes.lead).toBe(0);
    expect(outcome.writes.customer).toBe(0);
    expect(outcome.writes.link).toBe(0);
    // store reflects terminal REJECTED
    expect(svc.getReview('rev_r3')!.state).toBe('REJECTED');
  });

  /* ----------------------------- H1-02-G ----------------------------- */
  it('G — fail-closed on invalid edit (negative budget): zero writes, FAILED', async () => {
    const svc = makeSvc();
    const outcome = await svc.editAndApprove('rev_r2', {
      'requirement.budget_max': -5,
    });
    // fail closed: no COMMITTED, state FAILED, sanitized reason visible
    expect(outcome.state).toBe('FAILED');
    expect(outcome.commit_status).toBe('FAILED');
    expect(outcome.commit).toBeNull();
    expect(outcome.failure_reason).toBeTruthy();
    expect(outcome.failure_reason!.toLowerCase()).toContain('valid');
    // zero unauthorized business writes before failure
    expect(outcome.writes.lead).toBe(0);
    expect(outcome.writes.customer).toBe(0);
    expect(outcome.writes.link).toBe(0);
    // store reflects terminal FAILED
    expect(svc.getReview('rev_r2')!.state).toBe('FAILED');
  });

  /* ------------------- repeat-decision guard (UX §12) ---------------- */
  it('prevents a repeat decision once terminal', async () => {
    const svc = makeSvc();
    await svc.approve('rev_r1');
    await expect(svc.approve('rev_r1')).rejects.toThrow(/already decided/);
  });
});
