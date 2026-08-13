import {
  isBusinessCommitSuccess,
  type Project,
  type Task,
  type Asset,
} from '@busos/contracts';
import type {
  CreativeProductionInput,
  CreativeProductionResult,
  CreativeProductionWrites,
  CreativeProductionCompensation,
  CreativeProductionDeps,
  CreativeProductionRepository,
} from './types.js';
import { checkCreativeEligibility } from './eligibility.js';

/**
 * BUSOS-P5-01 — Creative Production vertical slice.
 *
 * `executeCreativeProduction` drives the bounded path
 *   Project -> Creative Task (TODO) -> Lumen generate -> Asset (IMAGE/LUMEN)
 *   -> Task DONE, with readback verification (D019) at every step and minimal
 * compensation (no transaction/saga framework, per task §8) when an
 * intermediate write/readback fails.
 *
 * Write order (task §7):
 *   1. getProject          2. validate eligibility
 *   3. create Task (TODO) -> readback VERIFIED
 *   4. Lumen.generate     5. create Asset (IMAGE/LUMEN) -> readback VERIFIED
 *   6. update Task.status -> DONE -> readback VERIFIED
 *   7. CREATIVE_SUCCESS
 *
 * The orchestration depends only on the canonical repository port and the
 * LumenPort — it never imports Feishu tokens, table ids, field names, Lumen
 * HTTP paths, or the provider key (D017/D018).
 */
const CREATIVE_TASK_TYPE = 'CREATIVE_GENERATION';

function zeroWrites(): CreativeProductionWrites {
  return { task: 0, asset: 0, taskStatusUpdate: 0 };
}

function emptyCompensation(): CreativeProductionCompensation {
  return { deletedTask: false, deletedAsset: false };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Best-effort compensation: delete a record by its exact external record id. */
async function safeDeleteTask(
  repo: CreativeProductionRepository,
  recordId: string | null,
  comp: CreativeProductionCompensation,
): Promise<void> {
  if (!recordId) return;
  try {
    const ok = await repo.deleteTask(recordId);
    comp.deletedTask = comp.deletedTask || ok;
  } catch {
    /* compensation is best-effort; never mask the original failure */
  }
}

async function safeDeleteAsset(
  repo: CreativeProductionRepository,
  recordId: string | null,
  comp: CreativeProductionCompensation,
): Promise<void> {
  if (!recordId) return;
  try {
    const ok = await repo.deleteAsset(recordId);
    comp.deletedAsset = comp.deletedAsset || ok;
  } catch {
    /* best-effort */
  }
}

export async function executeCreativeProduction(
  input: CreativeProductionInput,
  deps: CreativeProductionDeps,
): Promise<CreativeProductionResult> {
  const repo = deps.businessRepository;
  const writes = zeroWrites();
  const compensation = emptyCompensation();
  const result: CreativeProductionResult = {
    status: 'BLOCKED',
    projectId: input.project_id,
    writes,
    compensation,
  };

  // 1) getProject
  let project: Project | null;
  try {
    project = await repo.getProject(input.project_id);
  } catch (e) {
    result.status = 'BLOCKED';
    result.reason = `PROJECT_LOOKUP_FAILED:${errMsg(e)}`;
    return result;
  }

  // 2) validate creative eligibility — fail closed, ZERO writes
  const elig = checkCreativeEligibility(project, input.prompt, input.source_image_base64);
  if (elig.kind !== 'ALLOWED') {
    result.status = 'BLOCKED';
    result.reason = elig.reason;
    return result;
  }
  // ALLOWED guarantees project != null; capture a non-null local.
  const proj: Project = project as Project;

  // 3) create Creative Task (TODO) -> readback VERIFIED
  let taskOut;
  try {
    taskOut = await repo.createTask({
      project_id: proj.project_id,
      task_type: CREATIVE_TASK_TYPE,
      title: input.title ?? 'Creative generation',
      status: 'TODO',
      due_date: null,
    });
  } catch (e) {
    result.status = 'FAILED';
    result.reason = `TASK_WRITE_FAILED:${errMsg(e)}`;
    return result;
  }
  writes.task += 1;
  if (!isBusinessCommitSuccess(taskOut.commit)) {
    // Task write/readback failed -> delete the created Task by exact id.
    await safeDeleteTask(repo, taskOut.commit.external_record_id, compensation);
    result.status = 'FAILED';
    result.reason = 'TASK_WRITE_FAILED';
    result.task = taskOut.task;
    result.taskCommit = taskOut.commit;
    return result;
  }
  const task: Task = taskOut.task;
  const taskRecordId = taskOut.commit.external_record_id;

  // 4) Lumen generate (no Feishu/Lumen secret crosses this boundary)
  const gen = await deps.lumen.generate({
    prompt: input.prompt,
    project_name: input.title ?? `Creative ${proj.project_id}`,
    source_image_base64: input.source_image_base64,
    source_image_mime_type: input.source_image_mime_type,
  });
  if (gen.status === 'FAILED') {
    // Generation failed -> delete the Task created this invocation.
    await safeDeleteTask(repo, taskRecordId, compensation);
    result.status = 'FAILED';
    result.reason = `LUMEN_GENERATION_FAILED:${gen.error_code ?? 'UNKNOWN'}`;
    result.task = task;
    result.taskCommit = taskOut.commit;
    return result;
  }
  if (!gen.asset_uri || gen.asset_uri.length === 0) {
    await safeDeleteTask(repo, taskRecordId, compensation);
    result.status = 'FAILED';
    result.reason = 'LUMEN_GENERATION_FAILED:EMPTY_ASSET_URI';
    result.task = task;
    result.taskCommit = taskOut.commit;
    return result;
  }

  // 5) create Asset (IMAGE / LUMEN) -> readback VERIFIED
  let assetOut;
  try {
    assetOut = await repo.createAsset({
      project_id: proj.project_id,
      task_id: task.task_id,
      asset_type: 'IMAGE',
      source: 'LUMEN',
      asset_uri: gen.asset_uri,
      mime_type: gen.mime_type ?? null,
    });
  } catch (e) {
    // Asset create threw -> delete the Task created this invocation.
    await safeDeleteTask(repo, taskRecordId, compensation);
    result.status = 'FAILED';
    result.reason = `ASSET_WRITE_FAILED:${errMsg(e)}`;
    result.task = task;
    result.taskCommit = taskOut.commit;
    return result;
  }
  writes.asset += 1;
  if (!isBusinessCommitSuccess(assetOut.commit)) {
    // Asset write/readback failed -> delete the (possibly written) asset + task.
    await safeDeleteAsset(repo, assetOut.commit.external_record_id, compensation);
    await safeDeleteTask(repo, taskRecordId, compensation);
    result.status = 'FAILED';
    result.reason = 'ASSET_WRITE_FAILED';
    result.task = task;
    result.taskCommit = taskOut.commit;
    result.asset = assetOut.asset;
    result.assetCommit = assetOut.commit;
    return result;
  }
  const asset: Asset = assetOut.asset;
  const assetRecordId = assetOut.commit.external_record_id;

  // 6) update Task.status -> DONE -> readback VERIFIED
  let taskUpd;
  try {
    taskUpd = await repo.updateTaskStatus(task.task_id, 'DONE');
  } catch (e) {
    // Task DONE update/readback failed -> delete Asset + Task.
    await safeDeleteAsset(repo, assetRecordId, compensation);
    await safeDeleteTask(repo, taskRecordId, compensation);
    result.status = 'FAILED';
    result.reason = `TASK_DONE_UPDATE_FAILED:${errMsg(e)}`;
    result.task = task;
    result.taskCommit = taskOut.commit;
    result.asset = asset;
    result.assetCommit = assetOut.commit;
    return result;
  }
  writes.taskStatusUpdate += 1;
  if (!isBusinessCommitSuccess(taskUpd.commit) || taskUpd.task.status !== 'DONE') {
    // Task DONE update/readback failed -> delete Asset + Task.
    await safeDeleteAsset(repo, assetRecordId, compensation);
    await safeDeleteTask(repo, taskRecordId, compensation);
    result.status = 'FAILED';
    result.reason = 'TASK_DONE_UPDATE_FAILED';
    result.task = task;
    result.taskCommit = taskOut.commit;
    result.asset = asset;
    result.assetCommit = assetOut.commit;
    return result;
  }

  // 7) CREATIVE_SUCCESS
  result.status = 'CREATIVE_SUCCESS';
  result.task = taskUpd.task;
  result.taskCommit = taskUpd.commit;
  result.asset = asset;
  result.assetCommit = assetOut.commit;
  return result;
}
