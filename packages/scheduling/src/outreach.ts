import type { CommunicationScript } from '@busos/contracts';
import type { OutreachDraft, OutreachInput, SchedulingProposal } from './types.js';

function replaceToken(template: string, token: string, value: string): string {
  return template
    .replaceAll(`{{${token}}}`, value)
    .replaceAll(`{${token}}`, value)
    .replaceAll(`【${token}】`, value);
}

function selectScript(input: OutreachInput): CommunicationScript | null {
  const scripts = input.scripts
    .filter((script) => script.status === 'ACTIVE')
    .filter((script) => !input.audience || script.audience === input.audience)
    .filter((script) => !input.scene || script.scene === input.scene)
    .slice()
    .sort((left, right) => {
      const leftSpecific = left.resource_type === input.resource.resource_type ? 1 : 0;
      const rightSpecific = right.resource_type === input.resource.resource_type ? 1 : 0;
      return rightSpecific - leftSpecific || left.script_id.localeCompare(right.script_id);
    });
  return scripts[0] ?? null;
}

function addMissing(missingFacts: string[], questions: string[], key: string, question: string): void {
  missingFacts.push(key);
  questions.push(`【${question}】`);
}

function renderTemplate(
  template: string,
  input: OutreachInput,
  proposal: SchedulingProposal | null,
): string {
  let result = template;
  const values: Record<string, string> = {
    resource_name: input.resource.name,
    project_name: input.projectName ?? '【请确认项目名称】',
    resource_type: input.resource.resource_type,
  };
  if (proposal) {
    values.proposed_start = proposal.startAt;
    values.proposed_end = proposal.endAt;
  }
  for (const [token, value] of Object.entries(values)) result = replaceToken(result, token, value);
  return result;
}

function knownFactLines(
  input: OutreachInput,
  proposal: SchedulingProposal | null,
  missingFacts: string[],
  questions: string[],
): string[] {
  const lines: string[] = [];
  const requirement = input.requirement;
  if (input.projectName) lines.push(`项目：${input.projectName}`);
  lines.push(`合作资源：${input.resource.name}`);

  const dateStart = proposal?.startAt ?? requirement?.date_window_start ?? null;
  const dateEnd = proposal?.endAt ?? requirement?.date_window_end ?? null;
  if (dateStart && dateEnd) lines.push(`预计时间：${dateStart} 至 ${dateEnd}`);
  else addMissing(missingFacts, questions, 'date_window', '请确认预计拍摄日期');

  const duration = requirement?.duration_hours;
  if (duration !== null && duration !== undefined && Number.isFinite(duration) && duration > 0) {
    lines.push(`预计时长：${duration}小时`);
  } else {
    addMissing(missingFacts, questions, 'duration_hours', '请确认预计拍摄时长');
  }

  if (requirement?.location) lines.push(`拍摄地点：${requirement.location}`);
  else addMissing(missingFacts, questions, 'location', '请确认拍摄地点');

  if (requirement?.budget_max !== null && requirement?.budget_max !== undefined) {
    lines.push(`预算上限：${requirement.budget_max}`);
  } else {
    addMissing(missingFacts, questions, 'budget', '请确认预算范围');
  }

  if (requirement?.required === 'UNKNOWN') {
    addMissing(missingFacts, questions, 'required', '请确认该资源是否为必选');
  }
  return lines;
}

/** Generate copyable text only; this function never sends or schedules a message. */
export function draftAvailabilityOutreach(input: OutreachInput): OutreachDraft {
  const script = selectScript(input);
  const missingFacts: string[] = [];
  const questions: string[] = [];
  const warnings: string[] = [];
  if (!input.projectId.trim()) throw new Error('project id is required');

  const proposal = input.proposal ?? null;
  const template = script?.body ?? '【缺少可用沟通话术模板】';
  if (!script) {
    missingFacts.push('script_template');
    warnings.push('NO_ACTIVE_SCRIPT');
  }
  if (!input.projectName) warnings.push('PROJECT_NAME_UNKNOWN');
  const body = [
    renderTemplate(template, input, proposal),
    ...knownFactLines(input, proposal, missingFacts, questions),
    ...questions,
  ].join('\n');
  if (missingFacts.length > 0) warnings.push('REQUIRED_FACTS_INCOMPLETE');

  return {
    draftId: `outreach:${input.projectId}:${input.resource.resource_key}:${script?.script_id ?? 'none'}`,
    projectId: input.projectId,
    resourceKey: input.resource.resource_key,
    resourceType: input.resource.resource_type,
    scriptId: script?.script_id ?? null,
    body,
    missingFacts,
    warnings,
  };
}
