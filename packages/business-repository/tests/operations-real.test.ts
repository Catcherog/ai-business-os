import { describe, expect, it } from 'vitest';
import { createOperationsAdapter, createOperationsAdapterFromEnv, resolveOperationsTargetToken } from '../src/operations-adapter.js';
import { OperationsAdapterError } from '../src/operations-types.js';

const resourceRecord = (key: string, name: string) => ({
  record_id: `rec_${key}`,
  fields: {
    'Resource Key': key,
    'Resource Type': 'MODEL',
    Name: name,
    'Cooperation Status': 'ACTIVE',
    'Migration Key': `migration:${key}`,
  },
});

function makePagedFetch() {
  const calls: string[] = [];
  let authCalls = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.includes('/auth/v3/tenant_access_token')) {
      authCalls += 1;
      return new Response(JSON.stringify({ code: 0, tenant_access_token: 'stub-token', expire: 7200 }), { status: 200 });
    }
    if (url.includes('/tables/tbl_resources/records')) {
      const token = new URL(url).searchParams.get('page_token');
      const data = token
        ? { items: [resourceRecord('resource-b', 'Bob')], has_more: false }
        : { items: [resourceRecord('resource-a', 'Alice')], has_more: true, page_token: 'next-page' };
      return new Response(JSON.stringify({ code: 0, data }), { status: 200 });
    }
    return new Response(JSON.stringify({ code: 1 }), { status: 404 });
  };
  return { fetchImpl, calls, get authCalls() { return authCalls; } };
}

describe('connected operations adapter', () => {
  it('uses the shared token client and reads every paginated page', async () => {
    const transport = makePagedFetch();
    const adapter = createOperationsAdapter({
      appId: 'app-id',
      appSecret: 'app-secret',
      targetBaseToken: 'target-base',
      tableIds: { resources: 'tbl_resources' },
      fetchImpl: transport.fetchImpl,
    });

    const resources = await adapter.listResources();
    expect(resources.map((resource) => resource.resource_key)).toEqual(['resource-a', 'resource-b']);
    expect(transport.authCalls).toBe(1);
    expect(transport.calls.filter((call) => call.includes('/records?')).length).toBe(2);
  });

  it('fails startup on conflicting target-token configuration', () => {
    expect(() => resolveOperationsTargetToken({
      FEISHU_TARGET_BASE_TOKEN: 'target-a',
      FEISHU_BASE_APP_TOKEN: 'legacy-b',
    })).toThrow(OperationsAdapterError);
    expect(() => createOperationsAdapterFromEnv({
      FEISHU_APP_ID: 'app',
      FEISHU_APP_SECRET: 'secret',
      FEISHU_TARGET_BASE_TOKEN: 'target-a',
      FEISHU_BASE_APP_TOKEN: 'legacy-b',
    })).toThrow('differ');
  });

  it('maps invalid external values to safe table/key errors', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/auth/v3/tenant_access_token')) {
        return new Response(JSON.stringify({ code: 0, tenant_access_token: 'stub-token' }), { status: 200 });
      }
      return new Response(JSON.stringify({
        code: 0,
        data: {
          items: [{
            record_id: 'rec_bad',
            fields: {
              'Resource Key': 'resource-bad',
              'Resource Type': 'NOT_ALLOWED',
              Name: 'secret payload must not escape',
              'Migration Key': 'migration:bad',
            },
          }],
        },
      }), { status: 200 });
    };
    const adapter = createOperationsAdapter({
      appId: 'app-id',
      appSecret: 'app-secret',
      targetBaseToken: 'target-base',
      tableIds: { resources: 'tbl_resources' },
      fetchImpl,
    });
    await expect(adapter.listResources()).rejects.toMatchObject({ table: 'Resources', businessKey: 'migration:bad' });
    await expect(adapter.listResources()).rejects.not.toThrow('secret payload must not escape');
  });
});
