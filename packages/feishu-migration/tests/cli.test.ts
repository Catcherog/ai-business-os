import { describe, expect, it } from 'vitest';
import { parseCanaryArtifact, parseCliArgs } from '../src/cli.js';
import { redactApplyReport } from '../src/artifact.js';
import type { ApplyReport } from '../src/apply.js';

describe('migration CLI contract', () => {
  it('accepts help after the command when invoked through an npm script', () => {
    expect(parseCliArgs(['plan', '--help'])).toMatchObject({
      command: 'help',
      canary: false,
      schema_only: false,
    });
  });

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

  it('accepts a read-only schema dry-run before bootstrap writes', () => {
    expect(parseCliArgs(['bootstrap', '--dry-run'])).toMatchObject({
      command: 'bootstrap',
      dry_run: true,
    });
  });

  it('accepts verification scope without requiring a manifest path', () => {
    expect(parseCliArgs(['verify', '--run-id', 'run-20260825', '--scope', 'canary'])).toMatchObject({
      command: 'verify',
      run_id: 'run-20260825',
      scope: 'canary',
    });
  });

  it('accepts a local authorized config document path without exposing its contents', () => {
    expect(parseCliArgs(['plan', '--config-file', 'D:/safe/feishubase.txt'])).toMatchObject({
      command: 'plan',
      config_path: 'D:/safe/feishubase.txt',
    });
  });

  it('supports a safe config diagnostics command', () => {
    expect(parseCliArgs(['config', '--config-file', 'D:/safe/feishubase.txt'])).toMatchObject({
      command: 'config',
      config_path: 'D:/safe/feishubase.txt',
    });
  });

  it('accepts the read-only Drive inventory command', () => {
    expect(parseCliArgs(['inventory', '--output', '.artifacts/feishu-migration']))
      .toMatchObject({
        command: 'inventory',
        output_dir: '.artifacts/feishu-migration',
        canary: false,
        schema_only: false,
      });
  });

  it('loads the nested canary artifact persisted inside canary.json apply reports', () => {
    const persisted = redactApplyReport({
      run_id: 'run-canary',
      mode: 'canary',
      status: 'PASS',
      results: [],
      field_mismatches: [],
      untracked_writes: 0,
      schema_conflicts: [],
      business_writes: 0,
      registry_writes: 0,
      canary_report: {
        run_id: 'run-canary',
        status: 'PASS',
        selected_keys: ['project:FZ1'],
        field_mismatches: [],
        untracked_writes: 0,
        schema_conflicts: [],
        results: [],
      },
    } satisfies ApplyReport);

    expect(parseCanaryArtifact(persisted)).toMatchObject({
      artifact_type: 'feishu-migration-canary-report',
      run_id: 'run-canary',
      status: 'PASS',
    });
  });
});
