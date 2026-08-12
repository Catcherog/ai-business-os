import type {
  Lead,
  Customer,
  CommitResultV1,
  LeadStatus,
  CustomerStatus,
} from '@busos/contracts';

/**
 * A raw Feishu Base record as returned by the bitable API.
 *
 * This type lives BELOW the adapter boundary (D008/D017/D018): no upper layer
 * (BusinessRepository, GP-001, review UI) ever sees it as a business value.
 */
export interface FeishuRecord {
  record_id: string;
  fields: Record<string, unknown>;
}

/**
 * What a write method returns: the canonical domain object (after readback
 * verification) plus the contract-validated CommitResultV1.
 */
export type FeishuWriteOutcome<T> = {
  domain: T;
  commit: CommitResultV1;
};

export interface CustomerIdentityQuery {
  phone?: string | null;
  wechat?: string | null;
}

/**
 * The Feishu boundary as a port. BusinessRepository depends only on this
 * interface; the concrete implementation (real Feishu base or in-memory fake)
 * is injected. All Feishu-specific knowledge (tokens, table ids, field names,
 * HTTP) stays inside the implementation (D018).
 */
export interface FeishuAdapter {
  createLead(lead: Lead): Promise<FeishuWriteOutcome<Lead>>;
  getLead(leadId: string): Promise<Lead | null>;
  createCustomer(customer: Customer): Promise<FeishuWriteOutcome<Customer>>;
  getCustomer(customerId: string): Promise<Customer | null>;
  findCustomerByIdentity(identity: CustomerIdentityQuery): Promise<Customer | null>;
  linkLeadCustomer(leadId: string, customerId: string): Promise<Lead>;
  /**
   * Test-hygiene only: delete a single record by its exact Feishu `record_id`.
   * Used by the live E2E to clean up generated test records without touching
   * existing business data. Feishu-specific knowledge stays in the adapter.
   */
  deleteLead(recordId: string): Promise<boolean>;
  deleteCustomer(recordId: string): Promise<boolean>;
}

/* ----------------------------------------------------------------- input DTOs */

export interface LeadCreateInput {
  customer_id: string | null;
  source_session_id: string;
  source_candidate_id: string;
  service_type: string;
  budget_min?: number | null;
  budget_max?: number | null;
  preferred_date_text?: string | null;
  status?: LeadStatus;
}

export interface CustomerCreateInput {
  display_name: string;
  phone?: string | null;
  wechat?: string | null;
  status?: CustomerStatus;
}
