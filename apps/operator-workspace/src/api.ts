import { BusinessRepository, createFakeFeishuAdapter } from '@busos/business-repository';
import { InMemoryProcessRegistry } from '@busos/orchestrator';
import type { ProcessRegistryReadPort } from '@busos/orchestrator';
import { WorkspaceReadService, seedFakeWorkspace } from '@busos/workspace-read';
import { WorkspaceReviewService } from '@busos/workspace-review';
import { WorkspaceRunService, buildDemoRuns } from '@busos/workspace-run';

/**
 * Frontend data source for the Operator Workspace demo (H1-01 read surface +
 * H1-02 review surface + H1-03 run surface).
 *
 * The browser uses the in-memory fake adapter — no Feishu credentials ever
 * reach the client (the real adapter is exercised only by the server-side
 * simulator tests, never bundled for the browser). The same canonical read and
 * review surfaces the production backend would expose are what the UI consumes.
 *
 * H1-03 connection boundary: a single shared `InMemoryProcessRegistry` backs the
 * Runs surface. H1-04 will later pass THIS SAME registry instance to
 * `runBusinessProcess`, so real new runs automatically appear on the Runs
 * surface — the wiring is prepared here, but H1-04 execution is NOT started.
 */
let readSvc: WorkspaceReadService | null = null;
let reviewSvc: WorkspaceReviewService | null = null;
let runSvc: WorkspaceRunService | null = null;
let runRegistry: ProcessRegistryReadPort | null = null;

/** Seed the in-memory demo datasets and build the read + review + run services. Idempotent. */
export async function initWorkspace(): Promise<void> {
  if (readSvc && reviewSvc && runSvc) return;
  // One shared in-memory repository backs both surfaces so a committed review
  // lead is visible through the canonical write path (no extra UI plumbing).
  const repo = new BusinessRepository(createFakeFeishuAdapter());
  await seedFakeWorkspace(repo);
  readSvc = new WorkspaceReadService(repo);
  reviewSvc = new WorkspaceReviewService(repo);
  reviewSvc.seedDemo();

  // Shared in-memory process registry for the Runs surface. Seeded with
  // deterministic demo runs; H1-04 will pass the same instance to
  // runBusinessProcess so real runs show up here.
  runRegistry = new InMemoryProcessRegistry();
  for (const rec of buildDemoRuns()) await runRegistry.save(rec);
  runSvc = new WorkspaceRunService(runRegistry);
}

export function getService(): WorkspaceReadService {
  if (!readSvc) throw new Error('Workspace not initialized — call initWorkspace() first.');
  return readSvc;
}

export function getReviewService(): WorkspaceReviewService {
  if (!reviewSvc) throw new Error('Workspace not initialized — call initWorkspace() first.');
  return reviewSvc;
}

export function getRunService(): WorkspaceRunService {
  if (!runSvc) throw new Error('Workspace not initialized — call initWorkspace() first.');
  return runSvc;
}

/**
 * H1-03/H1-04 boundary seam — expose the SHARED in-memory process registry that
 * backs the Runs surface. H1-04 will pass this same instance to
 * `runBusinessProcess`; the smoke driver uses it to inject forbidden-material
 * scenarios and verify the presentation boundary strips them. Read-only access
 * from the UI's perspective; typed as the read port.
 */
export function getRunRegistry(): ProcessRegistryReadPort {
  if (!runRegistry) throw new Error('Workspace not initialized — call initWorkspace() first.');
  return runRegistry;
}
