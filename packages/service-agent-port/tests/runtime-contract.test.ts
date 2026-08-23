import { describe, expect, it } from 'vitest';

import {
  InMemoryServiceAgentConversationStore,
  assertServiceAgentConsultationInput,
  type ServiceAgentConversationRecord,
} from '../src/index.js';

const record = (overrides: Partial<ServiceAgentConversationRecord> = {}): ServiceAgentConversationRecord => ({
  conversationId: 'conv_contract_1',
  customerId: 'cust_contract_1',
  turns: [
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '你好，请问有什么可以帮你？' },
  ],
  createdAt: '2026-08-24T01:00:00.000Z',
  updatedAt: '2026-08-24T01:00:01.000Z',
  lastRun: null,
  ...overrides,
});

describe('Service Agent runtime contracts', () => {
  it('requires an idempotency key for a consultation command', () => {
    const input = assertServiceAgentConsultationInput({
      query: '请介绍一下服务',
      idempotencyKey: 'scs-contract-1',
    });

    expect(input.idempotencyKey).toBe('scs-contract-1');
    expect(() => assertServiceAgentConsultationInput({ query: '缺少幂等键' })).toThrow();
  });

  it('stores bounded conversation records with clone-safe list and read ports', async () => {
    const store = new InMemoryServiceAgentConversationStore();
    await store.save(record());
    await store.save(record({
      conversationId: 'conv_contract_2',
      updatedAt: '2026-08-24T02:00:00.000Z',
    }));

    const listed = await store.list({ limit: 1 });
    expect(listed.map((item) => item.conversationId)).toEqual(['conv_contract_2']);

    listed[0]!.turns[0] = { role: 'user', content: 'mutated outside store' };
    const read = await store.get('conv_contract_2');
    expect(read?.turns[0]?.content).toBe('你好');
    expect(await store.get('missing-conversation')).toBeNull();
  });

  it('does not accept unbounded conversation content', async () => {
    const store = new InMemoryServiceAgentConversationStore();
    await expect(store.save(record({
      turns: [{ role: 'user', content: 'x'.repeat(2001) }],
    }))).rejects.toThrow();
  });
});
