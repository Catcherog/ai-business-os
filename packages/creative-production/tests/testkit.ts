import type { Project, Task, Asset, CommitResultV1 } from '@busos/contracts';
import {
  BusinessRepository,
  FakeFeishuAdapter,
  type FakeFeishuAdapterOptions,
} from '@busos/business-repository';
import type { TaskCreateInput, AssetCreateInput } from '@busos/business-repository';
import { FakeLumenAdapter } from '@busos/lumen-adapter';
import type { LumenPort } from '@busos/lumen-adapter';
import type { CreativeProductionRepository, CreativeProductionDeps } from '../src/index.js';

/**
 * Test support kit for BUSOS-P5-01 (mirrors project-lifecycle's testkit).
 *
 * The CountingBusinessRepository is a pass-through wrapper around
 * `BusinessRepository` (backed by an in-memory FakeFeishuAdapter) that counts
 * the creative-production write operations. This is how the tests prove
 * "writes = 0" on eligibility blocks and exact counts on the happy path.
 */
export class CountingBusinessRepository implements CreativeProductionRepository {
  writes = { task: 0, asset: 0, taskStatusUpdate: 0 };

  constructor(private readonly repo: BusinessRepository) {}

  async getProject(projectId: string): Promise<Project | null> {
    return this.repo.getProject(projectId);
  }
  async createTask(input: TaskCreateInput): Promise<{ task: Task; commit: CommitResultV1 }> {
    this.writes.task += 1;
    return this.repo.createTask(input);
  }
  async getTask(taskId: string): Promise<Task | null> {
    return this.repo.getTask(taskId);
  }
  async updateTaskStatus(taskId: string, status: Task['status']) {
    this.writes.taskStatusUpdate += 1;
    return this.repo.updateTaskStatus(taskId, status);
  }
  async createAsset(input: AssetCreateInput): Promise<{ asset: Asset; commit: CommitResultV1 }> {
    this.writes.asset += 1;
    return this.repo.createAsset(input);
  }
  async getAsset(assetId: string): Promise<Asset | null> {
    return this.repo.getAsset(assetId);
  }
  async deleteTask(recordId: string): Promise<boolean> {
    return this.repo.deleteTask(recordId);
  }
  async deleteAsset(recordId: string): Promise<boolean> {
    return this.repo.deleteAsset(recordId);
  }
}

export interface FakeEnv {
  deps: CreativeProductionDeps;
  counts: CountingBusinessRepository;
  repo: BusinessRepository;
  adapter: FakeFeishuAdapter;
  lumen: LumenPort;
}

export function makeEnv(opts: { adapterOpts?: FakeFeishuAdapterOptions; lumen?: LumenPort } = {}): FakeEnv {
  const adapter = new FakeFeishuAdapter(opts.adapterOpts ?? {});
  const repo = new BusinessRepository(adapter);
  const counts = new CountingBusinessRepository(repo);
  const lumen = opts.lumen ?? new FakeLumenAdapter();
  return { deps: { businessRepository: counts, lumen }, counts, repo, adapter, lumen };
}

/** Seed a Project (any status) directly via the repository; returns its id. */
export async function seedProject(repo: BusinessRepository, status: Project['status']): Promise<string> {
  const out = await repo.createProject({
    customer_id: 'cust_seed',
    lead_id: 'lead_seed',
    project_type: 'BRAND',
    title: 'Seed Project',
    status,
    scheduled_date: null,
  });
  return out.project.project_id;
}

export { FakeFeishuAdapter, FakeLumenAdapter };
