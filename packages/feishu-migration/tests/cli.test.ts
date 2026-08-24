import { describe, expect, it } from 'vitest';
import { parseCliArgs } from '../src/cli.js';

describe('migration CLI contract', () => {
  it('accepts the plan output directory from the cutover runbook', () => {
    expect(parseCliArgs(['plan', '--output', '.artifacts/feishu-migration'])).toMatchObject({
      command: 'plan',
      output_dir: '.artifacts/feishu-migration',
    });
  });

  it('accepts schema-only bootstrap and a run id', () => {
    expect(parseCliArgs(['apply', '--schema-only', '--run-id', 'run-20260825'])).toMatchObject({
      command: 'apply',
      schema_only: true,
      run_id: 'run-20260825',
    });
  });

  it('accepts verification scope without requiring a manifest path', () => {
    expect(parseCliArgs(['verify', '--run-id', 'run-20260825', '--scope', 'canary'])).toMatchObject({
      command: 'verify',
      run_id: 'run-20260825',
      scope: 'canary',
    });
  });
});
