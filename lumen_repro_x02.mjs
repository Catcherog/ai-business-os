// BUSOS-P5-X02 §11 live repro for Lumen (picture-edit) production recovery.
// Proves the chain: auth -> project -> generation job -> resolve -> signedUrls keyed by asset.id.
//
// Prereqs:
//   - Lumen deployed at $LUMEN_BASE_URL (default https://lumen-ink.vercel.app)
//   - A PNG input supplied via argv[1] (base64 text file) or env LUMEN_IN_B64
//   - CloudBase NoSQL read quota NOT exhausted (else /api/auth hangs — see STATUS.md)
//
// Run:  node lumen_repro_x02.mjs [input.b64] [result.json]
//       LUMEN_AUTH_PASSWORD=... LUMEN_BASE_URL=... node lumen_repro_x02.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.LUMEN_BASE_URL || 'https://lumen-ink.vercel.app';
const PROXY = process.env.HTTPS_PROXY || process.env.LUMEN_REPRO_PROXY || 'http://127.0.0.1:7890';
const PASS = process.env.LUMEN_AUTH_PASSWORD;
if (!PASS) {
  console.error('LUMEN_AUTH_PASSWORD (Lumen production AUTH_PASSWORD) must be supplied via env — no hardcoded fallback.');
  process.exit(2);
}
const IN = process.argv[2] || process.env.LUMEN_IN_B64 || 'lumen_in.b64';
const OUT = process.argv[3] || 'lumen_repro_result.json';

function call(method, path, { body, token, headers, maxTime = 30 } = {}) {
  const args = ['-s', '-x', PROXY, '-m', String(maxTime), '-X', method, `${BASE}${path}`, '-w', '\n%{http_code}'];
  if (token) args.push('-H', `Authorization: Bearer ${token}`);
  if (headers) for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
  if (body) { args.push('-H', 'Content-Type: application/json'); args.push('-d', JSON.stringify(body)); }
  const out = execFileSync('curl', args, { maxBuffer: 32 * 1024 * 1024 }).toString();
  const nl = out.lastIndexOf('\n');
  const code = Number(out.slice(nl + 1).trim());
  const raw = out.slice(0, nl).trim();
  let json = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { json = raw; }
  return { code, json };
}

const log = (...a) => console.log(new Date().toISOString(), ...a);

(async () => {
  const report = { steps: [] };
  const auth = call('POST', '/api/auth', { body: { password: PASS } });
  log('AUTH', auth.code, JSON.stringify(auth.json).slice(0, 120));
  if (auth.code !== 200 || !auth.json?.token) { log('AUTH FAILED'); process.exit(1); }
  const token = auth.json.token;

  const b64 = readFileSync(IN, 'utf8').trim();
  const create = call('POST', '/api/projects', { token, maxTime: 60, body: { name: 'p5x02-repro', imageBase64: b64, mimeType: 'image/png' } });
  log('CREATE', create.code, 'projectId=', create.json?.project?.id, 'activeVersion=', create.json?.activeVersion?.id);
  if (create.code !== 201 || !create.json?.project?.id) { log('CREATE FAILED', JSON.stringify(create.json).slice(0, 400)); process.exit(1); }
  const projectId = create.json.project.id;
  const inputVersionId = create.json.activeVersion?.id;

  const idem = 'repro-' + Date.now();
  const job = call('POST', `/api/projects/${projectId}/jobs`, { token, maxTime: 180, headers: { 'Idempotency-Key': idem }, body: { prompt: 'Change the background to a calm blue gradient, keep the subject.', inputVersionId, providerId: 'env-seedream', outputSize: '2k' } });
  log('JOB', job.code, 'jobId=', job.json?.id, 'status=', job.json?.status, 'errorCode=', job.json?.errorCode);
  let jobId = job.json?.id;
  if (!jobId) {
    const list = call('GET', `/api/projects/${projectId}/jobs`, { token });
    log('LISTJOBS', list.code, JSON.stringify(list.json).slice(0, 300));
    if (Array.isArray(list.json) && list.json.length) jobId = list.json[list.json.length - 1].id;
  }
  if (!jobId) { log('NO JOB ID'); process.exit(1); }

  let final = null;
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    const st = call('GET', `/api/jobs/${jobId}`, { token, maxTime: 30 });
    const status = st.json?.status;
    const errCode = st.json?.errorCode;
    log(`poll#${i} code=${st.code} status=${status} errorCode=${errCode}`);
    if (st.code === 200 && (status === 'resolved' || status === 'failed')) { final = st.json; break; }
    if (st.code === 404) { log('JOB_NOT_FOUND', JSON.stringify(st.json).slice(0, 200)); final = st.json; break; }
  }

  const snap = call('GET', `/api/projects/${projectId}`, { token, maxTime: 30 });
  log('SNAPSHOT', snap.code);
  const signed = snap.json?.signedUrls || {};
  const keys = Object.keys(signed);
  log('signedUrls keys=', JSON.stringify(keys).slice(0, 400));
  for (const k of keys) log('   ', k, '=>', String(signed[k]).slice(0, 90));
  const assets = snap.json?.assets || [];
  log('assets=', assets.map((a) => ({ id: a.id, storageKey: a.storageKey })).slice(0, 5));

  const resolved = final?.status === 'resolved';
  report.projectId = projectId;
  report.jobId = jobId;
  report.finalJob = final;
  report.snapshot = snap.json;
  report.resolved = resolved;
  report.contractOk = keys.length > 0 && assets.every((a) => signed[a.id] && !signed[a.storageKey]);
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  log('RESULT resolved=', resolved, 'contractOk=', report.contractOk, 'finalStatus=', final?.status, 'errorCode=', final?.errorCode);
  process.exit(resolved && report.contractOk ? 0 : 2);
})();
