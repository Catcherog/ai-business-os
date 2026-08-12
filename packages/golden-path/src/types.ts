import type {
  LeadCandidateV1,
  GovernanceResultV1,
  Lead,
  Customer,
  CommitResultV1,
} from '@busos/contracts';
// LeadCreateInput / CustomerCreateInput / CustomerIdentityQuery are the
// repository DTOs, owned by @busos/business-repository (not the frozen contract
// package). The orchestration depends on them only through the repository port.
import type {
  CustomerIdentityQuery,
  LeadCreateInput,
  CustomerCreateInput,
} from '@busos/business-repository';
import type { AgentIntentId } from '@busos/service-agent-candidate';

/**
 * Repository surface the golden-path orchestration depends on.
 *
 * Duck-typed: satisfied by `BusinessRepository` (P1-03) and by the test-side
 * `CountingBusinessRepository`. The application layer never sees Feishu
 * specifics (D017/D018): only these six canonical operations are used.
 */
export interface GoldenPathRepository {
  createLead(input: LeadCreateInput): Promise<{ lead: Lead; commit: CommitResultV1 }>;
  getLead(leadId: string): Promise<Lead | null>;
  createCustomer(input: CustomerCreateInput): Promise<{ customer: Customer; commit: CommitResultV1 }>;
  getCustomer(customerId: string): Promise<Customer | null>;
  findCustomerByIdentity(identity: CustomerIdentityQuery): Promise<Customer | null>;
  linkLeadCustomer(leadId: string, customerId: string): Promise<Lead>;
}

/** Final outcome status of a golden-path run. */
export type GoldenPathStatus = 'SUCCESS' | 'BLOCKED' | 'FAILED';

/** Repository write counters, used by tests to prove "repository writes = 0". */
export interface WriteCounts {
  lead: number;
  customer: number;
  link: number;
}

/**
 * Canonical result of a golden-path execution.
 *
 * `status` is fail-closed: it is only `SUCCESS` when every hard condition
 * below actually held (governance permitted write, customer resolved/created
 * with VERIFIED commit, lead committed with VERIFIED readback, and — when a
 * customer exists — the lead was linked). A write that succeeds but fails
 * readback is reported as `FAILED`, never `SUCCESS` (D019).
 */
export interface GoldenPathResult {
  status: GoldenPathStatus;
  candidate?: LeadCandidateV1;
  governance?: GovernanceResultV1;
  customer?: Customer | null;
  customerCommit?: CommitResultV1;
  lead?: Lead | null;
  leadCommit?: CommitResultV1;
  writes: WriteCounts;
  failureReason?: string;
}

/** Raw consultation entry. The orchestration only consumes `text`. */
export interface GoldenPathInput {
  text: string;
  session?: { conversationId?: string; runId?: string };
  /** Service Agent intent id fed to the candidate builder (default I02). */
  intent?: AgentIntentId;
  intentConfidence?: number;
}

export type CandidateBuilder = (input: GoldenPathInput) => LeadCandidateV1;
export type GovernanceFn = (candidate: LeadCandidateV1) => GovernanceResultV1;

/** Dependency-injected collaborators for `executeGoldenPath`. */
export interface GoldenPathDeps {
  candidateBuilder: CandidateBuilder;
  governance: GovernanceFn;
  businessRepository: GoldenPathRepository;
}
