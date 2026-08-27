/** Stable UI-facing runtime identity. The server implementation is supplied
 * by WORKSPACE-API-01; UX-01 only defines and renders the view contract. */
export type RuntimeMode = 'DEMO' | 'CONNECTED' | 'LIVE' | 'BLOCKED';

export interface RuntimeIdentityView {
  mode: RuntimeMode;
  buildSha: string;
  connectionSummary: string;
}

export function demoRuntimeIdentity(buildSha: string): RuntimeIdentityView {
  return {
    mode: 'DEMO',
    buildSha: buildSha || 'unknown',
    connectionSummary: 'In-memory demo data',
  };
}

export function renderRuntimeIdentity(
  host: HTMLElement,
  identity: RuntimeIdentityView,
): void {
  host.replaceChildren();
  host.append(
    Object.assign(document.createElement('span'), {
      className: `badge badge-${identity.mode.toLowerCase()}`,
      textContent: identity.mode,
    }),
    Object.assign(document.createElement('span'), {
      className: 'muted runtime-build',
      textContent: `Build ${identity.buildSha}`,
    }),
    Object.assign(document.createElement('span'), {
      className: 'muted runtime-summary',
      textContent: identity.connectionSummary,
    }),
  );
}
