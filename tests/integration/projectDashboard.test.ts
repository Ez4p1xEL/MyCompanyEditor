import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectDashboard from '../../src/features/project/ProjectDashboard.vue';
import { sampleFiles } from '../../src/features/project/samples';
import { readZip } from '../../src/features/project/zip';
import { buildProjectJson } from '../../src/features/project/projectFileOps';
import { useProjectStore } from '../../src/store/project';

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

async function mountDashboard() {
  const wrapper = mount(ProjectDashboard, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  document.body.innerHTML = '';
});

describe('项目工作台', () => {
  it('空项目引导载入示例，三类文件出现并可打开编辑器', async () => {
    const wrapper = await mountDashboard();
    expect(wrapper.text()).toContain('开始你的 MyCompany 项目');
    await wrapper.find('[data-action="load-sample"]').trigger('click');
    await flushPromises();
    const store = useProjectStore();
    expect(store.fileList).toHaveLength(23);
    expect(wrapper.text()).toContain('orders.yml');
    expect(wrapper.findAll('[data-file^="menu/"]')).toHaveLength(18);
    expect(wrapper.find('[data-file="focus/none.yml"]').exists()).toBe(true);
    expect(wrapper.find('[data-file="focus/mob.yml"]').exists()).toBe(true);
    expect(wrapper.find('[data-file="focus/ore.yml"]').exists()).toBe(true);
    await wrapper.find('[data-file="orders.yml"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('顶层条目（10）');
    expect(wrapper.text()).toContain('stone_breaker');
    expect(wrapper.text()).toContain('mob_hunter');
    await wrapper.find('[data-action="project-open-editor"]').trigger('click');
    expect(store.activeFeatureId).toBe('orders');
    wrapper.unmount();
  });

  it('导出全量 ZIP，路径正确且不含 menus.yml / 参考 focus', async () => {
    setActivePinia(createPinia());
    const store = useProjectStore();
    store.importFiles(sampleFiles());
    store.importFiles([
      {
        path: 'focus/farming.yml',
        text: "id: farming\nlabel: Farming\nexpertise:\n  a:\n    condition: {}\n",
      },
    ]);
    const wrapper = await mountDashboard();
    const { blobs, filenames, restore } = stubDownloads();
    await wrapper.find('[data-action="project-export-zip"]').trigger('click');
    await flushPromises();
    expect(filenames).toEqual(['mycompany-project.zip']);
    const bytes = new Uint8Array(await blobs[0]!.arrayBuffer());
    const entries = await readZip(bytes);
    expect(entries).toHaveLength(22);
    expect(entries.some((entry) => entry.name === 'orders.yml')).toBe(true);
    expect(entries.some((entry) => entry.name === 'focus/none.yml')).toBe(true);
    expect(entries.some((entry) => entry.name === 'focus/mob.yml')).toBe(true);
    expect(entries.some((entry) => entry.name === 'focus/ore.yml')).toBe(true);
    expect(entries.some((entry) => entry.name === 'menus.yml')).toBe(false);
    expect(entries.some((entry) => entry.name.includes('farming'))).toBe(false);
    restore();
    wrapper.unmount();
  });

  it('下载项目 JSON 并可从 JSON 恢复', async () => {
    const store = useProjectStore();
    store.importFiles(sampleFiles());
    const wrapper = await mountDashboard();
    const { blobs, filenames, restore } = stubDownloads();
    await wrapper.find('[data-action="project-save-json"]').trigger('click');
    await flushPromises();
    expect(filenames).toEqual(['mycompany-project.json']);
    const text = await blobs[0]!.text();
    const data = JSON.parse(text) as ReturnType<typeof buildProjectJson>;
    expect(data.version).toBe(1);
    expect(data.files).toHaveLength(23);

    restore();
    wrapper.unmount();

    setActivePinia(createPinia());
    const wrapper2 = await mountDashboard();
    const input = wrapper2.find('[data-testid="project-file-input"]');
    const file = new File([text], 'project.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => text });
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
    window.confirm = () => true;
    await input.trigger('change');
    await flushPromises();
    const restored = useProjectStore();
    expect(restored.fileList).toHaveLength(23);
    expect(restored.files['menu/main.yml']).toBeDefined();
    wrapper2.unmount();
  });

  it('全局校验展示问题，错误阻止导出', async () => {
    setActivePinia(createPinia());
    const store = useProjectStore();
    store.importFiles([{ path: 'orders.yml', text: 'a: [1' }]);
    const wrapper = await mountDashboard();
    const text = wrapper.text();
    expect(text).toContain('YAML 解析失败');
    expect(text).toContain('第 1 行');
    expect(wrapper.find('[data-action="project-export-zip"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="export-blocked"]').text()).toContain('orders.yml');
    wrapper.unmount();
  });

  it('帮助面板列出字段速查与生效方式', async () => {
    useProjectStore().importFiles(sampleFiles());
    const wrapper = await mountDashboard();
    const help = wrapper.find('[data-testid="project-help"]').text();
    expect(help).toContain('break_block');
    expect(help).toContain('company_income');
    expect(help).toContain('focus/none.yml');
    expect(help).toContain('order-per-page');
    expect(help).toContain('需重启');
    expect(help).toContain('reload');
    wrapper.unmount();
  });
});
