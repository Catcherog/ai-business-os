import { describe, it, expect } from 'vitest';
import { isBusinessCommitSuccess } from '@busos/contracts';
import { BusinessRepository } from '@busos/business-repository';
import { HumanReviewService } from '../src/index.js';
import {
  buildReviewableCandidate,
  buildCandidateFromInput,
  CountingBusinessRepository,
  newFeishuStub,
  makeRealAdapter,
  createLiveAdapter,
} from './testkit.js';

/**
 * HR-H — Live Feishu vertical slice.
 *
 * At least one reviewed APPROVE or EDIT+APPROVE must run through:
 *   Human Review -> BusinessRepository -> RealFeishuAdapter -> real write
 *   -> real readback -> VERIFIED
 *
 * The LIVE block runs ONLY when FEISHU_* credentials are present in the
 * environment. When they are absent (this sandbox), it is SKIPPED and the
 * final report marks
 *   "IMPLEMENTATION PASS / LIVE P3 REVIEW E2E BLOCKED"
 * Per the task, a Fake/Simulator PASS must NOT be substituted for Live PASS.
 */
const liveAdapter = createLiveAdapter();
const describeLive = liveAdapter ? describe : describe.skip;

describeLive('HR-H — LIVE Feishu vertical slice (requires FEISHU_* env)', () => {
  it('EDIT+APPROVE: review -> BusinessRepository -> RealFeishuAdapter -> real write -> readback VERIFIED', async () => {
    const { candidate, governance } = buildReviewableCandidate();
    const svc = new HumanReviewService({ candidateBuilder: buildCandidateFromInput });
    const reviewCase = svc.createReviewCase(candidate, governance);
    const repo = new CountingBusinessRepository(new BusinessRepository(liveAdapter!));

    const outcome = await svc.applyReview(
      reviewCase,
      'EDIT_APPROVE',
      repo,
      { 'requirement.budget_max': 4500 },
      'live-human-review',
    );

    expect(outcome.state).toBe('COMMITTED');
    expect(outcome.commit).not.toBeNull();
    expect(outcome.commit!.status).toBe('COMMITTED');
    expect(outcome.commit!.write_status).toBe('SUCCESS');
    expect(outcome.commit!.readback_status).toBe('VERIFIED');
    expect(isBusinessCommitSuccess(outcome.commit!)).toBe(true);
    expect(outcome.lead!.budget_max).toBe(4500);

    // Sanitized cleanup: delete by exact record_id; must not affect others.
    const recId = outcome.commit!.external_record_id;
    expect(recId).not.toBeNull();
    const removed = await liveAdapter!.deleteLead(recId!);
    expect(removed).toBe(true);
  });

  it('APPROVE (no edit): review -> real write -> readback VERIFIED + cleanup', async () => {
    const { candidate, governance } = buildReviewableCandidate();
    const svc = new HumanReviewService({ candidateBuilder: buildCandidateFromInput });
    const reviewCase = svc.createReviewCase(candidate, governance);
    const repo = new CountingBusinessRepository(new BusinessRepository(liveAdapter!));

    const outcome = await svc.applyReview(reviewCase, 'APPROVE', repo, {}, 'live-approve');

    expect(outcome.state).toBe('COMMITTED');
    expect(outcome.commit!.readback_status).toBe('VERIFIED');
    const recId = outcome.commit!.external_record_id;
    expect(recId).not.toBeNull();
    const removed = await liveAdapter!.deleteLead(recId!);
    expect(removed).toBe(true);
  });
});

/**
 * RealFeishuAdapter code path via an in-memory Feishu bitable simulator.
 *
 * This exercises the PRODUCTION adapter logic (auth -> create -> readback ->
 * map -> verify -> CommitResultV1) through the review service, proving the
 * full path end-to-end. It is explicitly NOT a live Feishu E2E and must not be
 * reported as one.
 */
describe('HR-H — RealFeishuAdapter via in-memory Feishu simulator (NOT live)', () => {
  it('EDIT+APPROVE through review service + RealFeishuAdapter + simulator => VERIFIED', async () => {
    const { fetchFn } = newFeishuStub();
    const adapter = makeRealAdapter(fetchFn);
    const { candidate, governance } = buildReviewableCandidate();
    const svc = new HumanReviewService({ candidateBuilder: buildCandidateFromInput });
    const reviewCase = svc.createReviewCase(candidate, governance);
    const repo = new CountingBusinessRepository(new BusinessRepository(adapter));

    const outcome = await svc.applyReview(
      reviewCase,
      'EDIT_APPROVE',
      repo,
      { 'requirement.budget_max': 4500 },
    );

    expect(outcome.state).toBe('COMMITTED');
    expect(outcome.commit!.status).toBe('COMMITTED');
    expect(outcome.commit!.readback_status).toBe('VERIFIED');
    expect(outcome.lead!.budget_max).toBe(4500);

    const removed = await adapter.deleteLead(outcome.commit!.external_record_id!);
    expect(removed).toBe(true);
  });
});
