import { BusinessRepository, createFakeFeishuAdapter } from '@busos/business-repository';
import { WorkspaceReadService, seedFakeWorkspace } from '@busos/workspace-read';

/**
 * Frontend data source for the Operator Workspace demo (H1-01).
 *
 * The browser uses the in-memory fake adapter — no Feishu credentials ever
 * reach the client (the real adapter is exercised only by the server-side
 * simulator tests, never bundled for the browser). The same canonical read
 * surface the production backend would expose is what the UI consumes.
 */

let service: WorkspaceReadService | null = null;

/** Seed the in-memory demo dataset and return the read service. Idempotent. */
export async function initWorkspace(): Promise<WorkspaceReadService> {
  if (service) return service;
  const repo = new BusinessRepository(createFakeFeishuAdapter());
  await seedFakeWorkspace(repo);
  service = new WorkspaceReadService(repo);
  return service;
}

export function getService(): WorkspaceReadService {
  if (!service) throw new Error('Workspace not initialized — call initWorkspace() first.');
  return service;
}
