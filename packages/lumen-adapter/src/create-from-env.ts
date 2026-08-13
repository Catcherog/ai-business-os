import { RealLumenAdapter } from './real-lumen-adapter.js';
import type { LumenAdapterConfig, LumenPort } from './types.js';

/**
 * Build a real Lumen adapter from environment variables (never hardcode
 * secrets). Returns null when the required connection details are absent so the
 * live E2E can be marked BLOCKED instead of faking success (P5-I / §6).
 *
 * Security boundary (§19): AI Business OS only ever holds Lumen's
 * `AUTH_PASSWORD` + base URL. The underlying image-provider key (Seedream /
 * Volcengine) lives exclusively inside Lumen; it is never read or forwarded.
 */
export function createLumenAdapterFromEnv(env: NodeJS.ProcessEnv = process.env): LumenPort | null {
  const baseUrl = env.LUMEN_BASE_URL;
  const authPassword = env.LUMEN_AUTH_PASSWORD;
  if (!baseUrl || !authPassword) return null;
  return new RealLumenAdapter({ baseUrl, authPassword });
}

export function createLumenAdapter(config: LumenAdapterConfig): LumenPort {
  return new RealLumenAdapter(config);
}
