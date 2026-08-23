import { describe, expect, it } from 'vitest';

import { BusinessRepository, createFakeFeishuAdapter } from '@busos/business-repository';
import { InMemoryProcessRegistry } from '@busos/orchestrator';
import { WorkspaceReadService, seedFakeWorkspace } from '@busos/workspace-read';
import { WorkspaceReviewService } from '@busos/workspace-review';
import { WorkspaceRunService, buildDemoRuns } from '@busos/workspace-run';
import {
  createDemoWorkspaceDataSource,
  createServerWorkspaceDataSource,
  unwrapWorkspaceEnvelope,
  type WorkspaceEnvelope,
} from '../src/workspace-data-source.js';
import { createConnectedWorkspaceApi } from '../server/workspace-api.js';

async function demoSource() {
  const repo = new BusinessRepository(createFakeFeishuAdapter());
  await seedFakeWorkspace(repo);
  const review = new WorkspaceReviewService(repo);
  review.seedDemo();
  const registry = new InMemoryProcessRegistry();
  for (const run of buildDemoRuns()) await registry.save(run);
  return createDemoWorkspaceDataSource({
    read: new WorkspaceReadService(repo),
    review,
    run: new WorkspaceRunService(registry),
    buildSha: 'test123',
  });
}

describe('WorkspaceDataSource contract', () => {
  it('wraps DEMO project, review, and run reads in canonical ready envelopes', async () => {
    const source = await demoSource();

    await expect(source.runtime).resolves.toEqual({
      mode: 'DEMO',
      buildSha: 'test123',
      status: 'READY',
      data: {
        mode: 'DEMO',
        buildSha: 'test123',
        connectionSummary: 'In-memory demo data',
      },
    });

    const projects = await source.listProjects();
    const reviews = await source.listReviews();
    const runs = await source.listRuns();
    expect(projects.mode).toBe('DEMO');
    expect(projects.status).toBe('READY');
    expect(projects.data?.length).toBeGreaterThan(0);
    expect(reviews.data?.length).toBeGreaterThan(0);
    expect(runs.data?.length).toBeGreaterThan(0);
    expect(unwrapWorkspaceEnvelope(projects)[0]?.project.project_id).toBeTruthy();
  });

  it('routes review decisions through the shared data source and returns the updated case', async () => {
    const source = await demoSource();
    const reviews = await source.listReviews();
    const caseId = reviews.data?.[0]?.case_id;
    expect(caseId).toBeTruthy();

    const decision = await source.decideReview({
      caseId: caseId!,
      action: 'REJECT',
      note: 'test decision',
    });

    expect(decision.status).toBe('READY');
    expect(decision.data?.case_id).toBe(caseId);
    expect(decision.data?.state).toBe('REJECTED');
  });

  it('uses a stubbed server transport without exposing provider-shaped data', async () => {
    const calls: Array<{ path: string; method: string }> = [];
    const projectEnvelope: WorkspaceEnvelope<unknown> = {
      mode: 'CONNECTED',
      buildSha: 'srv1234',
      status: 'READY',
      data: [],
    };
    const fetchImpl = async (input: string | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      calls.push({ path: new URL(url).pathname, method: init?.method ?? 'GET' });
      return new Response(JSON.stringify(projectEnvelope), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const source = createServerWorkspaceDataSource({
      baseUrl: 'https://workspace.test',
      fetchImpl,
    });
    // `runtime` is a Promise property by contract, so its request starts when
    // the transport is created. Assert the explicit data calls below.
    calls.length = 0;

    const result = await source.listProjects();
    expect(result).toEqual(projectEnvelope);
    await source.decideReview({ caseId: 'case/001', action: 'REJECT', note: null });
    expect(calls).toEqual([
      { path: '/api/workspace/projects', method: 'GET' },
      { path: '/api/workspace/reviews/case%2F001/decision', method: 'POST' },
    ]);
  });

  it('returns a sanitized ERROR envelope for transport failures', async () => {
    const source = createServerWorkspaceDataSource({
      fetchImpl: async () => { throw new Error('provider password=do-not-leak'); },
    });

    const result = await source.listRuns();
    expect(result.status).toBe('ERROR');
    expect(result.data).toBeUndefined();
    expect(result.error?.message).not.toContain('password');
    expect(result.error?.message).toBe('Workspace data source request failed.');
  });

  it('fails closed when Connected configuration is absent and never substitutes DEMO data', async () => {
    const api = createConnectedWorkspaceApi({
      env: {},
      buildSha: 'srv1234',
    });

    await expect(api.runtime()).resolves.toMatchObject({
      mode: 'CONNECTED',
      buildSha: 'srv1234',
      status: 'BLOCKED',
    });
    const projects = await api.listProjects();
    expect(projects).toMatchObject({
      mode: 'CONNECTED',
      status: 'BLOCKED',
    });
    expect(projects.data).toBeUndefined();
  });
});
