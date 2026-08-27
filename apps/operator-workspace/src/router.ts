/**
 * Small, typed hash router for the Operator Workspace.
 *
 * The route model is intentionally independent from the DOM so navigation can
 * be tested without a browser and later surfaces can register around the same
 * top-level shape without adding a second state machine.
 */

/**
 * Top-level product navigation. The legacy ids remain in this union so old
 * deep links and smoke seams can continue to parse while the sidebar presents
 * the unified V1 information architecture.
 */
export type NavigationId =
  | 'overview'
  | 'customers'
  | 'orders'
  | 'projects'
  | 'scheduling'
  | 'service-agent'
  | 'creative'
  | 'reviews'
  | 'automations'
  | 'evaluation'
  | 'integrations'
  | 'runs'
  | 'business-data'
  | 'business'
  | 'review-queue'
  | 'lumen';

export type Route =
  | { name: 'overview' }
  | { name: 'projects' }
  | { name: 'project-detail'; projectId: string }
  | { name: 'reviews' }
  | { name: 'review-detail'; caseId: string }
  | { name: 'runs' }
  | { name: 'run-detail'; processId: string }
  | { name: 'service-agent' }
  | { name: 'creative' }
  | { name: 'automations' }
  | { name: 'integrations' }
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

export type NavigationItem = { id: NavigationId; label: string; tag?: string };

/** Final V1 sidebar grouping. Legacy routes are deliberately not exposed here. */
export const NAVIGATION_GROUPS: readonly {
  id: 'business' | 'ai' | 'system';
  label: string;
  items: readonly NavigationItem[];
}[] = [
  {
    id: 'business',
    label: 'Business',
    items: [
      { id: 'customers', label: 'Customers', tag: 'DEMO' },
      { id: 'orders', label: 'Orders', tag: 'DEMO' },
      { id: 'projects', label: 'Projects', tag: 'DEMO' },
      { id: 'scheduling', label: 'Scheduling', tag: 'DEMO' },
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    items: [
      { id: 'service-agent', label: 'Service Agent', tag: 'DEMO' },
      { id: 'creative', label: 'Creative', tag: 'DEMO' },
      { id: 'reviews', label: 'Reviews', tag: 'DEMO' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { id: 'automations', label: 'Automations', tag: 'DEMO' },
      { id: 'evaluation', label: 'Evaluation', tag: 'DEMO' },
      { id: 'integrations', label: 'Integrations', tag: 'STATUS' },
    ],
  },
] as const;

export const NAVIGATION: readonly NavigationItem[] = [
  { id: 'overview', label: 'Overview' },
  ...NAVIGATION_GROUPS.flatMap((group) => group.items),
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
  if (parts.length === 1 && parts[0] === 'creative') return { name: 'creative' };
  if (parts.length === 1 && parts[0] === 'automations') return { name: 'automations' };
  if (parts.length === 1 && parts[0] === 'integrations') return { name: 'integrations' };
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
    case 'creative': return '#/creative';
    case 'automations': return '#/automations';
    case 'integrations': return '#/integrations';
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
  if (navigationId === 'reviews') return route.name === 'reviews' || route.name === 'review-detail';
  if (navigationId === 'business-data') {
    return route.name === 'business-data' || route.name === 'business-data-detail';
  }
  if (navigationId === 'review-queue') {
    return route.name === 'review-queue' || route.name === 'review-queue-detail';
  }
  if (navigationId === 'creative') return route.name === 'creative';
  if (navigationId === 'automations') return route.name === 'automations';
  if (navigationId === 'integrations') return route.name === 'integrations';
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
