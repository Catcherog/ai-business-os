import { buildLeadCandidate } from '../src/candidate-builder';
import { CANONICAL_CONTEXT, FIXED_CANDIDATE_ID, FIXED_NOW } from '../tests/fixtures';

const candidate = buildLeadCandidate(CANONICAL_CONTEXT, {
  now: new Date(FIXED_NOW),
  candidateId: FIXED_CANDIDATE_ID,
});

console.log(JSON.stringify(candidate, null, 2));
