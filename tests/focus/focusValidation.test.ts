import { beforeEach, describe, expect, it } from 'vitest';
import { createProjectFile } from '../../src/core/projectFile';
import { clearQuestTypeBaseline } from '../../src/features/orders/ordersValidation';
import { ensureFocusValidatorRegistered, validateFocusText } from '../../src/features/focus/focusValidation';
import { validateProject } from '../../src/core/validation';
import { fixtureText } from '../foundation/fixtures';

const NONE = fixtureText('focus/none.yml');
const MOB = fixtureText('focus/mob.yml');

function codes(text: string, path = 'focus/mob.yml', other = new Set<string>()) {
  return validateFocusText(text, path, other);
}

function codeList(text: string, path = 'focus/mob.yml', other = new Set<string>()) {
  return codes(text, path, other).map((issue) => issue.code);
}

function blockingCount(text: string, path = 'focus/mob.yml', other = new Set<string>()) {
  return codes(text, path, other).filter((issue) => issue.blocking || issue.severity === 'error').length;
}

const node = (extra = '', condition = 'condition: {}') => `id: test
label: Test
expertise:
  a:
    label: A
    description: []
    value_type: boolean
    default:
      value: 'false'
    action: {}
    ${condition}
    effect: {}
${extra}`;

beforeEach(() => {
  ensureFocusValidatorRegistered();
  clearQuestTypeBaseline();
});

describe('focus 基础规则', () => {
  it('fixture none/mob 无阻断错误', () => {
    expect(blockingCount(NONE, 'focus/none.yml')).toBe(0);
    expect(blockingCount(MOB, 'focus/mob.yml')).toBe(0);
  });

  it('缺少 expertise / condition / 固定文件限制', () => {
    expect(codeList('id: x\nlabel: X\n')).toContain('FOC-02');
    expect(codeList(node('', 'value_type: boolean'))).toContain('FOC-10');
    const parsed = NONE.replace(/condition: \{\}/, '');
    expect(codeList(parsed, 'focus/none.yml')).toContain('FOC-10');
    expect(codeList(NONE, 'focus/farming.yml')).toContain('FOC-01');
  });

  it('boolean 的 default.value 只接受 true/false', () => {
    const yes = NONE.replace("value: 'false'", "value: 'yes'");
    const yesIssue = codes(yes, 'focus/none.yml').find((issue) => issue.code === 'FOC-13');
    expect(yesIssue).toBeDefined();
    expect(yesIssue?.severity).toBe('error');
    expect(yesIssue?.blocking).toBe(true);
    expect(blockingCount(yes, 'focus/none.yml')).toBeGreaterThan(0);

    for (const value of ['true', 'false', 'TRUE', 'False']) {
      const text = NONE.replace("value: 'false'", `value: '${value}'`);
      expect(codeList(text, 'focus/none.yml'), value).not.toContain('FOC-13');
      expect(blockingCount(text, 'focus/none.yml'), value).toBe(0);
    }
    for (const value of ['yes', 'no', '1', '', ' true ']) {
      const text = NONE.replace("value: 'false'", `value: '${value}'`);
      expect(codeList(text, 'focus/none.yml'), value).toContain('FOC-13');
      expect(blockingCount(text, 'focus/none.yml'), value).toBeGreaterThan(0);
    }

    const mobYes = MOB.replace("value: 'false'", "value: 'yes'");
    expect(codeList(mobYes, 'focus/mob.yml')).toContain('FOC-13');

    const numericValid = NONE.replace('value_type: boolean', 'value_type: integer').replace(
      "value: 'false'",
      "value: '7'",
    );
    expect(codeList(numericValid, 'focus/none.yml')).not.toContain('FOC-13');
    expect(blockingCount(numericValid, 'focus/none.yml')).toBe(0);
    const doubleValid = NONE.replace('value_type: boolean', 'value_type: double').replace(
      "value: 'false'",
      "value: '2.5'",
    );
    expect(codeList(doubleValid, 'focus/none.yml')).not.toContain('FOC-13');
    const stringValid = NONE.replace('value_type: boolean', 'value_type: string').replace(
      "value: 'false'",
      "value: 'ok'",
    );
    expect(codeList(stringValid, 'focus/none.yml')).not.toContain('FOC-14');
    expect(blockingCount(stringValid, 'focus/none.yml')).toBe(0);
    const integerInvalid = NONE.replace('value_type: boolean', 'value_type: integer').replace(
      "value: 'false'",
      "value: 'abc'",
    );
    expect(codeList(integerInvalid, 'focus/none.yml')).toContain('FOC-13');
    const doubleInvalid = NONE.replace('value_type: boolean', 'value_type: double').replace(
      "value: 'false'",
      "value: 'x'",
    );
    expect(codeList(doubleInvalid, 'focus/none.yml')).toContain('FOC-13');
  });

  it('value_type 非法、默认值不匹配、旧 value-type 警告', () => {
    const invalid = NONE.replace('value_type: boolean', 'value_type: date');
    expect(codeList(invalid, 'focus/none.yml')).toContain('FOC-11');

    const intDefault = NONE.replace('value_type: boolean', 'value_type: integer').replace(
      "value: 'false'",
      "value: 'abc'",
    );
    expect(codeList(intDefault, 'focus/none.yml')).toContain('FOC-13');

    const stringSemi = NONE.replace('value_type: boolean', 'value_type: string').replace(
      "value: 'false'",
      "value: 'a;b'",
    );
    expect(codeList(stringSemi, 'focus/none.yml')).toContain('FOC-14');

    const legacy = NONE.replace('value_type: boolean', 'value-type: boolean');
    expect(codeList(legacy, 'focus/none.yml')).toContain('FOC-12');
    expect(blockingCount(legacy, 'focus/none.yml')).toBe(0);
  });
});

describe('condition 规则', () => {
  it('company_money 非数字/负数阻断', () => {
    const nonNumber = node().replace('condition: {}', 'condition:\n      company_money: abc');
    expect(codeList(nonNumber)).toContain('CON-01');
    const negative = node().replace('condition: {}', 'condition:\n      company_money: -1');
    expect(codeList(negative)).toContain('CON-01');
    expect(blockingCount(negative)).toBeGreaterThan(0);
  });

  it('expertise 引用不存在/跨 focus', () => {
    const missing = node().replace('condition: {}', 'condition:\n      expertise: nope');
    expect(codeList(missing)).toContain('CON-02');
    expect(codeList(missing, 'focus/mob.yml', new Set(['nope']))).toContain('X-06');
  });

  it('expertises 标量阻断、引用不存在、自引用循环', () => {
    const scalar = node().replace('condition: {}', 'condition:\n      expertises: a,b');
    expect(codeList(scalar)).toContain('CON-03');
    const missing = node().replace('condition: {}', 'condition:\n      expertises:\n        - nope');
    expect(codeList(missing)).toContain('CON-04');
    const self = node().replace('condition: {}', 'condition:\n      expertises:\n        - a');
    expect(codeList(self)).toContain('FOC-CYCLE');
  });

  it('company_log 段数/大小写/未知 log', () => {
    const badSegments = node().replace(
      'condition: {}',
      'condition:\n      company_log:\n        - mob_kill_count,ZOMBIE',
    );
    expect(codeList(badSegments)).toContain('CON-05');
    const lower = node().replace(
      'condition: {}',
      'condition:\n      company_log:\n        - mob_kill_count,zombie,10',
    );
    expect(codeList(lower)).toContain('CON-07');
    const unknownLog = node().replace(
      'condition: {}',
      'condition:\n      company_log:\n        - unknown_log,ZOMBIE,10',
    );
    expect(codeList(unknownLog)).toContain('CON-06');
    const negative = node().replace(
      'condition: {}',
      'condition:\n      company_log:\n        - mob_kill_count,ZOMBIE,-1',
    );
    expect(codeList(negative)).toContain('CON-08');
    expect(codeList(negative)).toContain('CON-08');
  });

  it('未知 condition 键警告但保留', () => {
    const text = node().replace('condition: {}', 'condition:\n      mystery: 1');
    const issues = codes(text);
    expect(issues.map((entry) => entry.code)).toContain('CON-09');
    expect(issues.find((entry) => entry.code === 'CON-09')?.severity).toBe('warning');
  });
});

describe('action 规则', () => {
  it('set_price_group 必须是可读标量', () => {
    const list = node().replace('action: {}', 'action:\n      set_price_group:\n        - a');
    expect(codeList(list)).toContain('ACT-04');
    const map = node().replace('action: {}', 'action:\n      set_price_group: {a: 1}');
    expect(codeList(map)).toContain('ACT-04');
    const valid = node().replace('action: {}', 'action:\n      set_price_group: mob-company');
    expect(blockingCount(valid)).toBe(0);
  });

  it('console/enable/disable 形态与引用', () => {
    const scalar = node().replace('action: {}', 'action:\n      console_command: say hi');
    expect(codeList(scalar)).toContain('ACT-02');
    const missing = node().replace(
      'action: {}',
      'action:\n      enable_expertise:\n        - nope',
    );
    expect(codeList(missing)).toContain('ACT-03');
    const slash = node().replace('action: {}', "action:\n      console_command:\n        - '/say hi'");
    expect(codeList(slash)).toContain('ACT-05');
    const selfDisable = node().replace(
      'action: {}',
      'action:\n      disable_expertise:\n        - a',
    );
    expect(codeList(selfDisable)).toContain('ACT-07');
    const unknown = node().replace('action: {}', 'action:\n      mystery_action: 1');
    expect(codeList(unknown)).toContain('ACT-01');
    const none = node().replace('action: {}', 'action:\n      none: {}');
    expect(codeList(none)).toContain('ACT-08');
  });
});

describe('effect 规则', () => {
  it('实体/物品/数量/概率', () => {
    const badEntity = node().replace(
      'effect: {}',
      'effect:\n      mob_drops_add:\n        NOT_AN_ENTITY:\n          - STONE,+1,10',
    );
    expect(codeList(badEntity)).toContain('EFF-02');
    const namespaced = node().replace(
      'effect: {}',
      'effect:\n      mob_drops_add:\n        ZOMBIE:\n          - minecraft:stone,+1,10',
    );
    expect(codeList(namespaced)).toContain('EFF-04');
    const negative = node().replace(
      'effect: {}',
      'effect:\n      mob_drops_add:\n        ZOMBIE:\n          - STONE,-1,10',
    );
    expect(codeList(negative)).toContain('EFF-05');
    const badChance = node().replace(
      'effect: {}',
      'effect:\n      mob_drops_add:\n        ZOMBIE:\n          - STONE,+1,150',
    );
    const chanceIssue = codes(badChance).find((issue) => issue.code === 'EFF-08');
    expect(chanceIssue).toBeDefined();
    expect(chanceIssue?.blocking).toBe(true);
    const twoSegments = node().replace(
      'effect: {}',
      'effect:\n      mob_drops_add:\n        ZOMBIE:\n          - STONE,+1',
    );
    expect(codeList(twoSegments)).toContain('EFF-03');
    const zeroMult = node().replace(
      'effect: {}',
      'effect:\n      mob_damage_multiply:\n        ALL:\n          - 0,10',
    );
    expect(codeList(zeroMult)).toContain('EFF-07');
    const highMult = node().replace(
      'effect: {}',
      'effect:\n      mob_damage_multiply:\n        ALL:\n          - 101,10',
    );
    expect(codeList(highMult)).toContain('EFF-09');
    const unknown = node().replace(
      'effect: {}',
      'effect:\n      MOB_DROPS_ADD:\n        ZOMBIE:\n          - STONE,+1,10',
    );
    expect(codeList(unknown)).toContain('EFF-01');
  });

  it('condition/action/effect 写成标量阻断', () => {
    expect(codeList(node().replace('condition: {}', 'condition: hello'))).toContain('FOC-10');
    expect(codeList(node().replace('action: {}', 'action: hello'))).toContain('EFF-11');
    expect(codeList(node().replace('effect: {}', 'effect: hello'))).toContain('EFF-11');
  });
});

describe('跨文件规则', () => {
  it('FOC-18 两个固定文件同名节点阻断', () => {
    const mob = MOB.replace(
      'expertise:\n',
      'expertise:\n\n  empty:\n    label: Duplicate\n    condition: {}\n',
    );
    const none = createProjectFile('focus/none.yml', NONE);
    const mobFile = createProjectFile('focus/mob.yml', mob);
    const result = validateProject([none, mobFile]);
    const duplicates = result.issues.filter((issue) => issue.code === 'FOC-18');
    expect(duplicates.length).toBeGreaterThan(0);
    expect(duplicates.some((issue) => issue.blocking)).toBe(true);
  });

  it('未知字段保留并给 info，不阻断', () => {
    const text = NONE.replace('expertise:\n', 'custom_top: 1\nexpertise:\n').replace(
      '    effect: {}\n',
      '    custom_node: 2\n    effect: {}\n',
    );
    const issues = codes(text, 'focus/none.yml');
    expect(issues.map((issue) => issue.code)).toContain('GEN-03');
    expect(blockingCount(text, 'focus/none.yml')).toBe(0);
  });
});
