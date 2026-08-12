import {
  isBusinessCommitSuccess,
  type LeadCandidateV1,
  type Customer,
} from '@busos/contracts';
import type { CustomerIdentityQuery } from '@busos/business-repository';
import type {
  GoldenPathDeps,
  GoldenPathInput,
  GoldenPathResult,
  GoldenPathRepository,
  WriteCounts,
} from './types.js';
import { governancePermitsWrite } from './governance.js';

function zeroWrites(): WriteCounts {
  return { lead: 0, customer: 0, link: 0 };
}

/** Exact phone/wechat only — no fuzzy merge, no LLM guess (04-INTERFACES.md §2). */
function identityFromCandidate(c: LeadCandidateV1): CustomerIdentityQuery {
  return {
    phone: c.customer_candidate.phone ?? null,
    wechat: c.customer_candidate.wechat ?? null,
  };
}

/**
 * Display name for a newly-created Customer.
 *
 * `Customer.display_name` is required non-empty, so when the user stated a name
 * we use it; otherwise we fall back to the exact identity token (wechat/phone)
 * or a neutral placeholder. This is a minimal, deterministic fallback — it never
 * fabricates a richer profile.
 */
function displayNameForCustomer(c: LeadCandidateV1): string {
  const cc = c.customer_candidate;
  const fallback = (cc.name ?? cc.wechat ?? cc.phone ?? '未命名客户').trim();
  return fallback.length > 0 ? fallback : '未命名客户';
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * BUSOS-P2-GP-001 — Golden Path Vertical Slice orchestration.
 *
 * The single, very thin application entry point. It wires the four frozen
 * building blocks into one deterministic chain:
 *
 *   Candidate (P1-02) -> Governance (this pkg) -> BusinessRepository (P1-03)
 *   -> FeishuAdapter (P1-03) -> Readback (P1-03) -> VERIFIED / FAILED
 *
 * Fail-closed: any of the following yields a non-SUCCESS result with NO
 * repository write having been allowed to "succeed" the business commit:
 *   - candidate contract invalid (builder throws)
 *   - governance decision != APPROVE
 *   - customer lookup / create failure
 *   - customer readback not VERIFIED
 *   - lead create failure
 *   - lead readback not VERIFIED
 *   - lead-customer link failure / readback failure
 *
 * A write that succeeds but whose readback fails is a business FAILURE, never a
 * SUCCESS (D019). The orchestration depends only on the canonical repository
 * port — it never imports Feishu tokens, table ids, field names, or SDK types
 * (D017/D018).
 */
export async function executeGoldenPath(
  input: GoldenPathInput,
  deps: GoldenPathDeps,
): Promise<GoldenPathResult> {
  const writes = zeroWrites();
  const result: GoldenPathResult = { status: 'BLOCKED', writes, customer: null };

  // 1) Candidate — built by the injected builder (P1-02). Fail closed on error.
  let candidate: LeadCandidateV1;
  try {
    candidate = deps.candidateBuilder(input);
  } catch (e) {
    result.status = 'BLOCKED';
    result.failureReason = `candidate build rejected: ${errMsg(e)}`;
    return result;
  }
  result.candidate = candidate;

  // 2) Governance — fail closed: any non-APPROVE blocks the write outright.
  let governance;
  try {
    governance = deps.governance(candidate);
  } catch (e) {
    result.status = 'BLOCKED';
    result.failureReason = `governance error: ${errMsg(e)}`;
    return result;
  }
  result.governance = governance;
  if (!governancePermitsWrite(governance)) {
    result.status = 'BLOCKED';
    result.failureReason = `governance decision=${governance.decision}`;
    return result;
  }

  const repo: GoldenPathRepository = deps.businessRepository;

  // 3) Customer resolution — exact phone/wechat only. No create when absent.
  let customer: Customer | null = null;
  const identity = identityFromCandidate(candidate);
  if (identity.phone || identity.wechat) {
    try {
      customer = await repo.findCustomerByIdentity(identity);
    } catch (e) {
      result.status = 'FAILED';
      result.failureReason = `customer lookup failed: ${errMsg(e)}`;
      return result;
    }

    if (!customer) {
      try {
        const out = await repo.createCustomer({
          display_name: displayNameForCustomer(candidate),
          phone: identity.phone ?? null,
          wechat: identity.wechat ?? null,
        });
        writes.customer += 1;
        if (!isBusinessCommitSuccess(out.commit)) {
          result.status = 'FAILED';
          result.failureReason = `customer commit not verified (write=${out.commit.write_status}, readback=${out.commit.readback_status})`;
          result.customerCommit = out.commit;
          return result;
        }
        customer = out.customer;
        result.customerCommit = out.commit;
      } catch (e) {
        result.status = 'FAILED';
        result.failureReason = `customer create failed: ${errMsg(e)}`;
        return result;
      }
    }
  }
  result.customer = customer;

  // 4) Lead create — customer_id null when anonymous (D010).
  let lead;
  try {
    const out = await repo.createLead({
      customer_id: customer?.customer_id ?? null,
      source_session_id: candidate.session_id,
      source_candidate_id: candidate.candidate_id,
      // Guaranteed non-null by the governance gate above.
      service_type: candidate.requirement.service_type as string,
      budget_min: candidate.requirement.budget_min,
      budget_max: candidate.requirement.budget_max,
      preferred_date_text: candidate.requirement.preferred_date_text,
    });
    writes.lead += 1;
    if (!isBusinessCommitSuccess(out.commit)) {
      result.status = 'FAILED';
      result.failureReason = `lead commit not verified (write=${out.commit.write_status}, readback=${out.commit.readback_status})`;
      result.leadCommit = out.commit;
      return result;
    }
    lead = out.lead;
    result.lead = lead;
    result.leadCommit = out.commit;
  } catch (e) {
    result.status = 'FAILED';
    result.failureReason = `lead create failed: ${errMsg(e)}`;
    return result;
  }

  // 5) Link Lead -> Customer (exact id; no overwrite/auto-merge).
  if (customer) {
    try {
      await repo.linkLeadCustomer(lead.lead_id, customer.customer_id);
      writes.link += 1;
    } catch (e) {
      result.status = 'FAILED';
      result.failureReason = `lead-customer link failed: ${errMsg(e)}`;
      return result;
    }
  }

  result.status = 'SUCCESS';
  return result;
}
