import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrdersEditor from '../../src/features/orders/OrdersEditor.vue';
import { parseOrdersFile } from '../../src/features/orders/ordersDoc';
import { clearQuestTypeBaseline, type OrdersIssue } from '../../src/features/orders/ordersValidation';
import { clearToasts } from '../../src/core/toast';
import { documentsSemanticallyEqual, parseYamlText } from '../../src/core/yaml';
import { useProjectStore } from '../../src/store/project';
import { fixtureText } from '../foundation/fixtures';

const ORDERS = fixtureText('orders.yml');

function storeWith(text = ORDERS) {
  const store = useProjectStore();
  store.importFiles([{ path: 'orders.yml', text }]);
  return store;
}

function plain(text: string): Record<string, any> {
  const parsed = parseYamlText(text);
  expect(parsed.ok, parsed.error?.message).toBe(true);
  return parsed.doc!.toJS() as Record<string, any>;
}

async function mountEditor() {
  const wrapper = mount(OrdersEditor, { attachTo: document.body });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

function stubDownloads() {
  const blobs: Blob[] = [];
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
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  const restore = () => {
    clickSpy.mockRestore();
    if (originalCreate === undefined) delete (URL as { createObjectURL?: unknown }).createObjectURL;
    else Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreate });
    if (originalRevoke === undefined) delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
    else Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevoke });
  };
  return { blobs, restore };
}

beforeEach(() => {
  localStorage.clear();
  clearToasts();
  clearQuestTypeBaseline();
  setActivePinia(createPinia());
  document.body.innerHTML = '';
});

describe('orders 可视化编辑器', () => {
  it('展示全部订单，可选择并编辑 label（带颜色预览）', async () => {
    const store = storeWith();
    const wrapper = await mountEditor();
    expect(wrapper.findAll('[data-order-id]')).toHaveLength(10);
    expect(wrapper.text()).toContain('stone_breaker');

    await wrapper.find('[data-order-id="stone_breaker"]').trigger('click');
    await flushPromises();
    const label = wrapper.find('[data-field="order-label"]');
    expect((label.element as HTMLInputElement).value).toBe('Stone Breaker');

    await label.setValue('&aStone Breaker!');
    await flushPromises();
    expect(plain(store.files['orders.yml'].text).stone_breaker.label).toBe('&aStone Breaker!');
    expect(wrapper.find('[data-order-id="stone_breaker"] .badge.dirty').exists()).toBe(true);
    expect(wrapper.find('[data-testid="color-preview"]').text()).toContain('Stone Breaker!');
    wrapper.unmount();
  });

  it('新建 / 重命名 / 复制 / 删除订单', async () => {
    const store = storeWith();
    const wrapper = await mountEditor();

    await wrapper.find('[data-action="orders-new"]').trigger('click');
    await flushPromises();
    let tree = plain(store.files['orders.yml'].text);
    expect(Object.keys(tree)).toContain('order_1');

    const idInput = wrapper.find('[data-field="order-id-input"]');
    await idInput.setValue('my_order');
    await idInput.trigger('change');
    await flushPromises();
    tree = plain(store.files['orders.yml'].text);
    expect(Object.keys(tree)).toContain('my_order');
    expect(Object.keys(tree)).not.toContain('order_1');

    // 重命名到已存在的 ID 应被拒绝并显示错误
    await idInput.setValue('miner');
    await idInput.trigger('change');
    await flushPromises();
    expect(wrapper.text()).toContain('已存在');
    tree = plain(store.files['orders.yml'].text);
    expect(Object.keys(tree)).toContain('my_order');

    await wrapper.find('[data-action="orders-copy"]').trigger('click');
    await flushPromises();
    tree = plain(store.files['orders.yml'].text);
    expect(Object.keys(tree)).toContain('my_order_copy');

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await wrapper.find('[data-action="orders-delete"]').trigger('click');
    await flushPromises();
    tree = plain(store.files['orders.yml'].text);
    expect(Object.keys(tree)).not.toContain('my_order_copy');
    confirm.mockRestore();
    wrapper.unmount();
  });

  it('任务可添加、改 type/目标/amount、排序与删除', async () => {
    const store = storeWith();
    const wrapper = await mountEditor();
    await wrapper.find('[data-order-id="stone_breaker"]').trigger('click');
    await flushPromises();

    await wrapper.find('[data-action="orders-add-quest"]').trigger('click');
    await flushPromises();
    let tree = plain(store.files['orders.yml'].text);
    expect(Object.keys(tree.stone_breaker.quest)).toContain('quest_1');

    const card = wrapper.find('[data-quest-id="quest_1"]');
    await card.find('[data-field="quest-type"]').setValue('mob_kill');
    await flushPromises();
    await card.find('[data-field="quest-mob"]').setValue('zombie');
    await card.find('[data-field="quest-amount"]').setValue('3');
    await flushPromises();

    tree = plain(store.files['orders.yml'].text);
    expect(tree.stone_breaker.quest.quest_1).toMatchObject({
      type: 'mob_kill',
      mob: 'zombie',
      amount: 3,
    });

    // 上移任务（新增任务在最后）；注意 JS 对象会把数字键排在前面，
    // 必须从 YAML 顺序的模型（而非 Object.keys）判断排序。
    const liveCard = wrapper.find('[data-quest-id="quest_1"]');
    await liveCard.find('[aria-label="上移任务"]').trigger('click');
    await flushPromises();
    let questOrder = parseOrdersFile(store.files['orders.yml'].text).model.orders.find(
      (order) => order.id === 'stone_breaker',
    )!.quests.map((quest) => quest.id);
    expect(questOrder[0]).toBe('quest_1');

    await wrapper.find('[data-quest-id="quest_1"] [aria-label="删除任务"]').trigger('click');
    await flushPromises();
    questOrder = parseOrdersFile(store.files['orders.yml'].text).model.orders.find(
      (order) => order.id === 'stone_breaker',
    )!.quests.map((quest) => quest.id);
    expect(questOrder).not.toContain('quest_1');
    wrapper.unmount();
  });

  it('奖励结构化编辑、类型切换、原文模式与排序删除', async () => {
    const store = storeWith();
    const wrapper = await mountEditor();
    await wrapper.find('[data-order-id="stone_breaker"]').trigger('click');
    await flushPromises();

    await wrapper.find('[data-action="orders-add-reward"]').trigger('click');
    await flushPromises();
    let tree = plain(store.files['orders.yml'].text);
    const index = tree.stone_breaker.reward.length - 1;
    expect(tree.stone_breaker.reward[index]).toBe('item;stone;1');

    const row = wrapper.find(`[data-reward-index="${index}"]`);
    await row.find('[data-field="reward-type"]').setValue('money');
    await flushPromises();
    await wrapper.find(`[data-reward-index="${index}"] [data-field="reward-arg-0"]`).setValue('250.5');
    await flushPromises();
    tree = plain(store.files['orders.yml'].text);
    expect(tree.stone_breaker.reward[index]).toBe('money;250.5');

    await wrapper.find('[data-action="orders-toggle-raw"]').trigger('click');
    await flushPromises();
    const textarea = wrapper.find('[data-field="orders-raw-rewards"]');
    expect(textarea.exists()).toBe(true);
    await textarea.setValue("money;10.5\nitem;diamond;2");
    await wrapper.find('[data-action="orders-toggle-raw"]').trigger('click');
    await flushPromises();
    tree = plain(store.files['orders.yml'].text);
    expect(tree.stone_breaker.reward).toEqual(['money;10.5', 'item;diamond;2']);

    // 原文模式下可重新加一条奖励后排序
    await wrapper.find('[data-action="orders-add-reward"]').trigger('click');
    await flushPromises();
    tree = plain(store.files['orders.yml'].text);
    expect(tree.stone_breaker.reward).toHaveLength(3);
    await wrapper.find('[data-reward-index="2"] [aria-label="上移奖励"]').trigger('click');
    await flushPromises();
    tree = plain(store.files['orders.yml'].text);
    expect(tree.stone_breaker.reward[1]).toBe('item;stone;1');
    wrapper.unmount();
  });

  it('未知字段 / 未知 reward / 非字符串 reward 原样保留并警告', async () => {
    const text = [
      'stone_breaker:',
      "  label: 'Stone Breaker'",
      '  custom_flag: true',
      '  quest:',
      '    1:',
      '      type: break_block',
      '      item: stone',
      '      amount: 16',
      '      future_field: keep-me',
      '  reward:',
      "    - 'company_income;100.0'",
      "    - 'mystery;abc'",
      '    - 123',
      '',
    ].join('\n');
    const store = storeWith(text);
    const wrapper = await mountEditor();
    await wrapper.find('[data-order-id="stone_breaker"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('RWD-02');
    expect(wrapper.text()).toContain('RWD-15');
    expect(wrapper.text()).toContain('未识别字段');

    await wrapper.find('[data-field="order-label"]').setValue('Changed');
    await flushPromises();
    const tree = plain(store.files['orders.yml'].text);
    expect(tree.stone_breaker.custom_flag).toBe(true);
    expect(tree.stone_breaker.quest['1'].future_field).toBe('keep-me');
    expect(tree.stone_breaker.reward).toEqual(['company_income;100.0', 'mystery;abc', 123]);
    wrapper.unmount();
  });

  it('非法 amount 让导出按钮禁用并显示 ORD-24，修复后可导出', async () => {
    const store = storeWith();
    const wrapper = await mountEditor();
    await wrapper.find('[data-order-id="stone_breaker"]').trigger('click');
    await flushPromises();

    const amount = wrapper.find('[data-quest-id="1"] [data-field="quest-amount"]');
    await amount.setValue('0');
    await flushPromises();
    expect(wrapper.text()).toContain('ORD-24');
    expect(wrapper.find('[data-order-id="stone_breaker"]').classes()).toContain('invalid');
    const exportButton = wrapper.find('[data-action="orders-export"]');
    expect(exportButton.attributes('disabled')).toBeDefined();

    await amount.setValue('16');
    await flushPromises();
    expect(wrapper.find('[data-action="orders-export"]').attributes('disabled')).toBeUndefined();

    const blobs: Blob[] = [];
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
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await wrapper.find('[data-action="orders-export"]').trigger('click');
    await flushPromises();
    expect(blobs).toHaveLength(1);
    const exported = parseYamlText(await blobs[0].text());
    expect(exported.ok).toBe(true);
    expect(documentsSemanticallyEqual(parseYamlText(ORDERS).doc!, exported.doc!)).toBe(true);
    expect(store.isDirty).toBe(false);
    expect(wrapper.find('[data-order-id="stone_breaker"] .badge.dirty').exists()).toBe(false);

    clickSpy.mockRestore();
    if (originalCreate === undefined) delete (URL as { createObjectURL?: unknown }).createObjectURL;
    else Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreate });
    if (originalRevoke === undefined) delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
    else Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevoke });
    wrapper.unmount();
  });

  it('搜索过滤订单列表', async () => {
    storeWith();
    const wrapper = await mountEditor();
    const search = wrapper.find('[data-field="orders-search"]');
    await search.setValue('miner');
    await flushPromises();
    expect(wrapper.findAll('[data-order-id]')).toHaveLength(1);
    expect(wrapper.find('[data-order-id]').attributes('data-order-id')).toBe('miner');
    wrapper.unmount();
  });

  it('导入已有 orders.yml 时弹出替换/合并确认，替换生效', async () => {
    const store = storeWith();
    const wrapper = await mountEditor();
    const replacement = [
      'imported_order:',
      "  label: 'Imported'",
      '  quest:',
      '    q:',
      '      type: break_block',
      '      item: stone',
      '      amount: 1',
      '  reward: []',
      '',
    ].join('\n');
    const file = new File([replacement], 'orders.yml', { type: 'text/yaml' });
    if (typeof file.text !== 'function') {
      Object.defineProperty(File.prototype, 'text', {
        configurable: true,
        value: async () => replacement,
      });
    } else {
      vi.spyOn(file, 'text').mockResolvedValue(replacement);
    }
    const input = wrapper.find('input[type="file"]');
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
    await input.trigger('change');
    await flushPromises();
    await flushPromises();
    expect(wrapper.text()).toContain('请选择导入方式');
    await wrapper.find('[data-action="orders-import-replace"]').trigger('click');
    await flushPromises();
    expect(Object.keys(plain(store.files['orders.yml'].text))).toContain('imported_order');
    wrapper.unmount();
  });

  it('fixture feeder 的 4 个 feed 任务下拉正确选中（大小写归一且不改写原值）', async () => {
    const store = storeWith();
    const wrapper = await mountEditor();
    await wrapper.find('[data-order-id="feeder"]').trigger('click');
    await flushPromises();

    for (const questId of ['cow', 'pig', 'chicken', 'sheep']) {
      const select = wrapper.find(`[data-quest-id="${questId}"] [data-field="quest-mob"]`);
      expect(select.exists(), questId).toBe(true);
      const element = select.element as HTMLSelectElement;
      expect(element.value, questId).toBe(questId);
      expect(element.selectedIndex, questId).toBeGreaterThan(0);
    }
    // 未主动修改时保留 fixture 原始小写值，导出语义不变。
    const tree = plain(store.files['orders.yml'].text);
    expect(tree.feeder.quest.cow.mob).toBe('cow');
    expect(tree.feeder.quest.sheep.mob).toBe('sheep');
    wrapper.unmount();
  });

  it('新建订单添加 5 种 type 任务后不刷新直接导出；刷新后仍可导出', async () => {
    const store = storeWith();
    const wrapper = await mountEditor();
    await wrapper.find('[data-action="orders-new"]').trigger('click');
    await flushPromises();

    const addQuestWithType = async (questId: string, type: string) => {
      await wrapper.find('[data-action="orders-add-quest"]').trigger('click');
      await flushPromises();
      const card = wrapper.find(`[data-quest-id="${questId}"]`);
      await card.find('[data-field="quest-type"]').setValue(type);
      await flushPromises();
    };
    await addQuestWithType('quest_2', 'place_block');
    await addQuestWithType('quest_3', 'fish');
    await addQuestWithType('quest_4', 'mob_kill');
    await addQuestWithType('quest_5', 'feed');

    // 新建订单/任务不应拿默认 break_block 当历史类型。
    expect(
      store.files['orders.yml'].issues.some((issue) => issue.code === 'ORD-26'),
      '新建订单不应触发 ORD-26',
    ).toBe(false);
    expect(wrapper.find('[data-action="orders-export"]').attributes('disabled')).toBeUndefined();

    const first = stubDownloads();
    await wrapper.find('[data-action="orders-export"]').trigger('click');
    await flushPromises();
    expect(first.blobs).toHaveLength(1);
    const tree = plain(await first.blobs[0].text());
    const quests = tree.order_1.quest;
    expect(quests.quest_1).toMatchObject({ type: 'break_block', item: 'stone' });
    expect(quests.quest_1).not.toHaveProperty('mob');
    expect(quests.quest_2).toMatchObject({ type: 'place_block', item: 'stone' });
    expect(quests.quest_2).not.toHaveProperty('mob');
    expect(quests.quest_3).toMatchObject({ type: 'fish', item: 'stone' });
    expect(quests.quest_3).not.toHaveProperty('mob');
    expect(quests.quest_4).toMatchObject({ type: 'mob_kill', mob: 'zombie' });
    expect(quests.quest_4).not.toHaveProperty('item');
    expect(quests.quest_5).toMatchObject({ type: 'feed', mob: 'cow' });
    expect(quests.quest_5).not.toHaveProperty('item');
    first.restore();

    // 模拟刷新：保存 → 清空模块基线（reload 会重置）→ 恢复 → 重新挂载 → 仍可导出。
    store.saveToLocalStorage();
    wrapper.unmount();
    clearQuestTypeBaseline();
    setActivePinia(createPinia());
    const restored = useProjectStore();
    expect(restored.restoreFromLocalStorage()).toBe(true);
    const refreshed = await mountEditor();
    expect(
      restored.files['orders.yml'].issues.some((issue) => issue.code === 'ORD-26'),
      '刷新后新建订单不应触发 ORD-26',
    ).toBe(false);
    expect(refreshed.find('[data-action="orders-export"]').attributes('disabled')).toBeUndefined();
    refreshed.unmount();
  });

  it('已有订单改 type 仍按 ORD-26 报错并禁用导出', async () => {
    const store = storeWith();
    const wrapper = await mountEditor();
    await wrapper.find('[data-order-id="stone_breaker"]').trigger('click');
    await flushPromises();

    const card = wrapper.find('[data-quest-id="1"]');
    await card.find('[data-field="quest-type"]').setValue('place_block');
    await flushPromises();

    const issue = store.files['orders.yml'].issues.find(
      (entry) => entry.code === 'ORD-26',
    ) as OrdersIssue | undefined;
    expect(issue).toBeDefined();
    expect(issue?.questId).toBe('1');
    expect(wrapper.find('[data-action="orders-export"]').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
});

