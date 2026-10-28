import { beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../src/i18n';
import { fixtureText } from '../foundation/fixtures';
import {
  QUEST_TYPES as ORDER_QUEST_TYPES,
  REWARD_TYPES as ORDER_REWARD_TYPES,
  QUEST_TYPE_KEYS,
  REWARD_TYPE_KEYS,
  questTypeMeta,
  rewardTypeMeta,
} from '../../src/features/orders/catalog';
import {
  CONDITION_TYPES,
  ACTION_TYPES,
  EFFECT_TYPES,
  CONDITION_KEYS,
  ACTION_KEYS,
  EFFECT_KEYS,
  conditionTypeMeta,
  actionTypeMeta,
  effectTypeMeta,
} from '../../src/features/focus/catalog';
import {
  QUEST_TYPES as CONST_QUEST_TYPES,
  REWARD_TYPES as CONST_REWARD_TYPES,
  ordersText as constOrdersText,
} from '../../src/features/orders/ordersConstants';
import {
  CONDITION_TYPES as CONST_CONDITION_TYPES,
  ACTION_TYPES as CONST_ACTION_TYPES,
  EFFECT_TYPES as CONST_EFFECT_TYPES,
  focusText as constFocusText,
} from '../../src/features/focus/focusConstants';
import { ordersText } from '../../src/features/orders/ordersText';
import { focusText } from '../../src/features/focus/focusText';
import { FOCUS_LIMITS, QUEST_TYPES as HELP_QUESTS, REWARD_TYPES as HELP_REWARDS } from '../../src/features/project/help';
import { validateOrdersText } from '../../src/features/orders/ordersValidation';
import { validateFocusText, actionTypeAllowedHint, effectTypeAllowedHint, conditionUnknownHint } from '../../src/features/focus/focusValidation';
import { questTypeAllowedMessage, rewardTypeAllowedHint } from '../../src/features/orders/ordersValidation';
import { focusLimitText } from '../../src/features/project/help';
// @ts-ignore Node-only test helper; the app bundle never imports this test.
import { readFileSync } from 'node:fs';

const HAN = /[\u4e00-\u9fff]/;

function keysOf<T extends { value: string }>(items: T[]): string[] {
  return items.map((item) => item.value);
}

beforeEach(() => {
  setLocale('zh-CN', { persist: false, notify: false });
});

describe('per-feature catalogs', () => {
  it('5 类 catalog 的值唯一、keys 对齐、lookup 正常', () => {
    const groups = [
      [ORDER_QUEST_TYPES, QUEST_TYPE_KEYS],
      [ORDER_REWARD_TYPES, REWARD_TYPE_KEYS],
      [CONDITION_TYPES, CONDITION_KEYS],
      [ACTION_TYPES, ACTION_KEYS],
      [EFFECT_TYPES, EFFECT_KEYS],
    ] as const;
    for (const [items, keys] of groups) {
      const values = keysOf(items as { value: string }[]);
      expect(new Set(values).size).toBe(values.length);
      expect(keys).toEqual(values);
    }
    expect(questTypeMeta('feed')?.target).toBe('mob');
    expect(questTypeMeta('nope')).toBeUndefined();
    expect(rewardTypeMeta('ITEM')?.label).toBeTruthy();
    expect(rewardTypeMeta('nope')).toBeUndefined();
    expect(conditionTypeMeta('company_money')?.kind).toBe('number');
    expect(conditionTypeMeta('nope')).toBeUndefined();
    expect(actionTypeMeta('CONSOLE_COMMAND')?.kind).toBe('stringList');
    expect(actionTypeMeta('nope')).toBeUndefined();
    expect(effectTypeMeta('mob_drops_add')?.rowKind).toBe('drop');
    expect(effectTypeMeta('nope')).toBeUndefined();
  });

  it('constants 与 catalog 是同一数组引用，text helper 独立', () => {
    expect(CONST_QUEST_TYPES).toBe(ORDER_QUEST_TYPES);
    expect(CONST_REWARD_TYPES).toBe(ORDER_REWARD_TYPES);
    expect(CONST_CONDITION_TYPES).toBe(CONDITION_TYPES);
    expect(CONST_ACTION_TYPES).toBe(ACTION_TYPES);
    expect(CONST_EFFECT_TYPES).toBe(EFFECT_TYPES);
    expect(constOrdersText).toBe(ordersText);
    expect(constFocusText).toBe(focusText);
  });

  it('help Quest/Reward id 从 catalog 派生且包含 label/target/syntax', () => {
    expect(HELP_QUESTS.map((item) => item.id)).toEqual(QUEST_TYPE_KEYS);
    expect(HELP_REWARDS.map((item) => item.id)).toEqual(REWARD_TYPE_KEYS);
    for (const item of HELP_QUESTS) {
      expect(item.label).toBeTruthy();
      expect(['item', 'mob']).toContain(item.target);
    }
    for (const item of HELP_REWARDS) {
      expect(item.label).toBeTruthy();
      expect(item.syntax).toContain(item.id);
    }
  });

  it('English help focus 列表包含全部 catalog keys 且无中文回退', () => {
    setLocale('en', { persist: false });
    const text = FOCUS_LIMITS.map((item) => item.text).join('\n');
    for (const key of [...CONDITION_KEYS, ...ACTION_KEYS, ...EFFECT_KEYS]) {
      expect(text).toContain(key);
    }
    expect(text).not.toMatch(HAN);
    setLocale('zh-CN', { persist: false });
  });

  it('orders 校验允许列表从 catalog keys 派生（code/blocking 不变）', () => {
    const badQuest = fixtureText('orders.yml').replace('type: break_block', 'type: not_a_type');
    const questIssues = validateOrdersText(badQuest, 'orders.yml', new Map());
    const ord20 = questIssues.find((issue) => issue.code === 'ORD-20');
    expect(ord20?.severity).toBe('error');
    expect(ord20?.blocking).toBe(true);
    for (const key of QUEST_TYPE_KEYS) expect(ord20?.message).toContain(key);

    const badReward = fixtureText('orders.yml').replace("- 'item;diamond;16'", "- 'not_a_reward;DIAMOND;2'");
    const rewardIssues = validateOrdersText(badReward, 'orders.yml', new Map());
    const rwd02 = rewardIssues.find((issue) => issue.code === 'RWD-02');
    expect(rwd02?.severity).toBe('warning');
    for (const key of REWARD_TYPE_KEYS) expect(rwd02?.fixHint).toContain(key);
  });

  it('focus 校验允许列表从 catalog keys 派生', () => {
    const badAction = fixtureText('focus/mob.yml').replace('      console_command:', '      not_an_action:');
    const actionIssues = validateFocusText(badAction, 'focus/mob.yml', new Set());
    const act01 = actionIssues.find((issue) => issue.code === 'ACT-01');
    expect(act01).toBeDefined();
    for (const key of ACTION_KEYS) expect(act01?.fixHint).toContain(key);

    const badEffect = fixtureText('focus/mob.yml').replace('      mob_drops_add:', '      Bad_Effect:');
    const effectIssues = validateFocusText(badEffect, 'focus/mob.yml', new Set());
    const eff01 = effectIssues.find((issue) => issue.code === 'EFF-01');
    expect(eff01).toBeDefined();
    for (const key of EFFECT_KEYS) expect(eff01?.fixHint).toContain(key);
  });
  it('模板 key 不含名单；模拟新增 catalog 条目时仅插值列表变化，en 不回退、zh 无裸占位符', () => {
    const encoded = (value: string) => encodeURIComponent(value).replace(/\./g, '%2E');
    const enHelp = readFileSync('src/i18n/locales/en/help.ts', 'utf8');
    const enValidation = readFileSync('src/i18n/locales/en/validation.ts', 'utf8');
    for (const [file, source] of [
      [enHelp, 'condition：company_money / expertise / expertises / company_log。'],
      [enHelp, 'action：console_command / enable_expertise / disable_expertise / set_price_group（none 无效果）。'],
      [enHelp, 'effect：mob_drops_add / mob_damage_multiply（键必须小写）。'],
      [enValidation, '只允许 console_command/enable_expertise/disable_expertise/set_price_group'],
      [enValidation, '只允许小写 mob_drops_add / mob_damage_multiply'],
      [enValidation, '删除或改成 company_money/expertise/expertises/company_log'],
    ] as const) {
      expect(file).not.toContain(encoded(source));
    }
    expect(enHelp).toContain(encoded('condition：{list}。'));
    for (const key of ['只允许 {p0}', '只允许小写 {p0}', '删除或改成 {p0}']) {
      expect(enValidation).toContain(encoded(key));
    }

    setLocale('en', { persist: false });
    const extraConditions = [...CONDITION_KEYS, 'demo_condition'];
    const extraActions = [...ACTION_KEYS, 'demo_action'];
    const extraEffects = [...EFFECT_KEYS, 'demo_effect'];
    const extraQuests = [...QUEST_TYPE_KEYS, 'demo_quest'];
    const extraRewards = [...REWARD_TYPE_KEYS, 'demo_reward'];
    const lines = [
      focusLimitText('condition', extraConditions),
      focusLimitText('action', extraActions),
      focusLimitText('effect', extraEffects),
      questTypeAllowedMessage('quest', 'bad', extraQuests),
      rewardTypeAllowedHint(extraRewards),
      actionTypeAllowedHint(extraActions),
      effectTypeAllowedHint(extraEffects),
      conditionUnknownHint(extraConditions),
    ];
    for (const line of lines) {
      expect(line).not.toMatch(HAN);
      expect(line).not.toContain('{list}');
      expect(line).not.toContain('{p0}');
    }
    expect(lines[0]).toContain('demo_condition');
    expect(lines[3]).toContain('demo_quest');
    expect(lines[4]).toContain('demo_reward');

    setLocale('zh-CN', { persist: false });
    const zhLines = [focusLimitText('condition', extraConditions), actionTypeAllowedHint(extraActions), effectTypeAllowedHint(extraEffects), conditionUnknownHint(extraConditions)];
    for (const line of zhLines) {
      expect(line).not.toContain('{list}');
      expect(line).not.toContain('{p0}');
    }
    expect(zhLines[0]).toContain('demo_condition');
  });

  it('模板插值后的当前中英文与重构前一致', () => {
    setLocale('en', { persist: false });
    expect(focusLimitText('condition', CONDITION_KEYS)).toBe('condition: company_money / expertise / expertises / company_log.');
    expect(focusLimitText('action', ACTION_KEYS)).toBe('action: console_command / enable_expertise / disable_expertise / set_price_group (none has no effect).');
    expect(focusLimitText('effect', EFFECT_KEYS)).toBe('effect: mob_drops_add / mob_damage_multiply / block_drops_add / ore_smelt / mining_haste / item_durability_save (keys must be lowercase).');
    expect(questTypeAllowedMessage('q1', 'bad')).toBe('Invalid type “bad” for quest “q1” (allowed: break_block/place_block/fish/mob_kill/feed)');
    expect(rewardTypeAllowedHint()).toBe('Choose item/company_income/money/experience/console_command from the dropdown');
    expect(actionTypeAllowedHint()).toBe('Allowed: console_command/enable_expertise/disable_expertise/set_price_group');
    expect(effectTypeAllowedHint()).toBe('Only lowercase mob_drops_add / mob_damage_multiply / block_drops_add / ore_smelt / mining_haste / item_durability_save are allowed');
    expect(conditionUnknownHint()).toBe('Delete it or use company_money/expertise/expertises/company_log');

    setLocale('zh-CN', { persist: false });
    expect(focusLimitText('condition', CONDITION_KEYS)).toBe('condition：company_money / expertise / expertises / company_log。');
    expect(actionTypeAllowedHint()).toBe('只允许 console_command/enable_expertise/disable_expertise/set_price_group');
    expect(conditionUnknownHint()).toBe('删除或改成 company_money/expertise/expertises/company_log');
  });

});
