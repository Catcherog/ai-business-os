import { describe, expect, it } from 'vitest';

import {
  extractBudget,
  extractIdentity,
  extractPreferredDateText,
  extractServiceType,
} from '../src/extract.js';
import { CANONICAL_MESSAGE } from './fixtures.js';

/**
 * Extraction rules must be general patterns, never a special case for the
 * canonical sentence. Each block therefore checks the canonical value *and*
 * other phrasings that exercise the same rule.
 */

describe('extractServiceType', () => {
  it('extracts 新中式写真 from the canonical message', () => {
    expect(extractServiceType(CANONICAL_MESSAGE)).toEqual({
      value: '新中式写真',
      source_text: '新中式写真',
    });
  });

  it('generalises the style-modifier rule to other wordings', () => {
    // Same rule, different sentence shapes: proves it is not sentence-matching.
    expect(extractServiceType('拍新中式写真').value).toBe('新中式写真');
    expect(extractServiceType('新中式写真怎么收费').value).toBe('新中式写真');
    expect(extractServiceType('想约两套韩式婚纱照').value).toBe('韩式婚纱照');
    expect(extractServiceType('预约日系写真').value).toBe('日系写真');
    expect(extractServiceType('汉服写真多少钱').value).toBe('汉服写真');
  });

  it('stops at measure words, verbs and time words', () => {
    expect(extractServiceType('我想拍写真').value).toBe('写真');
    expect(extractServiceType('下个月拍一套写真').value).toBe('写真');
    expect(extractServiceType('拍一组全家福').value).toBe('全家福');
  });

  it('prefers the longest deliverable noun', () => {
    expect(extractServiceType('想拍婚纱照').value).toBe('婚纱照');
    expect(extractServiceType('个人写真怎么拍').value).toBe('个人写真');
  });

  it('returns null rather than guessing when no service is stated', () => {
    expect(extractServiceType('你们几点关门')).toEqual({
      value: null,
      source_text: null,
    });
  });
});

describe('extractBudget', () => {
  it('preserves 4000 exactly from the canonical message', () => {
    const budget = extractBudget(CANONICAL_MESSAGE);
    expect(budget.budget_max).toEqual({
      value: 4000,
      source_text: '预算大概4000',
    });
    expect(budget.budget_min.value).toBeNull();
  });

  it('does not invent a range from a hedge word', () => {
    // "大概" must never become 3500/4500 (task BUSOS-P1-02 §6).
    const budget = extractBudget('预算大概4000');
    expect(budget.budget_min.value).toBeNull();
    expect(budget.budget_max.value).toBe(4000);
  });

  it('reads an explicit range into min and max', () => {
    const budget = extractBudget('预算3000-5000');
    expect(budget.budget_min.value).toBe(3000);
    expect(budget.budget_max.value).toBe(5000);

    const cnRange = extractBudget('预算3000到5000元');
    expect(cnRange.budget_min.value).toBe(3000);
    expect(cnRange.budget_max.value).toBe(5000);
  });

  it('honours upper and lower bound wording', () => {
    expect(extractBudget('预算4000以内').budget_max.value).toBe(4000);
    expect(extractBudget('预算4000以内').budget_min.value).toBeNull();
    expect(extractBudget('预算5000以上').budget_min.value).toBe(5000);
    expect(extractBudget('预算5000以上').budget_max.value).toBeNull();
    expect(extractBudget('预算不超过8000').budget_max.value).toBe(8000);
  });

  it('applies 万/千 units', () => {
    expect(extractBudget('预算1万').budget_max.value).toBe(10_000);
    expect(extractBudget('预算大概5千').budget_max.value).toBe(5_000);
  });

  it('returns null when no budget is stated', () => {
    const budget = extractBudget('我想下个月拍写真');
    expect(budget.budget_min.value).toBeNull();
    expect(budget.budget_max.value).toBeNull();
  });

  it('does not read a phone number as a budget', () => {
    const budget = extractBudget('手机13800138000，想问下写真');
    expect(budget.budget_max.value).toBeNull();
  });
});

describe('extractPreferredDateText', () => {
  it('keeps 下个月 verbatim for the canonical message', () => {
    expect(extractPreferredDateText(CANONICAL_MESSAGE)).toEqual({
      value: '下个月',
      source_text: '下个月',
    });
  });

  it('never normalises wording into a calendar date', () => {
    const extracted = extractPreferredDateText(CANONICAL_MESSAGE);
    expect(extracted.value).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('prefers the most specific wording', () => {
    expect(extractPreferredDateText('下下个月拍').value).toBe('下下个月');
    expect(extractPreferredDateText('下周末有空吗').value).toBe('下周末');
    expect(extractPreferredDateText('下周有档期吗').value).toBe('下周');
  });

  it('handles explicit and holiday dates verbatim', () => {
    expect(extractPreferredDateText('想约10月1日').value).toBe('10月1日');
    expect(extractPreferredDateText('国庆想拍').value).toBe('国庆');
    expect(extractPreferredDateText('月底可以吗').value).toBe('月底');
  });

  it('returns null when no date is stated', () => {
    expect(extractPreferredDateText('写真多少钱')).toEqual({
      value: null,
      source_text: null,
    });
  });
});

describe('extractIdentity', () => {
  it('keeps every identity field null for the canonical message', () => {
    const identity = extractIdentity(CANONICAL_MESSAGE);
    expect(identity.name.value).toBeNull();
    expect(identity.phone.value).toBeNull();
    expect(identity.wechat.value).toBeNull();
  });

  it('does not mistake 我想 for a stated name', () => {
    expect(extractIdentity('我想拍写真').name.value).toBeNull();
    expect(extractIdentity('我要问一下价格').name.value).toBeNull();
  });

  it('extracts identity only when explicitly stated', () => {
    const identity = extractIdentity(
      '我是张三，微信 zhangsan123，手机13800138000',
    );
    expect(identity.name.value).toBe('张三');
    expect(identity.wechat.value).toBe('zhangsan123');
    expect(identity.phone.value).toBe('13800138000');
  });

  it('keeps source text for stated identity values', () => {
    const identity = extractIdentity('我叫李四');
    expect(identity.name.value).toBe('李四');
    expect(identity.name.source_text).toBe('我叫李四');
  });
});
