import { BusinessRepository, createFeishuAdapterFromEnv } from '@busos/business-repository';
import { InMemoryProcessRegistry } from '@busos/orchestrator';
import { WorkspaceReadService } from '@busos/workspace-read';
import { WorkspaceReviewService } from '@busos/workspace-review';
import { WorkspaceRunService } from '@busos/workspace-run';
import {
  workspaceBlocked,
  workspaceError,
  workspaceReady,
  listProjectWorkspaces,
  type ReviewDecisionInput,
  type RuntimeIdentityView,
  type WorkspaceEnvelope,
  type WorkspaceMode,
  type WorkspaceServiceSet,
} from '../src/workspace-data-source.js';
import type { ProjectWorkspace } from '@busos/workspace-read';
import type { ReviewCase } from '@busos/workspace-review';
import type { RunDetail, RunSummary } from '@busos/workspace-run';

export interface ConnectedWorkspaceApi {
  runtime(): Promise<WorkspaceEnvelope<RuntimeIdentityView>>;
  listProjects(): Promise<WorkspaceEnvelope<ProjectWorkspace[]>>;
  getProject(projectId: string): Promise<WorkspaceEnvelope<ProjectWorkspace | null>>;
  listReviews(): Promise<WorkspaceEnvelope<ReviewCase[]>>;
  getReview(caseId: string): Promise<WorkspaceEnvelope<ReviewCase | null>>;
  decideReview(input: ReviewDecisionInput): Promise<WorkspaceEnvelope<ReviewCase>>;
  listRuns(): Promise<WorkspaceEnvelope<RunSummary[]>>;
  getRun(processId: string): Promise<WorkspaceEnvelope<RunDetail | null>>;
}

export interface ConnectedWorkspaceApiOptions {
  env?: NodeJS.ProcessEnv;
  buildSha?: string;
  services?: WorkspaceServiceSet;
}

function resolveBuildSha(env: NodeJS.ProcessEnv): string {
  const sha = (env.VERCEL_GIT_COMMIT_SHA ?? env.BUSOS_BUILD_SHA ?? '').trim();
  return sha ? sha.slice(0, 7) : 'unknown';
}

function createServices(options: ConnectedWorkspaceApiOptions): WorkspaceServiceSet | null {
  if (options.services) return options.services;
  const feishu = createFeishuAdapterFromEnv(options.env ?? process.env);
  if (!feishu) return null;
  const repo = new BusinessRepository(feishu);
  return {
    read: new WorkspaceReadService(repo),
    review: new WorkspaceReviewService(repo),
    // Run history remains read-only in this batch. The server owns this
    // registry; it never substitutes the browser's DEMO records.
    run: new WorkspaceRunService(new InMemoryProcessRegistry()),
  };
}

export function createConnectedWorkspaceApi(
  options: ConnectedWorkspaceApiOptions = {},
): ConnectedWorkspaceApi {
  const env = options.env ?? process.env;
  const buildSha = options.buildSha ?? resolveBuildSha(env);
  const services = createServices(options);
  const mode: WorkspaceMode = 'CONNECTED';
  const blocked = <T>(): WorkspaceEnvelope<T> => workspaceBlocked(
    mode,
    buildSha,
    'Connected workspace is unavailable; configure the server-side Feishu adapter.',
  );
  const guarded = async <T>(call: () => Promise<T> | T): Promise<WorkspaceEnvelope<T>> => {
    if (!services) return blocked<T>();
    try {
      return workspaceReady(mode, buildSha, await call());
    } catch {
      return workspaceError(mode, buildSha);
    }
  };

  return {
    runtime: async () => services
      ? workspaceReady(mode, buildSha, {
          mode,
          buildSha,
          connectionSummary: 'Server-side Connected workspace',
        })
      : blocked<RuntimeIdentityView>(),
    listProjects: () => guarded(() => listProjectWorkspaces(services!.read)),
    getProject: (projectId) => guarded(() => services!.read.getProjectWorkspace(projectId)),
    listReviews: () => guarded(() => services!.review.listReviews()),
    getReview: (caseId) => guarded(() => services!.review.getReview(caseId)),
    // This batch has no live-write gate. The server route remains present so
    // the transport contract is stable, but a Feishu-backed default instance
    // must fail closed instead of turning a UI decision into a real write.
    decideReview: (input) => options.services
      ? guarded(async () => {
          switch (input.action) {
            case 'APPROVE':
              await services!.review.approve(input.caseId, input.note);
              break;
            case 'EDIT_APPROVE':
              await services!.review.editAndApprove(input.caseId, input.patch ?? {}, input.note);
              break;
            case 'REJECT':
              await services!.review.reject(input.caseId, input.note);
              break;
          }
          const updated = services!.review.getReview(input.caseId);
          if (!updated) throw new Error('Review case not found.');
          return updated;
      })
      : Promise.resolve(blocked<ReviewCase>()),
    listRuns: () => guarded(() => services!.run.listRuns()),
    getRun: (processId) => guarded(() => services!.run.getRun(processId)),
  };
}
