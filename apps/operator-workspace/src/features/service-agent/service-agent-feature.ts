import type { ServiceAgentConversationListOptions, ServiceAgentConversationRecord } from '@busos/service-agent-port';
import {
  createServiceAgentClient,
  type ServiceAgentClient,
  type ServiceAgentConsultationInput,
  type ServiceAgentConsultationResult,
  type ServiceAgentRunRead,
} from './service-agent-client.js';
import {
  serviceAgentConversationViewModel,
  type ServiceAgentConversationViewModel,
  type ServiceAgentFeatureContext,
} from './service-agent-model.js';

export interface ServiceAgentFeatureClient extends ServiceAgentClient {}

export interface ServiceAgentFeatureConsultationInput extends ServiceAgentConsultationInput {
  context?: ServiceAgentFeatureContext;
}

export interface ServiceAgentFeatureConsultationResult extends ServiceAgentConsultationResult {
  context: ServiceAgentFeatureContext;
  viewModel: ServiceAgentConversationViewModel;
}

export function createServiceAgentFeature(
  client: ServiceAgentFeatureClient = createServiceAgentClient(),
) {
  return {
    listConversations(options?: ServiceAgentConversationListOptions): Promise<ServiceAgentConversationRecord[]> {
      return client.listConversations(options);
    },
    getConversation(conversationId: string): Promise<ServiceAgentConversationRecord | null> {
      return client.getConversation(conversationId);
    },
    listRuns(): Promise<ServiceAgentRunRead[]> {
      return client.listRuns();
    },
    getRun(processId: string): Promise<ServiceAgentRunRead | null> {
      return client.getRun(processId);
    },
    async consult(input: ServiceAgentFeatureConsultationInput): Promise<ServiceAgentFeatureConsultationResult> {
      const result = await client.consult({
        query: input.query,
        idempotencyKey: input.idempotencyKey,
        ...(input.customerId ? { customerId: input.customerId } : {}),
      });
      const context = {
        ...(input.customerId ? { customerId: input.customerId } : {}),
        ...(input.context?.projectId ? { projectId: input.context.projectId } : {}),
        ...(input.context?.memoryRefs ? { memoryRefs: [...input.context.memoryRefs] } : {}),
      };
      return {
        ...result,
        context,
        viewModel: serviceAgentConversationViewModel(result.conversation, {
          run: result.run,
          context,
        }),
      };
    },
  };
}
