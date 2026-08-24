/**
 * Business Data — browser DEMO data channel (BUSOS-R2-BATCH1-PRODUCT-INTEGRATION-CORR-01;
 * identity corrected in OWNER-REVIEW-FIX-01).
 *
 * The server-side CONNECTED boundary (real Feishu) is read-only and requires
 * server-side configuration this batch is not authorized to bind. To make the
 * Business Data surface a real, clickable, verifiable product surface in DEMO
 * mode, this module projects the deterministic seeded demo dataset (customers /
 * leads / projects — the SAME data the Projects/Reviews/Runs surfaces already
 * render) into the exact `BusinessDataEnvelope` contract the existing
 * `createBusinessDataFeature` view consumes.
 *
 * Runtime identity (OWNER-REVIEW-FIX-01): seeded in-memory data is HONESTLY
 * `DEMO / READY` with `health.connected: false` — it never claims a real
 * Feishu connection. No configured resources, no successful external read
 * timestamps, no provider connectivity are fabricated. The real server seam
 * stays `CONNECTED / BLOCKED` until a connected Feishu configuration exists.
 */
import type { Customer, Lead, Project } from '@busos/contracts';
import {
  type BusinessDataClient,
  type BusinessDataEnvelope,
  type BusinessDataCustomerSummary,
  type BusinessDataCustomerDetail,
  type BusinessDataHealthView,
} from '../features/business-data/index.js';
import { getSeedData } from '../api.js';
import { buildSha } from '../build-info.js';

const DEMO_MODE = 'DEMO' as const;

/** Honest DEMO health: no fabricated provider resources, reads or connectivity. */
function health(connected: boolean): BusinessDataHealthView {
  return {
    mode: DEMO_MODE,
    connected,
    configuredResourceCount: 0,
    lastSuccessfulReadAt: null,
    lastSuccessfulWriteAt: null,
    lastReadbackStatus: 'NOT_RUN',
    // DEMO presentation only — in-memory latency, not a measured provider value.
    latencyBucket: 'FAST',
  };
}

function ready<T>(data: T): BusinessDataEnvelope<T> {
  return {
    mode: DEMO_MODE,
    buildSha,
    status: 'READY',
    data,
    health: health(false),
  };
}

function blocked<T>(code: string, message: string): BusinessDataEnvelope<T> {
  return {
    mode: DEMO_MODE,
    buildSha,
    status: 'BLOCKED',
    error: { code, message },
    health: {
      ...health(false),
      error: { code, message },
    },
  };
}

export function createDemoBusinessDataClient(): BusinessDataClient {
  return {
    async listCustomers(): Promise<BusinessDataEnvelope<BusinessDataCustomerSummary[]>> {
      const { customers, leads, projects } = getSeedData();
      const data: BusinessDataCustomerSummary[] = customers.map((customer: Customer) => ({
        customer,
        leadCount: leads.filter((l: Lead) => l.customer_id === customer.customer_id).length,
        projectCount: projects.filter((p: Project) => p.customer_id === customer.customer_id).length,
      }));
      return ready(data);
    },
    async getCustomer(
      customerId: string,
    ): Promise<BusinessDataEnvelope<BusinessDataCustomerDetail | null>> {
      const { customers, leads, projects } = getSeedData();
      const customer = customers.find((c: Customer) => c.customer_id === customerId);
      if (!customer) return blocked('BUSINESS_DATA_CUSTOMER_NOT_FOUND', 'Customer not found.');
      const data: BusinessDataCustomerDetail = {
        customer,
        leads: leads.filter((l: Lead) => l.customer_id === customerId),
        projects: projects.filter((p: Project) => p.customer_id === customerId),
      };
      return ready(data);
    },
  };
}
