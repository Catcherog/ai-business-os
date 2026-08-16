import { BusinessRepository, createFakeFeishuAdapter } from '@busos/business-repository';
import { WorkspaceReadService, seedFakeWorkspace } from '@busos/workspace-read';
import { WorkspaceReviewService } from '@busos/workspace-review';

/**
 * Frontend data source for the Operator Workspace demo (H1-01 read surface +
 * H1-02 review surface).
 *
 * The browser uses the in-memory fake adapter — no Feishu credentials ever
 * reach the client (the real adapter is exercised only by the server-side
 * simulator tests, never bundled for the browser). The same canonical read and
 * review surfaces the production backend would expose are what the UI consumes.
 */

let readSvc: WorkspaceReadService | null = null;
let reviewSvc: WorkspaceReviewService | null = null;

/** Seed the in-memory demo datasets and build the read + review services. Idempotent. */
export async function initWorkspace(): Promise<void> {
  if (readSvc && reviewSvc) return;
  // One shared in-memory repository backs both surfaces so a committed review
  // lead is visible through the canonical write path (no extra UI plumbing).
  const repo = new BusinessRepository(createFakeFeishuAdapter());
  await seedFakeWorkspace(repo);
  readSvc = new WorkspaceReadService(repo);
  reviewSvc = new WorkspaceReviewService(repo);
  reviewSvc.seedDemo();
}

export function getService(): WorkspaceReadService {
  if (!readSvc) throw new Error('Workspace not initialized — call initWorkspace() first.');
  return readSvc;
}

export function getReviewService(): WorkspaceReviewService {
  if (!reviewSvc) throw new Error('Workspace not initialized — call initWorkspace() first.');
  return reviewSvc;
}
