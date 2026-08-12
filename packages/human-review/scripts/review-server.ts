import { createServer, type ServerResponse, type IncomingMessage } from 'node:http';
import { HumanReviewService, InMemoryReviewStore } from '../src/index.js';
import type { AllowedEditField, ReviewCase } from '../src/index.js';
import { buildCandidateFromInput } from '@busos/golden-path';
import {
  BusinessRepository,
  FakeFeishuAdapter,
  createFeishuAdapterFromEnv,
  type FeishuAdapter,
} from '@busos/business-repository';

/**
 * Minimal human-review surface (task §6).
 *
 * No existing presentation stack exists in AI Business OS, so this uses the
 * smallest runtime (node:http) to expose:
 *   - one minimal HTML review case view (display + edit allowlisted fields)
 *   - APPROVE / EDIT+APPROVE / REJECT actions
 *   - a terminal outcome page
 *
 * Feishu knowledge stays behind BusinessRepository + the adapter: this file
 * only ever sees the canonical boundary. The review surface uses the Fake
 * adapter by default and the REAL adapter when FEISHU_* env is present.
 */

const PORT = Number(process.env.REVIEW_PORT ?? 4173);
const ANON = '我想下个月拍一套新中式写真，预算大概4000。';

const liveAdapter = createFeishuAdapterFromEnv();
const usingLive = liveAdapter !== null;
const adapter: FeishuAdapter = liveAdapter ?? new FakeFeishuAdapter();
const repo = new BusinessRepository(adapter);

const service = new HumanReviewService({ candidateBuilder: buildCandidateFromInput });
const store = new InMemoryReviewStore();

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Form field name -> allowlisted candidate path. */
const FIELD_MAP: { name: string; path: AllowedEditField; label: string; numeric: boolean }[] = [
  { name: 'name', path: 'customer_candidate.name', label: '姓名', numeric: false },
  { name: 'phone', path: 'customer_candidate.phone', label: '电话', numeric: false },
  { name: 'wechat', path: 'customer_candidate.wechat', label: 'WeChat', numeric: false },
  { name: 'service_type', path: 'requirement.service_type', label: '服务类型', numeric: false },
  { name: 'budget_min', path: 'requirement.budget_min', label: '预算最小', numeric: true },
  { name: 'budget_max', path: 'requirement.budget_max', label: '预算最大', numeric: true },
  { name: 'preferred_date_text', path: 'requirement.preferred_date_text', label: '预约日期', numeric: false },
  { name: 'notes', path: 'requirement.notes', label: '备注', numeric: false },
];

function valueAt(c: ReviewCase, path: AllowedEditField): string {
  switch (path) {
    case 'customer_candidate.name': return c.original_candidate.customer_candidate.name ?? '';
    case 'customer_candidate.phone': return c.original_candidate.customer_candidate.phone ?? '';
    case 'customer_candidate.wechat': return c.original_candidate.customer_candidate.wechat ?? '';
    case 'requirement.service_type': return c.original_candidate.requirement.service_type ?? '';
    case 'requirement.budget_min': return c.original_candidate.requirement.budget_min == null ? '' : String(c.original_candidate.requirement.budget_min);
    case 'requirement.budget_max': return c.original_candidate.requirement.budget_max == null ? '' : String(c.original_candidate.requirement.budget_max);
    case 'requirement.preferred_date_text': return c.original_candidate.requirement.preferred_date_text ?? '';
    case 'requirement.notes': return c.original_candidate.requirement.notes ?? '';
  }
}

function renderCasePage(c: ReviewCase): string {
  const cand = c.original_candidate;
  const fields = FIELD_MAP.map((f) => {
    const val = esc(valueAt(c, f.path));
    return `<label>${esc(f.label)}<br><input name="${f.name}" value="${val}" size="40"></label>`;
  }).join('\n');

  const issues = c.original_governance.issues
    .map((i) => `<li>${esc(i.code)} (${esc(i.field ?? '-')})</li>`)
    .join('');

  const evidence = cand.evidence
    .map((e) => `<li>${esc(e.field)}: ${esc(e.source_text)}</li>`)
    .join('');

  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>人工复核 - ${esc(c.case_id)}</title></head><body>
<h1>人工复核</h1>
<p>案例: <code>${esc(c.case_id)}</code> | 当前状态: <code>${esc(c.state)}</code> | 数据源: ${usingLive ? '真实 Feishu' : '模拟 Feishu'}</p>
<h2>原始候选 (AI 产出，不可变)</h2>
<ul>
  <li>会话: ${esc(cand.session_id)}</li>
  <li>运行: ${esc(cand.agent_run_id)}</li>
  <li>候选: ${esc(cand.candidate_id)}</li>
  <li>服务类型: ${esc(cand.requirement.service_type)}</li>
  <li>预算: ${esc(cand.requirement.budget_min)} ~ ${esc(cand.requirement.budget_max)}</li>
  <li>预约日期: ${esc(cand.requirement.preferred_date_text)}</li>
  <li>客户: ${esc(cand.customer_candidate.name)} / ${esc(cand.customer_candidate.phone)} / ${esc(cand.customer_candidate.wechat)}</li>
</ul>
<h2>治理问题</h2><ul>${issues}</ul>
<h2>证据</h2><ul>${evidence}</ul>
<form method="post" action="/api/review/${esc(c.case_id)}/approve">
  <button type="submit">通过 (APPROVE)</button>
</form>
<form method="post" action="/api/review/${esc(c.case_id)}/reject">
  <button type="submit">拒绝 (REJECT)</button>
</form>
<form method="post" action="/api/review/${esc(c.case_id)}/edit">
  <h2>可编辑字段 (仅允许清单)</h2>
  ${fields}
  <p><button type="submit">编辑并通过 (EDIT+APPROVE)</button></p>
</form>
</body></html>`;
}

function renderOutcomePage(c: ReviewCase): string {
  const o = c.outcome;
  if (!o) return `<p>尚无结果。</p>`;
  const edits = o.edits.map((e) => `<li>${esc(e.field)}: ${esc(e.before)} -> ${esc(e.after)}</li>`).join('');
  const notes = o.evidence_notes.map((n) => `<li>${esc(n)}</li>`).join('');
  const commit = o.commit
    ? `<p>提交状态: <code>${esc(o.commit.status)}</code> | 写入: <code>${esc(o.commit.write_status)}</code> | 回读: <code>${esc(o.commit.readback_status)}</code> | 外部记录: <code>${esc(o.commit.external_record_id)}</code></p>`
    : '<p>无提交结果。</p>';
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>复核结果</title></head><body>
<h1>复核结果</h1>
<p>案例: <code>${esc(c.case_id)}</code> | 审核结果: <code>${esc(o.state)}</code></p>
${commit}
<h2>人类编辑</h2><ul>${edits}</ul>
<h2>证据说明</h2><ul>${notes}</ul>
<p><a href="/">返回新建案例</a></p>
</body></html>`;
}

function send(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });
}

async function handleReviewAction(
  c: ReviewCase,
  action: 'approve' | 'reject' | 'edit',
  body: string,
): Promise<void> {
  if (action === 'reject') {
    await service.applyReview(c, 'REJECT', repo);
    return;
  }
  if (action === 'approve') {
    await service.applyReview(c, 'APPROVE', repo);
    return;
  }
  // edit -> EDIT_APPROVE with parsed allowlisted patch
  const params = new URLSearchParams(body);
  const patch: Record<string, unknown> = {};
  for (const f of FIELD_MAP) {
    const raw = params.get(f.name);
    if (raw === null) continue;
    const trimmed = raw.trim();
    if (f.numeric) {
      patch[f.path] = trimmed === '' ? null : Number(trimmed);
    } else {
      patch[f.path] = trimmed === '' ? null : trimmed;
    }
  }
  await service.applyReview(c, 'EDIT_APPROVE', repo, patch);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const parts = url.pathname.split('/').filter(Boolean); // e.g. ['review','rev_xxx'] or ['api','review','rev_xxx','approve']

    if (parts.length === 0 || (parts[0] === 'index' && parts.length === 1)) {
      const { reviewCase } = service.prepareReview({ text: ANON, intentConfidence: 0.3 });
      if (reviewCase) {
        store.put(reviewCase);
        res.writeHead(302, { Location: `/review/${reviewCase.case_id}` });
        res.end();
      } else {
        send(res, 200, '<p>当前候选无需人工复核 (非 REVIEW_REQUIRED)。</p>');
      }
      return;
    }

    if (parts[0] === 'review' && parts.length === 2) {
      const c = store.get(parts[1]);
      if (!c) {
        send(res, 404, '<p>案例不存在。</p>');
        return;
      }
      send(res, 200, renderCasePage(c));
      return;
    }

    if (parts[0] === 'api' && parts[1] === 'review' && parts.length === 4) {
      const c = store.get(parts[2]);
      if (!c) {
        send(res, 404, '<p>案例不存在。</p>');
        return;
      }
      const action = parts[3] as 'approve' | 'reject' | 'edit';
      const body = req.method === 'POST' ? await readBody(req) : '';
      await handleReviewAction(c, action, body);
      send(res, 200, renderOutcomePage(c));
      return;
    }

    send(res, 404, '<p>未找到。</p>');
  } catch (e) {
    send(res, 500, `<p>错误: ${esc(e instanceof Error ? e.message : String(e))}</p>`);
  }
});

server.listen(PORT, () => {
  // Credentials are never printed (HR-H). Only the local surface URL is shown.
  console.log(`[human-review] surface on http://localhost:${PORT} (adapter: ${usingLive ? 'LIVE Feishu' : 'Fake'})`);
});
