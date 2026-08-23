import type { ServiceAgentPort } from './port.js';
import {
  assertServiceAgentRunInput,
  assertServiceAgentRunResult,
  type ServiceAgentRunInput,
  type ServiceAgentRunResult,
} from './schema.js';

/**
 * Production transport contract. The endpoint/binding and any credentials are
 * intentionally owned by a later server integration; this lane only accepts
 * an injected transport so controlled probes cannot silently become live calls.
 */
export interface ServiceAgentProductionTransport {
  invoke(input: ServiceAgentRunInput): Promise<unknown>;
}

/**
 * Contract-validating production adapter. It has no environment lookup, no
 * default URL, and no logging of request/response material.
 */
export class ServiceAgentProductionAdapter implements ServiceAgentPort {
  constructor(private readonly transport: ServiceAgentProductionTransport) {}

  async run(input: ServiceAgentRunInput): Promise<ServiceAgentRunResult> {
    const request = assertServiceAgentRunInput(input);
    let payload: unknown;
    try {
      payload = await this.transport.invoke(request);
    } catch {
      throw new Error('Service Agent production transport failed.');
    }

    try {
      return assertServiceAgentRunResult(payload);
    } catch {
      throw new Error('Service Agent production response failed contract validation.');
    }
  }
}
