/**
 * Golden Set loader (BUSOS-R2-H2-03) — node-only.
 *
 * Loads `datasets/*.json` (or a single file), validates EVERY case against the
 * canonical `evaluation_case.v1` schema, rejects invalid provenance / malformed
 * cases, and enforces unique case_ids. The runner then applies the
 * baseline-eligibility filter (APPROVED / SYSTEM_REVIEWED only) — see
 * `case-schema.isBaselineEligible`.
 *
 * NOT exported from the barrel (node:fs) — import directly from the package
 * path or via the CLI.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  assertEvaluationCaseV1,
  type EvaluationCaseV1,
} from './case-schema.js';

export interface LoadIssue {
  file: string;
  case_index?: number;
  errors: string[];
}

export interface LoadedDataset {
  cases: EvaluationCaseV1[];
  issues: LoadIssue[];
}

export async function loadGoldenSetDirectory(dir: string): Promise<LoadedDataset> {
  const entries = await readdir(dir);
  const jsonFiles = entries.filter((e) => e.endsWith('.json') && !e.startsWith('.'));
  const all: LoadedDataset = { cases: [], issues: [] };
  for (const f of jsonFiles.sort()) {
    const file = join(dir, f);
    const parsed = await loadGoldenSetFile(file);
    all.cases.push(...parsed.cases);
    all.issues.push(...parsed.issues);
  }
  return dedupe(all);
}

export async function loadGoldenSetFile(file: string): Promise<LoadedDataset> {
  const raw = await readFile(file, 'utf8');
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return {
      cases: [],
      issues: [{ file, errors: [`not valid JSON: ${(e as Error).message}`] }],
    };
  }
  return parseGoldenSetPayload(json, file);
}

export function parseGoldenSetPayload(
  payload: unknown,
  file: string,
): LoadedDataset {
  const arr = Array.isArray(payload) ? payload : (payload as { cases?: unknown[] })?.cases;
  if (!Array.isArray(arr)) {
    return { cases: [], issues: [{ file, errors: ['payload must be an array or { cases: [...] }'] }] };
  }

  const out: LoadedDataset = { cases: [], issues: [] };
  arr.forEach((item, i) => {
    try {
      out.cases.push(assertEvaluationCaseV1(item));
    } catch (e) {
      out.issues.push({
        file,
        case_index: i,
        errors: [(e as Error).message],
      });
    }
  });
  return dedupe(out);
}

function dedupe(loaded: LoadedDataset): LoadedDataset {
  const seen = new Map<string, number>();
  const issues = [...loaded.issues];
  const cases = loaded.cases.filter((c) => {
    if (seen.has(c.case_id)) {
      issues.push({
        file: 'dataset',
        errors: [`duplicate case_id: ${c.case_id} (first seen at index ${seen.get(c.case_id)})`],
      });
      return false;
    }
    seen.set(c.case_id, loaded.cases.indexOf(c));
    return true;
  });
  return { cases, issues };
}
