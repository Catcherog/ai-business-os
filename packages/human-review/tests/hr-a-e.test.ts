import { describe, it, expect } from 'vitest';
import { isBusinessCommitSuccess } from '@busos/contracts';
import { BusinessRepository, FakeFeishuAdapter } from '@busos/business-repository';
import { HumanReviewService } from '../src/index.js';
import {
  buildReviewableCandidate,
  buildRejectedCandidate,
  buildCandidateFromInput,
  CountingBusinessRepository,
} from './testkit.js';

const ANON = '我想下个月拍一套新中式写真，预算大概4000。';

describe('HR-A — Review interception', () => {
  it('exposes a reviewable case with candidate, issues, trace IDs, and ZERO writes', async () => {
    const { candidate, governance } = buildReviewableCandidate();
    expect(governance.decision).toBe('REVIEW_REQUIRED');

    const svc = new HumanReviewService({ candidateBuilder: buildCandidateFromInput });
    const reviewCase = svc.createReviewCase(candidate, governance);

    // case available, pending
    expect(reviewCase.state).toBe('PENDING_REVIEW');
    expect(reviewCase.outcome).toBeNull();

    // candidate + governance issues visible
    expect(reviewCase.original_candidate.candidate_id).toBe(candidate.candidate_id);
    expect(reviewCase.original_governance.issues.length).toBeGreaterThan(0);
    expect(
      reviewCase.original_governance.issues.some((i) => i.code === 'INTENT_CONFIDENCE_LOW'),
    ).toBe(true);

    // trace IDs retained
    expect(reviewCase.original_candidate.session_id).toBe(candidate.session_id);
    expect(reviewCase.original_candidate.agent_run_id).toBe(candidate.agent_run_id);
    expect(reviewCase.original_candidate.candidate_id).toBe(candidate.candidate_id);

    // BusinessRepository write count = 0; Feishu write count = 0
    const adapter = new FakeFeishuAdapter();
    const repo = new CountingBusinessRepository(new BusinessRepository(adapter));
    expect(repo.writes.lead).toBe(0);
    expect(repo.writes.customer).toBe(0);
    expect(repo.writes.link).toBe(0);
    expect(adapter.leadCount).toBe(0);
    expect(adapter.customerCount).toBe(0);
  });
});

describe('HR-B — Approve', () => {
  it('APPROVE commits, records approval, COMMITTED with VERIFIED readback', async () => {
    const { candidate, governance } = buildReviewableCandidate();
    const svc = new HumanReviewService({ candidateBuilder: buildCandidateFromInput });
    const reviewCase = svc.createReviewCase(candidate, governance);

    const adapter = new FakeFeishuAdapter();
    const repo = new CountingBusinessRepository(new BusinessRepository(adapter));
    const outcome = await svc.applyReview(reviewCase, 'APPROVE', repo, {}, 'reviewer-ok');

    // approval explicitly recorded
    expect(outcome.approval).not.toBeNull();
    expect(outcome.approval!.action).toBe('APPROVE');

    // domain object created + repository write succeeds
    expect(outcome.lead).not.toBeNull();
    expect(outcome.lead!.service_type).toBe('新中式写真');
    expect(outcome.lead!.budget_max).toBe(4000);
    expect(outcome.customer).toBeNull(); // anonymous
    expect(repo.writes.lead).toBe(1);
    expect(repo.writes.customer).toBe(0);
    expect(repo.writes.link).toBe(0);

    // readback verifies + final commit COMMITTED
    expect(outcome.commit).not.toBeNull();
    expect(outcome.commit!.status).toBe('COMMITTED');
    expect(outcome.commit!.write_status).toBe('SUCCESS');
    expect(outcome.commit!.readback_status).toBe('VERIFIED');
    expect(isBusinessCommitSuccess(outcome.commit!)).toBe(true);
    expect(outcome.state).toBe('COMMITTED');
  });

  it('hard REJECT governance cannot be overridden by APPROVE (fail closed)', async () => {
    const { candidate, governance } = buildRejectedCandidate();
    expect(governance.decision).toBe('REJECT');

    const svc = new HumanReviewService({ candidateBuilder: buildCandidateFromInput });
    const reviewCase = svc.createReviewCase(candidate, governance);

    const adapter = new FakeFeishuAdapter();
    const repo = new CountingBusinessRepository(new BusinessRepository(adapter));
    const outcome = await svc.applyReview(reviewCase, 'APPROVE', repo);

    expect(outcome.state).toBe('FAILED');
    expect(outcome.commit).toBeNull();
    expect(repo.writes.lead).toBe(0);
    expect(repo.writes.customer).toBe(0);
  });
});

describe('HR-C — Edit + approve', () => {
  it('commits the HUMAN-EDITED value 4500; original AI snapshot + edits retained; no stale AI evidence', async () => {
    const { candidate, governance } = buildReviewableCandidate();
    const svc = new HumanReviewService({ candidateBuilder: buildCandidateFromInput });
    const reviewCase = svc.createReviewCase(candidate, governance);

    // original AI snapshot retained
    expect(reviewCase.original_candidate.requirement.budget_max).toBe(4000);
    const origEvidence = reviewCase.original_candidate.evidence.find(
      (e) => e.field === 'requirement.budget_max',
    );
    expect(origEvidence).toBeDefined();
    expect(origEvidence!.source_text).toContain('预算大概4000');

    const adapter = new FakeFeishuAdapter();
    const repo = new CountingBusinessRepository(new BusinessRepository(adapter));
    const outcome = await svc.applyReview(
      reviewCase,
      'EDIT_APPROVE',
      repo,
      { 'requirement.budget_max': 4500 },
      'edited by reviewer',
    );

    // terminal outcome committed
    expect(outcome.state).toBe('COMMITTED');
    expect(outcome.commit!.status).toBe('COMMITTED');
    expect(outcome.commit!.readback_status).toBe('VERIFIED');

    // human before/after edit retained separately
    expect(outcome.edits).toEqual([
      { field: 'requirement.budget_max', before: 4000, after: 4500 },
    ]);

    // committed business value = 4500
    expect(outcome.lead!.budget_max).toBe(4500);

    // Feishu readback verifies the EDITED value (4500), not the original AI 4000
    const readback = await repo.getLead(outcome.lead!.lead_id);
    expect(readback!.budget_max).toBe(4500);

    // stale AI evidence is NOT presented as evidence for the human-edited value
    const reviewedEvidence = reviewCase.reviewed_candidate.evidence.find(
      (e) => e.field === 'requirement.budget_max',
    );
    expect(reviewedEvidence).toBeDefined();
    expect(reviewedEvidence!.source_text).not.toContain('预算大概4000');
    expect(reviewedEvidence!.source_text).toContain('HUMAN_EDIT');

    // original snapshot still shows the AI value
    expect(reviewCase.original_candidate.requirement.budget_max).toBe(4000);
  });
});

describe('HR-D — Reject', () => {
  it('REJECT => zero repository writes, zero Feishu writes, no COMMITTED', async () => {
    const { candidate, governance } = buildReviewableCandidate();
    const svc = new HumanReviewService({ candidateBuilder: buildCandidateFromInput });
    const reviewCase = svc.createReviewCase(candidate, governance);

    const adapter = new FakeFeishuAdapter();
    const repo = new CountingBusinessRepository(new BusinessRepository(adapter));
    const outcome = await svc.applyReview(reviewCase, 'REJECT', repo);

    expect(outcome.state).toBe('REJECTED');
    expect(outcome.commit).toBeNull();
    expect(outcome.lead).toBeNull();
    expect(repo.writes.lead).toBe(0);
    expect(repo.writes.customer).toBe(0);
    expect(repo.writes.link).toBe(0);
    expect(adapter.leadCount).toBe(0);
    expect(adapter.customerCount).toBe(0);
    expect(reviewCase.state).toBe('REJECTED');
  });
});

describe('HR-E — Invalid edit / hard rejection', () => {
  it('invalid edited candidate (service_type cleared) => fail closed, zero writes', async () => {
    const { candidate, governance } = buildReviewableCandidate();
    const svc = new HumanReviewService({ candidateBuilder: buildCandidateFromInput });
    const reviewCase = svc.createReviewCase(candidate, governance);

    const adapter = new FakeFeishuAdapter();
    const repo = new CountingBusinessRepository(new BusinessRepository(adapter));
    // service_type -> '' is contract-valid but governance REJECTs empty service_type
    const outcome = await svc.applyReview(reviewCase, 'EDIT_APPROVE', repo, {
      'requirement.service_type': '',
    });

    expect(outcome.state).toBe('FAILED');
    expect(outcome.commit).toBeNull();
    expect(repo.writes.lead).toBe(0);
    expect(repo.writes.customer).toBe(0);
    expect(outcome.failure_reason).toContain('REJECT');
  });

  it('hard REJECT governance (service_type null) cannot be approved', async () => {
    const { candidate, governance } = buildRejectedCandidate();
    const svc = new HumanReviewService({ candidateBuilder: buildCandidateFromInput });
    const reviewCase = svc.createReviewCase(candidate, governance);

    const adapter = new FakeFeishuAdapter();
    const repo = new CountingBusinessRepository(new BusinessRepository(adapter));
    const outcome = await svc.applyReview(reviewCase, 'APPROVE', repo);

    expect(outcome.state).toBe('FAILED');
    expect(outcome.commit).toBeNull();
    expect(repo.writes.lead).toBe(0);
  });
});
