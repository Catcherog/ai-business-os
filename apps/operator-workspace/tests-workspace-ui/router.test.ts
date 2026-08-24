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
    expect(parseRoute('#/unknown-surface')).toEqual({ name: 'overview' });
    expect(parseRoute('#/projects/')).toEqual({ name: 'overview' });
    expect(parseRoute('#/runs/a/b')).toEqual({ name: 'overview' });
    expect(parseRoute('#/projects/%E0%A4%A')).toEqual({ name: 'overview' });
  });

  it('parses and serializes the new product-integration surfaces (AC-R01..R05)', () => {
    expect(parseRoute('#/service-agent')).toEqual({ name: 'service-agent' });
    expect(parseRoute('#/business-data')).toEqual({ name: 'business-data' });
    expect(parseRoute('#/business-data/cust_001')).toEqual({
      name: 'business-data-detail',
      customerId: 'cust_001',
    });
    expect(parseRoute('#/evaluation')).toEqual({ name: 'evaluation' });

    expect(serializeRoute({ name: 'service-agent' })).toBe('#/service-agent');
    expect(serializeRoute({ name: 'business-data' })).toBe('#/business-data');
    expect(serializeRoute({ name: 'business-data-detail', customerId: 'cust_001' })).toBe(
      '#/business-data/cust_001',
    );
    expect(serializeRoute({ name: 'evaluation' })).toBe('#/evaluation');

    // round-trip
    expect(parseRoute(serializeRoute({ name: 'business-data-detail', customerId: 'cust_001' }))).toEqual({
      name: 'business-data-detail',
      customerId: 'cust_001',
    });

    // detail keeps the business-data nav item active (explicit suffix rule)
    const detail = { name: 'business-data-detail' as const, customerId: 'cust_001' };
    expect(isNavigationActive(detail, 'business-data')).toBe(true);
    expect(isNavigationActive(detail, 'service-agent')).toBe(false);
    expect(isNavigationActive({ name: 'service-agent' }, 'service-agent')).toBe(true);
    expect(isNavigationActive({ name: 'evaluation' }, 'evaluation')).toBe(true);
  });

  it('parses and serializes the V3 operations surfaces (Operations/Customers/Orders/Review Queue)', () => {
    expect(parseRoute('#/business')).toEqual({ name: 'business' });
    expect(parseRoute('#/customers')).toEqual({ name: 'customers' });
    expect(parseRoute('#/customers/cust_001')).toEqual({
      name: 'customer-detail',
      customerId: 'cust_001',
    });
    expect(parseRoute('#/orders')).toEqual({ name: 'orders' });
    expect(parseRoute('#/orders/ord_001')).toEqual({
      name: 'order-detail',
      orderId: 'ord_001',
    });
    expect(parseRoute('#/review-queue')).toEqual({ name: 'review-queue' });
    expect(parseRoute('#/review-queue/rev_001')).toEqual({
      name: 'review-queue-detail',
      reviewId: 'rev_001',
    });

    expect(serializeRoute({ name: 'business' })).toBe('#/business');
    expect(serializeRoute({ name: 'customers' })).toBe('#/customers');
    expect(serializeRoute({ name: 'customer-detail', customerId: 'cust_001' })).toBe('#/customers/cust_001');
    expect(serializeRoute({ name: 'orders' })).toBe('#/orders');
    expect(serializeRoute({ name: 'order-detail', orderId: 'ord_001' })).toBe('#/orders/ord_001');
    expect(serializeRoute({ name: 'review-queue' })).toBe('#/review-queue');
    expect(serializeRoute({ name: 'review-queue-detail', reviewId: 'rev_001' })).toBe('#/review-queue/rev_001');

    // round-trips
    expect(parseRoute(serializeRoute({ name: 'customer-detail', customerId: 'cust_001' }))).toEqual({
      name: 'customer-detail',
      customerId: 'cust_001',
    });
    expect(parseRoute(serializeRoute({ name: 'review-queue-detail', reviewId: 'rev_001' }))).toEqual({
      name: 'review-queue-detail',
      reviewId: 'rev_001',
    });

    // detail keeps the parent nav item active (explicit + suffix rules)
    expect(isNavigationActive({ name: 'customer-detail', customerId: 'cust_001' }, 'customers')).toBe(true);
    expect(isNavigationActive({ name: 'order-detail', orderId: 'ord_001' }, 'orders')).toBe(true);
    expect(isNavigationActive({ name: 'review-queue-detail', reviewId: 'rev_001' }, 'review-queue')).toBe(true);
    expect(isNavigationActive({ name: 'business' }, 'business')).toBe(true);
    expect(isNavigationActive({ name: 'orders' }, 'customers')).toBe(false);
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
      'service-agent',
      'business-data',
      'scheduling',
      'evaluation',
      'business',
      'customers',
      'orders',
      'review-queue',
      'lumen',
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
