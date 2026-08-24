import type {
  LumenWorkflowInput,
  LumenWorkflowRunResult,
  LumenWorkflowPort,
} from './workflow-types.js';

/**
 * In-memory Lumen/RunningHub adapter for development + unit tests (explicitly
 * Fake, §6). It proves the LumenWorkflowPort contract and error handling
 * WITHOUT any RunningHub network/secret. It MUST NEVER be reported as a real
 * RunningHub execution — the real path (`RunningHubLumenAdapter`) requires a
 * configured `RUNNINGHUB_API_KEY` + `RUNNINGHUB_CONFIG_JSON`, which is BLOCKED
 * here (owner-gated) due to missing credentials/workflows.
 */
export interface FakeRunningHubAdapterOptions {
  /** Force a FAILED result (simulates a provider/network failure). */
  failRun?: boolean;
  /** Stable error code reported on injected failure. */
  errorCode?: string;
  /** MIME type advertised for generated assets. */
  mimeType?: string;
}

export class FakeRunningHubAdapter implements LumenWorkflowPort {
  private readonly opts: FakeRunningHubAdapterOptions;
  /** Number of `runWorkflow` calls — proves invocation wiring. */
  runCount = 0;
  /** Last input received — asserted by tests. */
  lastInput: LumenWorkflowInput | null = null;

  constructor(opts: FakeRunningHubAdapterOptions = {}) {
    this.opts = opts;
  }

  async runWorkflow(input: LumenWorkflowInput): Promise<LumenWorkflowRunResult> {
    this.runCount += 1;
    this.lastInput = input;
    if (this.opts.failRun) {
      return {
        status: 'FAILED',
        workflowType: input.workflowType,
        outputImages: [],
        provider: 'RUNNINGHUB',
        errorCode: this.opts.errorCode ?? 'DEMO_RUN_FAILED',
        errorMessage: 'injected DEMO RunningHub failure (not a real provider call)',
      };
    }
    const id = `lumen_demo_${Math.random().toString(36).slice(2, 10)}`;
    return {
      status: 'SUCCEEDED',
      workflowType: input.workflowType,
      outputImages: [
        { url: `lumen-demo://runninghub/${id}/out.png`, mimeType: this.opts.mimeType ?? 'image/png' },
      ],
      provider: 'RUNNINGHUB',
      runId: id,
      durationMs: 120,
    };
  }
}

export function createFakeRunningHubAdapter(opts: FakeRunningHubAdapterOptions = {}): LumenWorkflowPort {
  return new FakeRunningHubAdapter(opts);
}
