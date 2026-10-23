import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import OrdersEditor from '../../src/features/orders/OrdersEditor.vue';
import FocusEditor from '../../src/features/focus/FocusEditor.vue';
import MenuEditor from '../../src/features/menu/MenuEditor.vue';
import ExportDialog from '../../src/components/ExportDialog.vue';
import LanguagePanel from '../../src/features/menu/LanguagePanel.vue';
import ConditionEditor from '../../src/features/focus/ConditionEditor.vue';
import { QUEST_TYPES, REWARD_TYPES } from '../../src/features/orders/ordersConstants';
import { VALUE_TYPES, CONDITION_TYPES } from '../../src/features/focus/focusConstants';
import { MENU_META, MENU_CATEGORIES, menuCategoryText } from '../../src/features/menu/menuConstants';
import { checkCatalogAlignment, setLocale } from '../../src/i18n';
import { closeExportDialog, openExportDialog } from '../../src/core/exportDialog';
import { useProjectStore } from '../../src/store/project';
import { fixtureText } from '../foundation/fixtures';

const HAN = /[\u4e00-\u9fff]/;

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  setLocale('zh-CN', { persist: false, notify: false });
  document.body.innerHTML = '';
});

async function mountEditor(component: Parameters<typeof mount>[0]) {
  const wrapper = mount(component, { attachTo: document.body });
  await flushPromises();
  await flushPromises();
  return wrapper;
}

describe('editor 目录对齐与 en 渲染', () => {
  it('orders/focus/menu 目录 key 对齐', () => {
    for (const domain of ['orders', 'focus', 'menu']) {
      expect(checkCatalogAlignment(domain), domain).toEqual({ missing: [], extra: [] });
    }
  });

  it('orders 英文 UI 无中文，切回中文正常', async () => {
    const store = useProjectStore();
    store.importFiles([{ path: 'orders.yml', text: fixtureText('orders.yml') }]);
    setLocale('en', { persist: false });
    const wrapper = await mountEditor(OrdersEditor);
    const text = wrapper.find('.orders-editor').text();
    expect(text).not.toMatch(HAN);
    expect(text).toContain('Order editor');
    expect(text).toContain('New order');
    expect(text).toContain('Quests');
    expect(text).toContain('Rewards');
    expect(wrapper.find('[data-order-id="stone_breaker"]').text()).toContain('1 quest · 4 rewards');
    expect(wrapper.find('[data-order-id="miner"]').text()).toContain('3 quests · 2 rewards');
    expect(text).not.toContain('1 quests');

    const selectedBefore = wrapper.find('.order-row.active').attributes('data-order-id');
    setLocale('zh-CN', { persist: false });
    await flushPromises();
    expect(wrapper.find('.orders-editor').text()).toContain('订单编辑器');
    expect(wrapper.find('.order-row.active').attributes('data-order-id')).toBe(selectedBefore);
    expect(store.files['orders.yml']!.text).toBe(fixtureText('orders.yml'));
    wrapper.unmount();
  });

  it('focus 英文 UI（含 condition/action/effect）无中文', async () => {
    const store = useProjectStore();
    store.importFiles([
      { path: 'focus/none.yml', text: fixtureText('focus/none.yml') },
      { path: 'focus/mob.yml', text: fixtureText('focus/mob.yml') },
    ]);
    setLocale('en', { persist: false });
    const wrapper = await mountEditor(FocusEditor);
    const text = wrapper.find('.focus-editor').text();
    expect(text).not.toMatch(HAN);
    expect(text).toContain('Focus editor');
    expect(text).toContain('Focus files');
    expect(text).toContain('Expertise nodes');
    expect(text).toContain('condition (required, may be empty)');
    expect(text).toContain('action (runs once on unlock)');
    expect(text).toContain('effect (active only when the node is enabled)');

    setLocale('zh-CN', { persist: false });
    await flushPromises();
    expect(wrapper.find('.focus-editor').text()).toContain('专精编辑器');
    expect(store.files['focus/mob.yml']!.text).toBe(fixtureText('focus/mob.yml'));
    wrapper.unmount();
  });

  it('menu 英文 UI（含 LanguagePanel）无中文', async () => {
    const store = useProjectStore();
    store.importFiles(
      MENU_META.map((meta) => ({
        path: `menu/${meta.id}.yml`,
        text: fixtureText(`menu/${meta.id}.yml`),
      })),
    );
    setLocale('en', { persist: false });
    const wrapper = await mountEditor(MenuEditor);
    const text = wrapper.find('.menu-editor').text();
    expect(text).not.toMatch(HAN);
    expect(text).toContain('Chest menu editor');
    expect(text).toContain('Fixed menus (18)');
    expect(text).toContain('Main menu');
    expect(text).toContain('Language snippets (lang files)');
    const sizeLabels = wrapper
      .findAll('[data-field="menu-size"] option')
      .map((option) => option.text());
    expect(sizeLabels).toContain('9 (1 row)');
    expect(sizeLabels).toContain('18 (2 rows)');
    for (const label of sizeLabels) expect(label).not.toMatch(/[（）]/);

    setLocale('zh-CN', { persist: false });
    await flushPromises();
    expect(wrapper.find('.menu-editor').text()).toContain('菜单编辑器');
    expect(menuCategoryText(MENU_CATEGORIES[0])).toBe('主界面');
    expect(store.files['menu/main.yml']!.text).toBe(fixtureText('menu/main.yml'));
    wrapper.unmount();
  });

  it('LanguagePanel 英文无中文', async () => {
    setLocale('en', { persist: false });
    const wrapper = mount(LanguagePanel, { props: { menuId: 'main', items: ['foo'] } });
    await flushPromises();
    expect(wrapper.text()).not.toMatch(HAN);
    expect(wrapper.text()).toContain('Language snippets (lang files)');
    expect(wrapper.text()).toContain('Menu title key');
    const attrs = wrapper
      .findAll('input, textarea, button')
      .flatMap((el) => ['placeholder', 'title', 'aria-label'].map((name) => el.attributes(name)))
      .filter((value): value is string => Boolean(value));
    expect(attrs.length).toBeGreaterThan(0);
    for (const value of attrs) expect(value).not.toMatch(HAN);
    expect(wrapper.find('[data-field="lang-lore"]').attributes('placeholder')).toBe(
      '&7First line / &7Second line',
    );
    wrapper.unmount();
    setLocale('zh-CN', { persist: false });
  });

  it('常量标签随 locale 切换，枚举值不变', () => {
    setLocale('en', { persist: false });
    expect(QUEST_TYPES[0]!.label).toBe('Break block');
    expect(REWARD_TYPES[0]!.label).toBe('Item');
    expect(VALUE_TYPES[0]!.label).toBe('boolean (true/false)');
    expect(CONDITION_TYPES[0]!.label).toBe('Company money');
    expect(MENU_META.find((meta) => meta.id === 'main')!.label).toBe('Company main menu');
    expect(MENU_META.find((meta) => meta.id === 'internal_store')!.label).toBe('Internal store');
    expect(MENU_META.find((meta) => meta.id === 'chestshop')!.label).toBe('Chest shop help');
    expect(QUEST_TYPES[0]!.value).toBe('break_block');
    expect(REWARD_TYPES[0]!.value).toBe('item');
    expect(MENU_META[0]!.id).toBe('main');
    setLocale('zh-CN', { persist: false });
    expect(QUEST_TYPES[0]!.label).toBe('破坏方块');
    expect(MENU_META[0]!.label).toBe('公司主菜单');
  });

  it('ExportDialog en 使用 ASCII 括号', async () => {
    const store = useProjectStore();
    store.importFiles([{ path: 'orders.yml', text: fixtureText('orders.yml') }]);
    openExportDialog('orders.yml');
    setLocale('en', { persist: false });
    const wrapper = mount(ExportDialog, { attachTo: document.body });
    await flushPromises();
    const text = wrapper.text();
    expect(text).not.toMatch(/[（）]/);
    expect(text).toContain('orders.yml (Orders)');
    wrapper.unmount();
    closeExportDialog();
    setLocale('zh-CN', { persist: false });
  });
  it('ConditionEditor missing prompt en ends with ASCII punctuation', async () => {
    setLocale('en', { persist: false });
    const wrapper = mount(ConditionEditor, {
      props: {
        model: { kind: 'missing', unknown: [] },
        expertiseIds: [],
        ownerLabel: 'focus',
      },
    });
    const text = wrapper.text();
    expect(text).not.toContain('）。');
    const prompt = wrapper.find('p.muted').text().trim();
    expect(prompt.endsWith(').')).toBe(true);
    wrapper.unmount();
    setLocale('zh-CN', { persist: false });
  });

});
