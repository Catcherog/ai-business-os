import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { stableHash } from '../src/hash.js';
import { redactForLog } from '../src/redact.js';
import type { MigrationDecision } from '../src/types.js';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('stableHash', () => {
  it('derives the same migration key for the same normalized source', () => {
    expect(stableHash({ b: 2, a: 1 })).toBe(stableHash({ a: 1, b: 2 }));
  });

  it('uses host-independent code-unit key ordering', () => {
    expect(stableHash({ a: 1, B: 2 })).toBe(sha256('{"B":2,"a":1}'));
  });

  it('rejects unsupported values', () => {
    expect(() => stableHash({ run: () => 'x' })).toThrow(
      /does not support function values/,
    );
    expect(() => stableHash({ marker: Symbol('x') })).toThrow(
      /does not support symbol values/,
    );
  });

  it('rejects cyclic arrays', () => {
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(() => stableHash(cyclic)).toThrow(/does not support cyclic values/);
  });
});

describe('migration decision contract', () => {
  it('allows NEEDS_REVIEW decisions for changed source payload hashes', () => {
    const decision: MigrationDecision<Record<string, unknown>> = {
      source: {
        source_type: 'feishu',
        source_id: 'rec-1',
        fields: { source_payload_hash: 'before' },
      },
      decision: 'NEEDS_REVIEW',
      canonical_target: { source_payload_hash: 'after' },
      migration_key: 'mig-1',
      reason: 'source_payload_hash changed',
    };

    expect(decision.decision).toBe('NEEDS_REVIEW');
  });
});

describe('redactForLog', () => {
  it('redacts credentials and access tokens', () => {
    expect(redactForLog('app_secret=abc tenant_access_token=xyz')).toBe(
      'app_secret=[REDACTED] tenant_access_token=[REDACTED]',
    );
  });

  it('redacts colon-separated api keys and bearer authorization headers', () => {
    expect(
      redactForLog('api_key: abc Authorization: Bearer xyz x-api-key=def'),
    ).toBe(
      'api_key: [REDACTED] Authorization: Bearer [REDACTED] x-api-key=[REDACTED]',
    );
  });

  it('redacts sensitive keys recursively in structured objects', () => {
    expect(
      redactForLog({
        api_key: 'abc',
        nested: {
          Authorization: 'Bearer xyz',
          tenant_access_token: 'secret-token',
        },
        safe: 'visible',
      }),
    ).toBe(
      JSON.stringify({
        api_key: '[REDACTED]',
        nested: {
          Authorization: '[REDACTED]',
          tenant_access_token: '[REDACTED]',
        },
        safe: 'visible',
      }),
    );
  });
});
