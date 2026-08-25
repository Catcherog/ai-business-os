import type {
  AvailabilitySlot,
  Project,
  ProjectAssignment,
  ProjectRequirement,
  Resource,
} from '@busos/contracts';
import {
  createOperationsRepositoryFromEnv,
  createReviewQueueStore,
  buildDashboard,
  type BusinessPatchResult,
  type OperationsAuditEvent,
  type OperationsCustomer,
  type OperationsDashboard,
  type OperationsOrder,
  type OperationsRepositoryPort,
  type OperationsReviewCase,
  type ReviewDecision,
  type ReviewDecideOptions,
  type ReviewQueueListFilter,
  type ReviewQueueListResult,
  type ReviewQueueStore,
  ReviewAlreadyDecidedError,
  ReviewInvalidDecisionError,
  ReviewNotFoundError,
} from '@busos/business-repository';

const SOURCE = 'FEISHU_NEW_BASE' as const;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_CURSOR = 1_000;
const MAX_AGGREGATE = 500;

export interface BusinessDataResponse<T> {
  statusCode: number;
  body: BusinessDataEnvelope<T>;
}

export type BusinessDataEnvelope<T> =
  | { mode: 'BLOCKED'; reason: string }
  | { mode: 'CONNECTED'; source: typeof SOURCE; data: T; nextCursor?: string | null }
  | { mode: 'CONNECTED'; source: typeof SOURCE; error: { code: string; message: string } };

export interface BusinessDataApi {
  readonly repository: OperationsRepositoryPort | null;
  readonly reviewQueueAvailable: boolean;
  listProjects(query?: PageQuery): Promise<BusinessDataResponse<Project[]>>;
  listResources(query?: PageQuery & { type?: string; status?: string }): Promise<BusinessDataResponse<Resource[]>>;
  listAvailability(resourceKey: string, query: { start?: string; end?: string; limit?: string | number }): Promise<BusinessDataResponse<AvailabilitySlot[]>>;
  getProjectContext(projectId: string): Promise<BusinessDataResponse<ProjectContext | null>>;
  getOverview(): Promise<BusinessDataResponse<OperationsDashboard>>;
  listCustomers(query?: PageQuery & { status?: string }): Promise<BusinessDataResponse<OperationsCustomer[]>>;
  getCustomer(customerId: string): Promise<BusinessDataResponse<OperationsCustomer | null>>;
  listOrders(query?: PageQuery & { customerId?: string; status?: string }): Promise<BusinessDataResponse<OperationsOrder[]>>;
  getOrder(orderId: string): Promise<BusinessDataResponse<OperationsOrder | null>>;
  listReviewQueue(query?: ReviewQueueListFilter): Promise<BusinessDataResponse<ReviewQueueListResult>>;
  getReviewQueueItem(reviewId: string): Promise<BusinessDataResponse<OperationsReviewCase | null>>;
  decideReviewQueueItem(
    reviewId: string,
    decision: ReviewDecision,
    options?: ReviewDecideOptions,
  ): Promise<BusinessDataResponse<OperationsReviewCase>>;
  listAuditEvents(limit?: number): Promise<BusinessDataResponse<OperationsAuditEvent[]>>;
  patchBusinessFields(input: {
    entityType: string;
    entityId: string;
    patch: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<BusinessDataResponse<BusinessPatchResult>>;
}

export interface PageQuery {
  limit?: string | number;
  cursor?: string | number;
}

export interface ProjectContext {
  project: Project;
  requirements: ProjectRequirement[];
  assignments: ProjectAssignment[];
  resources: Resource[];
}

export interface BusinessDataApiOptions {
  env?: Record<string, string | undefined>;
  repository?: OperationsRepositoryPort;
  reviewQueue?: ReviewQueueStore;
}

class BusinessDataInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessDataInputError';
  }
}

function parsePositiveInteger(value: string | number | undefined, fallback: number, label: string): number {
  if (value === undefined || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new BusinessDataInputError(`${label} must be a non-negative integer`);
  return parsed;
}

function pageParams(query: PageQuery | undefined): { limit: number; cursor: number } {
  const limit = parsePositiveInteger(query?.limit, DEFAULT_LIMIT, 'limit');
  const cursor = parsePositiveInteger(query?.cursor, 0, 'cursor');
  if (limit < 1 || limit > MAX_LIMIT) throw new BusinessDataInputError(`limit must be between 1 and ${MAX_LIMIT}`);
  if (cursor > MAX_CURSOR) throw new BusinessDataInputError(`cursor must be at most ${MAX_CURSOR}`);
  return { limit, cursor };
}

function requiredId(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200 || /\s/.test(normalized) || /^rec[a-z0-9]/i.test(normalized)) {
    throw new BusinessDataInputError(`${label} must be a canonical id`);
  }
  return normalized;
}

function page<T>(items: T[], limit: number, cursor: number): { data: T[]; nextCursor: string | null } {
  const data = items.slice(cursor, cursor + limit);
  const nextCursor = cursor + limit < items.length ? String(cursor + limit) : null;
  return { data, nextCursor };
}

function blocked<T>(reason: string): BusinessDataResponse<T> {
  return { statusCode: 200, body: { mode: 'BLOCKED', reason } };
}

function invalid<T>(message: string): BusinessDataResponse<T> {
  return { statusCode: 400, body: { mode: 'CONNECTED', source: SOURCE, error: { code: 'INVALID_REQUEST', message } } };
}

function failed<T>(): BusinessDataResponse<T> {
  return {
    statusCode: 503,
    body: {
      mode: 'CONNECTED',
      source: SOURCE,
      error: { code: 'BUSINESS_DATA_READ_FAILED', message: 'Connected business data read failed.' },
    },
  };
}

function normalizeConfigurationError(error: unknown): string {
  if (error instanceof Error && error.message.startsWith('Missing required environment variable:')) {
    return error.message;
  }
  if (error instanceof Error && error.message.includes('differ')) return error.message;
  return 'Server-side Feishu target Base configuration is unavailable.';
}

function reviewError(code: string, message: string, statusCode = 422): BusinessDataResponse<never> {
  return {
    statusCode,
    body: { mode: 'CONNECTED', source: SOURCE, error: { code, message } },
  } as BusinessDataResponse<never>;
}

export function createBusinessDataApi(options: BusinessDataApiOptions = {}): BusinessDataApi {
  let repository = options.repository ?? null;
  let configurationReason: string | null = null;
  if (!repository) {
    try {
      repository = createOperationsRepositoryFromEnv(options.env ?? process.env);
    } catch (error) {
      configurationReason = normalizeConfigurationError(error);
    }
  }
  // The review queue is a local store (not a Feishu resource), so it is available
  // even when the server-side Feishu target Base is unconfigured. Its 562 cases
  // are synthetic/hash-only (the live migration artifact is gated). Feishu-backed
  // reads below remain BLOCKED without configuration.
  const reviewQueue = options.reviewQueue ?? createReviewQueueStore({ synthetic: true });

  async function read<T>(call: () => Promise<T>): Promise<BusinessDataResponse<T>> {
    if (!repository) return blocked<T>(configurationReason ?? 'Server-side Feishu target Base configuration is unavailable.');
    try {
      return { statusCode: 200, body: { mode: 'CONNECTED', source: SOURCE, data: await call() } };
    } catch {
      return failed<T>();
    }
  }

  async function readPage<T>(
    call: () => Promise<T[]>,
    limit: number,
    cursor: number,
  ): Promise<BusinessDataResponse<T[]>> {
    if (!repository) return blocked<T[]>(configurationReason ?? 'Server-side Feishu target Base configuration is unavailable.');
    try {
      const result = page(await call(), limit, cursor);
      return {
        statusCode: 200,
        body: { mode: 'CONNECTED', source: SOURCE, data: result.data, nextCursor: result.nextCursor },
      };
    } catch {
      return failed<T[]>();
    }
  }

  return {
    repository,
    reviewQueueAvailable: true,
    listProjects: async (query) => {
      try {
        const { limit, cursor } = pageParams(query);
        return readPage(
          () => repository!.listProjects({ limit: cursor + limit + 1 }),
          limit,
          cursor,
        );
      } catch (error) {
        return invalid<Project[]>(error instanceof Error ? error.message : 'Invalid request');
      }
    },
    listResources: async (query) => {
      try {
        const { limit, cursor } = pageParams(query);
        return readPage(
          () => repository!.listResources({
            type: query?.type,
            status: query?.status,
            limit: cursor + limit + 1,
          }),
          limit,
          cursor,
        );
      } catch (error) {
        return invalid<Resource[]>(error instanceof Error ? error.message : 'Invalid request');
      }
    },
    listAvailability: async (resourceKey, query) => {
      try {
        const key = requiredId(resourceKey, 'resourceKey');
        const start = query.start?.trim();
        const end = query.end?.trim();
        if (!start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))) {
          throw new BusinessDataInputError('start and end must be valid timestamps');
        }
        const limit = parsePositiveInteger(query.limit, DEFAULT_LIMIT, 'limit');
        if (limit < 1 || limit > MAX_LIMIT) throw new BusinessDataInputError(`limit must be between 1 and ${MAX_LIMIT}`);
        return await read(async () => (await repository!.listAvailability([key], { start, end })).slice(0, limit));
      } catch (error) {
        return invalid<AvailabilitySlot[]>(error instanceof Error ? error.message : 'Invalid request');
      }
    },
    getProjectContext: async (projectId) => {
      try {
        const id = requiredId(projectId, 'projectId');
        return await read(async () => {
          const projects = await repository!.listProjects({ limit: MAX_LIMIT });
          const project = projects.find((item) => item.project_id === id);
          if (!project) return null;
          const [requirements, assignments, resources] = await Promise.all([
            repository!.listProjectRequirements(id),
            repository!.listAssignments(id),
            repository!.listResources({ limit: MAX_LIMIT }),
          ]);
          const resourceKeys = new Set(assignments.map((assignment) => assignment.resource_key));
          return {
            project,
            requirements: requirements.slice(0, MAX_LIMIT),
            assignments: assignments.slice(0, MAX_LIMIT),
            resources: resources.filter((resource) => resourceKeys.has(resource.resource_key)).slice(0, MAX_LIMIT),
          };
        });
      } catch (error) {
        return invalid<ProjectContext | null>(error instanceof Error ? error.message : 'Invalid request');
      }
    },
    getOverview: async () => {
      try {
        return await read(async () => {
          const [customers, projects, resources, orders, reviews] = await Promise.all([
            repository!.listCustomers({ limit: MAX_AGGREGATE }),
            repository!.listProjects({ limit: MAX_AGGREGATE }),
            repository!.listResources({ limit: MAX_AGGREGATE }),
            repository!.listOrders({ limit: MAX_AGGREGATE }),
            repository!.listReviewQueue({ limit: MAX_AGGREGATE }),
          ]);
          return buildDashboard({
            customers,
            projects,
            resources,
            orders,
            reviews: reviews.data,
            syntheticReviewData: reviewQueue.synthetic,
          });
        });
      } catch (error) {
        return invalid<OperationsDashboard>(error instanceof Error ? error.message : 'Invalid request');
      }
    },
    listCustomers: async (query) => {
      try {
        const { limit, cursor } = pageParams(query);
        return readPage(
          () => repository!.listCustomers({ limit: cursor + limit + 1, status: query?.status }),
          limit,
          cursor,
        );
      } catch (error) {
        return invalid<OperationsCustomer[]>(error instanceof Error ? error.message : 'Invalid request');
      }
    },
    getCustomer: async (customerId) => {
      try {
        const id = requiredId(customerId, 'customerId');
        return await read(() => repository!.getCustomer(id));
      } catch (error) {
        return invalid<OperationsCustomer | null>(error instanceof Error ? error.message : 'Invalid request');
      }
    },
    listOrders: async (query) => {
      try {
        const { limit, cursor } = pageParams(query);
        return readPage(
          () => repository!.listOrders({ limit: cursor + limit + 1, customerId: query?.customerId, status: query?.status }),
          limit,
          cursor,
        );
      } catch (error) {
        return invalid<OperationsOrder[]>(error instanceof Error ? error.message : 'Invalid request');
      }
    },
    getOrder: async (orderId) => {
      try {
        const id = requiredId(orderId, 'orderId');
        return await read(() => repository!.getOrder(id));
      } catch (error) {
        return invalid<OperationsOrder | null>(error instanceof Error ? error.message : 'Invalid request');
      }
    },
    listReviewQueue: async (query) => {
      try {
        return { statusCode: 200, body: { mode: 'CONNECTED', source: SOURCE, data: reviewQueue.list(query) } };
      } catch {
        return failed<ReviewQueueListResult>();
      }
    },
    getReviewQueueItem: async (reviewId) => {
      try {
        const found = reviewQueue.get(reviewId);
        return {
          statusCode: 200,
          body: found
            ? { mode: 'CONNECTED', source: SOURCE, data: found }
            : { mode: 'CONNECTED', source: SOURCE, data: null },
        };
      } catch {
        return failed<OperationsReviewCase | null>();
      }
    },
    decideReviewQueueItem: async (reviewId, decision, options) => {
      try {
        const updated = reviewQueue.decide(reviewId, decision, options);
        return { statusCode: 200, body: { mode: 'CONNECTED', source: SOURCE, data: updated } };
      } catch (error) {
        if (error instanceof ReviewNotFoundError) return reviewError('REVIEW_NOT_FOUND', error.message, 404);
        if (error instanceof ReviewAlreadyDecidedError) return reviewError('REVIEW_ALREADY_DECIDED', error.message);
        if (error instanceof ReviewInvalidDecisionError) return reviewError('REVIEW_INVALID_DECISION', error.message);
        return failed<OperationsReviewCase>();
      }
    },
    listAuditEvents: async (limit) => {
      try {
        const events: OperationsAuditEvent[] = [];
        const items = reviewQueue.list({ limit: MAX_AGGREGATE }).data;
        for (const item of items) {
          const full = reviewQueue.get(item.review_id);
          if (full) events.push(...full.audit);
        }
        events.sort((a, b) => b.at.localeCompare(a.at));
        const capped = events.slice(0, Math.max(0, limit ?? 200));
        return { statusCode: 200, body: { mode: 'CONNECTED', source: SOURCE, data: capped } };
      } catch {
        return failed<OperationsAuditEvent[]>();
      }
    },
    patchBusinessFields: async (input) => {
      // Server-only write path. Fails closed without a connected Feishu write
      // adapter (this batch has none), but validates input allowlists first.
      if (!repository) {
        return blocked<BusinessPatchResult>('Server-side Feishu target Base configuration is unavailable.');
      }
      try {
        const result = await repository.patchBusinessFields(input);
        const statusCode = result.status === 'APPLIED' ? 200 : result.status === 'NOT_FOUND' ? 404 : 422;
        return { statusCode, body: { mode: 'CONNECTED', source: SOURCE, data: result } };
      } catch {
        return failed<BusinessPatchResult>();
      }
    },
  };
}

