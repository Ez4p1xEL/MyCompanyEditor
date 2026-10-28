import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FocusEditor from '../../src/features/focus/FocusEditor.vue';
import { clearToasts, useToasts } from '../../src/core/toast';
import { parseYamlText } from '../../src/core/yaml';
import { useProjectStore } from '../../src/store/project';
import { fixtureText } from '../foundation/fixtures';

const NONE = fixtureText('focus/none.yml');
const MOB = fixtureText('focus/mob.yml');

const ALL_EFFECTS = `id: add-group
label: Add Group
expertise:
  all_effects:
    label: All effects
    value_type: boolean
    default:
      value: 'false'
    condition: {}
    effect:
      mob_drops_add:
        ALL: ['STONE,+1,100']
      mob_damage_multiply:
        ALL: ['2.0,100']
      block_drops_add:
        ALL: ['COAL,+1,100']
      ore_smelt:
        ALL: ['15']
      mining_haste:
        ALL: ['0,100,25']
      item_durability_save:
        ALL: ['1.0,20']
`;

const EFFECT_KEYS = [
  'mob_drops_add',
  'mob_damage_multiply',
  'block_drops_add',
  'ore_smelt',
  'mining_haste',
  'item_durability_save',
] as const;

function seed(files: Array<{ path: string; text: string }>) {
  const store = useProjectStore();
  store.importFiles(files);
  return store;
}

async function mountEditor() {
  const wrapper = mount(FocusEditor, { attachTo: document.body });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

function stubDownloads() {
  const blobs: Blob[] = [];
  const filenames: string[] = [];
  const originalCreate = (URL as { createObjectURL?: unknown }).createObjectURL;
  const originalRevoke = (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: (blob: Blob) => {
      blobs.push(blob);
      return 'blob:test';
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => {} });
  const clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) {
      filenames.push(this.download);
    });
  const restore = () => {
    clickSpy.mockRestore();
    if (originalCreate === undefined) delete (URL as { createObjectURL?: unknown }).createObjectURL;
    else Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreate });
    if (originalRevoke === undefined) delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
    else Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevoke });
  };
  return { blobs, filenames, restore };
}

function fileInputUpload(wrapper: ReturnType<typeof mount>, name: string, text: string) {
  const input = wrapper.find('input[type="file"]');
  const file = new File([text], name, { type: 'text/yaml' });
  if (typeof file.text !== 'function') {
    Object.defineProperty(File.prototype, 'text', {
      configurable: true,
      value: async () => text,
    });
  } else {
    vi.spyOn(file, 'text').mockResolvedValue(text);
  }
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  return input.trigger('change');
}

beforeEach(() => {
  localStorage.clear();
  clearToasts();
  setActivePinia(createPinia());
  document.body.innerHTML = '';
});

describe('focus 可视化编辑器', () => {
  it('mob.yml 展示 14 个节点，可编辑并导出', async () => {
    const store = seed([{ path: 'focus/mob.yml', text: MOB }]);
    const wrapper = await mountEditor();
    expect(wrapper.findAll('[data-focus-node]')).toHaveLength(14);
    expect(wrapper.text()).toContain('固定加载列表');

    await wrapper.find('[data-focus-node="zombie_loot_1"]').trigger('click');
    await flushPromises();
    const label = wrapper.find('[data-field="focus-node-label"]');
    await label.setValue('More Zombie Loot I!');
    await flushPromises();
    expect(store.files['focus/mob.yml']?.text).toContain('More Zombie Loot I!');

    const { blobs, filenames, restore } = stubDownloads();
    await wrapper.find('[data-action="focus-export"]').trigger('click');
    await flushPromises();
    expect(filenames).toEqual(['mob.yml']);
    const exported = await blobs[0]!.text();
    const parsed = parseYamlText(exported);
    expect(parsed.ok).toBe(true);
    const tree = parsed.doc!.toJS() as Record<string, any>;
    expect(Object.keys(tree.expertise)).toHaveLength(14);
    expect(exported).not.toContain('value-type');
    restore();
    wrapper.unmount();
  });

  it('固定文件不可删除；其他 focus 文件只作为参考文件导出', async () => {
    const store = seed([
      { path: 'focus/none.yml', text: NONE },
      { path: 'focus/mob.yml', text: MOB },
    ]);
    const wrapper = await mountEditor();
    expect(wrapper.find('[data-focus-file="focus/none.yml"]').exists()).toBe(true);
    expect(wrapper.find('[data-focus-file="focus/mob.yml"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('移除');

    const reference = `id: farming
label: Farming
expertise:
  crops:
    label: Crops
    condition: {}
    value-type: integer
    default:
      value: '7'
    action: {}
    effect: {}
`;
    await fileInputUpload(wrapper, 'farming.yml', reference);
    await flushPromises();
    expect(store.files['focus-reference/farming.reference.yml']).toBeDefined();
    expect(store.files['focus/farming.yml']).toBeUndefined();
    const importedText = store.files['focus-reference/farming.reference.yml']?.text ?? '';
    expect(importedText).toContain('value_type: integer');
    expect(importedText).not.toContain('value-type');
    expect(useToasts().items.at(-1)?.message).toContain('已迁移');
    expect(wrapper.text()).toContain('参考文件');

    await wrapper.find('[data-focus-file="focus-reference/farming.reference.yml"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('另存为参考文件');

    const { blobs, filenames, restore } = stubDownloads();
    await wrapper.find('[data-action="focus-export"]').trigger('click');
    await flushPromises();
    expect(filenames).toEqual(['farming.reference.yml']);
    const exportedReference = await blobs[0]!.text();
    expect(exportedReference).toContain('crops');
    expect(exportedReference).not.toContain('value-type');
    restore();
    wrapper.unmount();
  });

  it('旧 value-type 提示并归一化，导出不含旧键', async () => {
    const legacy = NONE.replace('value_type: boolean', 'value-type: integer').replace(
      "value: 'false'",
      "value: '7'",
    );
    const store = seed([{ path: 'focus/none.yml', text: legacy }]);
    const wrapper = await mountEditor();
    expect(wrapper.text()).toContain('value-type');
    await wrapper.find('[data-action="focus-migrate-legacy"]').trigger('click');
    await flushPromises();
    const text = store.files['focus/none.yml']?.text ?? '';
    expect(text).toContain('value_type: integer');
    expect(text).not.toContain('value-type');

    const { blobs, restore } = stubDownloads();
    await wrapper.find('[data-action="focus-export"]').trigger('click');
    await flushPromises();
    expect(await blobs[0]!.text()).not.toContain('value-type');
    restore();
    wrapper.unmount();
  });

  it('boolean 下拉对 TRUE/False/true/false 都正确选中并保留原值', async () => {
    for (const raw of ['TRUE', 'False', 'true', 'false']) {
      const store = seed([
        { path: 'focus/none.yml', text: NONE.replace("value: 'false'", `value: '${raw}'`) },
      ]);
      const wrapper = await mountEditor();
      const select = wrapper.find('[data-field="focus-default"]');
      const element = select.element as HTMLSelectElement;
      expect(element.selectedIndex, raw).toBeGreaterThanOrEqual(0);
      expect(element.value, raw).toBe(raw.toLowerCase());
      expect(store.files['focus/none.yml']?.text).toContain(`value: '${raw}'`);
      if (raw === 'TRUE') {
        await select.setValue('false');
        await flushPromises();
        expect(store.files['focus/none.yml']?.text).toMatch(/value: ["']false["']/);
      }
      wrapper.unmount();
    }
  });

  it('boolean 默认值 yes 阻止导出，修正为 true 后恢复', async () => {
    const invalid = NONE.replace("value: 'false'", "value: 'yes'");
    const store = seed([{ path: 'focus/none.yml', text: invalid }]);
    const wrapper = await mountEditor();
    expect(wrapper.find('[data-action="focus-export"]').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('FOC-13');
    const select = wrapper.find('[data-field="focus-default"]');
    expect((select.element as HTMLSelectElement).value).toBe('yes');
    await select.setValue('true');
    await flushPromises();
    expect(store.files['focus/none.yml']?.text).toMatch(/value: ["']true["']/);
    expect(wrapper.find('[data-action="focus-export"]').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('非法默认值阻止导出并显示可定位问题', async () => {
    const invalid = NONE.replace('value_type: boolean', 'value_type: integer').replace(
      "value: 'false'",
      "value: 'abc'",
    );
    seed([{ path: 'focus/none.yml', text: invalid }]);
    const wrapper = await mountEditor();
    expect(wrapper.find('[data-action="focus-export"]').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('FOC-13');
    wrapper.unmount();
  });

  it('缺少固定文件时可以从模板创建', async () => {
    seed([]);
    const wrapper = await mountEditor();
    expect(wrapper.text()).toContain('还没有 focus 文件');
    await wrapper.find('[data-action="focus-create-none"]').trigger('click');
    await flushPromises();
    const store = useProjectStore();
    expect(store.files['focus/none.yml']).toBeDefined();
    expect(wrapper.findAll('[data-focus-node]')).toHaveLength(1);
    wrapper.unmount();
  });

  it('编辑头部、condition、action、effect 后保留未知字段', async () => {
    const text = NONE.replace('expertise:\n', 'custom_top: keep\nexpertise:\n').replace(
      '    effect: {}\n',
      '    custom_node: keep_node\n    effect: {}\n',
    );
    const store = seed([{ path: 'focus/none.yml', text }]);
    const wrapper = await mountEditor();
    await wrapper.find('[data-field="focus-label"]').setValue('None Edited');
    await flushPromises();

    await wrapper.find('[data-condition-toggle="company_money"]').setValue(true);
    await flushPromises();
    await wrapper.find('[data-condition-input="company_money"]').setValue('100');
    await flushPromises();

    await wrapper.find('[data-action-toggle="set_price_group"]').setValue(true);
    await flushPromises();
    await wrapper.find('[data-action-input="set_price_group"]').setValue('mob-company');
    await flushPromises();

    await wrapper.find('[data-action="effect-add-group-mob_drops_add"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-action="effect-add-row-mob_drops_add"]').trigger('click');
    await flushPromises();

    const updated = store.files['focus/none.yml']?.text ?? '';
    expect(updated).toContain('custom_top');
    expect(updated).toContain('custom_node');
    expect(updated).toContain('None Edited');
    expect(updated).toContain('company_money: 100');
    expect(updated).toContain('set_price_group: mob-company');
    expect(updated).toContain('mob_drops_add');
    wrapper.unmount();
  });

  it('每个 effect 在 ALL 已存在时仍能新增组', async () => {
    const store = seed([{ path: 'focus/ore.yml', text: ALL_EFFECTS }]);
    const wrapper = await mountEditor();
    await wrapper.find('[data-focus-node="all_effects"]').trigger('click');
    await flushPromises();

    for (const key of EFFECT_KEYS) {
      await wrapper.find(`[data-action="effect-add-group-${key}"]`).trigger('click');
      await flushPromises();
    }
    for (const blockKey of ['COAL_ORE', 'DIAMOND_ORE']) {
      await wrapper.find('[data-effect-new-group="block_drops_add"]').setValue(blockKey);
      await wrapper.find('[data-action="effect-add-group-block_drops_add"]').trigger('click');
      await flushPromises();
    }

    const parsed = parseYamlText(store.files['focus/ore.yml']!.text);
    expect(parsed.ok).toBe(true);
    const effect = (parsed.doc!.toJS() as Record<string, any>).expertise.all_effects.effect;
    for (const key of EFFECT_KEYS) {
      expect(Object.keys(effect[key]).length, key).toBeGreaterThanOrEqual(2);
      expect(Object.keys(effect[key])).toContain('ALL');
    }
    expect(Object.keys(effect.block_drops_add)).toContain('COAL_ORE');
    expect(Object.keys(effect.block_drops_add)).toContain('DIAMOND_ORE');
    wrapper.unmount();
  });
});
