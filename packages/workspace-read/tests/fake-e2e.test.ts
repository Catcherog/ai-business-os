import { describe, it, expect } from 'vitest';
import {
  BusinessRepository,
  FakeFeishuAdapter,
  createFakeFeishuAdapter,
} from '@busos/business-repository';

import { WorkspaceReadService, seedFakeWorkspace } from '../src/index.js';

/**
 * H1-01-G — Fake Product E2E.
 *
 * Drives the full read surface end-to-end against the in-memory fake adapter:
 * seed deterministic demo data, then prove `WorkspaceReadService` exposes
 * exactly the canonical structures the workspace needs, with no Feishu leakage.
 */
describe('H1-01-G WorkspaceReadService fake product E2E', () => {
  it('lists >=2 canonical projects and opens a full project workspace', async () => {
    const adapter: FakeFeishuAdapter = createFakeFeishuAdapter() as FakeFeishuAdapter;
    const repo = new BusinessRepository(adapter);
    const seeded = await seedFakeWorkspace(repo);
    const svc = new WorkspaceReadService(repo);

    const projects = await svc.listProjects();
    expect(projects.length).toBeGreaterThanOrEqual(2);
    // Deterministic ordering: most-recently-updated first (stable tie-break).
    for (let i = 1; i < projects.length; i++) {
      expect(projects[i - 1].updated_at >= projects[i].updated_at).toBe(true);
    }

    const ws = await svc.getProjectWorkspace(seeded.projects[0].project_id);
    expect(ws).not.toBeNull();
    expect(ws!.project.project_id).toBe(seeded.projects[0].project_id);
    expect(ws!.customer).not.toBeNull();
    expect(ws!.customer!.customer_id).toBe(seeded.projects[0].customer_id);
    expect(ws!.tasks.length).toBeGreaterThan(0);
    expect(ws!.assets.length).toBeGreaterThanOrEqual(1);

    // No Feishu leakage: the workspace object carries only canonical fields.
    expect(ws!.project).not.toHaveProperty('record_id');
    expect(ws!.project).not.toHaveProperty('fields');
  });

  it('every seeded project resolves a populated workspace', async () => {
    const repo = new BusinessRepository(createFakeFeishuAdapter());
    const seeded = await seedFakeWorkspace(repo);
    const svc = new WorkspaceReadService(repo);

    for (const p of seeded.projects) {
      const ws = await svc.getProjectWorkspace(p.project_id);
      expect(ws).not.toBeNull();
      expect(ws!.customer!.customer_id).toBe(p.customer_id);
      expect(ws!.tasks.every((t) => t.project_id === p.project_id)).toBe(true);
      expect(ws!.assets.every((a) => a.project_id === p.project_id)).toBe(true);
    }
  });

  it('returns null for an unknown project id (no mutation, no throw)', async () => {
    const repo = new BusinessRepository(createFakeFeishuAdapter());
    const svc = new WorkspaceReadService(repo);
    expect(await svc.getProjectWorkspace('does_not_exist')).toBeNull();
  });
});
