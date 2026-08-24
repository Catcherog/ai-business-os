/**
 * Small, typed hash router for the Operator Workspace.
 *
 * The route model is intentionally independent from the DOM so navigation can
 * be tested without a browser and later surfaces can register around the same
 * top-level shape without adding a second state machine.
 */

export type NavigationId = 'overview' | 'projects' | 'reviews' | 'runs' | 'service-agent' | 'business-data' | 'scheduling' | 'evaluation' | 'business' | 'customers' | 'orders' | 'review-queue' | 'lumen';

export type Route =
  | { name: 'overview' }
  | { name: 'projects' }
  | { name: 'project-detail'; projectId: string }
  | { name: 'reviews' }
  | { name: 'review-detail'; caseId: string }
  | { name: 'runs' }
  | { name: 'run-detail'; processId: string }
  | { name: 'service-agent' }
  | { name: 'business-data' }
  | { name: 'business-data-detail'; customerId: string }
  | { name: 'scheduling' }
  | { name: 'evaluation' }
  | { name: 'business' }
  | { name: 'customers' }
  | { name: 'customer-detail'; customerId: string }
  | { name: 'orders' }
  | { name: 'order-detail'; orderId: string }
  | { name: 'review-queue' }
  | { name: 'review-queue-detail'; reviewId: string }
  | { name: 'lumen' };

export const NAVIGATION: readonly { id: NavigationId; label: string; tag?: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'projects', label: 'Projects', tag: 'DEMO' },
  { id: 'reviews', label: 'Reviews', tag: 'DEMO' },
  { id: 'runs', label: 'Runs', tag: 'DEMO' },
  { id: 'service-agent', label: 'Service Agent', tag: 'DEMO' },
  { id: 'business-data', label: 'Business Data', tag: 'CONNECTED' },
  { id: 'scheduling', label: 'Scheduling', tag: 'CONNECTED' },
  { id: 'evaluation', label: 'Evaluation', tag: 'DEMO' },
  { id: 'business', label: 'Operations', tag: 'CONNECTED' },
  { id: 'customers', label: 'Customers', tag: 'CONNECTED' },
  { id: 'orders', label: 'Orders', tag: 'CONNECTED' },
  { id: 'review-queue', label: 'Review Queue', tag: 'CONNECTED' },
  { id: 'lumen', label: 'Lumen', tag: 'DEMO' },
] as const;

const DETAIL_ID = /^[A-Za-z0-9_-]+$/;

function validId(value: string | undefined): value is string {
  return Boolean(value && DETAIL_ID.test(value));
}

function pathFromHash(hash: string): string[] {
  const raw = hash.split('#', 2)[1] ?? '';
  const path = raw.split('?')[0].replace(/^\/+/, '');
  if (!path) return [];
  try {
    return path.split('/').map((part) => decodeURIComponent(part));
  } catch {
    return [];
  }
}

export function parseRoute(hash: string): Route {
  const parts = pathFromHash(hash);
  if (parts.length === 0 || (parts.length === 1 && parts[0] === 'overview')) {
    return { name: 'overview' };
  }
  if (parts.length === 1 && parts[0] === 'projects') return { name: 'projects' };
  if (parts.length === 2 && parts[0] === 'projects' && validId(parts[1])) {
    return { name: 'project-detail', projectId: parts[1] };
  }
  if (parts.length === 1 && parts[0] === 'reviews') return { name: 'reviews' };
  if (parts.length === 2 && parts[0] === 'reviews' && validId(parts[1])) {
    return { name: 'review-detail', caseId: parts[1] };
  }
  if (parts.length === 1 && parts[0] === 'runs') return { name: 'runs' };
  if (parts.length === 2 && parts[0] === 'runs' && validId(parts[1])) {
    return { name: 'run-detail', processId: parts[1] };
  }
  if (parts.length === 1 && parts[0] === 'service-agent') return { name: 'service-agent' };
  if (parts.length === 1 && parts[0] === 'business-data') return { name: 'business-data' };
  if (parts.length === 2 && parts[0] === 'business-data' && validId(parts[1])) {
    return { name: 'business-data-detail', customerId: parts[1] };
  }
  if (parts.length === 1 && parts[0] === 'scheduling') return { name: 'scheduling' };
  if (parts.length === 1 && parts[0] === 'evaluation') return { name: 'evaluation' };
  if (parts.length === 1 && parts[0] === 'business') return { name: 'business' };
  if (parts.length === 1 && parts[0] === 'customers') return { name: 'customers' };
  if (parts.length === 2 && parts[0] === 'customers' && validId(parts[1])) {
    return { name: 'customer-detail', customerId: parts[1] };
  }
  if (parts.length === 1 && parts[0] === 'orders') return { name: 'orders' };
  if (parts.length === 2 && parts[0] === 'orders' && validId(parts[1])) {
    return { name: 'order-detail', orderId: parts[1] };
  }
  if (parts.length === 1 && parts[0] === 'review-queue') return { name: 'review-queue' };
  if (parts.length === 2 && parts[0] === 'review-queue' && validId(parts[1])) {
    return { name: 'review-queue-detail', reviewId: parts[1] };
  }
  if (parts.length === 1 && parts[0] === 'lumen') return { name: 'lumen' };
  return { name: 'overview' };
}

function encodeId(value: string): string {
  return encodeURIComponent(value);
}

export function serializeRoute(route: Route): string {
  switch (route.name) {
    case 'overview': return '#/overview';
    case 'projects': return '#/projects';
    case 'project-detail': return `#/projects/${encodeId(route.projectId)}`;
    case 'reviews': return '#/reviews';
    case 'review-detail': return `#/reviews/${encodeId(route.caseId)}`;
    case 'runs': return '#/runs';
    case 'run-detail': return `#/runs/${encodeId(route.processId)}`;
    case 'service-agent': return '#/service-agent';
    case 'business-data': return '#/business-data';
    case 'business-data-detail': return `#/business-data/${encodeId(route.customerId)}`;
    case 'scheduling': return '#/scheduling';
    case 'evaluation': return '#/evaluation';
    case 'business': return '#/business';
    case 'customers': return '#/customers';
    case 'customer-detail': return `#/customers/${encodeId(route.customerId)}`;
    case 'orders': return '#/orders';
    case 'order-detail': return `#/orders/${encodeId(route.orderId)}`;
    case 'review-queue': return '#/review-queue';
    case 'review-queue-detail': return `#/review-queue/${encodeId(route.reviewId)}`;
    case 'lumen': return '#/lumen';
  }
}

export function isNavigationActive(route: Route, navigationId: NavigationId): boolean {
  if (navigationId === 'overview') return route.name === 'overview';
  if (navigationId === 'business-data') {
    return route.name === 'business-data' || route.name === 'business-data-detail';
  }
  if (navigationId === 'review-queue') {
    return route.name === 'review-queue' || route.name === 'review-queue-detail';
  }
  return route.name === navigationId || route.name === `${navigationId.slice(0, -1)}-detail`;
}

export interface RouterOptions {
  hash?: string;
  writeHash?: boolean;
}

export interface WorkspaceRouter {
  current(): Route;
  navigate(route: Route): void;
  subscribe(listener: (route: Route) => void): () => void;
  start(): () => void;
}

export function createRouter(options: RouterOptions = {}): WorkspaceRouter {
  const browserHash =
    typeof window !== 'undefined' && window?.location ? window.location.hash : '';
  let route = parseRoute(options.hash ?? browserHash);
  const listeners = new Set<(next: Route) => void>();
  const writeHash = options.writeHash ?? true;

  const emit = (next: Route): void => {
    route = next;
    for (const listener of listeners) listener(next);
  };

  return {
    current: () => route,
    navigate: (next) => {
      const hash = serializeRoute(next);
      if (writeHash && typeof window !== 'undefined' && window?.location && window.location.hash !== hash) {
        window.location.hash = hash;
      }
      emit(next);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: () => {
      if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
        return () => undefined;
      }
      const onHashChange = () => emit(parseRoute(window.location.hash));
      window.addEventListener('hashchange', onHashChange);
      return () => window.removeEventListener('hashchange', onHashChange);
    },
  };
}
