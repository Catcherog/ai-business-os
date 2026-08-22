import { loadGoldenSetFile } from '../src/loader.js';
const { cases } = await loadGoldenSetFile('./datasets/golden-set.v0.json');
for (const c of cases.filter((x) => x.domain === 'MEMORY')) {
  const fx = (c.fixture?.memory_setup ?? c.fixture) as any;
  const seedN = (fx?.records?.length ?? 0) + (fx?.bulk_count ?? 0);
  const expN = (c.expected?.memory_ids ?? []).length;
  const forbN = (c.expected?.forbidden_memory_ids ?? []).length;
  if (seedN > expN) {
    console.log(`${c.case_id} seed=${seedN} exp_ids=${expN} forb=${forbN} tags=${(c.tags || []).join(',')}`);
  }
}
console.log('--- done (only cases seeding MORE than they assert are listed) ---');
