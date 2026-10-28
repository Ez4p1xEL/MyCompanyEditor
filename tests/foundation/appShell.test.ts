import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App.vue';
import { useProjectStore } from '../../src/store/project';
import { clearToasts } from '../../src/core/toast';
import { documentsSemanticallyEqual, parseYamlText } from '../../src/core/yaml';
import { fixtureText } from './fixtures';

beforeEach(() => {
  localStorage.clear();
  clearToasts();
  setActivePinia(createPinia());
});

describe('应用壳', () => {
  it('渲染中文导航、空状态与版本标识', async () => {
    const wrapper = mount(App);
    await flushPromises();
    const text = wrapper.text();
    for (const label of ['项目总览', '订单', '专精', '菜单']) {
      expect(text).toContain(label);
    }
    expect(text).toContain('载入示例');
    expect(text).toContain('85e3947');
    expect(text).toContain('0.8.50');
    wrapper.unmount();
  });

  it('导航到已实现的菜单编辑器', async () => {
    await import('../../src/features/menu/MenuEditor.vue');
    const wrapper = mount(App);
    await flushPromises();
    await wrapper.find('[data-nav="menu"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('菜单编辑器');
    wrapper.unmount();
  });

  it('载入示例后展示文件列表与统计', async () => {
    // 预加载懒加载视图，确保 defineAsyncComponent 在断言前完成。
    await import('../../src/views/ProjectOverview.vue');
    const wrapper = mount(App);
    await flushPromises();
    await flushPromises();
    const sampleButton = wrapper.find('[data-action="load-sample"]');
    expect(sampleButton.exists(), wrapper.html().slice(0, 1200)).toBe(true);
    await sampleButton.trigger('click');
    await flushPromises();
    const store = useProjectStore();
    expect(store.fileList).toHaveLength(23);
    expect(wrapper.text()).toContain('orders.yml');
    wrapper.unmount();
  });

  it('导入 orders.yml 后总览展示解析出的订单 id', async () => {
    await import('../../src/views/ProjectOverview.vue');
    const store = useProjectStore();
    store.importFiles([{ path: 'orders.yml', text: fixtureText('orders.yml') }]);
    const wrapper = mount(App);
    await flushPromises();
    await flushPromises();
    await wrapper.find('[data-file="orders.yml"]').trigger('click');
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('stone_breaker');
    expect(text).toContain('mob_hunter');
    expect(text).toContain('顶层条目');
    expect(text).toContain('10');
    wrapper.unmount();
  });

  it('导出对话框可选择文件并编辑文件名', async () => {
    await import('../../src/views/ProjectOverview.vue');
    const store = useProjectStore();
    store.importFiles([{ path: 'orders.yml', text: fixtureText('orders.yml') }]);
    const wrapper = mount(App);
    await flushPromises();
    await flushPromises();
    await wrapper.find('[data-action="export"]').trigger('click');
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('导出 YAML 文件');
    expect(text).toContain('预览（前 14 行）');
    const filenameInput = wrapper.find('.export-dialog input.mc-input');
    expect(filenameInput.exists()).toBe(true);
    expect((filenameInput.element as HTMLInputElement).value).toBe('orders.yml');
    await wrapper.find('.modal-close').trigger('click');
    await flushPromises();
    expect(wrapper.find('.export-dialog').exists()).toBe(false);
    wrapper.unmount();
  });

  it('通过导出对话框下载 orders.yml，内容语义等价', async () => {
    await import('../../src/views/ProjectOverview.vue');
    const store = useProjectStore();
    store.importFiles([{ path: 'orders.yml', text: fixtureText('orders.yml') }]);
    const wrapper = mount(App);
    await flushPromises();
    await flushPromises();

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
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    await wrapper.find('[data-action="export"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-action="confirm-export"]').trigger('click');
    await flushPromises();

    expect(blobs).toHaveLength(1);
    const exportedText = await blobs[0].text();
    const original = parseYamlText(fixtureText('orders.yml'));
    const exported = parseYamlText(exportedText);
    expect(exported.ok).toBe(true);
    expect(
      documentsSemanticallyEqual(original.doc!, exported.doc!),
      '导出内容应与源文件语义等价',
    ).toBe(true);
    expect(exportedText.includes('\r')).toBe(false);
    expect(store.isDirty).toBe(false);

    anchorClick.mockRestore();
    if (originalCreate === undefined) delete (URL as { createObjectURL?: unknown }).createObjectURL;
    else Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreate });
    if (originalRevoke === undefined) delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
    else Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevoke });
    wrapper.unmount();
  });

  it('非法 YAML 显示行列错误且应用仍可用', async () => {
    await import('../../src/views/ProjectOverview.vue');
    const store = useProjectStore();
    store.importFiles([{ path: 'orders.yml', text: 'a: [1' }]);
    const wrapper = mount(App);
    await flushPromises();
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('YAML 解析失败');
    expect(text).toContain('第 1 行');
    // 仍然可以切换导航，说明应用没有崩溃。
    await import('../../src/features/menu/MenuEditor.vue');
    await wrapper.find('[data-nav="menu"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('菜单编辑器');
    wrapper.unmount();
  });
});
