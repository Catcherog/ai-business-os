import {
  isBusinessCommitSuccess,
  type Lead,
  type Customer,
  type Project,
  type Task,
} from '@busos/contracts';
import type {
  ConvertLeadToProjectInput,
  ConvertLeadToProjectResult,
  LifecycleWrites,
  LifecycleCompensation,
  ProjectLifecycleDeps,
  ProjectLifecycleRepository,
} from './types.js';
import { checkConversionEligibility } from './eligibility.js';
import { resolveScheduledDate } from './scheduled-date.js';

/**
 * Deterministic generic init task used when the caller supplies no explicit
 * initial task (task §5). No LLM is involved.
 */
const DEFAULT_INITIAL_TASK = {
  task_type: 'PROJECT_SETUP',
  title: 'Project setup',
} as const;

function zeroWrites(): LifecycleWrites {
  return { project: 0, task: 0, leadUpdate: 0 };
}

function emptyCompensation(): LifecycleCompensation {
  return { deletedProject: false, deletedTask: false };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Best-effort compensation: delete a record by its exact Feishu record id. */
async function safeDeleteProject(
  repo: ProjectLifecycleRepository,
  recordId: string | null,
  comp: LifecycleCompensation,
): Promise<void> {
  if (!recordId) return;
  try {
    const ok = await repo.deleteProject(recordId);
    comp.deletedProject = comp.deletedProject || ok;
  } catch {
    /* compensation is best-effort; never mask the original failure */
  }
}

async function safeDeleteTask(
  repo: ProjectLifecycleRepository,
  recordId: string | null,
  comp: LifecycleCompensation,
): Promise<void> {
  if (!recordId) return;
  try {
    const ok = await repo.deleteTask(recordId);
    comp.deletedTask = comp.deletedTask || ok;
  } catch {
    /* best-effort */
  }
}

/**
 * BUSOS-P4-01 — Project Lifecycle vertical slice.
 *
 * `convertLeadToProject` converts an eligible Lead into a Project + initial
 * Task, then marks the Lead CONVERTED — with readback verification (D019) at
 * every step and minimal compensation (no transaction/saga framework, per
 * task §8) when an intermediate write/readback fails.
 *
 * Write order (task §7):
 *   1. getLead            2. getCustomer       3. validate eligibility
 *   4. create Project -> readback VERIFIED
 *   5. create Initial Task -> readback VERIFIED
 *   6. update Lead.status -> CONVERTED -> readback VERIFIED
 *   7. LIFECYCLE_SUCCESS
 *
 * The orchestration depends only on the canonical repository port — it never
 * imports Feishu tokens, table ids, field names, or SDK types (D017/D018).
 */
export async function convertLeadToProject(
  input: ConvertLeadToProjectInput,
  deps: ProjectLifecycleDeps,
): Promise<ConvertLeadToProjectResult> {
  const repo = deps.businessRepository;
  const writes = zeroWrites();
  const compensation = emptyCompensation();
  const result: ConvertLeadToProjectResult = {
    status: 'BLOCKED',
    leadId: input.lead_id,
    writes,
    compensation,
  };

  // 1) getLead
  let lead: Lead | null;
  try {
    lead = await repo.getLead(input.lead_id);
  } catch (e) {
    result.status = 'BLOCKED';
    result.reason = `LEAD_LOOKUP_FAILED:${errMsg(e)}`;
    return result;
  }
  if (!lead) {
    result.status = 'BLOCKED';
    result.reason = 'LEAD_NOT_FOUND';
    return result;
  }

  // 2) getCustomer (only when a customer is referenced)
  let customer: Customer | null = null;
  if (lead.customer_id != null) {
    try {
      customer = await repo.getCustomer(lead.customer_id);
    } catch (e) {
      result.status = 'BLOCKED';
      result.reason = `CUSTOMER_LOOKUP_FAILED:${errMsg(e)}`;
      return result;
    }
  }

  // 3) validate conversion eligibility — fail closed, ZERO writes
  const elig = checkConversionEligibility(lead, customer);
  if (elig.kind !== 'ALLOWED') {
    const reason =
      elig.kind === 'ANONYMOUS'
        ? 'CUSTOMER_REQUIRED'
        : elig.kind === 'DANGLING_CUSTOMER'
          ? 'DANGLING_CUSTOMER'
          : elig.kind === 'ALREADY_CONVERTED'
            ? 'ALREADY_CONVERTED'
            : 'LEAD_LOST';
    result.status = 'BLOCKED';
    result.reason = reason;
    return result;
  }

  // BL-006 scheduled_date resolution
  const sd = resolveScheduledDate(input.scheduled_date);
  if (!sd.ok) {
    result.status = 'BLOCKED';
    result.reason = 'SCHEDULED_DATE_NOT_EXPLICIT';
    return result;
  }

  // 4) create Project (status DRAFT, never IN_PROGRESS — task §7)
  let projOut;
  try {
    projOut = await repo.createProject({
      customer_id: lead.customer_id!,
      lead_id: lead.lead_id,
      project_type: input.project_type,
      title: input.title,
      status: 'DRAFT',
      scheduled_date: sd.value,
    });
  } catch (e) {
    result.status = 'FAILED';
    result.reason = `PROJECT_WRITE_FAILED:${errMsg(e)}`;
    return result;
  }
  writes.project += 1;
  if (!isBusinessCommitSuccess(projOut.commit)) {
    // Project write/readback failed -> delete the created Project by exact id.
    await safeDeleteProject(repo, projOut.commit.external_record_id, compensation);
    result.status = 'FAILED';
    result.reason = 'PROJECT_WRITE_FAILED';
    result.project = projOut.project;
    result.projectCommit = projOut.commit;
    return result;
  }
  const project: Project = projOut.project;
  const projectRecordId = projOut.commit.external_record_id;

  // 5) create Initial Task
  const init = input.initial_task ?? {
    task_type: DEFAULT_INITIAL_TASK.task_type,
    title: DEFAULT_INITIAL_TASK.title,
    due_date: null,
  };
  let taskOut;
  try {
    taskOut = await repo.createTask({
      project_id: project.project_id,
      task_type: init.task_type,
      title: init.title,
      status: 'TODO',
      due_date: init.due_date ?? null,
    });
  } catch (e) {
    await safeDeleteProject(repo, projectRecordId, compensation);
    result.status = 'FAILED';
    result.reason = `TASK_WRITE_FAILED:${errMsg(e)}`;
    result.project = project;
    result.projectCommit = projOut.commit;
    return result;
  }
  writes.task += 1;
  if (!isBusinessCommitSuccess(taskOut.commit)) {
    // Task create/readback failed -> delete the Project created this invocation.
    await safeDeleteTask(repo, taskOut.commit.external_record_id, compensation);
    await safeDeleteProject(repo, projectRecordId, compensation);
    result.status = 'FAILED';
    result.reason = 'TASK_WRITE_FAILED';
    result.project = project;
    result.projectCommit = projOut.commit;
    result.task = taskOut.task;
    result.taskCommit = taskOut.commit;
    return result;
  }
  const task: Task = taskOut.task;
  const taskRecordId = taskOut.commit.external_record_id;

  // 6) update Lead.status -> CONVERTED -> readback VERIFIED
  let leadUpd;
  try {
    leadUpd = await repo.updateLeadStatus(lead.lead_id, 'CONVERTED');
  } catch (e) {
    // Lead CONVERTED update/readback failed -> delete Task + Project.
    await safeDeleteTask(repo, taskRecordId, compensation);
    await safeDeleteProject(repo, projectRecordId, compensation);
    result.status = 'FAILED';
    result.reason = `LEAD_CONVERTED_UPDATE_FAILED:${errMsg(e)}`;
    result.project = project;
    result.projectCommit = projOut.commit;
    result.task = task;
    result.taskCommit = taskOut.commit;
    return result;
  }
  writes.leadUpdate += 1;
  if (!isBusinessCommitSuccess(leadUpd.commit) || leadUpd.lead.status !== 'CONVERTED') {
    // Lead CONVERTED update/readback failed -> delete Task + Project.
    // Lead must NOT be reported CONVERTED.
    await safeDeleteTask(repo, taskRecordId, compensation);
    await safeDeleteProject(repo, projectRecordId, compensation);
    result.status = 'FAILED';
    result.reason = 'LEAD_CONVERTED_UPDATE_FAILED';
    result.project = project;
    result.projectCommit = projOut.commit;
    result.task = task;
    result.taskCommit = taskOut.commit;
    result.leadReadback = leadUpd.lead;
    result.leadCommit = leadUpd.commit;
    return result;
  }

  // 7) LIFECYCLE_SUCCESS
  result.status = 'LIFECYCLE_SUCCESS';
  result.project = project;
  result.projectCommit = projOut.commit;
  result.task = task;
  result.taskCommit = taskOut.commit;
  result.leadReadback = leadUpd.lead;
  result.leadCommit = leadUpd.commit;
  return result;
}
