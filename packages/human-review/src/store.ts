import type { ReviewCase } from './types.js';

/**
 * Minimal task-local review store (task §8).
 *
 * This slice does not require production-grade review persistence/recovery, so
 * an in-memory map is sufficient for the presentation layer. It is explicitly
 * NOT a generic ReviewRepository platform.
 */
export class InMemoryReviewStore {
  private readonly cases = new Map<string, ReviewCase>();

  put(reviewCase: ReviewCase): void {
    this.cases.set(reviewCase.case_id, reviewCase);
  }

  get(caseId: string): ReviewCase | null {
    return this.cases.get(caseId) ?? null;
  }

  list(): ReviewCase[] {
    return [...this.cases.values()];
  }
}
