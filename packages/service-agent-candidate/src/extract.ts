/**
 * Requirement + customer-identity extraction for BUSOS-P1-02.
 *
 * Hard rules enforced here (project-control/03-DECISIONS.md, task BUSOS-P1-02):
 * - D012: every extracted value carries the source text that supports it.
 * - Never hallucinate. A value that is not stated is `null`, not a default.
 * - `preferred_date_text` keeps the customer's original wording. No date maths
 *   happens in V1 (04-INTERFACES.md §1).
 * - A single stated budget figure is preserved exactly. A hedge word such as
 *   "大概" must NOT be turned into an invented range (3500/4500).
 * - No rule may be a whole-sentence equality check against a canonical test
 *   sentence. Every extractor below is a general pattern over the message.
 */

/** An extracted value plus the exact substring of the message proving it. */
export interface ExtractedField<T> {
  value: T | null;
  /** Verbatim slice of the input message; `null` when nothing was extracted. */
  source_text: string | null;
}

export interface RequirementExtraction {
  service_type: ExtractedField<string>;
  budget_min: ExtractedField<number>;
  budget_max: ExtractedField<number>;
  preferred_date_text: ExtractedField<string>;
}

export interface IdentityExtraction {
  name: ExtractedField<string>;
  phone: ExtractedField<string>;
  wechat: ExtractedField<string>;
}

const EMPTY = <T>(): ExtractedField<T> => ({ value: null, source_text: null });

const CJK_CHAR = /[\u4e00-\u9fff]/;

// ---------------------------------------------------------------------------
// service_type
// ---------------------------------------------------------------------------

/**
 * Photography deliverable nouns for this business domain.
 *
 * Matched longest-first so that "个人写真" wins over "写真" and "婚纱照" wins
 * over "婚纱".
 */
const SHOOT_TYPE_NOUNS: readonly string[] = [
  '个人写真',
  '情侣写真',
  '闺蜜写真',
  '亲子写真',
  '孕妇写真',
  '全家福',
  '婚纱照',
  '婚纱',
  '亲子照',
  '闺蜜照',
  '情侣照',
  '证件照',
  '形象照',
  '艺术照',
  '毕业照',
  '商务照',
  '孕妇照',
  '宝宝照',
  '儿童照',
  '写真',
  '旅拍',
  '跟拍',
  '商业摄影',
  '人像摄影',
  '摄影',
  '拍摄',
];

const SHOOT_TYPE_NOUNS_BY_LENGTH: readonly string[] = [...SHOOT_TYPE_NOUNS].sort(
  (a, b) => b.length - a.length,
);

/**
 * Characters that terminate the style modifier scanned leftwards from the
 * deliverable noun: verbs, pronouns, particles, measure words, numerals and
 * time words. They are never part of a style name such as "新中式" or "韩式".
 */
const MODIFIER_STOP_CHARS: ReadonlySet<string> = new Set([
  // verbs / pronouns / particles
  '拍', '摄', '想', '要', '我', '你', '他', '她', '们', '的', '了', '是',
  '有', '在', '去', '来', '找', '约', '订', '预', '定', '做', '给', '帮',
  '咨', '询', '问', '看', '说', '能', '可', '会', '需',
  // measure words / numerals
  '套', '组', '张', '个', '次', '场', '份', '本', '件', '部', '一', '二',
  '三', '四', '五', '六', '七', '八', '九', '十', '两', '几', '半',
  // time words.
  // '日' is deliberately NOT a stop char: it opens the common style name
  // "日系写真". Calendar wording cannot leak in through it, because a date is
  // always separated from the deliverable noun either by a verb/measure word
  // ("10月1日拍一套写真" stops at '拍') or by a digit, and digits already stop
  // the scan as non-CJK characters.
  '月', '号', '天', '周', '年', '底', '初', '下', '上', '这', '那',
  '明', '今', '后', '前', '昨', '旬', '末', '时', '点',
  // conjunctions
  '和', '跟', '与', '及', '或',
]);

/** Upper bound on the style modifier, so a run-on clause cannot be absorbed. */
const MAX_MODIFIER_CHARS = 6;

/**
 * Extract the requested service type: an optional style modifier immediately
 * followed by a domain deliverable noun.
 *
 * Example: "拍一套新中式写真" -> the noun "写真" is found, then the scan walks
 * left over 式/中/新 and stops at the measure word "套", yielding "新中式写真".
 */
export function extractServiceType(message: string): ExtractedField<string> {
  for (const noun of SHOOT_TYPE_NOUNS_BY_LENGTH) {
    const nounIndex = message.indexOf(noun);
    if (nounIndex < 0) continue;

    let start = nounIndex;
    let taken = 0;
    while (start > 0 && taken < MAX_MODIFIER_CHARS) {
      const previous = message[start - 1];
      if (previous === undefined) break;
      if (!CJK_CHAR.test(previous)) break;
      if (MODIFIER_STOP_CHARS.has(previous)) break;
      start -= 1;
      taken += 1;
    }

    const value = message.slice(start, nounIndex + noun.length);
    return { value, source_text: value };
  }
  return EMPTY<string>();
}

// ---------------------------------------------------------------------------
// budget
// ---------------------------------------------------------------------------

/** Words that mark a following/preceding number as a money figure. */
const BUDGET_CUES: readonly string[] = [
  '预算',
  '报价',
  '价位',
  '价格',
  '费用',
  '花费',
  '多少钱',
];

/** How far after a cue a figure may sit and still belong to that cue. */
const BUDGET_LOOKAHEAD_CHARS = 16;

const AMOUNT_PATTERN =
  /(\d{1,10}(?:\.\d{1,2})?)\s*(万|千|k|K)?\s*(?:元|块钱|块|RMB|rmb)?/g;

const UNIT_MULTIPLIER: Record<string, number> = {
  万: 10_000,
  千: 1_000,
  k: 1_000,
  K: 1_000,
};

interface AmountToken {
  /** Offset of the first digit, relative to the scanned window. */
  start: number;
  /** Offset just past the consumed unit/currency suffix. */
  end: number;
  value: number;
}

/** Enumerate money figures in a window, ignoring digits inside longer runs. */
function scanAmounts(window: string): AmountToken[] {
  const tokens: AmountToken[] = [];
  AMOUNT_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = AMOUNT_PATTERN.exec(window)) !== null) {
    const digits = match[1];
    if (digits === undefined) continue;

    const start = match.index;
    const end = start + match[0].length;

    // Reject a figure glued to a longer digit run (e.g. an 11-digit phone).
    const charBefore = start > 0 ? window[start - 1] : undefined;
    if (charBefore !== undefined && /\d/.test(charBefore)) continue;

    const unit = match[2];
    const multiplier = unit === undefined ? 1 : (UNIT_MULTIPLIER[unit] ?? 1);
    const value = Number(digits) * multiplier;
    if (!Number.isFinite(value)) continue;

    tokens.push({ start, end, value });
  }
  return tokens;
}

const RANGE_SEPARATOR = /^\s*(?:-|－|—|~|～|to|到|至)\s*$/;
const UPPER_BOUND_HINT = /(以内|以下|不超过|不超|最多|封顶|之内)/;
const LOWER_BOUND_HINT = /(以上|至少|最少|起步|起)/;

type BudgetExtraction = Pick<RequirementExtraction, 'budget_min' | 'budget_max'>;

/**
 * Extract the stated budget.
 *
 * Behaviour:
 * - "预算3000-5000" -> budget_min 3000, budget_max 5000.
 * - "预算4000以内"   -> budget_max 4000.
 * - "预算4000以上"   -> budget_min 4000.
 * - "预算大概4000"   -> budget_max 4000 (04-INTERFACES.md §1 represents a
 *   single stated figure as the upper bound). The hedge "大概" is recorded in
 *   the evidence text but never expanded into an invented range.
 */
export function extractBudget(message: string): BudgetExtraction {
  for (const cue of BUDGET_CUES) {
    const cueIndex = message.indexOf(cue);
    if (cueIndex < 0) continue;

    const cueEnd = cueIndex + cue.length;
    const window = message.slice(cueEnd, cueEnd + BUDGET_LOOKAHEAD_CHARS);
    const amounts = scanAmounts(window);
    const first = amounts[0];
    if (first === undefined) continue;

    // Range: two figures separated only by a range separator.
    const second = amounts[1];
    if (second !== undefined) {
      const between = window.slice(first.end, second.start);
      if (RANGE_SEPARATOR.test(between)) {
        const span = message.slice(cueIndex, cueEnd + second.end);
        return {
          budget_min: { value: first.value, source_text: span },
          budget_max: { value: second.value, source_text: span },
        };
      }
    }

    const span = message.slice(cueIndex, cueEnd + first.end);
    const textBefore = window.slice(0, first.start);
    const textAfter = window.slice(first.end, first.end + 4);

    if (UPPER_BOUND_HINT.test(textBefore) || UPPER_BOUND_HINT.test(textAfter)) {
      return {
        budget_min: EMPTY<number>(),
        budget_max: { value: first.value, source_text: span },
      };
    }
    if (LOWER_BOUND_HINT.test(textBefore) || LOWER_BOUND_HINT.test(textAfter)) {
      return {
        budget_min: { value: first.value, source_text: span },
        budget_max: EMPTY<number>(),
      };
    }

    return {
      budget_min: EMPTY<number>(),
      budget_max: { value: first.value, source_text: span },
    };
  }

  return { budget_min: EMPTY<number>(), budget_max: EMPTY<number>() };
}

// ---------------------------------------------------------------------------
// preferred_date_text
// ---------------------------------------------------------------------------

/**
 * Date expressions, ordered so that the most specific wording wins
 * ("下下个月" before "下个月", "下周末" before "下周").
 *
 * V1 stores the matched wording verbatim; it is never normalised to a calendar
 * date (04-INTERFACES.md §1).
 */
const DATE_PATTERNS: readonly RegExp[] = [
  /下下个月|下下月/,
  /下个月|下月/,
  /这个月|本月|当月/,
  /下下周末|下下个周末/,
  /下个周末|下周末/,
  /这个周末|本周末|这周末/,
  /下个星期|下个礼拜|下星期|下礼拜|下周/,
  /这个星期|本星期|本周|这周/,
  /月底|月初|月中/,
  /年底|年初|年中/,
  /大后天|后天|明天|今天|今晚|明晚|明早/,
  /国庆|春节|五一|元旦|中秋|清明|端午|情人节|圣诞|跨年|七夕/,
  /寒假|暑假|小长假|假期/,
  /\d{4}年\d{1,2}月\d{1,2}[日号]/,
  /\d{4}年\d{1,2}月/,
  /\d{1,2}月\d{1,2}[日号]/,
  /\d{1,2}月底|\d{1,2}月初/,
  /\d{1,2}月/,
  /\d{1,2}[日号]/,
  /星期[一二三四五六日天]|周[一二三四五六日天]/,
];

/** Extract the preferred date wording, preserved exactly as written. */
export function extractPreferredDateText(
  message: string,
): ExtractedField<string> {
  for (const pattern of DATE_PATTERNS) {
    const match = pattern.exec(message);
    if (match !== null && match[0].length > 0) {
      return { value: match[0], source_text: match[0] };
    }
  }
  return EMPTY<string>();
}

// ---------------------------------------------------------------------------
// customer identity
// ---------------------------------------------------------------------------

const NAME_PATTERN =
  /(?:我(?:是|叫)|本人(?:是|叫)?|这边是|这是)\s*([\u4e00-\u9fff]{2,4})/;

/**
 * Characters that reveal the "name" capture is really a verb phrase
 * ("我想…", "我要…"), which must not become a customer name.
 */
const NOT_NAME_LEADING_CHARS: ReadonlySet<string> = new Set([
  '想', '要', '来', '去', '在', '的', '和', '有', '看', '问', '找', '咨',
  '预', '打', '说', '觉', '准', '不', '这', '那', '为', '会', '能', '可',
  '刚', '就', '还', '也', '很', '真',
]);

const PHONE_PATTERN = /(?<!\d)(1[3-9]\d{9})(?!\d)/;

const WECHAT_PATTERN =
  /(?:微信号|微信|weixin|wechat|WeChat|wx|WX|vx|VX)\s*(?:是|为)?\s*[:：]?\s*([A-Za-z][A-Za-z0-9_-]{4,19})/;

/**
 * Extract customer identity **only when explicitly stated**.
 *
 * Anything absent stays `null`. Guessing, defaulting or reusing test-user data
 * is forbidden (task BUSOS-P1-02 §6, 04-INTERFACES.md §1).
 */
export function extractIdentity(message: string): IdentityExtraction {
  const result: IdentityExtraction = {
    name: EMPTY<string>(),
    phone: EMPTY<string>(),
    wechat: EMPTY<string>(),
  };

  const nameMatch = NAME_PATTERN.exec(message);
  if (nameMatch !== null) {
    const capturedName = nameMatch[1];
    const leading = capturedName?.[0];
    if (
      capturedName !== undefined &&
      leading !== undefined &&
      !NOT_NAME_LEADING_CHARS.has(leading)
    ) {
      result.name = { value: capturedName, source_text: nameMatch[0] };
    }
  }

  const phoneMatch = PHONE_PATTERN.exec(message);
  if (phoneMatch !== null) {
    const capturedPhone = phoneMatch[1];
    if (capturedPhone !== undefined) {
      result.phone = { value: capturedPhone, source_text: capturedPhone };
    }
  }

  const wechatMatch = WECHAT_PATTERN.exec(message);
  if (wechatMatch !== null) {
    const capturedWechat = wechatMatch[1];
    if (capturedWechat !== undefined) {
      result.wechat = { value: capturedWechat, source_text: wechatMatch[0] };
    }
  }

  return result;
}

/** Extract the full requirement block from a consultation message. */
export function extractRequirement(message: string): RequirementExtraction {
  const budget = extractBudget(message);
  return {
    service_type: extractServiceType(message),
    budget_min: budget.budget_min,
    budget_max: budget.budget_max,
    preferred_date_text: extractPreferredDateText(message),
  };
}
