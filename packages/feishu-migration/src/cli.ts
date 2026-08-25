import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyMigration, selectCanaryDecisions, type ApplyReport } from './apply.js';
import { bootstrapTargetSchema, getTargetSchemaFingerprint } from './bootstrap.js';
import { loadFeishuMigrationConfig } from './config.js';
import {
  FeishuConfigDocumentError,
  inspectFeishuMigrationConfigDocument,
  parseFeishuMigrationConfigDocument,
} from './config-document.js';
import { FeishuAuthorizationError, FeishuClient, type FeishuRequestStats } from './feishu-client.js';
import {
  assertTargetAllowlist,
  discoverDriveSourceInventory,
  DriveInventoryError,
  resolveExplicitSourceConfig,
  type DriveInventoryReport,
  type ResolvedFeishuMigrationConfig,
} from './drive-inventory.js';
import { discoverSourceInventory } from './inventory.js';
import { createMigrationManifest, targetTableName, type MigrationManifest } from './plan.js';
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

export type MigrationCliCommand = 'inventory' | 'plan' | 'bootstrap' | 'apply' | 'verify' | 'config' | 'help';
export type MigrationVerifyScope = 'canary' | 'full';

export const DEFAULT_OUTPUT_DIR = '.artifacts/feishu-migration';

export interface ParsedCliArgs {
  command: MigrationCliCommand;
  run_id?: string;
  manifest_path?: string;
  config_path?: string;
  output_dir?: string;
  canary: boolean;
  schema_only: boolean;
  dry_run: boolean;
  scope?: MigrationVerifyScope;
}

export function parseCliArgs(args: string[]): ParsedCliArgs {
  const rawCommand = args[0];
  if (!rawCommand || args.some((argument) => argument === '--help' || argument === '-h')) {
    return { command: 'help', canary: false, schema_only: false, dry_run: false };
  }
  const command = rawCommand as MigrationCliCommand;
  if (!['inventory', 'plan', 'bootstrap', 'apply', 'verify', 'config'].includes(command)) {
    throw new Error(`Unknown migration command: ${command}`);
  }
  let run_id: string | undefined;
  let manifest_path: string | undefined;
  let config_path: string | undefined;
  let output_dir: string | undefined;
  let canary = false;
  let schema_only = false;
  let dry_run = false;
  let scope: MigrationVerifyScope | undefined;
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--canary') {
      canary = true;
      continue;
    }
    if (argument === '--run-id' || argument === '--manifest' || argument === '--output' || argument === '--config-file') {
      const value = args[index + 1]?.trim();
      if (!value) throw new Error(`${argument} requires a value`);
      if (argument === '--run-id') run_id = value;
      else if (argument === '--manifest') manifest_path = value;
      else if (argument === '--output') output_dir = value;
      else config_path = value;
      index += 1;
      continue;
    }
    if (argument === '--schema-only') {
      schema_only = true;
      continue;
    }
    if (argument === '--dry-run') {
      dry_run = true;
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
  if (
    dry_run &&
    command !== 'bootstrap' &&
    !(command === 'apply' && (schema_only || canary))
  ) {
    throw new Error('--dry-run is only valid for bootstrap, canary, or schema-only apply');
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
    config_path,
    output_dir,
    canary,
    schema_only,
    dry_run,
    scope,
  };
}

function usage(): string {
  return [
    'Usage:',
    '  npm run migrate:plan -- --output .artifacts/feishu-migration',
    '  npm run migrate:plan -- --config-file <local-path> --output .artifacts/feishu-migration',
    '  npm run migrate:inventory -- --output .artifacts/feishu-migration',
    '  npm run migrate:config -- --config-file <local-path>',
    '  npm run migrate:apply -- --schema-only --run-id <run_id>',
    '  npm run migrate:bootstrap -- --dry-run',
    '  npm run migrate:apply -- --canary --dry-run --run-id <run_id>',
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

export function parseCanaryArtifact(value: unknown): RedactedCanaryArtifact {
  const candidate = value && typeof value === 'object' &&
    (value as { artifact_type?: unknown }).artifact_type === 'feishu-migration-apply-report'
    ? (value as { canary?: unknown }).canary
    : value;
  return parseRedactedCanaryArtifact(candidate);
}

async function loadCanaryArtifact(args: ParsedCliArgs): Promise<RedactedCanaryArtifact | undefined> {
  const raw = await readOptionalJson<unknown>(join(outputDirectory(args), 'canary.json'));
  if (raw === undefined) return undefined;
  const report = parseCanaryArtifact(raw);
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
  config: ResolvedFeishuMigrationConfig,
  client: FeishuClient,
): Promise<MigrationManifest> {
  const artifact = await loadManifestArtifact(path);
  const inventory = await discoverSourceInventory({ config, client });
  return rehydrateMigrationManifest(artifact, inventory);
}

interface SourceTargetPreflight {
  config: ResolvedFeishuMigrationConfig;
  report: DriveInventoryReport;
  target_table_count: number;
}

interface InventoryArtifact {
  verdict: 'INVENTORY_PASS' | 'AUTHORIZATION_BLOCKED' | 'INVENTORY_BLOCKED';
  source: DriveInventoryReport;
  target: {
    allowlist: 'PASS' | 'NOT_CHECKED';
    identity: 'TARGET_BASE_TOKEN_CONFIGURED' | 'NOT_VERIFIED';
    table_count: number;
  };
  feishu_http_total: number;
  feishu_reads: number;
  feishu_writes: number;
  blocker?: string;
}

interface RequestStatsFields {
  feishu_http_total: number;
  feishu_reads: number;
  feishu_writes: number;
}

function zeroRequestStats(): FeishuRequestStats {
  return { http_total: 0, reads: 0, writes: 0 };
}

function requestStatsFields(stats: FeishuRequestStats): RequestStatsFields {
  return {
    feishu_http_total: stats.http_total,
    feishu_reads: stats.reads,
    feishu_writes: stats.writes,
  };
}

function explicitSourceTargetPreflight(
  config: ReturnType<typeof loadFeishuMigrationConfig>,
): { config: ResolvedFeishuMigrationConfig; report: DriveInventoryReport } {
  if (config.sourceDriveFolderToken) {
    throw new Error('Drive source configuration requires Drive inventory discovery');
  }
  return resolveExplicitSourceConfig(config);
}

async function runSourceTargetPreflight(
  config: ReturnType<typeof loadFeishuMigrationConfig>,
  client: FeishuClient,
): Promise<SourceTargetPreflight> {
  const source = config.sourceDriveFolderToken
    ? await discoverDriveSourceInventory({ client, config })
    : explicitSourceTargetPreflight(config);
  assertTargetAllowlist(source.config);
  let targetTables;
  try {
    targetTables = await client.listAllTables(source.config.targetBaseToken);
  } catch (error) {
    if (error instanceof FeishuAuthorizationError) throw error;
    const report: DriveInventoryReport = {
      ...source.report,
      verdict: 'BLOCKED',
      blocker: 'TARGET_IDENTITY_BLOCKED',
    };
    throw new DriveInventoryError('TARGET_IDENTITY_BLOCKED', report);
  }
  return {
    config: source.config,
    report: source.report,
    target_table_count: targetTables.length,
  };
}

function inventoryArtifactFromPreflight(
  preflight: SourceTargetPreflight,
  stats: FeishuRequestStats,
): InventoryArtifact {
  return {
    verdict: 'INVENTORY_PASS',
    source: preflight.report,
    target: {
      allowlist: 'PASS',
      identity: 'TARGET_BASE_TOKEN_CONFIGURED',
      table_count: preflight.target_table_count,
    },
    ...requestStatsFields(stats),
  };
}

function safeInventoryBlocker(
  error: unknown,
  stats: FeishuRequestStats = zeroRequestStats(),
): InventoryArtifact {
  if (error instanceof DriveInventoryError) {
    return {
      verdict: error.code === 'AUTHORIZATION_BLOCKED'
        ? 'AUTHORIZATION_BLOCKED'
        : 'INVENTORY_BLOCKED',
      source: error.report,
      target: {
        allowlist: error.code === 'TARGET_ALLOWLIST_MISMATCH' ? 'NOT_CHECKED' : 'NOT_CHECKED',
        identity: 'NOT_VERIFIED',
        table_count: 0,
      },
      ...requestStatsFields(stats),
      blocker: error.code,
    };
  }
  if (error instanceof FeishuAuthorizationError) {
    const report: DriveInventoryReport = {
      verdict: 'BLOCKED',
      source_mode: 'DRIVE_DISCOVERY',
      resources_discovered: 0,
      folders_discovered: 0,
      expected_source_workbooks: 8,
      legacy_base_candidates: { count: 0, candidates: [] },
      source_workbook_candidates: { count: 0, candidates: [] },
      required_scope: error.missingScopes[0] ?? 'drive:drive.metadata:readonly',
      identity: error.identityKind,
      blocker: 'AUTHORIZATION_BLOCKED',
    };
    return {
      verdict: 'AUTHORIZATION_BLOCKED',
      source: report,
      target: { allowlist: 'NOT_CHECKED', identity: 'NOT_VERIFIED', table_count: 0 },
      ...requestStatsFields(stats),
      blocker: 'AUTHORIZATION_BLOCKED',
    };
  }
  if (error instanceof FeishuConfigDocumentError || (
    error instanceof Error &&
    /^(?:Missing required|Expected exactly|Invalid FEISHU|FEISHU_TARGET_BASE_URL)/u.test(error.message)
  )) {
    const report: DriveInventoryReport = {
      verdict: 'BLOCKED',
      source_mode: 'DRIVE_DISCOVERY',
      resources_discovered: 0,
      folders_discovered: 0,
      expected_source_workbooks: 8,
      legacy_base_candidates: { count: 0, candidates: [] },
      source_workbook_candidates: { count: 0, candidates: [] },
      blocker: 'CONFIGURATION_BLOCKED',
    };
    return {
      verdict: 'INVENTORY_BLOCKED',
      source: report,
      target: { allowlist: 'NOT_CHECKED', identity: 'NOT_VERIFIED', table_count: 0 },
      ...requestStatsFields(stats),
      blocker: 'CONFIGURATION_BLOCKED',
    };
  }
  const report: DriveInventoryReport = {
    verdict: 'BLOCKED',
    source_mode: 'DRIVE_DISCOVERY',
    resources_discovered: 0,
    folders_discovered: 0,
    expected_source_workbooks: 8,
    legacy_base_candidates: { count: 0, candidates: [] },
    source_workbook_candidates: { count: 0, candidates: [] },
    blocker: 'DRIVE_READ_BLOCKED',
  };
  return {
    verdict: 'INVENTORY_BLOCKED',
    source: report,
    target: { allowlist: 'NOT_CHECKED', identity: 'NOT_VERIFIED', table_count: 0 },
    ...requestStatsFields(stats),
    blocker: 'DRIVE_READ_BLOCKED',
  };
}

async function runInventory(args: ParsedCliArgs): Promise<number> {
  const path = join(outputDirectory(args), 'source-inventory.json');
  let client: FeishuClient | undefined;
  try {
    const runtimeConfig = await loadRuntimeConfig(args);
    client = new FeishuClient({ appId: runtimeConfig.appId, appSecret: runtimeConfig.appSecret });
    const preflight = await runSourceTargetPreflight(runtimeConfig, client);
    const artifact = inventoryArtifactFromPreflight(preflight, client.getRequestStats());
    await writeJsonArtifact(path, artifact);
    process.stdout.write(`${JSON.stringify({ ...artifact, artifact_path: path }, null, 2)}\n`);
    return 0;
  } catch (error) {
    const artifact = safeInventoryBlocker(error, client?.getRequestStats());
    await writeJsonArtifact(path, artifact);
    process.stdout.write(`${JSON.stringify({ ...artifact, artifact_path: path }, null, 2)}\n`);
    return 1;
  }
}

async function loadRuntimeConfig(args: ParsedCliArgs): Promise<ReturnType<typeof loadFeishuMigrationConfig>> {
  if (!args.config_path) return loadFeishuMigrationConfig();
  const document = await readFile(resolve(args.config_path), 'utf8');
  return parseFeishuMigrationConfigDocument(document).config;
}

async function runConfigDiagnostics(args: ParsedCliArgs): Promise<number> {
  if (!args.config_path) throw new Error('config requires --config-file');
  const document = await readFile(resolve(args.config_path), 'utf8');
  try {
    const result = parseFeishuMigrationConfigDocument(document);
    process.stdout.write(`${JSON.stringify({ status: 'PASS', diagnostics: result.diagnostics }, null, 2)}\n`);
    return 0;
  } catch (error) {
    if (!(error instanceof FeishuConfigDocumentError)) throw error;
    const diagnostics = error.diagnostics ?? inspectFeishuMigrationConfigDocument(document);
    process.stdout.write(`${JSON.stringify({
      status: 'BLOCKED',
      code: error.code,
      fields: [...error.missing_fields, ...error.conflicting_fields],
      diagnostics,
    }, null, 2)}\n`);
    return 1;
  }
}

async function runPlan(args: ParsedCliArgs): Promise<number> {
  const runtimeConfig = await loadRuntimeConfig(args);
  const client = new FeishuClient({ appId: runtimeConfig.appId, appSecret: runtimeConfig.appSecret });
  const preflight = await runSourceTargetPreflight(runtimeConfig, client);
  const config = preflight.config;
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
    ...requestStatsFields(client.getRequestStats()),
  }, null, 2)}\n`);
  return 0;
}

async function runSchemaOnly(args: ParsedCliArgs): Promise<number> {
  const runtimeConfig = await loadRuntimeConfig(args);
  const client = new FeishuClient({ appId: runtimeConfig.appId, appSecret: runtimeConfig.appSecret });
  const preflight = await runSourceTargetPreflight(runtimeConfig, client);
  const config = preflight.config;
  const dryRun = await bootstrapTargetSchema(client, config.targetBaseToken, { dry_run: true });
  const dryRunPath = join(outputDirectory(args), 'schema-dry-run.json');
  await writeJsonArtifact(dryRunPath, { run_id: runId(args), ...dryRun });
  process.stdout.write(`${JSON.stringify({
    phase: 'SCHEMA_DRY_RUN',
    ...dryRun,
    artifact_path: dryRunPath,
    ...requestStatsFields(client.getRequestStats()),
  }, null, 2)}\n`);
  if (dryRun.status === 'SCHEMA_CONFLICT') {
    const path = join(outputDirectory(args), 'schema.json');
    await writeJsonArtifact(path, { run_id: runId(args), dry_run: dryRun, ...dryRun });
    return 1;
  }
  if (args.dry_run) return 0;
  const result = dryRun.status === 'SCHEMA_PATCH_REQUIRED'
    ? await bootstrapTargetSchema(client, config.targetBaseToken)
    : dryRun;
  const path = join(outputDirectory(args), 'schema.json');
  await writeJsonArtifact(path, { run_id: runId(args), dry_run: dryRun, ...result });
  process.stdout.write(`${JSON.stringify({
    ...result,
    ...requestStatsFields(client.getRequestStats()),
    artifact_path: path,
  }, null, 2)}\n`);
  return result.status === 'SCHEMA_CONFLICT' ? 1 : 0;
}

async function runBootstrap(args: ParsedCliArgs): Promise<number> {
  return runSchemaOnly(args);
}

async function runApply(args: ParsedCliArgs): Promise<number> {
  if (args.schema_only) {
    return runSchemaOnly(args);
  }
  const runtimeConfig = await loadRuntimeConfig(args);
  const client = new FeishuClient({ appId: runtimeConfig.appId, appSecret: runtimeConfig.appSecret });
  const preflight = await runSourceTargetPreflight(runtimeConfig, client);
  const config = preflight.config;
  const manifest = await loadRehydratedManifest(manifestPath(args), config, client);
  if (args.run_id && args.run_id !== manifest.run_id) {
    throw new Error('apply --run-id does not match manifest run_id');
  }
  const currentFingerprint = await getTargetSchemaFingerprint(client, config.targetBaseToken);
  if (args.canary) {
    const selected = selectCanaryDecisions(manifest);
    const decision_counts = selected.reduce<Record<string, number>>((counts, decision) => {
      counts[decision.decision] = (counts[decision.decision] ?? 0) + 1;
      return counts;
    }, {});
    const canaryDryRun = {
      phase: 'CANARY_DRY_RUN',
      run_id: manifest.run_id,
      selected_count: selected.length,
      decision_counts,
      target_tables: [...new Set(selected.map((decision) => targetTableName(decision)))].sort(),
      write_candidates: selected.filter((decision) =>
        decision.decision === 'CREATE' || decision.decision === 'UPDATE',
      ).length,
      non_write_review_or_skip: selected.filter((decision) =>
        decision.decision === 'NEEDS_REVIEW' || decision.decision === 'SKIP',
      ).length,
    };
    const dryRunPath = join(outputDirectory(args), 'canary-dry-run.json');
    await writeJsonArtifact(dryRunPath, canaryDryRun);
    process.stdout.write(`${JSON.stringify({
      ...canaryDryRun,
      artifact_path: dryRunPath,
      ...requestStatsFields(client.getRequestStats()),
    }, null, 2)}\n`);
    if (args.dry_run) return 0;
  }
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
  process.stdout.write(`${JSON.stringify({
    ...redacted,
    ...requestStatsFields(client.getRequestStats()),
  }, null, 2)}\n`);
  return result.status === 'PASS' ? 0 : 1;
}

async function runVerify(args: ParsedCliArgs): Promise<number> {
  const runtimeConfig = await loadRuntimeConfig(args);
  const client = new FeishuClient({ appId: runtimeConfig.appId, appSecret: runtimeConfig.appSecret });
  const preflight = await runSourceTargetPreflight(runtimeConfig, client);
  const config = preflight.config;
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
  process.stdout.write(`${JSON.stringify({
    ...redacted,
    ...requestStatsFields(client.getRequestStats()),
  }, null, 2)}\n`);
  return result.status === 'PASS' ? 0 : 1;
}

export async function runCli(args: string[] = process.argv.slice(2)): Promise<number> {
  const parsed = parseCliArgs(args);
  if (parsed.command === 'help') {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  if (parsed.command === 'inventory') return runInventory(parsed);
  if (parsed.command === 'plan') return runPlan(parsed);
  if (parsed.command === 'bootstrap') return runBootstrap(parsed);
  if (parsed.command === 'apply') return runApply(parsed);
  if (parsed.command === 'config') return runConfigDiagnostics(parsed);
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
