/**
 * @busos/workspace-read — Operator Workspace read-surface boundary (H1-01).
 *
 * The workspace UI imports only from here. Everything it receives is canonical
 * domain data; Feishu specifics never cross this boundary (D017 / D018).
 */

export { WorkspaceReadService } from './workspace-read-service.js';
export type { ProjectWorkspace } from './types.js';

export { seedFakeWorkspace } from './seed.js';
export type { SeededWorkspace } from './seed.js';
