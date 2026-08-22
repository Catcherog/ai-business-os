import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/cli.js';
import { EVALUATION_CASE_VERSION } from '../src/versions.js';

/**
 * Runner failure-exit behaviour (§25 / §15): the CLI must return non-zero when
 * the required regression gate fails, and zero when it passes.
 */

const OLD: Record<string, string | undefined> = {};
for (const k of ['EVAL_DATASET', 'EVAL_REPORTS_DIR', 'EVAL_BASELINE']) {
  OLD[k] = process.env[k];
}

afterEach(() => {
  for (const [k, v] of Object.entries(OLD)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function tmpReports(): string {
  const dir = mkdtempSync(join(tmpdir(), 'busos-eval-reports-'));
  return dir;
}

function tmpDataset(cases: unknown[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'busos-eval-'));
  const file = join(dir, 'dataset.json');
  writeFileSync(file, JSON.stringify(cases), 'utf8');
  return file;
}

describe('evaluation CLI exit behaviour', () => {
  it('returns 0 when a clean synthetic passing dataset passes the gate', async () => {
    // Must NOT depend on the canonical golden-set's current production state —
    // a self-contained passing case proves the 0-contract independently.
    const passing = [
      {
        version: EVALUATION_CASE_VERSION,
        case_id: 'CLI-PASS',
        domain: 'GOVERNANCE',
        provenance_type: 'SYNTHETIC',
        query: 'expect REJECT and the engine rejects (clean pass)',
        expected: { governance_decision: 'REJECT' },
        fixture: { candidate: { service_type: null } },
        tags: [],
        review_status: 'SYSTEM_REVIEWED',
        synthetic: true,
      },
    ];
    process.env.EVAL_DATASET = tmpDataset(passing);
    process.env.EVAL_REPORTS_DIR = tmpReports();
    const code = await main(['--skip-baseline']);
    expect(code).toBe(0);
  }, 120_000);

  it('returns 1 when an executed case FAILs the hard gate', async () => {
    const failing = [
      {
        version: EVALUATION_CASE_VERSION,
        case_id: 'CLI-FAIL',
        domain: 'GOVERNANCE',
        provenance_type: 'SYNTHETIC',
        query: 'expect REJECT but engine approves',
        expected: { governance_decision: 'REJECT' },
        fixture: { candidate: { service_type: '新中式写真', intent_confidence: 0.99 } },
        tags: [],
        review_status: 'SYSTEM_REVIEWED',
        synthetic: true,
      },
    ];
    process.env.EVAL_DATASET = tmpDataset(failing);
    process.env.EVAL_REPORTS_DIR = tmpReports();
    const code = await main(['--skip-baseline']);
    expect(code).toBe(1);
  });

  it('returns 2 when the dataset is malformed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'busos-eval-'));
    const file = join(dir, 'dataset.json');
    writeFileSync(file, JSON.stringify([{ version: 'wrong', case_id: 'X' }]), 'utf8');
    process.env.EVAL_DATASET = file;
    process.env.EVAL_REPORTS_DIR = tmpReports();
    const code = await main(['--skip-baseline']);
    expect(code).toBe(2);
    rmSync(dir, { recursive: true, force: true });
  });
});
