import { describe, it, expect } from 'vitest';
import { isBusinessCommitSuccess } from '@busos/contracts';
import { BusinessRepository } from '@busos/business-repository';
import { executeGoldenPath } from '../src/index.js';
import {
  CountingBusinessRepository,
  makeRealAdapter,
  newFeishuStub,
  createFeishuAdapterFromEnv,
} from './testkit.js';
import { buildCandidateFromInput, govern } from '../src/index.js';

/**
 * §12 — RealFeishuAdapter + makeFeishuStub integration.
 *
 * This exercises the PRODUCTION adapter code path (RealFeishuAdapter: auth ->
 * create -> readback -> map -> verify -> CommitResultV1) against an in-memory
 * Feishu bitable simulator. It proves the full GP orchestration works end-to-end
 * through the real adapter logic.
 *
 * It is explicitly NOT a live Feishu E2E: the stub transport stands in for the
 * Feishu API. Per §19 the report must say
 *   "RealFeishuAdapter via in-memory Feishu simulator: PASS"
 * and must NOT say "Real Feishu E2E: PASS".
 */

const ANON = '我想下个月拍一套新中式写真，预算大概4000。';
const IDENTIFIED = '我是张三，微信 zhangsan123，想下个月拍新中式写真，预算4000。';
const NOSERVICE = '你好，请问你们几点关门？';

function realDeps() {
  const adapter = makeRealAdapter(newFeishuStub().fetchFn);
  const repo = new BusinessRepository(adapter);
  const counts = new CountingBusinessRepository(repo);
  return {
    deps: { candidateBuilder: buildCandidateFromInput, governance: govern, businessRepository: counts },
    counts,
  };
}

describe('RealFeishuAdapter via in-memory Feishu simulator', () => {
  it('Flow A — anonymous lead write+readback VERIFIED', async () => {
    const { deps, counts } = realDeps();
    const r = await executeGoldenPath({ text: ANON }, deps);
    expect(r.status).toBe('SUCCESS');
    expect(counts.writes.lead).toBe(1);
    expect(r.lead!.customer_id).toBeNull();
    expect(r.leadCommit!.readback_status).toBe('VERIFIED');
    expect(isBusinessCommitSuccess(r.leadCommit!)).toBe(true);
  });

  it('Flow B — customer find/create + lead + link VERIFIED', async () => {
    const { deps, counts } = realDeps();
    const r = await executeGoldenPath({ text: IDENTIFIED }, deps);
    expect(r.status).toBe('SUCCESS');
    expect(counts.writes.customer).toBe(1);
    expect(isBusinessCommitSuccess(r.customerCommit!)).toBe(true);
    expect(counts.writes.lead).toBe(1);
    expect(counts.writes.link).toBe(1);
    expect(r.lead!.customer_id).toBe(r.customer!.customer_id);
    expect(isBusinessCommitSuccess(r.leadCommit!)).toBe(true);
  });

  it('Flow C — governance block => zero Feishu writes', async () => {
    const { deps, counts } = realDeps();
    const r = await executeGoldenPath({ text: NOSERVICE }, deps);
    expect(r.status).not.toBe('SUCCESS');
    expect(counts.writes.lead).toBe(0);
    expect(counts.writes.customer).toBe(0);
    expect(counts.writes.link).toBe(0);
  });
});

/* ---------------------------------------------------------------------- LIVE */

/**
 * LIVE Feishu Base E2E (§13/§14). Only runs when FEISHU_* credentials are
 * present in the environment. In this sandbox they are NOT set, so this block
 * is SKIPPED and the live gate remains BLOCKED (BL-013/BL-014).
 */
const liveAdapter = createFeishuAdapterFromEnv();
const describeLive = liveAdapter ? describe : describe.skip;

describeLive('LIVE Feishu Base E2E (requires FEISHU_* env)', () => {
  it('create lead -> real readback verifies on live Base', async () => {
    const counts = new CountingBusinessRepository(new BusinessRepository(liveAdapter!));
    const r = await executeGoldenPath(
      { text: ANON },
      { candidateBuilder: buildCandidateFromInput, governance: govern, businessRepository: counts },
    );
    expect(r.status).toBe('SUCCESS');
    expect(r.leadCommit!.readback_status).toBe('VERIFIED');
    expect(isBusinessCommitSuccess(r.leadCommit!)).toBe(true);
  });
});
