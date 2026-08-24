/**
 * Lumen capability layer — the ONLY Lumen surface the UI / application depends on.
 *
 * These definitions describe WHAT the user can do (a capability template) and
 * the input schema for it. They contain ZERO RunningHub detail (node ids,
 * workflow ids, auth) — that lives behind `RunningHubLumenAdapter` and is
 * supplied server-side from owner configuration (§19). The browser renders
 * capability cards from this list and posts a `LumenWorkflowInput`; the server
 * maps the chosen capability to its RunningHub workflow.
 */
import type { LumenWorkflowType } from './workflow-types.js';

export interface LumenParamSpec {
  key: string;
  label: string;
  placeholder?: string;
  default?: string;
  required?: boolean;
}

export interface LumenCapabilityDefinition {
  type: LumenWorkflowType;
  /** Chinese display label for the capability card. */
  label: string;
  /** One-line description shown under the card. */
  description: string;
  /** Label for the free-text prompt field. */
  promptLabel: string;
  /** Placeholder for the free-text prompt field. */
  promptPlaceholder: string;
  /** Capability-specific structured parameters (rendered as inputs). */
  params: LumenParamSpec[];
  /** Whether the in-browser DEMO (FakeRunningHubAdapter) can exercise it. */
  demoSupported: boolean;
}

/**
 * The four core capabilities required by the task, plus the optional OUTPAINT
 * extension. OUTPAINT is `demoSupported` but the task marks it optional; the
 * real RunningHub wiring is owner-supplied config, so its absence there is an
 * honest per-capability BLOCKED, never a faked success.
 */
export const LUMEN_CAPABILITIES: LumenCapabilityDefinition[] = [
  {
    type: 'PRODUCT_SHOT',
    label: 'AI 产品图',
    description: '将商品图重绘为高质量电商主图 / 场景图。',
    promptLabel: '风格 / 场景描述',
    promptPlaceholder: '例如：白色背景棚拍风格，柔和光影，专业电商主图',
    params: [
      { key: 'style', label: '画风', placeholder: 'realistic / 3d / flat', default: 'realistic' },
      { key: 'ratio', label: '画幅', placeholder: '1:1 / 3:4 / 4:3', default: '1:1' },
    ],
    demoSupported: true,
  },
  {
    type: 'BACKGROUND_SWAP',
    label: 'AI 换背景',
    description: '保留主体，将背景替换为指定场景或风格。',
    promptLabel: '目标背景描述',
    promptPlaceholder: '例如：清晨咖啡馆窗边，暖光，虚化背景',
    params: [
      { key: 'scene', label: '场景', placeholder: 'studio / outdoor / custom', default: 'studio' },
    ],
    demoSupported: true,
  },
  {
    type: 'LOCAL_RETOUCH',
    label: 'AI 局部修图',
    description: '对图像局部区域进行擦除 / 修复 / 替换。',
    promptLabel: '修图指令',
    promptPlaceholder: '例如：去除右上角水印，修复划痕',
    params: [
      { key: 'mask', label: '区域提示', placeholder: 'auto / manual', default: 'auto' },
    ],
    demoSupported: true,
  },
  {
    type: 'STYLE_VARIATION',
    label: 'AI 风格变体',
    description: '在保留主体的前提下生成多种艺术风格变体。',
    promptLabel: '目标风格',
    promptPlaceholder: '例如：水彩插画风 / 赛博朋克 / 复古胶片',
    params: [
      { key: 'style', label: '风格', placeholder: 'watercolor / cyberpunk / film', default: 'watercolor' },
      { key: 'count', label: '变体数', placeholder: '1-4', default: '2' },
    ],
    demoSupported: true,
  },
  {
    type: 'OUTPAINT',
    label: 'AI 扩图',
    description: '将图像向外扩展，补充画面边界内容（可选能力）。',
    promptLabel: '扩展方向 / 描述',
    promptPlaceholder: '例如：向左右扩展，保持构图延续',
    params: [
      { key: 'direction', label: '方向', placeholder: 'left / right / all', default: 'all' },
    ],
    demoSupported: true,
  },
];

export function getLumenCapability(type: LumenWorkflowType): LumenCapabilityDefinition | undefined {
  return LUMEN_CAPABILITIES.find((c) => c.type === type);
}
