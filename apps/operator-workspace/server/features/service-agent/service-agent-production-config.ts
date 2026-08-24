/**
 * BUSOS-R2-BATCH2-SCS-PRODUCTION-CONNECT-01 — production SCS configuration.
 *
 * The configuration is SERVER-ENVIRONMENT ONLY. No URL or credential is
 * hard-coded, and no secret is ever written to source, tests, fixtures, logs,
 * trace, error responses, or the browser bundle.
 *
 * Variable naming reuses the real SCS deployment contract:
 *   - BUSOS_SCS_BASE_URL  : BUSOS-owned binding for the deployed SCS origin
 *                           (e.g. https://scs.internal — no trailing slash).
 *   - SCS_AGENT_API_KEY   : maps directly to the SCS `AGENT_API_KEY` that the
 *                           /api/agent/chat endpoint requires
 *                           (`Authorization: Bearer <AGENT_API_KEY>`).
 */

export interface ServiceAgentProductionConfig {
  /** Deployed SCS origin, e.g. https://scs.internal (no trailing slash). */
  readonly baseUrl: string;
  /** Agent-role API key for the production SCS. Never logged or echoed. */
  readonly apiKey: string;
}

/**
 * Load production SCS configuration from the server environment ONLY.
 *
 * Returns `null` when any required value is absent or malformed, so the caller
 * can fall back to the fail-closed port. No secret value is ever returned,
 * logged, or thrown.
 */
export function loadServiceAgentProductionConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServiceAgentProductionConfig | null {
  const rawBase = env['BUSOS_SCS_BASE_URL'];
  const rawKey = env['SCS_AGENT_API_KEY'];

  if (!rawBase || !rawKey) return null;

  const baseUrl = rawBase.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(baseUrl)) return null;
  if (rawKey.trim().length === 0) return null;

  return { baseUrl, apiKey: rawKey };
}
