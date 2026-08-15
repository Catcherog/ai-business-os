import type {
  Project,
  Customer,
  Task,
  Asset,
} from '@busos/contracts';
import type { BusinessRepository } from '@busos/business-repository';

import type { ProjectWorkspace } from './types.js';

/**
 * `WorkspaceReadService` — the application boundary for the Operator Workspace
 * read surface (H1-01).
 *
 * It sits *above* {@link BusinessRepository} (the R1 persistence boundary,
 * D017) and exposes exactly the reads the workspace needs:
 *
 * - `listProjects()` — the Projects navigation list.
 * - `getProjectWorkspace(projectId)` — the Project Detail aggregation
 *   (Project + Customer reference + Tasks + Assets).
 *
 * Read-only by construction: every method delegates to a repository *read*
 * (`getProject`, `getCustomer`, `listProjects`, `listTasksByProject`,
 * `listAssetsByProject`). It never calls a create/update/delete path, so it
 * cannot mutate storage (H1-01-F). Feishu structures never cross this boundary
 * — only canonical domain types leave it (D018).
 */
export class WorkspaceReadService {
  constructor(private readonly repo: BusinessRepository) {}

  /**
   * Canonical Project list, ordered most-recently-updated first by the
   * repository. An optional bounded `limit` may be supplied by the caller.
   */
  listProjects(opts?: { limit?: number }): Promise<Project[]> {
    return this.repo.listProjects(opts);
  }

  /**
   * Aggregate a single Project's full read surface. Returns `null` when the
   * project does not exist. The customer reference and the task/asset
   * collections are resolved in parallel — all reads.
   */
  async getProjectWorkspace(projectId: string): Promise<ProjectWorkspace | null> {
    const project = await this.repo.getProject(projectId);
    if (!project) return null;

    const [customer, tasks, assets] = await Promise.all([
      this.repo.getCustomer(project.customer_id),
      this.repo.listTasksByProject(projectId),
      this.repo.listAssetsByProject(projectId),
    ]);

    return { project, customer, tasks, assets };
  }
}

/** Re-exported for callers that build workspaces without importing contracts directly. */
export type { Project, Customer, Task, Asset };
