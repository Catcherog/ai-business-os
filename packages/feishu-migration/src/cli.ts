import { readFile } from 'node:fs/promises';
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

export type MigrationCliCommand = 'plan' | 'bootstrap' | 'apply' | 'verify' | 'help';

export interface ParsedCliArgs {
  command: MigrationCliCommand;
  run_id?: string;
  manifest_path?: string;
  canary: boolean;
}

export function parseCliArgs(args: string[]): ParsedCliArgs {
  const rawCommand = args[0];
  if (!rawCommand || rawCommand === '--help' || rawCommand === '-h') {
    return { command: 'help', canary: false };
  }
  const command = rawCommand as MigrationCliCommand;
  if (!['plan', 'bootstrap', 'apply', 'verify'].includes(command)) {
    throw new Error(`Unknown migration command: ${command}`);
  }
  let run_id: string | undefined;
  let manifest_path: string | undefined;
  let canary = false;
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--canary') {
      canary = true;
      continue;
    }
    if (argument === '--run-id' || argument === '--manifest') {
      const value = args[index + 1]?.trim();
      if (!value) throw new Error(`${argument} requires a value`);
      if (argument === '--run-id') run_id = value;
      else manifest_path = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown migration argument: ${argument}`);
  }
  return { command, run_id, manifest_path, canary };
}

function usage(): string {
  return [
    'Usage:',
    '  npm run plan --workspace=@busos/feishu-migration -- --run-id <run_id>',
    '  npm run bootstrap --workspace=@busos/feishu-migration',
    '  npm run apply --workspace=@busos/feishu-migration -- --canary --manifest <path>',
    '  npm run apply --workspace=@busos/feishu-migration -- --run-id <run_id> --manifest <path>',
    '  npm run verify:live --workspace=@busos/feishu-migration -- --run-id <run_id> --manifest <path>',
  ].join('\n');
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

async function loadManifest(path: string): Promise<MigrationManifest> {
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw) as MigrationManifest;
  if (!parsed || typeof parsed !== 'object' || typeof parsed.manifest_hash !== 'string') {
    throw new Error('Manifest is missing manifest_hash');
  }
  return parsed;
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
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  return 0;
}

async function runBootstrap(): Promise<number> {
  const config = loadFeishuMigrationConfig();
  const client = new FeishuClient({ appId: config.appId, appSecret: config.appSecret });
  const result = await bootstrapTargetSchema(client, config.targetBaseToken);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.status === 'SCHEMA_CONFLICT' ? 1 : 0;
}

async function runApply(args: ParsedCliArgs): Promise<number> {
  const config = loadFeishuMigrationConfig();
  const manifestPath = args.manifest_path;
  if (!manifestPath) throw new Error('apply requires --manifest <path>');
  const manifest = await loadManifest(manifestPath);
  if (args.run_id && args.run_id !== manifest.run_id) {
    throw new Error('apply --run-id does not match manifest run_id');
  }
  const client = new FeishuClient({ appId: config.appId, appSecret: config.appSecret });
  const currentFingerprint = await getTargetSchemaFingerprint(client, config.targetBaseToken);
  const result = await applyMigration(client, manifest, {
    target_token: config.targetBaseToken,
    mode: args.canary ? 'canary' : 'full',
    current_schema_fingerprint: currentFingerprint,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.status === 'PASS' ? 0 : 1;
}

async function runVerify(args: ParsedCliArgs): Promise<number> {
  const config = loadFeishuMigrationConfig();
  const manifestPath = args.manifest_path;
  if (!manifestPath) throw new Error('verify requires --manifest <path>');
  const manifest = await loadManifest(manifestPath);
  if (args.run_id && args.run_id !== manifest.run_id) {
    throw new Error('verify --run-id does not match manifest run_id');
  }
  const client = new FeishuClient({ appId: config.appId, appSecret: config.appSecret });
  const currentFingerprint = await getTargetSchemaFingerprint(client, config.targetBaseToken);
  const result = await verifyMigration(client, manifest, {
    target_token: config.targetBaseToken,
    current_schema_fingerprint: currentFingerprint,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.status === 'PASS' ? 0 : 1;
}

export async function runCli(args: string[] = process.argv.slice(2)): Promise<number> {
  const parsed = parseCliArgs(args);
  if (parsed.command === 'help') {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  if (parsed.command === 'plan') return runPlan(parsed);
  if (parsed.command === 'bootstrap') return runBootstrap();
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
