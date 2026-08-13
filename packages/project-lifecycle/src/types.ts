import type {
  Lead,
  Customer,
  Project,
  Task,
  CommitResultV1,
  LeadStatus,
} from '@busos/contracts';
// ProjectCreateInput / TaskCreateInput are the repository DTOs, owned by
// @busos/business-repository (not the frozen contract package). The
// application layer depends on them only through the repository port.
import type { ProjectCreateInput, TaskCreateInput } from '@busos/business-repository';

/**
 * Repository surface the project-lifecycle orchestration depends on.
 *
 * Duck-typed: satisfied by `BusinessRepository` (P1-03) and by the test-side
 * `CountingBusinessRepository`. The application layer never sees Feishu
 * specifics (D017/D018): only these canonical operations are used.
 */
export interface ProjectLifecycleRepository {
  getLead(leadId: string): Promise<Lead | null>;
  getCustomer(customerId: string): Promise<Customer | null>;
  updateLeadStatus(leadId: string, status: LeadStatus): Promise<{ lead: Lead; commit: CommitResultV1 }>;
  createProject(input: ProjectCreateInput): Promise<{ project: Project; commit: CommitResultV1 }>;
  getProject(projectId: string): Promise<Project | null>;
  createTask(input: TaskCreateInput): Promise<{ task: Task; commit: CommitResultV1 }>;
  getTask(taskId: string): Promise<Task | null>;
  /** Test-hygiene / partial-failure compensation only. */
  deleteProject(recordId: string): Promise<boolean>;
  deleteTask(recordId: string): Promise<boolean>;
}

/** Final outcome status of a lifecycle run. */
export type LifecycleStatus = 'LIFECYCLE_SUCCESS' | 'BLOCKED' | 'FAILED';

/** Repository write counters, used by tests to prove "writes = 0" / counts. */
export interface LifecycleWrites {
  project: number;
  task: number;
  leadUpdate: number;
}

export interface InitialTaskInput {
  task_type: string;
  title: string;
  /** Optional explicit due date (YYYY-MM-DD). Relative text is not accepted. */
  due_date?: string | null;
}

export interface ConvertLeadToProjectInput {
  lead_id: string;
  project_type: string;
  title: string;
  /**
   * Optional explicit confirmed date (YYYY-MM-DD). Relative-only expressions
   * must be passed as `null` (BL-006). Any non-explicit string is rejected.
   */
  scheduled_date?: string | null;
  /** Optional explicit initial task. When omitted, a deterministic generic
   *  init task is generated (PROJECT_SETUP / "Project setup" / TODO). */
  initial_task?: InitialTaskInput;
}

/** Pre-conversion rejection reasons (fail closed, zero Project/Task writes). */
export type BlockedReason =
  | 'LEAD_NOT_FOUND'
  | 'CUSTOMER_REQUIRED' // anonymous Lead (Case 2)
  | 'DANGLING_CUSTOMER' // customer_id points to a missing Customer (Case 3)
  | 'ALREADY_CONVERTED' // Lead already CONVERTED (Case 4)
  | 'LEAD_LOST' // LOST Lead (PL-D)
  | 'SCHEDULED_DATE_NOT_EXPLICIT'; // BL-006 violation

/** Mid-flight partial-failure reasons (some writes already attempted). */
export type FailedReason =
  | 'PROJECT_WRITE_FAILED'
  | 'TASK_WRITE_FAILED'
  | 'LEAD_CONVERTED_UPDATE_FAILED';

export interface LifecycleCompensation {
  deletedProject: boolean;
  deletedTask: boolean;
}

export interface ConvertLeadToProjectResult {
  status: LifecycleStatus;
  /**
   * One of the documented `BlockedReason` / `FailedReason` values, possibly
   * suffixed with `:<detail>` for lookup/transport errors (e.g.
   * `LEAD_LOOKUP_FAILED:...`). Tests assert the documented prefix.
   */
  reason?: string;
  leadId: string;
  writes: LifecycleWrites;
  project?: Project | null;
  projectCommit?: CommitResultV1;
  task?: Task | null;
  taskCommit?: CommitResultV1;
  /** Lead after the CONVERTED update + readback (only on success / lead-failure). */
  leadReadback?: Lead | null;
  leadCommit?: CommitResultV1;
  /** Exact-record-id cleanup performed during partial failure (PL-E). */
  compensation: LifecycleCompensation;
}

export interface ProjectLifecycleDeps {
  businessRepository: ProjectLifecycleRepository;
}
