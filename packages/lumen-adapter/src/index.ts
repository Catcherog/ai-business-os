/**
 * @busos/lumen-adapter — Lumen (光砚) generation port + adapters (BUSOS-P5-01).
 *
 * The application layer depends only on `LumenPort` / `LumenGenerateInput` /
 * `LumenGenerateResult`. `RealLumenAdapter` owns all Lumen HTTP + auth
 * knowledge; `FakeLumenAdapter` is the in-memory stand-in. All provider-key
 * knowledge stays inside Lumen (§19).
 *
 * BUSOS-R2-BATCH2C — Lumen as a unified in-OS image workbench backed by the
 * RunningHub workflow engine. The UI depends ONLY on the capability layer
 * (`LumenWorkflowType` / `LumenWorkflowPort` / `LUMEN_CAPABILITIES`) and never
 * sees RunningHub endpoints, auth, or node graphs. The real engine lives in
 * `RunningHubLumenAdapter` (server-only).
 */

// --- Original Lumen (光砚) single-image generation port -------------------
export type {
  LumenPort,
  LumenGenerateInput,
  LumenGenerateResult,
  LumenAdapterConfig,
} from './types.js';

export { RealLumenAdapter } from './real-lumen-adapter.js';
export { FakeLumenAdapter, createFakeLumenAdapter } from './fake-lumen-adapter.js';
export type { FakeLumenAdapterOptions } from './fake-lumen-adapter.js';
export { createLumenAdapter, createLumenAdapterFromEnv } from './create-from-env.js';

// --- Lumen Workflow layer (capability templates over RunningHub) ----------
export type {
  LumenWorkflowType,
  LumenWorkflowInput,
  LumenWorkflowOutputImage,
  LumenWorkflowRunResult,
  LumenWorkflowPort,
  RunningHubNodeSlot,
  RunningHubNodeInfo,
  RunningHubWorkflowConfig,
  RunningHubAdapterConfig,
} from './workflow-types.js';

export { RunningHubLumenAdapter } from './runninghub-lumen-adapter.js';
export {
  LUMEN_CAPABILITIES,
  getLumenCapability,
} from './lumen-capabilities.js';
export type {
  LumenCapabilityDefinition,
  LumenParamSpec,
} from './lumen-capabilities.js';
export { FakeRunningHubAdapter, createFakeRunningHubAdapter } from './fake-runninghub-adapter.js';
export type { FakeRunningHubAdapterOptions } from './fake-runninghub-adapter.js';
export { createRunningHubAdapterFromEnv } from './runninghub-from-env.js';
