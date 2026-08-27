import { describe, expect, it } from 'vitest';
import { createDemoSchedulingClient } from '../src/features/scheduling/scheduling-client.js';

describe('unified scheduling demo client', () => {
  it('produces deterministic proposals for a project and confirms one with readback', async () => {
    const client = createDemoSchedulingClient({ projectId: 'proj_001', projectTitle: '林晚晴 · 新中式写真' });
    const input = {
      start: '2026-09-20T01:00:00.000Z',
      end: '2026-09-20T09:00:00.000Z',
      location: '上海',
      preferredResourceKeys: ['photographer_demo_001'],
    };

    const first = client.propose(input);
    const second = client.propose(input);

    expect(first.length).toBeGreaterThan(0);
    expect(first).toEqual(second);
    const confirmation = await client.confirm({
      proposal: first[0]!,
      idempotencyKey: 'schedule_demo_001',
    });
    expect(confirmation.status).toBe('CONFIRMED');
    expect(confirmation.readbackStatus).toBe('VERIFIED');
    expect(client.getSnapshot().assignments[0]?.status).toBe('CONFIRMED');
  });
});
