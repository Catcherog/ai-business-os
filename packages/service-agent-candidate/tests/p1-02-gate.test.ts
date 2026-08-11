import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isLeadCandidateV1,
  validateLeadCandidateV1,
} from '@busos/contracts';
import { describe, expect, it } from 'vitest';

import { buildLeadCandidate } from '../src/candidate-builder.js';
import {
  CANONICAL_CONTEXT,
  CANONICAL_MESSAGE,
  FIXED_CANDIDATE_ID,
  FIXED_NOW,
} from './fixtures.js';

/**
 * BUSOS-P1-02 gate, exactly as defined in project-control/05-TEST-GATES.md.
 * Gate items 1-8, one describe block each. Nothing beyond the gate.
 */

const candidate = buildLeadCandidate(CANONICAL_CONTEXT, {
  now: FIXED_NOW,
  candidateId: FIXED_CANDIDATE_ID,
});

describe('P1-02 gate 1 — canonical input produces a valid LeadCandidateV1', () => {
  it('accepts the canonical input verbatim', () => {
    expect(CANONICAL_CONTEXT.message).toBe(
      '我想下个月拍一套新中式写真，预算大概4000。',
    );
  });

  it('produces a candidate that satisfies the frozen contract', () => {
    const result = validateLeadCandidateV1(candidate);
    expect(result.ok).toBe(true);
  });

  it('carries the contract version and the full traceability chain', () => {
    expect(candidate.version).toBe('lead_candidate.v1');
    expect(candidate.candidate_id.length).toBeGreaterThan(0);
    // V1-G5: session and run IDs come from the Service Agent, unchanged.
    expect(candidate.session_id).toBe(CANONICAL_CONTEXT.conversation_id);
    expect(candidate.agent_run_id).toBe(CANONICAL_CONTEXT.run_id);
  });

  it('records an intent with a confidence inside 0..1', () => {
    expect(candidate.intent.type.length).toBeGreaterThan(0);
    expect(candidate.intent.confidence).toBeGreaterThanOrEqual(0);
    expect(candidate.intent.confidence).toBeLessThanOrEqual(1);
  });

  it('initialises governance as PENDING_REVIEW', () => {
    expect(candidate.governance.status).toBe('PENDING_REVIEW');
  });

  it('stamps an ISO-8601 created_at', () => {
    expect(candidate.created_at).toBe('2026-08-11T15:00:00.000Z');
  });
});

describe('P1-02 gate 2 — service_type is 新中式写真', () => {
  it('extracts the requested service type', () => {
    expect(candidate.requirement.service_type).toBe('新中式写真');
  });
});

describe('P1-02 gate 3 — budget preserves 4000', () => {
  it('keeps 4000 as the upper bound', () => {
    expect(candidate.requirement.budget_max).toBe(4000);
  });

  it('does not fabricate a range around the hedge word 大概', () => {
    expect(candidate.requirement.budget_min).toBeNull();
    expect(candidate.requirement.budget_max).not.toBe(3500);
    expect(candidate.requirement.budget_max).not.toBe(4500);
  });
});

describe('P1-02 gate 4 — original date wording is retained', () => {
  it('keeps 下个月 exactly as written', () => {
    expect(candidate.requirement.preferred_date_text).toBe('下个月');
  });

  it('does not resolve it to a concrete date', () => {
    expect(candidate.requirement.preferred_date_text).not.toMatch(/\d/);
  });
});

describe('P1-02 gate 5 — missing customer identity stays null', () => {
  it('leaves name, phone and wechat null', () => {
    expect(candidate.customer_candidate).toEqual({
      name: null,
      phone: null,
      wechat: null,
    });
  });

  it('does not invent notes either', () => {
    expect(candidate.requirement.notes).toBeNull();
  });
});

describe('P1-02 gate 6 — evidence covers service type and budget', () => {
  const byField = new Map(
    candidate.evidence.map((item) => [item.field, item.source_text]),
  );

  it('has evidence for requirement.service_type', () => {
    expect(byField.get('requirement.service_type')).toBe('新中式写真');
  });

  it('has evidence for requirement.budget_max', () => {
    expect(byField.get('requirement.budget_max')).toBe('预算大概4000');
  });

  it('quotes only real substrings of the consultation message', () => {
    for (const item of candidate.evidence) {
      expect(CANONICAL_MESSAGE).toContain(item.source_text);
    }
  });

  it('emits no evidence for fields that were not extracted', () => {
    const fields = candidate.evidence.map((item) => item.field);
    expect(fields).not.toContain('customer_candidate.name');
    expect(fields).not.toContain('customer_candidate.phone');
    expect(fields).not.toContain('customer_candidate.wechat');
    expect(fields).not.toContain('requirement.budget_min');
  });
});

describe('P1-02 gate 7 — output passes contract validation', () => {
  it('is accepted by the frozen @busos/contracts validator', () => {
    // Runtime validation by the P1-01 package, not a local re-implementation.
    expect(isLeadCandidateV1(candidate)).toBe(true);
  });

  it('is rejected by the same validator once tampered with', () => {
    // Proves the validator is actually exercised, not vacuously passing.
    const tampered = { ...candidate, version: 'lead_candidate.v2' };
    const result = validateLeadCandidateV1(tampered);
    expect(result.ok).toBe(false);
  });

  it('refuses to emit a candidate that violates the contract', () => {
    expect(() =>
      buildLeadCandidate({ ...CANONICAL_CONTEXT, conversation_id: '' }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Gate 8 — the Candidate Builder path must not write Feishu.
// ---------------------------------------------------------------------------

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Every source file on the Candidate Builder path. */
function collectSourceFiles(): string[] {
  const roots = ['src', 'bridge'];
  const files: string[] = [];
  for (const root of roots) {
    const dir = join(PACKAGE_ROOT, root);
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isFile()) files.push(full);
    }
  }
  return files;
}

describe('P1-02 gate 8 — no Feishu write on the Candidate Builder path', () => {
  const sourceFiles = collectSourceFiles();

  it('covers the whole builder path', () => {
    expect(sourceFiles.length).toBeGreaterThanOrEqual(5);
  });

  it('contains no Feishu / Bitable / lark reference in executable code', () => {
    // Comments legitimately mention Feishu to state the boundary, so the check
    // runs against code with comments stripped.
    for (const file of sourceFiles) {
      const stripped = readFileSync(file, 'utf8')
        .replace(/"""[\s\S]*?"""/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)#.*$/gm, '')
        .replace(/\/\/.*$/gm, '');
      expect(stripped).not.toMatch(/feishu|lark|bitable|open\.feishu\.cn/i);
    }
  });

  it('performs no network or persistence I/O', () => {
    for (const file of sourceFiles) {
      const stripped = readFileSync(file, 'utf8')
        .replace(/"""[\s\S]*?"""/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)#.*$/gm, '')
        .replace(/\/\/.*$/gm, '');
      expect(stripped).not.toMatch(
        /\bfetch\s*\(|\baxios\b|node:https?|\bimport\s+requests\b|\bimport\s+socket\b|\bhttpx\b|\burllib\b|writeFile|sqlite/i,
      );
    }
  });

  it('does not import the agent modules that own persistence or Feishu', () => {
    const bridge = readFileSync(
      join(PACKAGE_ROOT, 'bridge', 'service_agent_context.py'),
      'utf8',
    );
    const imports = [...bridge.matchAll(/^\s*(?:from|import)\s+([\w.]+)/gm)].map(
      (match) => match[1] ?? '',
    );
    const agentImports = imports.filter((name) =>
      name.startsWith('langgraph'),
    );
    // Only the dependency-free type modules of the agent are touched.
    expect(agentImports).toEqual([
      'langgraph.types.intent',
      'langgraph.types.state',
    ]);
    for (const forbidden of [
      'api_server',
      'knowledge_base',
      'feishu_blocks',
      'persistence',
      'lark_oapi',
    ]) {
      expect(imports).not.toContain(forbidden);
    }
  });

  it('creates no Lead and no Customer (candidate only, D015)', () => {
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/createLead|createCustomer|LeadSchema/);
    }
  });
});

// ---------------------------------------------------------------------------
// Anti-hardcoding guard (task BUSOS-P1-02 §6).
// ---------------------------------------------------------------------------

describe('extraction is rule-based, not a canonical-sentence special case', () => {
  it('never stores the canonical sentence in the builder source', () => {
    for (const file of collectSourceFiles()) {
      expect(readFileSync(file, 'utf8')).not.toContain(CANONICAL_MESSAGE);
    }
  });

  it('extracts the same fields from a differently phrased consultation', () => {
    const other = buildLeadCandidate({
      ...CANONICAL_CONTEXT,
      message: '下周末想约个韩式婚纱照，预算8000以内，我叫王五',
    });
    expect(other.requirement.service_type).toBe('韩式婚纱照');
    expect(other.requirement.budget_max).toBe(8000);
    expect(other.requirement.preferred_date_text).toBe('下周末');
    expect(other.customer_candidate.name).toBe('王五');
    expect(other.customer_candidate.phone).toBeNull();
  });
});
