import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MenuEditor from '../../src/features/menu/MenuEditor.vue';
import { MENU_META, menuPath } from '../../src/features/menu/menuConstants';
import { parseMenuFile } from '../../src/features/menu/menuDoc';
import { clearToasts, useToasts } from '../../src/core/toast';
import { useProjectStore } from '../../src/store/project';
import { fixtureText } from '../foundation/fixtures';

const MAIN = fixtureText('menu/main.yml');

function allFixtures() {
  return MENU_META.map((meta) => ({
    path: menuPath(meta.id),
    text: fixtureText(menuPath(meta.id)),
  }));
}

function seed(files: Array<{ path: string; text: string }>) {
  const store = useProjectStore();
  store.importFiles(files);
  return store;
}

async function mountEditor() {
  const wrapper = mount(MenuEditor, { attachTo: document.body });
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

function upload(wrapper: ReturnType<typeof mount>, name: string, text: string) {
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

describe('菜单可视化编辑器', () => {
  it('展示 18 个固定菜单与 9×N 箱子网格，选中/槽位号/图标正常', async () => {
    seed(allFixtures());
    const wrapper = await mountEditor();
    expect(wrapper.findAll('[data-menu-id]')).toHaveLength(18);
    expect(wrapper.find('[data-menu-id="main"]').classes()).toContain('active');
    expect(wrapper.findAll('[data-slot]')).toHaveLength(45);
    expect(wrapper.find('[data-slot="0"]').text()).toContain('0');
    expect(wrapper.findAll('[data-slot] .menu-icon').length).toBeGreaterThan(0);
    expect(wrapper.find('[data-slot="3"]').attributes('title')).toContain('user_info');
    wrapper.unmount();
  });

  it('删除物品后从 items 中移除', async () => {
    const store = seed([{ path: 'menu/main.yml', text: MAIN }]);
    const wrapper = await mountEditor();
    await wrapper.find('[data-menu-item="user_info"]').trigger('click');
    window.confirm = () => true;
    await wrapper.find('[data-action="menu-item-delete"]').trigger('click');
    await flushPromises();
    expect(store.files['menu/main.yml']?.text).not.toContain('user_info:');
    wrapper.unmount();
  });

  it('点击槽位分配当前物品，slot 与 slots 编辑正确，编辑 main 后导出语义仅预期变化', async () => {
    const store = seed(allFixtures());
    const wrapper = await mountEditor();
    await wrapper.find('[data-slot="10"]').trigger('click');
    await flushPromises();
    let parsed = parseMenuFile('menu/main.yml', store.files['menu/main.yml']!.text);
    expect(parsed.model.items.find((item) => item.id === 'user_info')?.slot?.number).toBe(10);

    await wrapper.find('[data-menu-id="internal_store"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-slot]')).toHaveLength(54);
    await wrapper.find('[data-menu-item="bar"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('46, 47, 48, 50, 51, 52, 53');

    const { blobs, filenames, restore } = stubDownloads();
    await wrapper.find('[data-action="menu-export"]').trigger('click');
    await flushPromises();
    expect(filenames).toEqual(['internal_store.yml']);
    const exported = parseMenuFile('menu/internal_store.yml', await blobs[0]!.text());
    expect(exported.model.sizeNumber).toBe(54);
    expect(exported.model.items.find((item) => item.id === 'bar')?.slots?.items.map((entry) => entry.number)).toEqual([
      46, 47, 48, 50, 51, 52, 53,
    ]);
    restore();
    wrapper.unmount();
  });

  it('修改 material 与 options，保留未知字段', async () => {
    const store = seed([
      {
        path: 'menu/main.yml',
        text: MAIN.replace('items:', 'custom_top: keep\nitems:').replace(
          '    slot: 3\n',
          '    slot: 3\n    custom_item_flag: keep\n',
        ),
      },
    ]);
    const wrapper = await mountEditor();
    await wrapper.find('[data-menu-item="user_info"]').trigger('click');
    const material = wrapper.find('[data-field="menu-item-material"]');
    await material.setValue('PLAYER_HEAD;%player%');
    await material.trigger('change');
    await flushPromises();
    expect(store.files['menu/main.yml']?.text).toContain('PLAYER_HEAD;%player%');
    expect(store.files['menu/main.yml']?.text).toContain('custom_item_flag');
    expect(store.files['menu/main.yml']?.text).toContain('custom_top');

    wrapper.unmount();
  });

  it('修改 size 与 orders 的 order-per-page，非法 size 阻止导出', async () => {
    const store = seed([
      { path: 'menu/main.yml', text: MAIN.replace('size: 45', 'size: 10') },
    ]);
    const wrapper = await mountEditor();
    expect(wrapper.find('[data-action="menu-export"]').attributes('disabled')).toBeDefined();
    await wrapper.find('[data-action="menu-toggle-issues"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('MEN-02');
    wrapper.unmount();

    setActivePinia(createPinia());
    const store2 = seed(allFixtures());
    const wrapper2 = await mountEditor();
    await wrapper2.find('[data-menu-id="orders"]').trigger('click');
    await flushPromises();
    const option = wrapper2.find('[data-option-value="order-per-page"]');
    await option.setValue('7');
    await option.trigger('change');
    await flushPromises();
    expect(store2.files['menu/orders.yml']?.text).toContain('order-per-page: 7');
    wrapper2.unmount();
    void store;
  });

  it('导入未知菜单 id 时警告并跳过', async () => {
    seed([]);
    const wrapper = await mountEditor();
    await upload(wrapper, 'farming.yml', 'size: 27\nitems: {}\n');
    await flushPromises();
    const store = useProjectStore();
    expect(store.files['menu/farming.yml']).toBeUndefined();
    expect(useToasts().items.at(-1)?.message).toContain('插件不会加载');
    wrapper.unmount();
  });

  it('一次导入多个菜单文件', async () => {
    seed([]);
    const wrapper = await mountEditor();
    const input = wrapper.find('input[type="file"]');
    const files = [
      new File([MAIN], 'main.yml', { type: 'text/yaml' }),
      new File([fixtureText('menu/orders.yml')], 'orders.yml', { type: 'text/yaml' }),
    ];
    for (const file of files) {
      Object.defineProperty(file, 'text', { value: async () => file.name === 'main.yml' ? MAIN : fixtureText('menu/orders.yml') });
    }
    Object.defineProperty(input.element, 'files', { value: files, configurable: true });
    await input.trigger('change');
    await flushPromises();
    const store = useProjectStore();
    expect(store.files['menu/main.yml']).toBeDefined();
    expect(store.files['menu/orders.yml']).toBeDefined();
    expect(wrapper.find('[data-menu-id="orders"]').classes()).toContain('active');
    wrapper.unmount();
  });

  it('全部菜单打包为 ZIP；语言片段单独导出且不写 menu 文件', async () => {
    const store = seed(allFixtures());
    const wrapper = await mountEditor();
    const downloads = stubDownloads();
    const before = store.files['menu/main.yml']!.text;
    await wrapper.find('[data-field="lang-title"]').setValue('Company Menu');
    await wrapper.find('[data-field="lang-display-name"]').setValue('Players');
    await wrapper.find('[data-action="lang-export"]').trigger('click');
    await flushPromises();
    const langToast = useToasts().items.at(-1)?.message ?? '';
    expect(langToast).toContain('不会写入 menu/*.yml');
    expect(downloads.filenames[0]).toBe('menu-main-lang-snippet.yml');
    expect(store.files['menu/main.yml']!.text).toBe(before);
    expect(store.files['menu/main.yml']!.text).not.toContain('Company Menu');

    downloads.blobs.length = 0;
    downloads.filenames.length = 0;
    await wrapper.find('[data-action="menu-export-zip"]').trigger('click');
    await flushPromises();
    expect(downloads.filenames).toEqual(['mycompany-menu.zip']);
    const bytes = new Uint8Array(await downloads.blobs[0]!.arrayBuffer());
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('menu/main.yml');
    expect(text).toContain('menu/orders.yml');
    downloads.restore();
    wrapper.unmount();
  });
});
