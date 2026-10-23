import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import ProjectDashboard from '../../src/features/project/ProjectDashboard.vue';
import OrdersEditor from '../../src/features/orders/OrdersEditor.vue';
import FocusEditor from '../../src/features/focus/FocusEditor.vue';
import MenuEditor from '../../src/features/menu/MenuEditor.vue';
import '../../src/features/orders/index';
import '../../src/features/focus/index';
import '../../src/features/menu/index';
import { setLocale } from '../../src/i18n';
import { useProjectStore } from '../../src/store/project';
import { fixtureText } from '../foundation/fixtures';

const HAN = /[\u4e00-\u9fff]/;
const BAD_ORDERS = fixtureText('orders.yml').replace('amount: 16', 'amount: "16"');
const BAD_FOCUS = `id: none
label: None
expertise:
  bad:
    label: Bad
    value_type: boolean
    default:
      value: 'false'
    condition:
      company_money: -1
    action: {}
    effect: {}
`;

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

describe('active issue fixHint', () => {
  it('ProjectDashboard 摘要/详情显示 fixHint，无 hint 的 issue 省略，切语言不变 code/path/blocking', async () => {
    setLocale('en', { persist: false });
    const store = useProjectStore();
    store.importFiles([
      { path: 'bad.yml', text: 'a: [\n' },
      { path: 'orders.yml', text: BAD_ORDERS },
    ]);
    store.setActive('orders.yml');
    const before = store.allIssues.map((issue) => ({
      code: issue.code,
      path: issue.path,
      blocking: issue.blocking,
      file: issue.file,
    }));
    const wrapper = await mountEditor(ProjectDashboard);
    const global = wrapper.find('[data-testid="global-validation"]');
    const hints = global.findAll('.issue-fix').map((el) => el.text());
    expect(hints.length).toBeGreaterThan(0);
    for (const hint of hints) expect(hint).not.toMatch(HAN);
    const noHintRow = global.findAll('li').find((li) => li.text().includes('RWD-12'));
    expect(noHintRow?.find('.issue-fix').exists()).toBe(false);
    store.setActive('orders.yml');
    await flushPromises();
    const detail = wrapper.find('[data-testid="file-detail"]');
    expect(detail.findAll('.issue-fix').length).toBeGreaterThan(0);

    setLocale('zh-CN', { persist: false });
    store.validateAll();
    await flushPromises();
    expect(global.findAll('.issue-fix').map((el) => el.text()).join(' ')).toMatch(HAN);
    expect(
      store.allIssues.map((issue) => ({
        code: issue.code,
        path: issue.path,
        blocking: issue.blocking,
        file: issue.file,
      })),
    ).toEqual(before);
    expect(store.files['orders.yml']!.text).toBe(BAD_ORDERS);
    wrapper.unmount();
  });

  it('orders 编辑器侧栏显示 en fixHint', async () => {
    setLocale('en', { persist: false });
    useProjectStore().importFiles([{ path: 'orders.yml', text: BAD_ORDERS }]);
    useProjectStore().validateAll();
    const wrapper = await mountEditor(OrdersEditor);
    await wrapper.find('[data-action="orders-toggle-issues"]').trigger('click');
    await flushPromises();
    const hints = wrapper.findAll('.issue-fix').map((el) => el.text());
    expect(hints.length).toBeGreaterThan(0);
    for (const hint of hints) expect(hint).not.toMatch(HAN);
    wrapper.unmount();
  });

  it('focus 编辑器节点问题显示 en fixHint', async () => {
    setLocale('en', { persist: false });
    useProjectStore().importFiles([{ path: 'focus/none.yml', text: BAD_FOCUS }]);
    const wrapper = await mountEditor(FocusEditor);
    if (!wrapper.find('[data-focus-node="bad"]').exists()) {
      throw new Error('bad node not rendered');
    }
    await wrapper.find('[data-focus-node="bad"]').trigger('click');
    await flushPromises();
    const hints = wrapper.findAll('.issue-fix').map((el) => el.text());
    expect(hints.length).toBeGreaterThan(0);
    for (const hint of hints) expect(hint).not.toMatch(HAN);
    wrapper.unmount();
  });

  it('menu 编辑器问题列表显示 en fixHint', async () => {
    setLocale('en', { persist: false });
    const menu = fixtureText('menu/main.yml').replace('material: DIAMOND', 'material: NOT_A_MATERIAL');
    useProjectStore().importFiles([{ path: 'menu/main.yml', text: menu }]);
    const wrapper = await mountEditor(MenuEditor);
    await wrapper.find('[data-action="menu-toggle-issues"]').trigger('click');
    await flushPromises();
    const hints = wrapper.findAll('.issue-fix').map((el) => el.text());
    expect(hints.length).toBeGreaterThan(0);
    for (const hint of hints) expect(hint).not.toMatch(HAN);
    wrapper.unmount();
  });
});
