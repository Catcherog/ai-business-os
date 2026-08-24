import { describe, it, expect } from 'vitest';
import {
  RunningHubLumenAdapter,
  FakeRunningHubAdapter,
  createFakeRunningHubAdapter,
  createRunningHubAdapterFromEnv,
  LUMEN_CAPABILITIES,
} from '../src/index.js';
import type {
  LumenWorkflowInput,
  RunningHubWorkflowConfig,
} from '../src/index.js';

/**
 * Validate the REAL RunningHub adapter against a stubbed HTTP transport that
 * faithfully mimics the verified RunningHub Workflow API
 * (upload -> create -> outputs, codes 0/804/813/805). This exercises the real
 * adapter's mapping WITHOUT any network or provider key.
 */
function makeRhStub(opts: { uploadCode?: number; createCode?: number; outputsCode?: number; outputsMsg?: string } = {}) {
  const calls: string[] = [];
  const json = (body: unknown, status = 200) =>
    ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

  const fetchFn: typeof fetch = async (input: any, init?: any) => {
    const url: string = typeof input === 'string' ? input : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push(`${method} ${url}`);
    if (url.endsWith('/task/openapi/upload')) {
      const code = opts.uploadCode ?? 0;
      return json({ code, data: code === 0 ? { fileName: 'f1.png' } : undefined, msg: code === 0 ? undefined : 'upload rejected' });
    }
    if (url.endsWith('/task/openapi/create')) {
      const code = opts.createCode ?? 0;
      return json({ code, data: code === 0 ? { taskId: 'task_1' } : undefined, msg: code === 0 ? undefined : 'create rejected' });
    }
    if (url.endsWith('/task/openapi/outputs')) {
      const code = opts.outputsCode ?? 0;
      if (code === 0) {
        return json({ code: 0, data: [{ fileType: 'image/png', fileUrl: 'https://rh.example/out.png' }] });
      }
      if (code === 805) {
        return json({ code: 805, msg: opts.outputsMsg ?? 'node runtime error' });
      }
      // 804/813 -> still running; caller polled too long if it loops forever,
      // so we return 804 to exercise the "exhausted" branch under a small cap.
      return json({ code: 804, data: [] });
    }
    return json({ code: -1, msg: 'unknown' }, 404);
  };
  return { fetchFn, calls };
}

const WF: RunningHubWorkflowConfig = {
  workflowId: 'wf_product',
  imageNode: { nodeId: 'img', fieldName: 'image' },
  promptNode: { nodeId: 'prompt', fieldName: 'text' },
  paramNodes: { style: { nodeId: 'style', fieldName: 'style' } },
};

const SAMPLE: LumenWorkflowInput = {
  workflowType: 'PRODUCT_SHOT',
  sourceImageBase64: 'data:image/png;base64,AAAA',
  sourceImageMimeType: 'image/png',
  prompt: 'white studio background',
  params: { style: 'realistic' },
};

describe('RunningHubLumenAdapter — real API mapping (via stub)', () => {
  it('happy path: SUCCEEDED with parsed output, RUNNINGHUB provider, runId + workflowId', async () => {
    const stub = makeRhStub();
    const adapter = new RunningHubLumenAdapter({
      apiKey: 'secret-key',
      workflows: { PRODUCT_SHOT: WF },
      fetchImpl: stub.fetchFn,
    });
    const result = await adapter.runWorkflow(SAMPLE);
    expect(result.status).toBe('SUCCEEDED');
    expect(result.outputImages).toHaveLength(1);
    expect(result.outputImages[0].url).toBe('https://rh.example/out.png');
    expect(result.outputImages[0].mimeType).toBe('image/png');
    expect(result.provider).toBe('RUNNINGHUB');
    expect(result.runId).toBe('task_1');
    expect(result.workflowId).toBe('wf_product');
    expect(typeof result.durationMs).toBe('number');
    // ordered: upload -> create -> outputs
    expect(stub.calls[0]).toContain('/task/openapi/upload');
    expect(stub.calls[1]).toContain('/task/openapi/create');
    expect(stub.calls[2]).toContain('/task/openapi/outputs');
  });

  it('upload failure -> FAILED (IMAGE_UPLOAD_FAILED), apiKey never in message', async () => {
    const stub = makeRhStub({ uploadCode: 1 });
    const adapter = new RunningHubLumenAdapter({
      apiKey: 'super-secret',
      workflows: { PRODUCT_SHOT: WF },
      fetchImpl: stub.fetchFn,
    });
    const result = await adapter.runWorkflow(SAMPLE);
    expect(result.status).toBe('FAILED');
    expect(result.errorCode).toBe('IMAGE_UPLOAD_FAILED');
    expect(result.outputImages).toHaveLength(0);
    expect(result.errorMessage).not.toContain('super-secret');
  });

  it('create failure -> FAILED (TASK_CREATE_FAILED)', async () => {
    const stub = makeRhStub({ createCode: 1 });
    const adapter = new RunningHubLumenAdapter({
      apiKey: 'super-secret',
      workflows: { PRODUCT_SHOT: WF },
      fetchImpl: stub.fetchFn,
    });
    const result = await adapter.runWorkflow(SAMPLE);
    expect(result.status).toBe('FAILED');
    expect(result.errorCode).toBe('TASK_CREATE_FAILED');
    expect(result.errorMessage).not.toContain('super-secret');
  });

  it('RunningHub task failure (805) -> FAILED (TASK_POLL_FAILED) with reason', async () => {
    const stub = makeRhStub({ outputsCode: 805, outputsMsg: 'ComfyUI node crashed' });
    const adapter = new RunningHubLumenAdapter({
      apiKey: 'super-secret',
      workflows: { PRODUCT_SHOT: WF },
      fetchImpl: stub.fetchFn,
    });
    const result = await adapter.runWorkflow(SAMPLE);
    expect(result.status).toBe('FAILED');
    expect(result.errorCode).toBe('TASK_POLL_FAILED');
    expect(result.errorMessage).toContain('ComfyUI node crashed');
  });

  it('polling exhausts bounded attempts -> FAILED (TASK_POLL_FAILED)', async () => {
    const stub = makeRhStub({ outputsCode: 804 });
    const adapter = new RunningHubLumenAdapter({
      apiKey: 'super-secret',
      workflows: { PRODUCT_SHOT: WF },
      fetchImpl: stub.fetchFn,
      // tiny cap so the loop terminates quickly without sleeping long.
      poll: { maxAttempts: 2, intervalMs: 1, timeoutMs: 1000 },
    });
    const result = await adapter.runWorkflow(SAMPLE);
    expect(result.status).toBe('FAILED');
    expect(result.errorCode).toBe('TASK_POLL_FAILED');
    expect(result.errorMessage).toContain('exhausted');
  });

  it('unconfigured workflow -> FAILED (WORKFLOW_NOT_CONFIGURED)', async () => {
    const stub = makeRhStub();
    const adapter = new RunningHubLumenAdapter({
      apiKey: 'super-secret',
      workflows: {},
      fetchImpl: stub.fetchFn,
    });
    const result = await adapter.runWorkflow(SAMPLE);
    expect(result.status).toBe('FAILED');
    expect(result.errorCode).toBe('WORKFLOW_NOT_CONFIGURED');
    expect(result.errorMessage).toContain('PRODUCT_SHOT');
  });

  it('constructor throws without an apiKey', () => {
    expect(() => new RunningHubLumenAdapter({ apiKey: '', workflows: {} })).toThrow();
  });
});

describe('createRunningHubAdapterFromEnv — credential gating (owner-gated)', () => {
  it('returns null when RUNNINGHUB_API_KEY absent', () => {
    expect(createRunningHubAdapterFromEnv({})).toBeNull();
    expect(createRunningHubAdapterFromEnv({ RUNNINGHUB_API_BASE_URL: 'x' })).toBeNull();
  });

  it('constructs a real adapter when the key is present', () => {
    const a = createRunningHubAdapterFromEnv({ RUNNINGHUB_API_KEY: 'k' });
    expect(a).not.toBeNull();
    expect(a).toBeInstanceOf(RunningHubLumenAdapter);
  });
});

describe('Lumen capability layer — frontend-only surface', () => {
  it('exposes at least the four required capabilities', () => {
    const types = LUMEN_CAPABILITIES.map((c) => c.type);
    expect(types).toContain('PRODUCT_SHOT');
    expect(types).toContain('BACKGROUND_SWAP');
    expect(types).toContain('LOCAL_RETOUCH');
    expect(types).toContain('STYLE_VARIATION');
  });
});

describe('FakeRunningHubAdapter — in-memory stand-in', () => {
  it('happy: SUCCEEDED with a stable DEMO url, counted once', async () => {
    const adapter = new FakeRunningHubAdapter();
    const result = await adapter.runWorkflow(SAMPLE);
    expect(result.status).toBe('SUCCEEDED');
    expect(result.outputImages[0].url).toMatch(/^lumen-demo:\/\/runninghub\//);
    expect(result.provider).toBe('RUNNINGHUB');
    expect(adapter.runCount).toBe(1);
  });

  it('injected failure: FAILED with DEMO code', async () => {
    const adapter = new FakeRunningHubAdapter({ failRun: true, errorCode: 'DEMO_TIMEOUT' });
    const result = await adapter.runWorkflow(SAMPLE);
    expect(result.status).toBe('FAILED');
    expect(result.errorCode).toBe('DEMO_TIMEOUT');
  });
});
