/**
 * Small, typed hash router for the Operator Workspace.
 *
 * The route model is intentionally independent from the DOM so navigation can
 * be tested without a browser and later surfaces can register around the same
 * top-level shape without adding a second state machine.
 */

export type NavigationId = 'overview' | 'projects' | 'reviews' | 'runs';

export type Route =
  | { name: 'overview' }
  | { name: 'projects' }
  | { name: 'project-detail'; projectId: string }
  | { name: 'reviews' }
  | { name: 'review-detail'; caseId: string }
  | { name: 'runs' }
  | { name: 'run-detail'; processId: string };

export const NAVIGATION: readonly { id: NavigationId; label: string; tag?: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'projects', label: 'Projects', tag: 'DEMO' },
  { id: 'reviews', label: 'Reviews', tag: 'DEMO' },
  { id: 'runs', label: 'Runs', tag: 'DEMO' },
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
  }
}

export function isNavigationActive(route: Route, navigationId: NavigationId): boolean {
  if (navigationId === 'overview') return route.name === 'overview';
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
