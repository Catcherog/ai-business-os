import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyMigration, type ApplyReport } from './apply.js';
import { bootstrapTargetSchema, getTargetSchemaFingerprint } from './bootstrap.js';
import { loadFeishuMigrationConfig } from './config.js';
import { FeishuClient } from './feishu-client.js';
import { discoverSourceInventory } from './inventory.js';
import { createMigrationManifest, type MigrationManifest } from './plan.js';
import { redactForLog } from './redact.js';
import { verifyMigration, type LiveVerificationReport } from './verify-live.js';
import type { TargetSnapshot } from './types.js';
import {
  parseRedactedCanaryArtifact,
  parseRedactedManifestArtifact,
  redactApplyReport,
  redactLiveVerificationReport,
  redactMigrationManifest,
  rehydrateCanaryReport,
  rehydrateMigrationManifest,
  type RedactedCanaryArtifact,
  type RedactedManifestArtifact,
} from './artifact.js';

export type MigrationCliCommand = 'plan' | 'bootstrap' | 'apply' | 'verify' | 'help';
export type MigrationVerifyScope = 'canary' | 'full';

export const DEFAULT_OUTPUT_DIR = '.artifacts/feishu-migration';

export interface ParsedCliArgs {
  command: MigrationCliCommand;
  run_id?: string;
  manifest_path?: string;
  output_dir?: string;
  canary: boolean;
  schema_only: boolean;
  scope?: MigrationVerifyScope;
}

export function parseCliArgs(args: string[]): ParsedCliArgs {
  const rawCommand = args[0];
  if (!rawCommand || args.some((argument) => argument === '--help' || argument === '-h')) {
    return { command: 'help', canary: false, schema_only: false };
  }
  const command = rawCommand as MigrationCliCommand;
  if (!['plan', 'bootstrap', 'apply', 'verify'].includes(command)) {
    throw new Error(`Unknown migration command: ${command}`);
  }
  let run_id: string | undefined;
  let manifest_path: string | undefined;
  let output_dir: string | undefined;
  let canary = false;
  let schema_only = false;
  let scope: MigrationVerifyScope | undefined;
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--canary') {
      canary = true;
      continue;
    }
    if (argument === '--run-id' || argument === '--manifest' || argument === '--output') {
      const value = args[index + 1]?.trim();
      if (!value) throw new Error(`${argument} requires a value`);
      if (argument === '--run-id') run_id = value;
      else if (argument === '--manifest') manifest_path = value;
      else output_dir = value;
      index += 1;
      continue;
    }
    if (argument === '--schema-only') {
      schema_only = true;
      continue;
    }
    if (argument === '--scope') {
      const value = args[index + 1]?.trim();
      if (value !== 'canary' && value !== 'full') {
        throw new Error('--scope must be canary or full');
      }
      scope = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown migration argument: ${argument}`);
  }
  if (schema_only && command !== 'apply') {
    throw new Error('--schema-only is only valid for apply');
  }
  if (canary && command !== 'apply') {
    throw new Error('--canary is only valid for apply');
  }
  if (scope && command !== 'verify') {
    throw new Error('--scope is only valid for verify');
  }
  return {
    command,
    run_id,
    manifest_path,
    output_dir,
    canary,
    schema_only,
    scope,
  };
}

function usage(): string {
  return [
    'Usage:',
    '  npm run migrate:plan -- --output .artifacts/feishu-migration',
    '  npm run migrate:apply -- --schema-only --run-id <run_id>',
    '  npm run migrate:apply -- --canary --run-id <run_id>',
    '  npm run migrate:verify -- --run-id <run_id> --scope canary',
    '  npm run migrate:apply -- --run-id <run_id>',
    '  npm run migrate:verify -- --run-id <run_id> --scope full',
  ].join('\n');
}

function outputDirectory(args: ParsedCliArgs): string {
  return resolve(args.output_dir ?? DEFAULT_OUTPUT_DIR);
}

function manifestPath(args: ParsedCliArgs): string {
  return resolve(args.manifest_path ?? join(outputDirectory(args), 'manifest.json'));
}

async function writeJsonArtifact(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readOptionalJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
    if (code === 'ENOENT') return undefined;
    throw error;
  }
}

async function loadCanaryArtifact(args: ParsedCliArgs): Promise<RedactedCanaryArtifact | undefined> {
  const raw = await readOptionalJson<unknown>(join(outputDirectory(args), 'canary.json'));
  if (raw === undefined) return undefined;
  const report = parseRedactedCanaryArtifact(raw);
  if (args.run_id && report.run_id !== args.run_id) {
    throw new Error('canary report run_id does not match requested run_id');
  }
  return report;
}

async function readTargetSnapshot(
  client: FeishuClient,
  targetToken: string,
): Promise<TargetSnapshot> {
  const tables = await client.listAllTables(targetToken);
  const records: Array<{ source_type: string; source_id: string; fields: Record<string, unknown> }> = [];
  for (const table of tables) {
    const tableRecords = await client.listAllRecords(targetToken, table.table_id);
    for (const record of tableRecords) {
      records.push({
        source_type: `TARGET_BASE:${table.name}`,
        source_id: record.record_id,
        fields: record.fields,
      });
    }
  }
  return { records };
}

function runId(args: ParsedCliArgs): string {
  return args.run_id ?? `run-${new Date().toISOString().replace(/[^0-9]/gu, '')}`;
}

async function loadManifestArtifact(path: string): Promise<RedactedManifestArtifact> {
  const raw = await readFile(path, 'utf8');
  return parseRedactedManifestArtifact(JSON.parse(raw) as unknown);
}

async function loadRehydratedManifest(
  path: string,
  config: ReturnType<typeof loadFeishuMigrationConfig>,
  client: FeishuClient,
): Promise<MigrationManifest> {
  const artifact = await loadManifestArtifact(path);
  const inventory = await discoverSourceInventory({ config, client });
  return rehydrateMigrationManifest(artifact, inventory);
}

async function runPlan(args: ParsedCliArgs): Promise<number> {
  const config = loadFeishuMigrationConfig();
  const client = new FeishuClient({ appId: config.appId, appSecret: config.appSecret });
  const [inventory, targetSnapshot, schemaFingerprint] = await Promise.all([
    discoverSourceInventory({ config, client }),
    readTargetSnapshot(client, config.targetBaseToken),
    getTargetSchemaFingerprint(client, config.targetBaseToken),
  ]);
  const manifest = createMigrationManifest(inventory, targetSnapshot, {
    run_id: runId(args),
    target_schema_fingerprint: schemaFingerprint,
  });
  const path = join(outputDirectory(args), 'manifest.json');
  await writeJsonArtifact(path, redactMigrationManifest(manifest));
  process.stdout.write(`${JSON.stringify({
    run_id: manifest.run_id,
    manifest_path: path,
    source_count: manifest.source_count,
    target_schema_fingerprint: manifest.target_schema_fingerprint,
  }, null, 2)}\n`);
  return 0;
}

async function runSchemaOnly(args: ParsedCliArgs): Promise<number> {
  const config = loadFeishuMigrationConfig();
  const client = new FeishuClient({ appId: config.appId, appSecret: config.appSecret });
  const result = await bootstrapTargetSchema(client, config.targetBaseToken);
  const path = join(outputDirectory(args), 'schema.json');
  await writeJsonArtifact(path, { run_id: runId(args), ...result });
  process.stdout.write(`${JSON.stringify({ ...result, artifact_path: path }, null, 2)}\n`);
  return result.status === 'SCHEMA_CONFLICT' ? 1 : 0;
}

async function runBootstrap(args: ParsedCliArgs): Promise<number> {
  return runSchemaOnly(args);
}

async function runApply(args: ParsedCliArgs): Promise<number> {
  if (args.schema_only) {
    return runSchemaOnly(args);
  }
  const config = loadFeishuMigrationConfig();
  const client = new FeishuClient({ appId: config.appId, appSecret: config.appSecret });
  const manifest = await loadRehydratedManifest(manifestPath(args), config, client);
  if (args.run_id && args.run_id !== manifest.run_id) {
    throw new Error('apply --run-id does not match manifest run_id');
  }
  const currentFingerprint = await getTargetSchemaFingerprint(client, config.targetBaseToken);
  const canaryArtifact = args.canary ? undefined : await loadCanaryArtifact({
    ...args,
    run_id: args.run_id ?? manifest.run_id,
  });
  const canaryReport = canaryArtifact
    ? rehydrateCanaryReport(canaryArtifact, manifest)
    : undefined;
  const result = await applyMigration(client, manifest, {
    target_token: config.targetBaseToken,
    mode: args.canary ? 'canary' : 'full',
    current_schema_fingerprint: currentFingerprint,
    canary_report: canaryReport,
  });
  const artifact = args.canary ? 'canary.json' : 'full.json';
  const path = join(outputDirectory(args), artifact);
  const redacted = redactApplyReport(result);
  await writeJsonArtifact(path, redacted);
  process.stdout.write(`${JSON.stringify(redacted, null, 2)}\n`);
  return result.status === 'PASS' ? 0 : 1;
}

async function runVerify(args: ParsedCliArgs): Promise<number> {
  const config = loadFeishuMigrationConfig();
  const client = new FeishuClient({ appId: config.appId, appSecret: config.appSecret });
  const manifest = await loadRehydratedManifest(manifestPath(args), config, client);
  if (args.run_id && args.run_id !== manifest.run_id) {
    throw new Error('verify --run-id does not match manifest run_id');
  }
  const scope = args.scope ?? 'full';
  const canaryArtifact = scope === 'canary' ? await loadCanaryArtifact({
    ...args,
    run_id: args.run_id ?? manifest.run_id,
  }) : undefined;
  if (scope === 'canary' && !canaryArtifact) {
    throw new Error('canary verification requires canary.json from a successful canary apply');
  }
  const currentFingerprint = await getTargetSchemaFingerprint(client, config.targetBaseToken);
  const canaryReport = canaryArtifact
    ? rehydrateCanaryReport(canaryArtifact, manifest)
    : undefined;
  const result = await verifyMigration(client, manifest, {
    target_token: config.targetBaseToken,
    current_schema_fingerprint: currentFingerprint,
    migration_keys: canaryReport?.selected_keys,
  });
  const redacted = redactLiveVerificationReport(result);
  await writeJsonArtifact(join(outputDirectory(args), `verify-${scope}.json`), redacted);
  process.stdout.write(`${JSON.stringify(redacted, null, 2)}\n`);
  return result.status === 'PASS' ? 0 : 1;
}

export async function runCli(args: string[] = process.argv.slice(2)): Promise<number> {
  const parsed = parseCliArgs(args);
  if (parsed.command === 'help') {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  if (parsed.command === 'plan') return runPlan(parsed);
  if (parsed.command === 'bootstrap') return runBootstrap(parsed);
  if (parsed.command === 'apply') return runApply(parsed);
  return runVerify(parsed);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  runCli()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${redactForLog(error instanceof Error ? error.message : String(error))}\n`);
      process.exitCode = 1;
    });
}

export type { ApplyReport, LiveVerificationReport };
