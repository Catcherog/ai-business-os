import {
  LUMEN_CAPABILITIES,
  type LumenWorkflowInput,
  type LumenWorkflowRunResult,
  type LumenWorkflowType,
} from '@busos/lumen-adapter';
import {
  runLumenWorkflowConnected,
  runLumenWorkflowDemo,
  type CreativeConnectedRunResult,
  type LumenRunResult,
} from '../../lumen-action.js';

type CreativeMode = 'DEMO' | 'CONNECTED' | 'BLOCKED';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return node;
}

function badge(value: CreativeMode): HTMLElement {
  return el('span', { class: `badge badge-${value.toLowerCase()}` }, [value]);
}

function statusPill(value: string): HTMLElement {
  return el('span', { class: `pill pill-${value}` }, [value]);
}

function section(title: string, children: (Node | string)[]): HTMLElement {
  return el('section', { class: 'section creative-panel' }, [
    el('div', { class: 'panel-head' }, [el('h2', {}, [title])]),
    ...children,
  ]);
}

interface CreativeJob {
  jobId: string;
  projectId: string;
  brief: string;
  capability: LumenWorkflowType;
  mode: CreativeMode;
  status: string;
  output: string | null;
  at: string;
  error?: string;
}

let creativeJobSequence = 0;

function outputUrl(result: LumenWorkflowRunResult): string | null {
  return result.outputImages[0]?.url ?? null;
}

function jobRow(job: CreativeJob): HTMLElement {
  return el('div', { class: 'creative-job-row', 'data-job-id': job.jobId }, [
    el('div', {}, [
      el('strong', {}, [job.brief || job.capability]),
      el('div', { class: 'muted' }, [`${job.jobId} · ${job.projectId} · ${job.at}`]),
    ]),
    el('div', { class: 'creative-job-status' }, [statusPill(job.status), badge(job.mode)]),
  ]);
}

function resultPanel(job: CreativeJob): HTMLElement {
  const rows: (Node | string)[] = [
    el('div', { class: 'panel-head' }, [
      el('div', {}, [el('h2', {}, ['Selected output']), el('p', { class: 'muted' }, [job.jobId])]),
      badge(job.mode),
    ]),
    el('div', { class: 'creative-result-status' }, [statusPill(job.status)]),
  ];
  if (job.output) {
    rows.push(
      el('div', { class: 'creative-output' }, [
        el('div', { class: 'creative-output-preview' }, [
          el('span', { class: 'eyebrow' }, ['OUTPUT']),
          el('strong', {}, [job.output]),
        ]),
        el('p', { class: 'muted' }, ['Output is shown as a provider-safe reference. DEMO output is not production media.']),
      ]),
    );
  }
  if (job.error) rows.push(el('p', { class: 'err' }, [job.error]));
  return el('section', { class: 'section creative-result', 'data-state': job.mode === 'BLOCKED' ? 'blocked' : job.status.toLowerCase() }, rows);
}

function normalizeResult(
  jobId: string,
  projectId: string,
  brief: string,
  capability: LumenWorkflowType,
  out: LumenRunResult | CreativeConnectedRunResult,
): CreativeJob {
  const result = out.result;
  const mode: CreativeMode = out.mode === 'LIVE' ? 'CONNECTED' : out.mode;
  return {
    jobId,
    projectId,
    brief,
    capability,
    mode,
    status: result.status,
    output: outputUrl(result),
    at: new Date(0).toISOString(),
    ...(result.errorMessage ? { error: `${result.errorCode ?? 'CREATIVE_ERROR'}: ${result.errorMessage}` } : {}),
  };
}

function inputFor(
  projectId: string,
  brief: string,
  capability: LumenWorkflowType,
  referenceAsset: string,
): LumenWorkflowInput {
  const dataUrl = referenceAsset.startsWith('data:')
    ? referenceAsset
    : 'data:image/png;base64,AAAA';
  return {
    workflowType: capability,
    sourceImageBase64: dataUrl,
    sourceImageMimeType: dataUrl.slice(5, dataUrl.indexOf(';')) || 'image/png',
    prompt: brief,
    params: { projectId },
  };
}

export interface CreativeViewOptions {
  initialProjectId?: string | null;
}

/**
 * Unified V1 Creative workspace. DEMO is the default browser channel; the
 * connected check calls the server boundary and surfaces BLOCKED explicitly.
 */
export function renderCreativeView(options: CreativeViewOptions = {}): HTMLElement {
  const projectId = el('input', { class: 'field', type: 'text', 'aria-label': 'Project' }) as HTMLInputElement;
  projectId.value = options.initialProjectId ?? 'proj_demo_001';
  const brief = el('textarea', {
    class: 'field creative-brief', rows: '3', 'aria-label': 'Brief',
    placeholder: 'Describe the visual output for this project…',
  }) as HTMLTextAreaElement;
  brief.value = '新中式人像主视觉 · 柔和自然光';
  const referenceAsset = el('input', {
    class: 'field', type: 'text', 'aria-label': 'Reference asset',
    placeholder: 'Reference asset URI or data URL',
  }) as HTMLInputElement;
  referenceAsset.value = 'demo://reference-assets/portrait-001';
  const capability = el('select', { class: 'field', 'aria-label': 'Creative capability' }) as HTMLSelectElement;
  for (const item of LUMEN_CAPABILITIES) capability.append(el('option', { value: item.type }, [item.label]));
  capability.value = LUMEN_CAPABILITIES[0]?.type ?? 'PRODUCT_SHOT';

  const jobs: CreativeJob[] = [];
  const jobsHost = el('div', { class: 'creative-jobs-list' });
  const resultHost = el('div', { class: 'creative-result-host' });
  const statusHost = el('div', { class: 'creative-status', role: 'status' });
  const demoButton = el('button', { class: 'btn-primary', type: 'button', 'data-action': 'creative-demo-run' }, ['Run DEMO']);
  const connectedButton = el('button', { class: 'btn', type: 'button', 'data-action': 'creative-connected-run' }, ['Check connected provider']);

  const renderJobs = (): void => {
    jobsHost.replaceChildren();
    if (!jobs.length) {
      jobsHost.append(el('p', { class: 'muted' }, ['No creative jobs yet. Run a DEMO job to create a traceable local job.']));
      return;
    }
    for (const job of jobs.slice(0, 8)) jobsHost.append(jobRow(job));
  };

  const run = async (mode: 'DEMO' | 'CONNECTED'): Promise<void> => {
    const chosen = capability.value as LumenWorkflowType;
    const input = inputFor(projectId.value.trim() || 'proj_demo_001', brief.value.trim(), chosen, referenceAsset.value.trim());
    demoButton.setAttribute('disabled', 'true');
    connectedButton.setAttribute('disabled', 'true');
    statusHost.replaceChildren(el('span', { class: 'muted' }, [mode === 'DEMO' ? 'Running local Creative DEMO…' : 'Checking connected Creative provider…']));
    const jobId = `creative_job_${String(++creativeJobSequence).padStart(3, '0')}`;
    try {
      const out = mode === 'DEMO'
        ? await runLumenWorkflowDemo(input)
        : await runLumenWorkflowConnected(input);
      const job = normalizeResult(jobId, input.params?.projectId ?? 'proj_demo_001', input.prompt ?? '', chosen, out);
      jobs.unshift(job);
      jobsHost.replaceChildren(...jobs.slice(0, 8).map(jobRow));
      resultHost.replaceChildren(resultPanel(job));
      statusHost.replaceChildren(
        badge(job.mode),
        el('span', { class: 'muted' }, [job.mode === 'BLOCKED' ? 'No provider result was fabricated.' : 'Job recorded in the local Creative history.']),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const job: CreativeJob = {
        jobId,
        projectId: input.params?.projectId ?? 'proj_demo_001',
        brief: input.prompt ?? '',
        capability: chosen,
        mode: mode === 'DEMO' ? 'DEMO' : 'BLOCKED',
        status: 'FAILED',
        output: null,
        at: new Date(0).toISOString(),
        error: `CREATIVE_REQUEST_FAILED: ${message}`,
      };
      jobs.unshift(job);
      jobsHost.replaceChildren(...jobs.slice(0, 8).map(jobRow));
      resultHost.replaceChildren(resultPanel(job));
    } finally {
      demoButton.removeAttribute('disabled');
      connectedButton.removeAttribute('disabled');
    }
  };

  demoButton.addEventListener('click', () => void run('DEMO'));
  connectedButton.addEventListener('click', () => void run('CONNECTED'));
  renderJobs();

  const root = el('div', { class: 'creative-view', 'data-surface': 'creative', 'data-journey': 'D' });
  root.append(
    el('div', { class: 'view-head' }, [
      el('span', { class: 'eyebrow' }, ['AI / CREATIVE']),
      el('h1', {}, ['Creative']),
      el('p', {}, ['Project-linked creative workspace with explicit DEMO and connected-provider states.']),
    ]),
    el('div', { class: 'runtime-strip' }, [badge('DEMO'), el('span', { class: 'muted' }, ['Local fake adapter · no provider credential in browser'])]),
    el('div', { class: 'creative-grid' }, [
      section('Project / brief', [
        el('label', { class: 'field-label' }, ['Project']), projectId,
        el('label', { class: 'field-label' }, ['Brief']), brief,
        el('label', { class: 'field-label' }, ['Reference assets']), referenceAsset,
        el('label', { class: 'field-label' }, ['Capability']), capability,
        el('div', { class: 'btn-row' }, [demoButton, connectedButton]),
        statusHost,
      ]),
      section('Recent Jobs', [jobsHost]),
    ]),
    resultHost,
    section('History / trace', [
      el('p', { class: 'muted' }, ['Every job has a stable job id and explicit provider mode. Open Runs for the full execution trace.']),
      el('a', { href: '#/runs' }, ['Open Runs →']),
    ]),
  );
  return root;
}
