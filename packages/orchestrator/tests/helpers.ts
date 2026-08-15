import { BusinessRepository, FakeFeishuAdapter } from '@busos/business-repository';
import { createFakeLumenAdapter } from '@busos/lumen-adapter';
import { govern } from '@busos/golden-path';
import type { GovernanceFn } from '@busos/golden-path';
import type { LumenPort } from '@busos/lumen-adapter';
import type { OrchestratorInput } from '../src/index.js';

/**
 * Shared fixtures for the BUSOS-P6-02 orchestrator reliability gates.
 *
 * Downstream execution is proven with real call COUNTERS (not by comparing two
 * return values), so idempotency gates can assert that a duplicate call
 * performed no work at all.
 */

/** Customer-linked, governance-approved consultation (golden-path Flow B). */
export const IDENTIFIED_TEXT =
  '我是张三，微信 zhangsan123，想下个月拍新中式写真，预算4000。';

/** Any non-empty base64 + png mime satisfies creative eligibility in fakes. */
export const SOURCE_IMAGE_B64 = 'aGVsbG8td29ybGQtZmFrZS1wbmc=';

export function validInput(
  overrides: Partial<OrchestratorInput> = {},
): OrchestratorInput {
  return {
    goldenPath: { text: IDENTIFIED_TEXT },
    projectType: 'portrait_shoot',
    projectTitle: '新中式写真拍摄',
    scheduledDate: '2026-09-15',
    creativeTitle: 'Blue background edit',
    prompt: 'make the background blue',
    sourceImageBase64: SOURCE_IMAGE_B64,
    sourceImageMimeType: 'image/png',
    ...overrides,
  };
}

/** Per-stage downstream side-effect counters. */
export interface DownstreamCounts {
  /** GOLDEN_PATH executed a Lead write. */
  createLead: number;
  /** PROJECT_LIFECYCLE executed a Project write. */
  createProject: number;
  /** CREATIVE_PRODUCTION invoked Lumen generation. */
  lumenGenerate: number;
  /** CREATIVE_PRODUCTION executed an Asset write. */
  createAsset: number;
}

export interface CountingDeps {
  businessRepository: BusinessRepository;
  lumen: LumenPort;
  counts: DownstreamCounts;
}

/**
 * Build fake-backed deps whose stage-entry operations are counted, with optional
 * fault injection per operation.
 */
export function createCountingDeps(
  faults: {
    failGeneration?: boolean;
    createLeadError?: Error;
    createProjectError?: Error;
    createAssetError?: Error;
    lumenGenerateError?: Error;
  } = {},
): CountingDeps {
  const counts: DownstreamCounts = {
    createLead: 0,
    createProject: 0,
    lumenGenerate: 0,
    createAsset: 0,
  };

  const repo = new BusinessRepository(new FakeFeishuAdapter());

  const origCreateLead = repo.createLead.bind(repo);
  repo.createLead = async (i) => {
    counts.createLead += 1;
    if (faults.createLeadError) throw faults.createLeadError;
    return origCreateLead(i);
  };

  const origCreateProject = repo.createProject.bind(repo);
  repo.createProject = async (i) => {
    counts.createProject += 1;
    if (faults.createProjectError) throw faults.createProjectError;
    return origCreateProject(i);
  };

  const origCreateAsset = repo.createAsset.bind(repo);
  repo.createAsset = async (i) => {
    counts.createAsset += 1;
    if (faults.createAssetError) throw faults.createAssetError;
    return origCreateAsset(i);
  };

  const baseLumen = createFakeLumenAdapter(
    faults.failGeneration ? { failGeneration: true } : {},
  );
  const lumen: LumenPort = {
    generate: async (i) => {
      counts.lumenGenerate += 1;
      if (faults.lumenGenerateError) throw faults.lumenGenerateError;
      return baseLumen.generate(i);
    },
    release: (id) => baseLumen.release(id),
  };

  return { businessRepository: repo, lumen, counts };
}

/** Governance override that always REJECTs (business rejection, not a fault). */
export const rejectingGovernance: GovernanceFn = (candidate) => ({
  ...govern(candidate),
  decision: 'REJECT' as const,
});

/** Governance override that always requires a human decision. */
export const reviewRequiredGovernance: GovernanceFn = (candidate) => ({
  ...govern(candidate),
  decision: 'REVIEW_REQUIRED' as const,
});
