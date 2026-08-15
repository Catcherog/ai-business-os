import type {
  Lead,
  Customer,
  Project,
  Task,
  Asset,
} from '@busos/contracts';
import type { BusinessRepository } from '@busos/business-repository';

/** The deterministic demo dataset produced by {@link seedFakeWorkspace}. */
export interface SeededWorkspace {
  /** The repository the seed was written through (in-memory fake). */
  repo: BusinessRepository;
  leads: Lead[];
  customers: Customer[];
  projects: Project[];
  tasks: Task[];
  assets: Asset[];
}

/**
 * Populate a (typically `FakeFeishuAdapter`-backed) repository with a
 * deterministic demo dataset so the Operator Workspace has something to show:
 *
 * - 2 Customers, 2 Leads
 * - 2 Projects (IN_PROGRESS + CONFIRMED)
 * - 3 + 2 Tasks across the two projects
 * - 1 Asset per project (IMAGE sourced from LUMEN)
 *
 * This goes through the repository's *create* methods on purpose: it exercises
 * the exact same write->readback pipeline the production surface uses, so the
 * read surface is validated against real stored canonical data. It is seed
 * setup, not a user mutation — the workspace UI itself remains read-only.
 *
 * IDs are repository-assigned (random), but the *content* (names, types,
 * statuses, counts) is fixed, which is what the acceptance gates assert.
 */
export async function seedFakeWorkspace(
  repo: BusinessRepository,
): Promise<SeededWorkspace> {
  const leads: Lead[] = [];
  const customers: Customer[] = [];
  const projects: Project[] = [];
  const tasks: Task[] = [];
  const assets: Asset[] = [];

  // ---- Customer + Lead + Project A -------------------------------------------
  const leadA = await repo.createLead({
    customer_id: null,
    source_session_id: 'sess_seed_a0001',
    source_candidate_id: 'cand_seed_a0001',
    service_type: '新中式写真',
    budget_min: 3500,
    budget_max: 4000,
    preferred_date_text: '下个月',
    status: 'QUALIFIED',
  });
  leads.push(leadA.lead);

  const custA = await repo.createCustomer({
    display_name: '林晚晴',
    phone: '13900000001',
    wechat: 'linwanqing',
    status: 'ACTIVE',
  });
  customers.push(custA.customer);

  const projA = await repo.createProject({
    customer_id: custA.customer.customer_id,
    lead_id: leadA.lead.lead_id,
    project_type: '写真',
    title: '林晚晴 · 新中式写真',
    status: 'IN_PROGRESS',
    scheduled_date: '2026-09-20',
  });
  projects.push(projA.project);

  const taskA1 = await repo.createTask({
    project_id: projA.project.project_id,
    task_type: 'PREP',
    title: '场地勘景',
    status: 'DONE',
  });
  tasks.push(taskA1.task);

  const taskA2 = await repo.createTask({
    project_id: projA.project.project_id,
    task_type: 'PREP',
    title: '造型沟通',
    status: 'IN_PROGRESS',
  });
  tasks.push(taskA2.task);

  const taskA3 = await repo.createTask({
    project_id: projA.project.project_id,
    task_type: 'SHOOT',
    title: '正片拍摄',
    status: 'TODO',
  });
  tasks.push(taskA3.task);

  const assetA = await repo.createAsset({
    project_id: projA.project.project_id,
    task_id: taskA3.task.task_id,
    asset_type: 'IMAGE',
    source: 'LUMEN',
    asset_uri: 'lumen://gen/seed-proj-a-portrait-001',
    mime_type: 'image/jpeg',
  });
  assets.push(assetA.asset);

  // ---- Customer + Lead + Project B -------------------------------------------
  const leadB = await repo.createLead({
    customer_id: null,
    source_session_id: 'sess_seed_b0002',
    source_candidate_id: 'cand_seed_b0002',
    service_type: '婚纱摄影',
    budget_min: 8000,
    budget_max: 12000,
    preferred_date_text: '国庆期间',
    status: 'CONVERTED',
  });
  leads.push(leadB.lead);

  const custB = await repo.createCustomer({
    display_name: '陈思远',
    phone: '13900000002',
    wechat: 'chensiyuan',
    status: 'ACTIVE',
  });
  customers.push(custB.customer);

  const projB = await repo.createProject({
    customer_id: custB.customer.customer_id,
    lead_id: leadB.lead.lead_id,
    project_type: '婚纱',
    title: '陈思远 · 婚纱套系',
    status: 'CONFIRMED',
    scheduled_date: '2026-10-01',
  });
  projects.push(projB.project);

  const taskB1 = await repo.createTask({
    project_id: projB.project.project_id,
    task_type: 'PREP',
    title: '需求确认',
    status: 'DONE',
  });
  tasks.push(taskB1.task);

  const taskB2 = await repo.createTask({
    project_id: projB.project.project_id,
    task_type: 'SHOOT',
    title: '拍摄执行',
    status: 'TODO',
  });
  tasks.push(taskB2.task);

  const assetB = await repo.createAsset({
    project_id: projB.project.project_id,
    task_id: taskB1.task.task_id,
    asset_type: 'IMAGE',
    source: 'LUMEN',
    asset_uri: 'lumen://gen/seed-proj-b-wedding-001',
    mime_type: 'image/jpeg',
  });
  assets.push(assetB.asset);

  return {
    repo,
    leads,
    customers,
    projects,
    tasks,
    assets,
  };
}
