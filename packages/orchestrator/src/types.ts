import type {
  GoldenPathInput,
  CandidateBuilder,
  GovernanceFn,
} from '@busos/golden-path';
import type { LeadCandidateV1, GovernanceResultV1 } from '@busos/contracts';
import type { BusinessRepository } from '@busos/business-repository';
import type { LumenPort } from '@busos/lumen-adapter';

/** The three composed vertical slices, in pipeline order. */
export type ProcessStage =
  | 'GOLDEN_PATH'
  | 'PROJECT_LIFECYCLE'
  | 'CREATIVE_PRODUCTION';

export type ProcessStatus = 'SUCCESS' | 'BLOCKED' | 'FAILED';

/**
 * Dependency-injected collaborators. A single shared `BusinessRepository`
 * satisfies the GoldenPath / ProjectLifecycle / CreativeProduction repository
 * ports (duck-typed), and a single `LumenPort` drives creative generation.
 */
export interface OrchestratorDeps {
  businessRepository: BusinessRepository;
  lumen: LumenPort;
  /** Override candidate builder (defaults to `buildCandidateFromInput`). */
  candidateBuilder?: CandidateBuilder;
  /** Override governance (defaults to `govern`). */
  governance?: GovernanceFn;
}

/** End-to-end business-process input. */
export interface OrchestratorInput {
  goldenPath: GoldenPathInput;
  projectType: string;
  projectTitle: string;
  /** Explicit YYYY-MM-DD or omitted (BL-006: never coerced). */
  scheduledDate?: string;
  creativeTitle?: string;
  prompt: string;
  sourceImageBase64: string;
  sourceImageMimeType: string;
}

export interface ProcessStageEvent {
  stage: ProcessStage;
  /** 'OK' = ran and business outcome succeeded; 'FAILED' = threw or business FAILED/BLOCKED. */
  status: 'OK' | 'FAILED';
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
  detail?: string;
}

export interface ProcessTrace {
  stages: ProcessStageEvent[];
  startedAtMs: number;
  endedAtMs: number;
}

export interface ProcessResult {
  status: ProcessStatus;
  /** Stage at which processing stopped (null on full success). */
  failedStage: ProcessStage | null;
  leadId?: string;
  customerId?: string;
  projectId?: string;
  taskId?: string;
  assetId?: string;
  assetUri?: string;
  trace: ProcessTrace;
  reason?: string;
}
