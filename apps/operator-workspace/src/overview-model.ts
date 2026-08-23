/**
 * H1-05 — Operator Workspace Overview read model.
 *
 * A pure projection that aggregates the EXISTING read surfaces (Projects /
 * Reviews / Runs) into a single actionable Overview payload. It introduces NO
 * second analytics backend and NO new Project/Review/Run type — every field is
 * derived from the canonical domain models already exposed by
 * `WorkspaceReadService` / `WorkspaceReviewService` / `WorkspaceRunService`.
 *
 * The UI (and the H1-05 integration test) consume this one function so the
 * Overview never guesses business state.
 */
import type { Project } from '@busos/contracts';
import type { ReviewCase } from '@busos/workspace-review';
import type { RunSummary } from '@busos/workspace-run';
export interface OverviewReadSurface {
  listProjects(): Promise<Project[]>;
}

export interface OverviewReviewSurface {
  listReviews(): Promise<ReviewCase[]>;
}

export interface OverviewRunSurface {
  listRuns(): Promise<RunSummary[]>;
}

export interface ActivityItem {
  kind: 'project' | 'review' | 'run';
  /** Navigation target id (project_id / case_id / processId). */
  id: string;
  label: string;
  sub: string;
  status: string;
  /** Sortable timestamp (ISO). */
  at: string;
}

export interface OverviewModel {
  projects: Project[];
  projectStatusCounts: Record<string, number>;
  reviews: ReviewCase[];
  pendingReviews: ReviewCase[];
  runs: RunSummary[];
  runStatusCounts: Record<string, number>;
  /** Recent activity across all three surfaces, newest first (bounded). */
  recentActivity: ActivityItem[];
}

function countBy<T>(items: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const k = key(it);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function buildActivity(
  projects: Project[],
  reviews: ReviewCase[],
  runs: RunSummary[],
): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const p of projects) {
    items.push({
      kind: 'project',
      id: p.project_id,
      label: p.title,
      sub: `${p.project_type} · ${p.customer_id}`,
      status: p.status,
      at: p.updated_at,
    });
  }
  for (const r of reviews) {
    items.push({
      kind: 'review',
      id: r.case_id,
      label: r.original_candidate.requirement.service_type ?? '(无服务类型)',
      sub: `线索 ${r.original_candidate.candidate_id} · 状态 ${r.state}`,
      status: r.state,
      at: r.updated_at,
    });
  }
  for (const run of runs) {
    items.push({
      kind: 'run',
      id: run.processId,
      label: run.processId,
      sub: `stage ${run.stage} · ${run.startedAt}`,
      status: run.status,
      at: run.startedAt,
    });
  }
  return items
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, 8);
}

/**
 * Build the Overview model from the three existing read surfaces. All data is
 * REAL (the in-memory demo workspace) — never faked metrics.
 */
export async function buildOverview(
  read: OverviewReadSurface,
  review: OverviewReviewSurface,
  run: OverviewRunSurface,
): Promise<OverviewModel> {
  const [projects, reviews, runs] = await Promise.all([
    read.listProjects(),
    review.listReviews(),
    run.listRuns(),
  ]);
  return {
    projects,
    projectStatusCounts: countBy(projects, (p) => p.status),
    reviews,
    pendingReviews: reviews.filter((r) => r.state === 'PENDING_REVIEW'),
    runs,
    runStatusCounts: countBy(runs, (r) => r.status),
    recentActivity: buildActivity(projects, reviews, runs),
  };
}
