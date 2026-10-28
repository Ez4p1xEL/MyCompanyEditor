import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import FocusEditor from '../../src/features/focus/FocusEditor.vue';
import { useProjectStore } from '../../src/store/project';
import {
  createFixedFocusTemplate,
  parseFocusFile,
  serializeFocus,
  setEffectGroupRows,
  titleForFocusId,
} from '../../src/features/focus/focusDoc';
import {
  ensureFocusValidatorRegistered,
  validateFocusText,
} from '../../src/features/focus/focusValidation';
import { clearQuestTypeBaseline } from '../../src/features/orders/ordersValidation';
import { documentsSemanticallyEqual, parseYamlText } from '../../src/core/yaml';
import { fixtureText } from '../foundation/fixtures';

const ORE = fixtureText('focus/ore.yml');

function codes(text: string, path = 'focus/ore.yml') {
  return validateFocusText(text, path);
}

function codeList(text: string, path = 'focus/ore.yml') {
  return codes(text, path).map((issue) => issue.code);
}

function blockingCount(text: string, path = 'focus/ore.yml') {
  return codes(text, path).filter((issue) => issue.blocking || issue.severity === 'error').length;
}

function oreNode(effect: string): string {
  return `id: ore
label: Ore
expertise:
  a:
    label: A
    description: []
    value_type: boolean
    default:
      value: 'false'
    condition: {}
    action: {}
    effect:
${effect}
`;
}

beforeEach(() => {
  ensureFocusValidatorRegistered();
  clearQuestTypeBaseline();
});

describe('focus/ore.yml 上游样例', () => {
  it('解析出 16 个节点、company_money 60000 且无阻断错误', () => {
    const parsed = parseFocusFile('focus/ore.yml', ORE);
    expect(parsed.parsed.ok, parsed.parsed.error?.message).toBe(true);
    expect(parsed.model.idField).toBe('ore');
    expect(parsed.model.label).toBe('Ore');
    expect(parsed.model.condition.companyMoney?.raw).toBe('60000');
    expect(parsed.model.expertises).toHaveLength(16);
    expect(parsed.model.expertises.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        'coal_seam_1',
        'coal_seam_2',
        'copper_vein',
        'iron_vein',
        'ore_luck',
        'field_smelt_1',
        'field_smelt_2',
        'noble_smelt',
        'smelt_master',
        'miner_rhythm_1',
        'miner_rhythm_2',
        'tool_guard_1',
        'tool_guard_2',
        'ore_trader',
        'ore_magnate',
        'mining_legend',
      ]),
    );
    expect(blockingCount(ORE)).toBe(0);
  });

  it('四类新 effect 的节点数量与分组正确，且语义往返', () => {
    const parsed = parseFocusFile('focus/ore.yml', ORE);
    const count = (key: string) =>
      parsed.model.expertises.filter((node) => (node.effect.byType[key]?.length ?? 0) > 0).length;
    expect(count('block_drops_add')).toBe(6);
    expect(count('ore_smelt')).toBe(5);
    expect(count('mining_haste')).toBe(2);
    expect(count('item_durability_save')).toBe(2);

    const output = serializeFocus(parsed.doc!);
    const reread = parseYamlText(output);
    expect(reread.ok).toBe(true);
    expect(documentsSemanticallyEqual(parsed.doc!, reread.doc!)).toBe(true);
  });

  it('可编辑 item_durability_save 并导出，未知字段仍保留', () => {
    const text = ORE.replace('expertise:\n', 'custom_top: keep_me\nexpertise:\n');
    const parsed = parseFocusFile('focus/ore.yml', text);
    expect(setEffectGroupRows(parsed.doc!, 'tool_guard_1', 'item_durability_save', 'pickaxe', ['0.5,50'])).toBe(true);
    const output = serializeFocus(parsed.doc!);
    expect(output).toContain('custom_top: keep_me');
    const reread = parseFocusFile('focus/ore.yml', output);
    const node = reread.model.expertises.find((item) => item.id === 'tool_guard_1');
    expect(node?.effect.byType.item_durability_save?.[0]?.rows[0]?.raw).toBe('0.5,50');
    expect(blockingCount(output)).toBe(0);
  });

  it('block_break_count 只接受大写方块 Material', () => {
    expect(codeList(ORE)).not.toContain('CON-07');

    const lower = ORE.replace('block_break_count,STONE,500', 'block_break_count,stone,500');
    expect(codeList(lower)).toContain('CON-07');
    expect(blockingCount(lower)).toBeGreaterThan(0);

    const all = ORE.replace('block_break_count,STONE,500', 'block_break_count,ALL,500');
    expect(codeList(all)).toContain('CON-07');

    const entity = ORE.replace('block_break_count,STONE,500', 'block_break_count,ZOMBIE,500');
    expect(codeList(entity)).toContain('CON-07');

    const valid = ORE.replace('block_break_count,STONE,500', 'block_break_count,DEEPSLATE_IRON_ORE,500');
    expect(codeList(valid)).not.toContain('CON-07');
  });

  it('接受小写 all 组 key 并原样导出，方块计数的 Material 仍必须大写', () => {
    const lowerAll = oreNode(`      mob_drops_add:
        all:
          - 'STONE,+1,100'
      block_drops_add:
        all:
          - 'COAL,+1,10'
      ore_smelt:
        all:
          - '15'
      mining_haste:
        all:
          - '0,100,25'
      item_durability_save:
        all:
          - '1.0,20'`);
    const issues = codeList(lowerAll);
    expect(issues).not.toContain('EFF-02');
    expect(issues).not.toContain('EFF-13');
    expect(issues).not.toContain('EFF-15');
    expect(issues).not.toContain('EFF-16');
    expect(issues).not.toContain('EFF-17');
    expect(blockingCount(lowerAll)).toBe(0);

    const parsed = parseFocusFile('focus/ore.yml', lowerAll);
    const output = serializeFocus(parsed.doc!);
    expect(output).toContain('all:');
    expect(codeList(output)).not.toContain('EFF-13');
    expect(codeList(output)).not.toContain('CON-07');
  });

  it('四类新 effect 的非法分组/行会阻断并给出对应错误码', () => {
    const badBlockGroup = oreNode(`      block_drops_add:
        DIAMOND:
          - 'COAL,+1,10'`);
    expect(codeList(badBlockGroup)).toContain('EFF-13');

    const badItem = oreNode(`      block_drops_add:
        ALL:
          - 'NOT_A_BLOCK,+1,10'`);
    expect(codeList(badItem)).toContain('EFF-14');

    const zeroDrop = oreNode(`      block_drops_add:
        ALL:
          - 'COAL,*0,100'`);
    expect(codeList(zeroDrop)).toContain('EFF-06');
    expect(blockingCount(zeroDrop)).toBeGreaterThan(0);

    const badSmelt = oreNode(`      ore_smelt:
        ALL:
          - '15,20'`);
    expect(codeList(badSmelt)).toContain('EFF-15');

    const badHaste = oreNode(`      mining_haste:
        ALL:
          - '0,100'`);
    expect(codeList(badHaste)).toContain('EFF-16');

    const badDurability = oreNode(`      item_durability_save:
        pickaxe:
          - '1.5,20'`);
    expect(codeList(badDurability)).toContain('EFF-17');
  });

  it('未知 item-type 组只告警，不阻断', () => {
    const unknownGroup = oreNode(`      item_durability_save:
        shovel:
          - '1.0,20'`);
    const hint = codes(unknownGroup).find((issue) => issue.code === 'EFF-18');
    expect(hint).toBeDefined();
    expect(hint?.severity).toBe('warning');
    expect(hint?.blocking).toBeFalsy();
  });

  it('固定 ore 模板可创建并通过校验', () => {
    const doc = createFixedFocusTemplate('ore');
    expect(doc).not.toBeNull();
    const text = serializeFocus(doc!);
    const parsed = parseFocusFile('focus/ore.yml', text);
    expect(parsed.model.idField).toBe('ore');
    expect(parsed.model.condition.companyMoney?.raw).toBe('60000');
    expect(blockingCount(text)).toBe(0);
    expect(titleForFocusId('ore')).toBe('Ore');
  });
});

describe('focus 编辑器中的 ore effect', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    document.body.innerHTML = '';
  });

  it('展示 16 节点，item_durability_save 可编辑并写回 YAML', async () => {
    const store = useProjectStore();
    store.importFiles([{ path: 'focus/ore.yml', text: ORE }]);
    const wrapper = mount(FocusEditor, { attachTo: document.body });
    await flushPromises();
    await flushPromises();
    expect(wrapper.findAll('[data-focus-node]')).toHaveLength(16);

    await wrapper.find('[data-focus-node="tool_guard_1"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-effect-group="item_durability_save:pickaxe"]').exists()).toBe(true);
    const percentage = wrapper.find('[data-effect-field="item_durability_save-percentage-0"]');
    expect(percentage.exists()).toBe(true);
    await percentage.setValue('0.5');
    await flushPromises();
    expect(store.files['focus/ore.yml']?.text).toContain('0.5,20');

    await wrapper.find('[data-focus-node="miner_rhythm_1"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-effect-group="mining_haste:ALL"]').exists()).toBe(true);
    expect(wrapper.find('[data-effect-field="mining_haste-amplifier-0"]').exists()).toBe(true);

    await wrapper.find('[data-focus-node="field_smelt_1"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-effect-field^="ore_smelt-chance"]').exists()).toBe(true);

    await wrapper.find('[data-focus-node="mining_legend"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-effect-group="block_drops_add:COAL_ORE"]').exists()).toBe(true);
    expect(wrapper.find('[data-effect-group="ore_smelt:ALL"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
