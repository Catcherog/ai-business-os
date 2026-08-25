/**
 * Operations feature barrel (BUSOS-R2-FEISHU-V3-OS-PRODUCT-INTEGRATION-01).
 *
 * Three layers:
 *  - `operations-client`  — CONNECTED browser transport (strict envelope guards,
 *                           no DEMO fallback, no browser-side field patching).
 *  - `operations-demo`    — deterministic in-memory DEMO channel (health.connected
 *                           false, honest synthetic review seed).
 *  - `operations-view`    — pure render layer over `BusinessDataEnvelope<T>`.
 */
export {
  createOperationsClient,
  type OperationsClient,
  type OperationsClientOptions,
  type ReviewDecisionInput,
  type BusinessDataEnvelope,
  type BusinessDataHealthView,
} from './operations-client.js';

export { createDemoOperationsClient } from './operations-demo.js';

export {
  renderOperationsDashboard,
  renderOperationsCustomers,
  renderOperationsCustomerDetail,
  renderOperationsOrders,
  renderOperationsOrderDetail,
  renderReviewQueue,
  renderReviewDetail,
  createOperationsFeature,
  operationsDashboardModel,
  type OperationsDashboardModel,
  type BusinessDataHealthModel,
  type OperationsFeature,
} from './operations-view.js';
