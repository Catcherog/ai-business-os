import type { Project } from '@busos/contracts';
import type { OperationsCustomer, OperationsOrder } from './operations-customer.js';
import type { OperationsReviewSummary } from './operations-review-queue.js';
import type { Resource } from '@busos/contracts';

export interface OperationsProjectSummary {
  project_id: string;
  title: string;
  project_type: string;
  status: Project['status'];
  scheduled_date: string | null;
  customer_id: string;
}

export interface OperationsDashboard {
  generated_at: string;
  /** True when the review queue is populated with deterministic synthetic cases
   * (the live 562-record migration artifact is hash-redacted and not in this
   * worktree). Honest signal, never hidden from the caller. */
  synthetic_review_data: boolean;
  counts: {
    customers: number;
    projects: number;
    orders: number;
    resources: number;
    reviews_pending: number;
    reviews_resolved: number;
  };
  project_status: Record<string, number>;
  order_status: Record<string, number>;
  resource_status: Record<string, number>;
  reviews_by_reason: Record<string, number>;
  recent_projects: OperationsProjectSummary[];
  recent_orders: OperationsOrder[];
  pending_reviews_sample: OperationsReviewSummary[];
}

export interface BuildDashboardInput {
  customers: OperationsCustomer[];
  projects: Project[];
  resources: Resource[];
  orders: OperationsOrder[];
  reviews: OperationsReviewSummary[];
  syntheticReviewData: boolean;
  generatedAt?: string;
  recentLimit?: number;
}

function tally<T extends string>(items: { status: T }[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const key = item.status;
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

export function buildDashboard(input: BuildDashboardInput): OperationsDashboard {
  const generatedAt = input.generatedAt ?? new Date(0).toISOString();
  const pending = input.reviews.filter((r) => r.status === 'PENDING');
  const resolved = input.reviews.length - pending.length;
  const reviewsByReason: Record<string, number> = {};
  for (const review of input.reviews) {
    reviewsByReason[review.reason] = (reviewsByReason[review.reason] ?? 0) + 1;
  }
  const recentLimit = input.recentLimit ?? 8;
  return {
    generated_at: generatedAt,
    synthetic_review_data: input.syntheticReviewData,
    counts: {
      customers: input.customers.length,
      projects: input.projects.length,
      orders: input.orders.length,
      resources: input.resources.length,
      reviews_pending: pending.length,
      reviews_resolved: resolved,
    },
    project_status: tally(input.projects),
    order_status: tally(input.orders),
    resource_status: tally(input.resources.map((r) => ({ status: r.cooperation_status }))),
    reviews_by_reason: reviewsByReason,
    recent_projects: input.projects
      .slice()
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, recentLimit)
      .map((project) => ({
        project_id: project.project_id,
        title: project.title,
        project_type: project.project_type,
        status: project.status,
        scheduled_date: project.scheduled_date,
        customer_id: project.customer_id,
      })),
    recent_orders: input.orders
      .slice()
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, recentLimit),
    pending_reviews_sample: pending.slice(0, recentLimit),
  };
}
