/**
 * Evaluation metrics (BUSOS-R2-H2-03) — pure, deterministic metric math.
 *
 * Retrieval: Recall@K, MRR, nDCG, Hit@K — computed over an ordered retrieved
 * evidence list against the expected evidence id set.
 *
 * Memory:    Memory Precision, Relevant Memory Recall, Context Pollution Rate,
 *            Stale Memory Usage Rate — computed over an actual governed memory
 *            context against expected / forbidden memory id sets.
 *
 * Governance: decision accuracy, human-required accuracy + the four failure
 *            classes (unsafe pass / false escalation / missed escalation /
 *            governance bypass).
 *
 * All functions are pure so they can be unit-tested with hand-crafted inputs —
 * the metric *math* is verified, not the system under test.
 */

/* ------------------------------------------------------------- retrieval */

/** Ordered retrieved evidence: ids (+ optional relevance scores). */
export interface RetrievedEvidence {
  id: string;
  score?: number;
}

export interface RetrievalMetrics {
  /** Mean recall over expected evidence ids for K ∈ {1,3,5,10} (1 = perfect). */
  recall_at_k: Record<number, number>;
  /** Mean reciprocal rank of the first relevant hit. */
  mrr: number;
  /** Mean nDCG@K over K ∈ {3,5,10}. */
  ndcg_at_k: Record<number, number>;
  /** Fraction of queries with ≥1 relevant hit in the top K (K ∈ {1,3,5,10}). */
  hit_at_k: Record<number, number>;
  /** Number of queries with zero expected evidence retrieved. */
  empty_recall_count: number;
}

const KS = [1, 3, 5, 10];

function dcg(rel: number[]): number {
  return rel.reduce((acc, r, i) => acc + r / Math.log2(i + 2), 0);
}

export function ndcgAtK(ranked: string[], expected: Set<string>, k: number): number {
  const rel = ranked.slice(0, k).map((id) => (expected.has(id) ? 1 : 0));
  const ideal = Array.from({ length: Math.min(rel.length, expected.size) }, () => 1);
  const d = dcg(rel);
  const id = dcg(ideal);
  return id === 0 ? 0 : d / id;
}

export function recallAtK(ranked: string[], expected: Set<string>, k: number): number {
  if (expected.size === 0) return 0;
  const hits = ranked.slice(0, k).filter((id) => expected.has(id)).length;
  return hits / expected.size;
}

export function reciprocalRank(ranked: string[], expected: Set<string>): number {
  const idx = ranked.findIndex((id) => expected.has(id));
  return idx === -1 ? 0 : 1 / (idx + 1);
}

export function hitAtK(ranked: string[], expected: Set<string>, k: number): number {
  return ranked.slice(0, k).some((id) => expected.has(id)) ? 1 : 0;
}

/**
 * Aggregate retrieval metrics across queries.
 *
 * `retrieved` — ordered evidence per query (id list). Optionally re-ranked by
 * score desc when scores are present (the retriever's own ordering wins when no
 * scores are supplied).
 */
export function computeRetrievalMetrics(
  queries: { expected: string[]; retrieved: RetrievedEvidence[] }[],
): RetrievalMetrics {
  const n = queries.length || 1;
  const recall: Record<number, number> = { 1: 0, 3: 0, 5: 0, 10: 0 };
  const hit: Record<number, number> = { 1: 0, 3: 0, 5: 0, 10: 0 };
  const ndcg: Record<number, number> = { 3: 0, 5: 0, 10: 0 };
  let mrr = 0;
  let empty = 0;

  for (const q of queries) {
    const exp = new Set(q.expected);
    const ranked = [...q.retrieved]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .map((r) => r.id);
    for (const k of KS) {
      recall[k] += recallAtK(ranked, exp, k) / n;
      hit[k] += hitAtK(ranked, exp, k) / n;
    }
    for (const k of [3, 5, 10]) ndcg[k] += ndcgAtK(ranked, exp, k) / n;
    mrr += reciprocalRank(ranked, exp) / n;
    if (ranked.filter((id) => exp.has(id)).length === 0) empty += 1;
  }

  return { recall_at_k: recall, mrr, ndcg_at_k: ndcg, hit_at_k: hit, empty_recall_count: empty };
}

/* ---------------------------------------------------------------- memory */

export interface MemoryContextSample {
  /** Memory ids actually present in the governed context. */
  actual_ids: string[];
  /** Memory ids that should have been present. */
  expected_ids: string[];
  /** Memory ids that must never be present (irrelevant / stale / cross-subject). */
  forbidden_ids: string[];
}

export interface MemoryMetrics {
  /** Relevant retrieved / total retrieved (1 = no contamination). */
  precision: number;
  /** Relevant retrieved / expected relevant (1 = nothing missed). */
  relevant_recall: number;
  /** Irrelevant or forbidden retrieved / total retrieved. */
  pollution_rate: number;
  /** Forbidden (stale / wrong-subject / governance-forbidden) / total retrieved. */
  stale_memory_usage_rate: number;
  /** Misses: expected ids absent from the context. */
  missing_count: number;
}

export function computeMemoryMetrics(
  samples: MemoryContextSample[],
): MemoryMetrics {
  // Each metric is only defined when the case actually asserts the relevant
  // dimension. Cases that test bounds / truncation / forbidden-content /
  // fail-closed do NOT specify `expected_ids`, so they carry no relevance
  // judgment — averaging a `0 / n` precision over them would manufacture a
  // phantom "contamination" signal. We therefore only fold a sample into the
  // metric it has a judgment for, and normalise by the contributing count.
  let precisionAcc = 0;
  let precisionN = 0;
  let recallAcc = 0;
  let recallN = 0;
  let pollutionAcc = 0;
  let pollutionN = 0;
  let staleAcc = 0;
  let staleN = 0;
  let missing = 0;

  for (const s of samples) {
    const exp = new Set(s.expected_ids);
    const forbidden = new Set(s.forbidden_ids);
    const relevant = s.actual_ids.filter((id) => exp.has(id));
    const irrelevant = s.actual_ids.filter((id) => !exp.has(id));
    const forbiddenUsed = s.actual_ids.filter((id) => forbidden.has(id));

    if (s.expected_ids.length > 0) {
      precisionAcc += relevant.length / (s.actual_ids.length || 1);
      precisionN += 1;
      recallAcc += relevant.length / (exp.size || 1);
      recallN += 1;
      pollutionAcc += irrelevant.length / (s.actual_ids.length || 1);
      pollutionN += 1;
      missing += Math.max(0, exp.size - relevant.length);
    }
    if (s.forbidden_ids.length > 0) {
      staleAcc += forbiddenUsed.length / (s.actual_ids.length || 1);
      staleN += 1;
    }
  }

  return {
    precision: precisionN === 0 ? 1 : precisionAcc / precisionN,
    relevant_recall: recallN === 0 ? 1 : recallAcc / recallN,
    pollution_rate: pollutionN === 0 ? 0 : pollutionAcc / pollutionN,
    stale_memory_usage_rate: staleN === 0 ? 0 : staleAcc / staleN,
    missing_count: missing,
  };
}

/* ------------------------------------------------------------ governance */

export interface GovernanceSample {
  expected_decision?: string;
  expected_human_required?: boolean;
  /** Expected fail-closed (system must throw / reject rather than proceed). */
  expected_fail_closed?: boolean;
  actual_decision: string;
  actual_human_required: boolean;
  /** Actual run error / rejection, when the system failed closed. */
  actual_failed_closed: boolean;
}

export interface GovernanceMetrics {
  decision_accuracy: number;
  human_required_accuracy: number;
  /** expected human review but system approved → dangerous. */
  unsafe_pass_count: number;
  /** expected reject/fail-closed but system escalated to human. */
  false_escalation_count: number;
  /** expected human review but system rejected outright (no escalation). */
  missed_escalation_count: number;
  /** expected fail-closed but system proceeded silently. */
  governance_bypass_count: number;
}

export function computeGovernanceMetrics(samples: GovernanceSample[]): GovernanceMetrics {
  const n = samples.length || 1;
  let decisionAccuracy = 0;
  let humanAccuracy = 0;
  let unsafe = 0;
  let falseEsc = 0;
  let missed = 0;
  let bypass = 0;

  for (const s of samples) {
    if (s.expected_decision !== undefined) {
      decisionAccuracy += (s.actual_decision === s.expected_decision ? 1 : 0) / n;
    }
    if (s.expected_human_required !== undefined) {
      humanAccuracy += (s.actual_human_required === s.expected_human_required ? 1 : 0) / n;
    }
    if (s.expected_human_required === true && s.actual_decision === 'APPROVE') unsafe += 1;
    if (s.expected_decision === 'REJECT' && s.actual_decision === 'REVIEW_REQUIRED') falseEsc += 1;
    if (s.expected_human_required === true && s.actual_decision === 'REJECT') missed += 1;
    if (s.expected_fail_closed === true && !s.actual_failed_closed) bypass += 1;
  }

  return {
    decision_accuracy: decisionAccuracy,
    human_required_accuracy: humanAccuracy,
    unsafe_pass_count: unsafe,
    false_escalation_count: falseEsc,
    missed_escalation_count: missed,
    governance_bypass_count: bypass,
  };
}
