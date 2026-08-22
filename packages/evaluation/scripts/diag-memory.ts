import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadGoldenSetFile } from '../src/loader.js';
import { evaluateMemoryCase } from '../src/evaluators/memory-evaluator.js';

const DATASET = join(dirname(fileURLToPath(import.meta.url)), '..', 'datasets', 'golden-set.v0.json');
const { cases } = await loadGoldenSetFile(DATASET);
const mem = cases.filter((c) => c.domain === 'MEMORY');

let totalPrecisionContrib = 0;
let n = 0;
for (const c of mem) {
  const r = await evaluateMemoryCase(c);
  const actual = (r.actual ?? {}) as { memory_ids?: string[]; count?: number };
  const expected = (c.expected ?? {}) as { memory_ids?: string[]; forbidden_memory_ids?: string[]; memory_required?: boolean };
  const aIds = actual.memory_ids ?? [];
  const eIds = expected.memory_ids ?? [];
  // replicate computeMemoryMetrics per-sample precision
  const relevant = aIds.filter((id) => eIds.includes(id)).length;
  const prec = aIds.length === 0 ? 0 : relevant / aIds.length;
  totalPrecisionContrib += prec;
  n += 1;
  if (r.status !== 'PASS' || prec < 1) {
    console.log(`\n=== ${c.case_id} | status=${r.status} | prec=${prec.toFixed(3)}`);
    console.log(`  failure: ${r.failure_reason ?? '-'}`);
    console.log(`  expected.memory_ids: ${(expected.memory_ids ?? []).join(',') || '(none)'}`);
    console.log(`  actual.memory_ids:   ${aIds.join(',') || '(EMPTY)'}`);
    console.log(`  forbidden_memory_ids: ${(expected.forbidden_memory_ids ?? []).join(',') || '(none)'}`);
  }
}
console.log(`\nTOTAL precision sum=${totalPrecisionContrib.toFixed(4)} n=${n} avg=${(totalPrecisionContrib / n).toFixed(4)}`);
