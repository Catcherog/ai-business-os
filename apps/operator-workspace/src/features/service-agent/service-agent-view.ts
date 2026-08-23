import type { ServiceAgentConversationViewModel } from './service-agent-model.js';

function esc(value: unknown): string {
  return String(value ?? '—')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function serviceAgentConversationMarkup(
  model: ServiceAgentConversationViewModel,
): string {
  const handoff = model.handoff.requiresHuman ? '转人工' : '无需转人工';
  const run = model.runLink
    ? `<a href="${esc(model.runLink.href)}">Run ${esc(model.runLink.processId)}</a>`
    : '—';
  return [
    `<section data-conversation="${esc(model.conversationId)}">`,
    `<h2>Service Agent · ${esc(model.status)}</h2>`,
    `<p>回答：${esc(model.answer)}</p>`,
    `<dl>`,
    `<dt>Intent</dt><dd>${esc(model.intent)}</dd>`,
    `<dt>Risk</dt><dd>${esc(model.risk)}</dd>`,
    `<dt>Route</dt><dd>${esc(model.route)}</dd>`,
    `<dt>Handoff</dt><dd>${handoff} · ${esc(model.handoff.state)}</dd>`,
    `<dt>Evidence</dt><dd>${esc(model.evidence.sourceModules.join('、'))} · ${esc(model.evidence.retrievalScore)}</dd>`,
    `<dt>Latency</dt><dd>${esc(model.latencyMs)}ms</dd>`,
    `<dt>Canonical Run</dt><dd>${run}</dd>`,
    `</dl>`,
    `<button type="button" data-action="governance-review">治理 / 审阅</button>`,
    `</section>`,
  ].join('');
}
