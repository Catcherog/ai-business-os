/**
 * @busos/lumen-adapter — Lumen (光砚) generation port + adapters (BUSOS-P5-01).
 *
 * The application layer depends only on `LumenPort` / `LumenGenerateInput` /
 * `LumenGenerateResult`. `RealLumenAdapter` owns all Lumen HTTP + auth
 * knowledge; `FakeLumenAdapter` is the in-memory stand-in. All provider-key
 * knowledge stays inside Lumen (§19).
 */

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
