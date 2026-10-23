import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App.vue';
import AppToolbar from '../../src/components/AppToolbar.vue';
import { setLocale, useLocale } from '../../src/i18n';
import { useProjectStore } from '../../src/store/project';
import { fixtureText } from '../foundation/fixtures';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  setLocale('zh-CN', { persist: false, notify: false });
  document.body.innerHTML = '';
});

describe('工具栏国际化', () => {
  it('中文/English 切换，en 工具栏无中文并持久化', async () => {
    const wrapper = mount(AppToolbar, { attachTo: document.body });
    await flushPromises();
    expect(wrapper.find('[data-locale="zh-CN"]').exists()).toBe(true);
    expect(wrapper.find('[data-locale="en"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('导入');
    expect(wrapper.text()).toContain('尚未载入项目');

    await wrapper.find('[data-locale="en"]').trigger('click');
    await flushPromises();
    const text = wrapper.find('.toolbar').text();
    expect(text).not.toMatch(/[\u4e00-\u9fff]/);
    expect(text).toContain('Import');
    expect(text).toContain('Export');
    expect(text).toContain('No project loaded');
    expect(text).toContain('0 errors');
    expect(text).toContain('0 info');
    expect(document.documentElement.lang).toBe('en');
    expect(useLocale().locale.value).toBe('en');
    expect(localStorage.getItem('mycompany-editor:locale')).toBe('en');

    await wrapper.find('[data-locale="zh-CN"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('导入');
    expect(document.documentElement.lang).toBe('zh-CN');
    wrapper.unmount();
  });

  it('切换语言触发 App 重新校验，不重写文件', async () => {
    const store = useProjectStore();
    store.importFiles([{ path: 'orders.yml', text: fixtureText('orders.yml') }]);
    const originalText = store.files['orders.yml']!.text;
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    const spy = vi.spyOn(store, 'validateAll');
    setLocale('en');
    await flushPromises();
    expect(spy).toHaveBeenCalled();
    expect(store.files['orders.yml']!.text).toBe(originalText);
    expect(store.fileList).toHaveLength(1);
    spy.mockRestore();
    setLocale('zh-CN');
    wrapper.unmount();
  });
});
