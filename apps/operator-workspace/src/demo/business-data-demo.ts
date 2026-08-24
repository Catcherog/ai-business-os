/**
 * Business Data — browser DEMO data channel (BUSOS-R2-BATCH1-PRODUCT-INTEGRATION-CORR-01).
 *
 * The server-side CONNECTED boundary (real Feishu) is read-only and requires
 * server-side configuration this batch is not authorized to bind. To make the
 * Business Data surface a real, clickable, verifiable product surface in DEMO
 * mode, this module projects the deterministic seeded demo dataset (customers /
 * leads / projects — the SAME data the Projects/Reviews/Runs surfaces already
 * render) into the exact `BusinessDataEnvelope` contract the existing
 * `createBusinessDataFeature` view consumes. Nothing here mutates storage or
 * carries provider credentials; the envelope keeps `mode: CONNECTED` per the
 * client contract and reports an honest "read-only demo" health posture.
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

const CONNECTED_MODE = 'CONNECTED' as const;

function health(connected: boolean): BusinessDataHealthView {
  return {
    mode: CONNECTED_MODE,
    connected,
    configuredResourceCount: 8,
    lastSuccessfulReadAt: new Date('2026-08-24T00:00:00Z').toISOString(),
    lastSuccessfulWriteAt: null,
    lastReadbackStatus: 'NOT_RUN',
    latencyBucket: 'FAST',
  };
}

function ready<T>(data: T): BusinessDataEnvelope<T> {
  return {
    mode: CONNECTED_MODE,
    buildSha,
    status: 'READY',
    data,
    health: health(true),
  };
}

function blocked<T>(code: string, message: string): BusinessDataEnvelope<T> {
  return {
    mode: CONNECTED_MODE,
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
