import { describe, expect, it } from 'vitest';
import {
  addEffectGroup,
  addExpertise,
  createFixedFocusTemplate,
  defaultNodePlain,
  deleteEffectGroup,
  deleteExpertise,
  duplicateExpertise,
  migrateLegacyValueType,
  moveExpertise,
  parseFocusFile,
  renameExpertise,
  serializeFocus,
  setActionEntry,
  setConditionEntry,
  setEffectGroupRows,
  setFocusDescription,
  setFocusField,
  setNodeDefaultValue,
  setNodeField,
  setNodeValueType,
} from '../../src/features/focus/focusDoc';
import { documentsSemanticallyEqual, parseYamlText } from '../../src/core/yaml';
import { fixtureText } from '../foundation/fixtures';

function roundtrip(text: string, path = 'focus/mob.yml') {
  const parsed = parseFocusFile(path, text);
  expect(parsed.parsed.ok, parsed.parsed.error?.message).toBe(true);
  expect(parsed.doc).not.toBeNull();
  const output = serializeFocus(parsed.doc!);
  const reread = parseYamlText(output);
  expect(reread.ok).toBe(true);
  expect(documentsSemanticallyEqual(parsed.doc!, reread.doc!)).toBe(true);
  return { parsed, output };
}

const MOB = fixtureText('focus/mob.yml');
const NONE = fixtureText('focus/none.yml');

describe('focus 文件解析与往返', () => {
  it('mob.yml 解析出 14 个专精节点并语义往返', () => {
    const { parsed } = roundtrip(MOB);
    expect(parsed.model.expertises).toHaveLength(14);
    expect(parsed.model.expertises.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        'zombie_loot_1',
        'zombie_loot_2',
        'zombie_loot_3',
        'zombie_master',
        'loot_master_1',
        'loot_master_2',
        'scavenger',
        'hunter_edge',
        'hunter_fury',
        'executioner',
        'berserker',
        'bounty_hunter',
        'bounty_master',
        'hunter_legend',
      ]),
    );
    expect(parsed.model.label).toBe('Mob');
    expect(parsed.model.condition.companyMoney?.raw).toBe('60000');
  });

  it('none.yml 往返且节点含 value_type/default/空 action/effect', () => {
    const { parsed } = roundtrip(NONE, 'focus/none.yml');
    expect(parsed.model.expertises).toHaveLength(1);
    const node = parsed.model.expertises[0]!;
    expect(node.id).toBe('empty');
    expect(node.valueType).toBe('boolean');
    expect(node.valueTypeKey).toBe('value_type');
    expect(node.condition.kind).toBe('map');
    expect(node.action.kind).toBe('map');
    expect(node.effect.kind).toBe('map');
  });

  it('覆盖 4 condition / 4 action / 2 effect 全部类型并语义往返', () => {
    const text = `id: all
label: All Types
description:
  - 'all'
condition:
  company_money: 100
  expertise: a
  expertises:
    - a,b
  company_log:
    - 'mob_kill_count,ZOMBIE,10'
expertise:
  a:
    label: A
    description: []
    value_type: boolean
    default:
      value: 'false'
    condition:
      company_money: 0
    action:
      console_command:
        - 'say hi'
        - 'eco give %player% 1'
      enable_expertise: [b]
      disable_expertise: [b]
      set_price_group: mob-company
      none: {}
    effect:
      mob_drops_add:
        ZOMBIE:
          - 'ROTTEN_FLESH,+1,30'
        ALL:
          - 'ALL,*2,5'
      mob_damage_multiply:
        ALL:
          - '2.0,10'
  b:
    label: B
    description: []
    value_type: integer
    default:
      value: '3'
    condition: {}
    action: {}
    effect: {}
`;
    const { parsed } = roundtrip(text, 'focus/mob.yml');
    const node = parsed.model.expertises[0]!;
    expect(node.condition.companyMoney?.raw).toBe('0');
    expect(node.action.consoleCommands.items).toEqual(['say hi', 'eco give %player% 1']);
    expect(node.action.enableExpertise.items).toEqual(['b']);
    expect(node.action.disableExpertise.items).toEqual(['b']);
    expect(node.action.setPriceGroup?.raw).toBe('mob-company');
    expect(node.action.hasNone).toBe(true);
    expect(node.effect.drops.map((group) => group.entity)).toEqual(['ZOMBIE', 'ALL']);
    expect(node.effect.damage[0]?.entity).toBe('ALL');
    expect(parsed.model.condition.expertises?.items).toEqual(['a,b']);
    expect(parsed.model.condition.companyLog?.items).toEqual(['mob_kill_count,ZOMBIE,10']);
  });
});

describe('focus 编辑操作', () => {
  it('新增/复制/重命名/排序/删除专精节点', () => {
    const parsed = parseFocusFile('focus/mob.yml', MOB);
    const doc = parsed.doc!;
    expect(addExpertise(doc, 'new_node', defaultNodePlain('new_node'))).toBe(true);
    expect(addExpertise(doc, 'new_node', defaultNodePlain('new_node'))).toBe(false);
    expect(renameExpertise(doc, 'new_node', 'renamed_node')).toBe(true);
    expect(renameExpertise(doc, 'renamed_node', 'zombie_loot_1')).toBe(false);
    expect(duplicateExpertise(doc, 'renamed_node', 'copy_node')).toBe(true);
    expect(moveExpertise(doc, 0, 2)).toBe(true);
    expect(deleteExpertise(doc, 'copy_node')).toBe(true);
    const reread = parseFocusFile('focus/mob.yml', serializeFocus(doc));
    const ids = reread.model.expertises.map((node) => node.id);
    expect(ids).toContain('renamed_node');
    expect(ids).not.toContain('copy_node');
    expect(ids).toHaveLength(15);
  });

  it('头部、节点字段、condition/action/effect 外科式修改且保留未知字段', () => {
    const text = NONE.replace(
      'expertise:\n',
      'custom_top: keep_me\nexpertise:\n',
    ).replace(
      "    effect: {}\n",
      "    custom_node: keep_node\n    effect:\n      custom_effect:\n        X: [1]\n    condition:\n      custom_condition: keep\n",
    );
    const parsed = parseFocusFile('focus/none.yml', text);
    const doc = parsed.doc!;
    setFocusField(doc, 'label', 'Renamed None');
    setFocusField(doc, 'id', 'none-renamed');
    setFocusDescription(doc, ['line 1', 'line 2']);
    setNodeField(doc, 'empty', 'label', 'Empty II');
    setNodeValueType(doc, 'empty', 'integer');
    setNodeDefaultValue(doc, 'empty', '7');
    setConditionEntry(doc, 'empty', 'company_money', 0);
    setActionEntry(doc, 'empty', 'set_price_group', 'mob-company');
    setEffectGroupRows(doc, 'empty', 'mob_drops_add', 'ZOMBIE', ['ROTTEN_FLESH,+1,30']);
    const output = serializeFocus(doc);
    expect(output).toContain('custom_top');
    expect(output).toContain('custom_node');
    expect(output).toContain('custom_effect');
    expect(output).toContain('custom_condition');
    expect(output).toContain('value_type: integer');
    expect(output).not.toContain('value-type');
    const reread = parseFocusFile('focus/none.yml', output);
    const node = reread.model.expertises[0]!;
    expect(node.label).toBe('Empty II');
    expect(node.valueType).toBe('integer');
    expect(node.defaultValue).toBe('7');
    expect(node.action.setPriceGroup?.raw).toBe('mob-company');
    expect(node.effect.unknown[0]?.key).toBe('custom_effect');
    expect(reread.model.extras[0]?.key).toBe('custom_top');
  });

  it('effect 实体组增删与行编辑', () => {
    const parsed = parseFocusFile('focus/mob.yml', MOB);
    const doc = parsed.doc!;
    expect(addEffectGroup(doc, 'zombie_loot_1', 'mob_damage_multiply', 'CREEPER')).toBe(true);
    expect(addEffectGroup(doc, 'zombie_loot_1', 'mob_damage_multiply', 'CREEPER')).toBe(false);
    expect(
      setEffectGroupRows(doc, 'zombie_loot_1', 'mob_damage_multiply', 'CREEPER', ['2.5,10']),
    ).toBe(true);
    expect(deleteEffectGroup(doc, 'zombie_loot_1', 'mob_damage_multiply', 'CREEPER')).toBe(true);
    const reread = parseFocusFile('focus/mob.yml', serializeFocus(doc));
    const node = reread.model.expertises.find((entry) => entry.id === 'zombie_loot_1')!;
    expect(node.effect.damage).toHaveLength(0);
  });

  it('旧 value-type 迁移为 value_type（保留值）且导出不含旧键', () => {
    const legacy = NONE.replace('value_type: boolean', 'value-type: integer');
    const parsed = parseFocusFile('focus/none.yml', legacy);
    expect(parsed.model.legacyNodeIds).toEqual(['empty']);
    expect(parsed.model.expertises[0]?.valueTypeKey).toBe('value-type');
    const count = migrateLegacyValueType(parsed.doc!);
    expect(count).toBe(1);
    const output = serializeFocus(parsed.doc!);
    expect(output).toContain('value_type: integer');
    expect(output).not.toContain('value-type');
    const reread = parseFocusFile('focus/none.yml', output);
    expect(reread.model.expertises[0]?.valueType).toBe('integer');
    expect(reread.model.legacyNodeIds).toHaveLength(0);
  });

  it('固定文件模板可创建 none/mob/ore', () => {
    for (const id of ['none', 'mob', 'ore']) {
      const doc = createFixedFocusTemplate(id);
      expect(doc).not.toBeNull();
      const parsed = parseFocusFile(`focus/${id}.yml`, serializeFocus(doc!));
      expect(parsed.model.focusId).toBe(id);
      expect(parsed.model.expertises.length).toBeGreaterThan(0);
      expect(parsed.parsed.duplicates).toHaveLength(0);
    }
    expect(createFixedFocusTemplate('farming')).toBeNull();
  });
});
