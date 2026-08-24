/**
 * RunningHubLumenAdapter — Lumen's workflow-engine backend (BUSOS-R2-BATCH2C).
 *
 * Verified RunningHub Workflow API contract (official docs, 2026-08):
 *   POST /task/openapi/upload   multipart {file, fileType:image, apiKey}
 *                                    -> {code, data:{fileName}}  (fileName = node ref)
 *   POST /task/openapi/create    JSON {apiKey, workflowId, nodeInfoList:[{nodeId,fieldName,fieldValue}]}
 *                                    -> {code, data:{taskId, taskStatus}}
 *   POST /task/openapi/outputs   JSON {apiKey, taskId}
 *                                    -> {code, data:[{fileType, fileUrl}]}
 *                                       codes: 0 success, 804 running, 813 queued, 805 failed
 *
 * Flow: upload source image -> map capability to nodeInfoList -> create task
 * -> poll outputs (bounded) -> normalize to `LumenWorkflowRunResult`.
 *
 * Server-only: the API key is injected via config and is NEVER placed in a
 * result message or returned to the client (§19). Failures are normalized into
 * the result object so callers never throw on a provider/network error.
 */
import type {
  LumenWorkflowInput,
  LumenWorkflowRunResult,
  LumenWorkflowPort,
  LumenWorkflowType,
  RunningHubAdapterConfig,
  RunningHubNodeInfo,
  RunningHubWorkflowConfig,
} from './workflow-types.js';

const DEFAULT_BASE_URL = 'https://www.runninghub.cn';
const POLL_CODE_SUCCESS = 0;
const POLL_CODE_RUNNING = 804;
const POLL_CODE_QUEUED = 813;
const POLL_CODE_FAILED = 805;

function decodeBase64ToBytes(s: string): Uint8Array {
  const raw = s.includes(',') ? s.slice(s.indexOf(',') + 1) : s;
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return new Uint8Array(Buffer.from(raw, 'base64'));
  }
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class RunningHubLumenAdapter implements LumenWorkflowPort {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly workflows: RunningHubAdapterConfig['workflows'];
  private readonly fetchImpl: typeof fetch;
  private readonly maxAttempts: number;
  private readonly intervalMs: number;
  private readonly timeoutMs: number;

  constructor(config: RunningHubAdapterConfig) {
    if (!config.apiKey) throw new Error('RunningHubLumenAdapter requires apiKey');
    this.apiKey = config.apiKey;
    this.baseUrl = (config.apiBaseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.workflows = config.workflows;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    this.maxAttempts = config.poll?.maxAttempts ?? 90;
    this.intervalMs = config.poll?.intervalMs ?? 3000;
    this.timeoutMs = config.poll?.timeoutMs ?? 300_000;
  }

  async runWorkflow(input: LumenWorkflowInput): Promise<LumenWorkflowRunResult> {
    const started = Date.now();
    const workflow = this.workflows[input.workflowType];
    if (!workflow || !workflow.workflowId) {
      return this.fail(
        input.workflowType,
        'WORKFLOW_NOT_CONFIGURED',
        `RunningHub workflow for ${input.workflowType} is not configured`,
        undefined,
      );
    }

    // 1) Upload source image -> fileName (referenced by the image input node).
    let fileName: string;
    try {
      fileName = await this.uploadImage(input);
    } catch (e) {
      return this.fail(input.workflowType, 'IMAGE_UPLOAD_FAILED', errMsg(e), undefined);
    }

    // 2) Map capability -> nodeInfoList, then create the task.
    let taskId: string | undefined;
    try {
      const nodeInfoList = this.buildNodeInfoList(workflow, fileName, input);
      taskId = await this.createTask(workflow.workflowId, nodeInfoList);
    } catch (e) {
      return this.fail(input.workflowType, 'TASK_CREATE_FAILED', errMsg(e), taskId);
    }

    // 3) Poll outputs until terminal (bounded, never infinite).
    try {
      const outputs = await this.pollOutputs(taskId);
      return {
        status: 'SUCCEEDED',
        workflowType: input.workflowType,
        outputImages: outputs.map((o) => ({ url: o.fileUrl, mimeType: o.fileType ?? null })),
        provider: 'RUNNINGHUB',
        runId: taskId,
        workflowId: workflow.workflowId,
        durationMs: Date.now() - started,
      };
    } catch (e) {
      return this.fail(input.workflowType, 'TASK_POLL_FAILED', errMsg(e), taskId);
    }
  }

  private async uploadImage(input: LumenWorkflowInput): Promise<string> {
    const bytes = decodeBase64ToBytes(input.sourceImageBase64);
    const fd = new FormData();
    fd.append('file', new Blob([bytes], { type: input.sourceImageMimeType || 'application/octet-stream' }), 'source.png');
    fd.append('fileType', 'image');
    fd.append('apiKey', this.apiKey);
    const resp = await this.fetchImpl(`${this.baseUrl}/task/openapi/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: fd as unknown as BodyInit,
    });
    const json = (await resp.json().catch(() => ({}))) as {
      code?: number;
      msg?: string;
      data?: { fileName?: string };
    };
    if (!resp.ok || json.code !== 0 || !json.data?.fileName) {
      throw new Error(`upload failed: code=${json.code ?? resp.status} msg=${json.msg ?? resp.statusText}`);
    }
    return json.data.fileName;
  }

  private buildNodeInfoList(
    wf: RunningHubWorkflowConfig,
    fileName: string,
    input: LumenWorkflowInput,
  ): RunningHubNodeInfo[] {
    const list: RunningHubNodeInfo[] = [
      { nodeId: wf.imageNode.nodeId, fieldName: wf.imageNode.fieldName, fieldValue: fileName },
    ];
    if (wf.promptNode) {
      list.push({ nodeId: wf.promptNode.nodeId, fieldName: wf.promptNode.fieldName, fieldValue: input.prompt });
    }
    if (wf.paramNodes) {
      for (const [key, slot] of Object.entries(wf.paramNodes)) {
        const v = input.params[key];
        if (v != null && v !== '') list.push({ nodeId: slot.nodeId, fieldName: slot.fieldName, fieldValue: v });
      }
    }
    if (wf.fixedNodes) list.push(...wf.fixedNodes);
    return list;
  }

  private async createTask(workflowId: string, nodeInfoList: RunningHubNodeInfo[]): Promise<string> {
    const resp = await this.fetchImpl(`${this.baseUrl}/task/openapi/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ apiKey: this.apiKey, workflowId, nodeInfoList }),
    });
    const json = (await resp.json().catch(() => ({}))) as {
      code?: number;
      msg?: string;
      data?: { taskId?: string | number; taskStatus?: string };
    };
    if (!resp.ok || json.code !== 0 || json.data?.taskId == null) {
      throw new Error(`create failed: code=${json.code ?? resp.status} msg=${json.msg ?? resp.statusText}`);
    }
    return String(json.data.taskId);
  }

  private async pollOutputs(taskId: string): Promise<{ fileUrl: string; fileType?: string }[]> {
    const deadline = Date.now() + this.timeoutMs;
    for (let i = 0; i < this.maxAttempts; i++) {
      if (Date.now() > deadline) throw new Error(`polling timed out after ${this.maxAttempts} attempts`);
      const resp = await this.fetchImpl(`${this.baseUrl}/task/openapi/outputs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ apiKey: this.apiKey, taskId }),
      });
      const json = (await resp.json().catch(() => ({}))) as {
        code?: number;
        msg?: string;
        data?:
          | { failedReason?: string }
          | Array<{ fileType?: string; fileUrl?: string; fileName?: string }>;
      };
      const code = json.code ?? (resp.ok ? 0 : -1);
      if (code === POLL_CODE_SUCCESS && Array.isArray(json.data)) {
        return (json.data as Array<{ fileType?: string; fileUrl?: string; fileName?: string }>)
          .filter((o) => o.fileUrl)
          .map((o) => ({ fileUrl: o.fileUrl as string, fileType: o.fileType }));
      }
      if (code === POLL_CODE_FAILED) {
        const reason =
          json.data && !Array.isArray(json.data) ? json.data.failedReason ?? json.msg : json.msg ?? 'FAILED';
        throw new Error(`RunningHub task failed: ${reason}`);
      }
      if (code === POLL_CODE_RUNNING || code === POLL_CODE_QUEUED) {
        await sleep(this.intervalMs);
        continue;
      }
      // Unknown non-zero code -> treat as terminal failure (bounded, no infinite loop).
      throw new Error(`unexpected poll code ${code}: ${json.msg ?? resp.statusText}`);
    }
    throw new Error(`exhausted ${this.maxAttempts} polling attempts`);
  }

  private fail(
    workflowType: LumenWorkflowType,
    code: string,
    message: string,
    runId?: string,
  ): LumenWorkflowRunResult {
    // `message` must never contain the apiKey — it is not embedded anywhere here.
    return {
      status: 'FAILED',
      workflowType,
      outputImages: [],
      provider: 'RUNNINGHUB',
      runId,
      errorCode: code,
      errorMessage: message,
    };
  }
}
