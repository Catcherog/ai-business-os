import type {
  Project,
  Task,
  Asset,
  CommitResultV1,
  TaskStatus,
} from '@busos/contracts';
// TaskCreateInput / AssetCreateInput are repository DTOs owned by
// @busos/business-repository (not the frozen contract package). The
// application layer depends on them only through the repository port.
import type { TaskCreateInput, AssetCreateInput } from '@busos/business-repository';
import type { LumenPort } from '@busos/lumen-adapter';
import type { MemoryContextSummary } from '@busos/memory';

/**
 * Repository surface the creative-production orchestration depends on.
 *
 * Duck-typed: satisfied by `BusinessRepository` (P5-B2) and by the test-side
 * `CountingBusinessRepository`. The application layer never sees Feishu
 * specifics (D017/D018): only these canonical operations are used.
 */
export interface CreativeProductionRepository {
  getProject(projectId: string): Promise<Project | null>;
  createTask(input: TaskCreateInput): Promise<{ task: Task; commit: CommitResultV1 }>;
  getTask(taskId: string): Promise<Task | null>;
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<{ task: Task; commit: CommitResultV1 }>;
  createAsset(input: AssetCreateInput): Promise<{ asset: Asset; commit: CommitResultV1 }>;
  getAsset(assetId: string): Promise<Asset | null>;
  /** Test-hygiene / partial-failure compensation only. */
  deleteTask(recordId: string): Promise<boolean>;
  deleteAsset(recordId: string): Promise<boolean>;
}

/** Final outcome status of a creative-production run. */
export type CreativeStatus = 'CREATIVE_SUCCESS' | 'BLOCKED' | 'FAILED';

/** Repository write counters, used by tests to prove "writes = 0" / counts. */
export interface CreativeProductionWrites {
  task: number;
  asset: number;
  taskStatusUpdate: number;
}

export interface CreativeProductionInput {
  project_id: string;
  /** The editing instruction sent to Lumen. Non-empty (BLOCKED otherwise). */
  prompt: string;
  /** Exactly one source image, base64 (P5 §16). */
  source_image_base64: string;
  source_image_mime_type: string;
  /** Optional human-readable title for the creative task. */
  title?: string;
  /**
   * H2-02 — the governed memory context summary handed down by the orchestrator.
   * Carried ONLY as auditable metadata; it is NEVER concatenated into `prompt`
   * (the user action input). Lumen receives `prompt` untouched.
   */
  governedMemoryContext?: MemoryContextSummary;
}

/** Pre-flight rejection reasons (fail closed, zero writes). */
export type BlockedReason =
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_CANCELLED'
  | 'PROJECT_DELIVERED'
  | 'PROMPT_EMPTY'
  | 'SOURCE_IMAGE_EMPTY';

/** Mid-flight partial-failure reasons (some writes already attempted). */
export type FailedReason =
  | 'TASK_WRITE_FAILED'
  | 'LUMEN_GENERATION_FAILED'
  | 'ASSET_WRITE_FAILED'
  | 'TASK_DONE_UPDATE_FAILED';

export interface CreativeProductionCompensation {
  deletedTask: boolean;
  deletedAsset: boolean;
}

export interface CreativeProductionResult {
  status: CreativeStatus;
  /**
   * One of the documented `BlockedReason` / `FailedReason` values, possibly
   * suffixed with `:<detail>` for lookup/transport errors (e.g.
   * `PROJECT_LOOKUP_FAILED:...`). Tests assert the documented prefix.
   */
  reason?: string;
  projectId: string;
  writes: CreativeProductionWrites;
  task?: Task | null;
  taskCommit?: CommitResultV1;
  asset?: Asset | null;
  assetCommit?: CommitResultV1;
  /** Exact-record-id cleanup performed during partial failure (P5-E). */
  compensation: CreativeProductionCompensation;
  /**
   * H2-02 — the governed memory context summary that was supplied to this run,
   * echoed back for observability (UI / trace). Never the raw memory content.
   */
  governedContext?: MemoryContextSummary;
}

export interface CreativeProductionDeps {
  businessRepository: CreativeProductionRepository;
  lumen: LumenPort;
}
