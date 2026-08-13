import type {
  AgentRun,
  CommitResultV1,
  Customer,
  GovernanceResultV1,
  Lead,
  LeadCandidateV1,
  Project,
  Session,
  Task,
} from '../src/index.js';

/**
 * Canonical examples.
 *
 * The LeadCandidateV1 example is the GP-001 consultation described in
 * project-control/00-CHARTER.md and 04-INTERFACES.md §1:
 * "我想下个月拍一套新中式写真，预算大概 4000 元。"
 */

export const canonicalLeadCandidate: LeadCandidateV1 = {
  version: 'lead_candidate.v1',
  candidate_id: 'cand_0001',
  session_id: 'sess_0001',
  agent_run_id: 'run_0001',
  intent: {
    type: 'portrait_consultation',
    confidence: 0.94,
  },
  customer_candidate: {
    name: null,
    phone: null,
    wechat: null,
  },
  requirement: {
    service_type: '新中式写真',
    budget_min: null,
    budget_max: 4000,
    preferred_date_text: '下个月',
    notes: null,
  },
  evidence: [
    {
      field: 'requirement.budget_max',
      source_text: '预算大概4000',
    },
    {
      field: 'requirement.service_type',
      source_text: '拍一套新中式写真',
    },
  ],
  governance: {
    status: 'PENDING_REVIEW',
    risk_level: 'R0',
    missing_fields: ['customer_candidate.name', 'customer_candidate.phone'],
  },
  created_at: '2026-08-11T10:00:00.000Z',
};

export const canonicalGovernanceResult: GovernanceResultV1 = {
  version: 'governance_result.v1',
  candidate_id: 'cand_0001',
  decision: 'REVIEW_REQUIRED',
  issues: [
    {
      code: 'CUSTOMER_IDENTITY_MISSING',
      field: 'customer_candidate',
    },
  ],
  customer_resolution: {
    status: 'NOT_REQUIRED',
    customer_id: null,
  },
  normalized_data: {
    service_type: '新中式写真',
    budget_max: 4000,
  },
  created_at: '2026-08-11T10:00:01.000Z',
};

export const canonicalCommitResult: CommitResultV1 = {
  version: 'commit_result.v1',
  status: 'COMMITTED',
  domain_object: 'lead',
  domain_id: 'lead_0001',
  storage: 'feishu',
  external_record_id: 'recABC123',
  write_status: 'SUCCESS',
  readback_status: 'VERIFIED',
  errors: [],
};

export const canonicalSession: Session = {
  session_id: 'sess_0001',
  user_id: null,
  channel: 'web',
  status: 'OPEN',
  created_at: '2026-08-11T09:59:00.000Z',
  updated_at: '2026-08-11T10:00:00.000Z',
};

export const canonicalAgentRun: AgentRun = {
  agent_run_id: 'run_0001',
  session_id: 'sess_0001',
  agent_type: 'service_agent',
  status: 'SUCCEEDED',
  started_at: '2026-08-11T09:59:30.000Z',
  completed_at: '2026-08-11T10:00:00.000Z',
};

/** Anonymous lead: allowed by D010. */
export const canonicalLead: Lead = {
  lead_id: 'lead_0001',
  customer_id: null,
  source_session_id: 'sess_0001',
  source_candidate_id: 'cand_0001',
  service_type: '新中式写真',
  budget_min: null,
  budget_max: 4000,
  preferred_date_text: '下个月',
  status: 'NEW',
  created_at: '2026-08-11T10:00:02.000Z',
  updated_at: '2026-08-11T10:00:02.000Z',
};

export const canonicalCustomer: Customer = {
  customer_id: 'cust_0001',
  display_name: '张三',
  phone: null,
  wechat: 'zhangsan123',
  status: 'ACTIVE',
  created_at: '2026-08-11T10:00:03.000Z',
  updated_at: '2026-08-11T10:00:03.000Z',
};

export const canonicalProject: Project = {
  project_id: 'proj_0001',
  customer_id: 'cust_0001',
  lead_id: 'lead_0001',
  project_type: 'portrait_shoot',
  title: '新中式写真拍摄',
  status: 'DRAFT',
  scheduled_date: null,
  created_at: '2026-08-11T10:00:04.000Z',
  updated_at: '2026-08-11T10:00:04.000Z',
};

/** Task is additive (P4). Created only after a Lead converts to a Project. */
export const canonicalTask: Task = {
  task_id: 'task_0001',
  project_id: 'proj_0001',
  task_type: 'PROJECT_SETUP',
  title: 'Project setup',
  status: 'TODO',
  due_date: null,
  created_at: '2026-08-11T10:00:05.000Z',
  updated_at: '2026-08-11T10:00:05.000Z',
};

/** Deep clone helper so an invalid-case mutation cannot leak between tests. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
