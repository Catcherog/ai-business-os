import { describe, expect, it } from 'vitest';
import {
  mapAvailabilityRecord,
  mapKnowledgeRecord,
  mapResourceRecord,
  OperationsMappingError,
} from '../src/operations-mapping.js';

describe('canonical operations mapping', () => {
  it('unwraps Feishu values and maps a resource through the strict contract', () => {
    const resource = mapResourceRecord({
      record_id: 'rec_resource_1',
      fields: {
        'Resource Key': [{ text: 'resource:model:alice' }],
        'Resource ID': 'legacy-1',
        'Resource Type': [{ text: 'MODEL', type: 'text' }],
        Name: 'Alice',
        'Xiaohongshu Name': 'alice_xhs',
        'Xiaohongshu Profile URL': 'https://www.xiaohongshu.com/user/profile/1',
        WeChat: 'alice-wechat',
        Phone: '13800000000',
        City: 'Shanghai',
        Address: null,
        Styles: '新中式',
        'Size Raw': 'S',
        'Quote Raw': '3000-5000',
        'Quote Min': 3000,
        'Quote Max': 5000,
        Priority: 1,
        'Cooperation Status': 'ACTIVE',
        Rating: 4.5,
        'Availability Raw': '周末可约',
        'Work URL': 'https://example.test/work/1',
        'Source Aliases JSON': '{"legacy_id":"legacy-1"}',
        'Migration Key': 'resource:model:alice',
        'Legacy Updated At': Date.UTC(2026, 7, 25),
      },
    });

    expect(resource.resource_key).toBe('resource:model:alice');
    expect(resource.resource_type).toBe('MODEL');
    expect(resource.legacy_updated_at).toBe('2026-08-25T00:00:00.000Z');
    expect(resource.quote_max).toBe(5000);
  });

  it('maps nullable availability dates without inventing an interval', () => {
    const slot = mapAvailabilityRecord({
      record_id: 'rec_availability_1',
      fields: {
        'Availability ID': 'availability-1',
        'Resource Key': 'resource:model:alice',
        'Resource Type': 'MODEL',
        'Start At': null,
        'End At': null,
        Status: 'UNAVAILABLE',
        Granularity: 'DATE',
        'Raw Text': '下周不确定',
        'Parse Status': 'UNPARSED',
        Confidence: 'LOW',
        'Source Updated At': null,
        'Expires At': null,
        'Migration Key': 'availability:resource:model:alice:1',
      },
    });

    expect(slot.start_at).toBeNull();
    expect(slot.parse_status).toBe('UNPARSED');
  });

  it('fails closed and does not include the raw payload in mapping errors', () => {
    expect(() =>
      mapKnowledgeRecord({
        record_id: 'rec_knowledge_1',
        fields: {
          'Knowledge ID': 'knowledge-1',
          'Knowledge Type': 'SYSTEM_RULE',
          Title: 'sensitive payload should not be echoed',
          Detail: 'secret-token-value',
          'Workflow Status': 'NOT_A_STATUS',
          'Migration Key': 'knowledge:1',
        },
      }),
    ).toThrowError(OperationsMappingError);

    try {
      mapKnowledgeRecord({
        record_id: 'rec_knowledge_1',
        fields: {
          'Knowledge ID': 'knowledge-1',
          'Knowledge Type': 'SYSTEM_RULE',
          Title: 'sensitive payload should not be echoed',
          Detail: 'secret-token-value',
          'Workflow Status': 'NOT_A_STATUS',
          'Migration Key': 'knowledge:1',
        },
      });
    } catch (error) {
      expect(String(error)).not.toContain('secret-token-value');
      expect(String(error)).toContain('Knowledge');
    }
  });
});
