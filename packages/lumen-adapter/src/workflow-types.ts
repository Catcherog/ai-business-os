/**
 * Lumen Workflow layer — capability templates over a workflow engine (RunningHub).
 *
 * The application / UI layer depends ONLY on these types + `LumenWorkflowPort`.
 * It never sees RunningHub endpoints, auth, or node-graph details (§19). All
 * RunningHub specifics live behind `RunningHubLumenAdapter` (server-only).
 */

export type LumenWorkflowType =
  | 'PRODUCT_SHOT'
  | 'BACKGROUND_SWAP'
  | 'LOCAL_RETOUCH'
  | 'STYLE_VARIATION'
  | 'OUTPAINT';

export interface LumenWorkflowInput {
  workflowType: LumenWorkflowType;
  /** Source image as a data URL (`data:<mime>;base64,...`) or raw base64. */
  sourceImageBase64: string;
  sourceImageMimeType: string;
  prompt: string;
  /** Capability-specific parameters (scene / style / retouch target / ...). */
  params: Record<string, string>;
}

export interface LumenWorkflowOutputImage {
  url: string;
  mimeType?: string | null;
}

export interface LumenWorkflowRunResult {
  status: 'SUCCEEDED' | 'FAILED';
  workflowType: LumenWorkflowType;
  outputImages: LumenWorkflowOutputImage[];
  /** Always 'RUNNINGHUB' — the engine behind Lumen (never leaked to the UI naming). */
  provider: 'RUNNINGHUB';
  runId?: string;
  workflowId?: string;
  errorCode?: string;
  errorMessage?: string;
  durationMs?: number;
}

export interface LumenWorkflowPort {
  runWorkflow(input: LumenWorkflowInput): Promise<LumenWorkflowRunResult>;
}

/** RunningHub node input slot — which node + field receives a given value. */
export interface RunningHubNodeSlot {
  nodeId: string;
  fieldName: string;
}

export interface RunningHubNodeInfo {
  nodeId: string;
  fieldName: string;
  fieldValue: string;
}

/** Per-workflow RunningHub wiring (server-only config, never shipped to browser). */
export interface RunningHubWorkflowConfig {
  workflowId: string;
  imageNode: RunningHubNodeSlot;
  promptNode?: RunningHubNodeSlot;
  paramNodes?: Record<string, RunningHubNodeSlot>;
  fixedNodes?: RunningHubNodeInfo[];
}

export interface RunningHubAdapterConfig {
  /** RunningHub API key (server-only secret). */
  apiKey: string;
  /** RunningHub API host. Default https://www.runninghub.cn */
  apiBaseUrl?: string;
  workflows: Partial<Record<LumenWorkflowType, RunningHubWorkflowConfig>>;
  fetchImpl?: typeof fetch;
  poll?: { maxAttempts?: number; intervalMs?: number; timeoutMs?: number };
}
