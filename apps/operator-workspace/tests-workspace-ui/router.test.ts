import { describe, expect, it } from 'vitest';

import {
  NAVIGATION,
  createRouter,
  isNavigationActive,
  parseRoute,
  serializeRoute,
} from '../src/router.js';
import { demoRuntimeIdentity } from '../src/runtime-identity.js';

describe('workspace router', () => {
  it('parses top-level and detail routes without losing the canonical id', () => {
    expect(parseRoute('#/projects')).toEqual({ name: 'projects' });
    expect(parseRoute('#/projects/proj_001')).toEqual({
      name: 'project-detail',
      projectId: 'proj_001',
    });
    expect(parseRoute('#/reviews/case_001')).toEqual({
      name: 'review-detail',
      caseId: 'case_001',
    });
    expect(parseRoute('#/runs/proc_001')).toEqual({
      name: 'run-detail',
      processId: 'proc_001',
    });
  });

  it('fails closed to Overview for malformed or unsupported paths', () => {
    expect(parseRoute('')).toEqual({ name: 'overview' });
    expect(parseRoute('#/customers')).toEqual({ name: 'overview' });
    expect(parseRoute('#/projects/')).toEqual({ name: 'overview' });
    expect(parseRoute('#/runs/a/b')).toEqual({ name: 'overview' });
    expect(parseRoute('#/projects/%E0%A4%A')).toEqual({ name: 'overview' });
  });

  it('serializes routes and keeps the parent navigation item active in details', () => {
    const route = { name: 'run-detail' as const, processId: 'proc_001' };
    expect(serializeRoute(route)).toBe('#/runs/proc_001');
    expect(isNavigationActive(route, 'runs')).toBe(true);
    expect(isNavigationActive(route, 'projects')).toBe(false);
    expect(NAVIGATION.map((item) => item.id)).toEqual([
      'overview',
      'projects',
      'reviews',
      'runs',
    ]);
  });

  it('notifies subscribers for programmatic navigation and removes them cleanly', () => {
    const seen: string[] = [];
    const router = createRouter({ hash: '#/overview', writeHash: false });
    const unsubscribe = router.subscribe((route) => seen.push(serializeRoute(route)));

    router.navigate({ name: 'projects' });
    router.navigate({ name: 'project-detail', projectId: 'proj_001' });
    unsubscribe();
    router.navigate({ name: 'reviews' });

    expect(seen).toEqual(['#/projects', '#/projects/proj_001']);
    expect(router.current()).toEqual({ name: 'reviews' });
  });

  it('exposes an explicit DEMO runtime identity with a non-sensitive build reference', () => {
    expect(demoRuntimeIdentity('abc1234')).toEqual({
      mode: 'DEMO',
      buildSha: 'abc1234',
      connectionSummary: 'In-memory demo data',
    });
  });

  it('does not assume a complete browser window object exists in headless smoke execution', () => {
    const previous = globalThis.window;
    globalThis.window = {} as Window;
    try {
      expect(createRouter({ writeHash: false }).current()).toEqual({ name: 'overview' });
    } finally {
      globalThis.window = previous;
    }
  });
});
