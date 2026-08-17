// Re-export the exact symbols the UI smoke drives. This is a thin barrel used
// only by apps/operator-workspace/smoke-review.mjs and smoke-run.mjs to exercise
// the real UI module graph (ui.ts + api.ts) in a headless DOM — it adds no
// product surface.
export { initWorkspace, getService, getReviewService, getRunService, getRunRegistry, getActionRepo, getActionRegistry } from './api.js';
export { renderApp, navigate } from './ui.js';
export { runGenerateVisualReference } from './action.js';
