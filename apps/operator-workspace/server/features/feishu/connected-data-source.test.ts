import { describe, expect, it } from 'vitest';

import {
  BusinessRepository,
  createFakeFeishuAdapter,
  type FeishuAdapter,
} from '@busos/business-repository';
import { seedFakeWorkspace } from '@busos/workspace-read';

import {
  createConnectedFeishuDataSource,
  type ConnectedFeishuDataSource,
} from './connected-data-source.js';

async function seededSource(adapter: FeishuAdapter = createFakeFeishuAdapter()) {
  const repo = new BusinessRepository(adapter);
  const seeded = await seedFakeWorkspace(repo);
  const source = createConnectedFeishuDataSource({
    adapter,
    allowWrites: true,
    buildSha: 'feishu01',
  });
  return { source, seeded };
}

describe('Connected Feishu data source', () => {
  it('fails closed without server-side configuration and never returns demo data', async () => {
    const source = createConnectedFeishuDataSource({ env: {}, buildSha: 'blocked1' });

    await expect(source.runtime).resolves.toMatchObject({
      mode: 'CONNECTED',
      buildSha: 'blocked',
      status: 'BLOCKED',
      error: {
        code: 'FEISHU_CONFIGURATION_MISSING',
        message: 'Connected Feishu configuration is unavailable.',
      },
    });

    const projects = await source.listProjects();
    expect(projects.status).toBe('BLOCKED');
    expect(projects.data).toBeUndefined();
    expect(projects.health).toMatchObject({
      mode: 'CONNECTED',
      connected: false,
      configuredResourceCount: 0,
      lastSuccessfulReadAt: null,
      lastSuccessfulWriteAt: null,
      lastReadbackStatus: 'NOT_RUN',
    });
    expect(JSON.stringify(projects)).not.toContain('record_id');
    expect(JSON.stringify(projects)).not.toContain('table_id');
  });

  it('reads a canonical Project aggregate through an injected fake adapter', async () => {
    const { source, seeded } = await seededSource();

    const result = await source.getProjectAggregate(seeded.projects[0].project_id);

    expect(result).toMatchObject({
      mode: 'CONNECTED',
      buildSha: 'feishu0',
      status: 'READY',
      data: {
        project: { project_id: seeded.projects[0].project_id },
      },
    });
    expect(result.data?.customer?.customer_id).toBe(seeded.customers[0].customer_id);
    expect(result.data?.tasks.length).toBeGreaterThan(0);
    expect(result.health.connected).toBe(true);
    expect(result.health.lastSuccessfulReadAt).toEqual(expect.any(String));
    expect(result.health.lastReadbackStatus).toBe('NOT_RUN');
    expect(JSON.stringify(result)).not.toContain('record_id');
    expect(JSON.stringify(result)).not.toContain('table_id');
  });

  it('writes canonically only when the explicit write gate is enabled and reports verified readback', async () => {
    const { source } = await seededSource();

    const result = await source.createCustomer({
      display_name: 'Connected fake customer',
      phone: '13800138000',
      wechat: 'connected-fake',
    });

    expect(result.status).toBe('READY');
    expect(result.data?.value?.display_name).toBe('Connected fake customer');
    expect(result.data?.commit.status).toBe('COMMITTED');
    expect(result.data?.commit.write_status).toBe('SUCCESS');
    expect(result.data?.commit.readback_status).toBe('VERIFIED');
    expect(result.data?.commit.external_record_id).toBeNull();
    expect(result.health.lastSuccessfulWriteAt).toEqual(expect.any(String));
    expect(result.health.lastReadbackStatus).toBe('VERIFIED');
    expect(result.health.error).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('rec_');
  });

  it('keeps a readback failure explicit while sanitizing provider details', async () => {
    const adapter = createFakeFeishuAdapter({
      corruptReadbackCustomer: { display_name: 'corrupted provider value' },
    });
    const { source } = await seededSource(adapter);

    const result = await source.createCustomer({ display_name: 'Expected customer' });

    expect(result.status).toBe('ERROR');
    expect(result.data?.commit.status).toBe('FAILED');
    expect(result.data?.commit.readback_status).toBe('FAILED');
    expect(result.health.lastSuccessfulWriteAt).toBeNull();
    expect(result.health.lastReadbackStatus).toBe('FAILED');
    expect(result.error).toEqual({
      code: 'FEISHU_READBACK_FAILED',
      message: 'Connected Feishu readback verification failed.',
    });
    expect(JSON.stringify(result)).not.toContain('corrupted provider value');
  });

  it('blocks default writes even when no fake gate is supplied', async () => {
    const adapter = createFakeFeishuAdapter();
    const source: ConnectedFeishuDataSource = createConnectedFeishuDataSource({ adapter });

    const result = await source.createCustomer({ display_name: 'must not write' });

    expect(result.status).toBe('BLOCKED');
    expect(result.error).toEqual({
      code: 'FEISHU_WRITE_BLOCKED',
      message: 'Connected Feishu writes are disabled for this server boundary.',
    });
    expect(result.data).toBeUndefined();
  });
});
