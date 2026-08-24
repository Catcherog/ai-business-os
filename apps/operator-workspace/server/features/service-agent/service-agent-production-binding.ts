/**
 * BUSOS-R2-BATCH2-SCS-PRODUCTION-CONNECT-01 — server-side port composition.
 *
 * This module is the single composition seam between:
 *   - a VALID production SCS configuration  -> ServiceAgentProductionAdapter(real transport)
 *   - an ABSENT/INVALID configuration        -> the existing fail-closed port
 *
 * It deliberately never returns a DEMO fallback: no config means the Service
 * Agent fails closed, and a production error also fails closed (the adapter
 * validates and rejects). The browser boundary is untouched.
 */

import type { ServiceAgentPort, ServiceAgentRunInput } from '@busos/service-agent-port';
import { ServiceAgentProductionAdapter } from '@busos/service-agent-port';
import {
  createServiceAgentProductionTransport,
  type ServiceAgentProductionTransportOptions,
} from './service-agent-production-transport.js';
import type { ServiceAgentProductionConfig } from './service-agent-production-config.js';

/** Typed fail-closed error, identical semantics to the prior inline stub. */
export class ServiceAgentNotConfiguredError extends Error {
  readonly code = 'SERVICE_AGENT_NOT_CONFIGURED' as const;
  constructor() {
    super('Service Agent is not configured on this server boundary.');
  }
}

/**
 * Fail-closed port used when no production SCS configuration is present.
 * Every consultation is rejected with SERVICE_AGENT_NOT_CONFIGURED so the
 * CONNECTED server boundary stays safe without a live binding.
 */
export const failClosedServiceAgentPort: ServiceAgentPort = {
  async run(_input: ServiceAgentRunInput): Promise<never> {
    throw new ServiceAgentNotConfiguredError();
  },
};

export interface ResolveServiceAgentPortOptions {
  transportOptions?: Omit<ServiceAgentProductionTransportOptions, 'config'>;
}

/**
 * Resolve the Service Agent port for the CONNECTED server boundary.
 *
 *   production config available -> ServiceAgentProductionAdapter(real transport)
 *   production config absent   -> failClosedServiceAgentPort
 *
 * No DEMO fallback is ever returned. The real transport still runs through the
 * canonical ServiceAgentRuntime / ProcessRegistry / ConversationStore.
 */
export function resolveServiceAgentPort(
  config: ServiceAgentProductionConfig | null,
  options: ResolveServiceAgentPortOptions = {},
): ServiceAgentPort {
  if (!config) return failClosedServiceAgentPort;

  const transport = createServiceAgentProductionTransport({
    config,
    ...options.transportOptions,
  });
  return new ServiceAgentProductionAdapter(transport);
}
