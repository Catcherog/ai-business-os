import type { Project, Customer, Task, Asset } from '@busos/contracts';

/**
 * The full read surface for a single Project in the Operator Workspace.
 *
 * This is the ONLY shape the workspace UI consumes. It is composed entirely
 * from canonical domain types returned by {@link BusinessRepository}; no Feishu
 * record id, table id, or field name exists anywhere in this object (D017 /
 * D018 — the persistence boundary and Feishu knowledge stay behind the adapter).
 */
export interface ProjectWorkspace {
  /** The canonical Project. */
  project: Project;
  /** The Project's owning Customer reference (null only for a dangling project). */
  customer: Customer | null;
  /** Canonical Tasks for the Project, ordered deterministically. */
  tasks: Task[];
  /** Canonical Assets for the Project, ordered deterministically. */
  assets: Asset[];
}
