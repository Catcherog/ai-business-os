import { describe, expect, it } from 'vitest';
import { stableHash } from '../src/hash.js';
import { redactForLog } from '../src/redact.js';

describe('stableHash', () => {
  it('derives the same migration key for the same normalized source', () => {
    expect(stableHash({ b: 2, a: 1 })).toBe(stableHash({ a: 1, b: 2 }));
  });
});

describe('redactForLog', () => {
  it('redacts credentials and access tokens', () => {
    expect(redactForLog('app_secret=abc tenant_access_token=xyz')).toBe(
      'app_secret=[REDACTED] tenant_access_token=[REDACTED]',
    );
  });
});
