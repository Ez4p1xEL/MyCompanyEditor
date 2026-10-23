import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../../src/App.vue';
import AppSidebar from '../../src/components/AppSidebar.vue';
import ExportDialog from '../../src/components/ExportDialog.vue';
import FeaturePlaceholder from '../../src/components/FeaturePlaceholder.vue';
import IssueList from '../../src/components/IssueList.vue';
import ToastHost from '../../src/components/ToastHost.vue';
import ProjectDashboard from '../../src/features/project/ProjectDashboard.vue';
import ProjectOverview from '../../src/views/ProjectOverview.vue';
import { closeExportDialog, openExportDialog } from '../../src/core/exportDialog';
import { clearToasts, pushToast } from '../../src/core/toast';
import { checkCatalogAlignment, setLocale } from '../../src/i18n';
import { getAllFeatures, getNavItems } from '../../src/features/registry';
import { planYamlImports, parseProjectJson } from '../../src/features/project/projectFileOps';
import { useProjectStore } from '../../src/store/project';
import { fixtureText } from '../foundation/fixtures';

const CJK = /[\u4e00-\u9fff]/;

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  setLocale('zh-CN', { persist: false, notify: false });
  closeExportDialog();
  document.body.innerHTML = '';
  clearToasts();
});

describe('shell 字典与侧栏', () => {
  it('shell 目录 zh-CN/en key 对齐', () => {
    expect(checkCatalogAlignment('shell')).toEqual({ missing: [], extra: [] });
  });

  it('侧栏中文用「专精文件」，英文无中文并使用 Focus files', async () => {
    const wrapper = mount(AppSidebar, {
      props: { items: getNavItems(), activeId: 'project' },
      attachTo: document.body,
    });
    await flushPromises();
    expect(wrapper.text()).toContain('专精文件');
    expect(wrapper.text()).not.toContain('焦点文件');

    setLocale('en');
    await flushPromises();
    const english = wrapper.text();
    expect(english).not.toMatch(CJK);
    expect(english).toContain('Focus files');
    expect(english).toContain('Project overview');
    expect(english).toContain('Chest menus');

    setLocale('zh-CN');
    await flushPromises();
    expect(wrapper.text()).toContain('专精文件');
    wrapper.unmount();
  });

  it('feature registry 标题跟随 locale', () => {
    setLocale('en', { persist: false });
    expect(getAllFeatures().find((feature) => feature.id === 'orders')?.title).toBe('Orders');
    expect(getNavItems().find((item) => item.id === 'project')?.title).toBe('Project overview');
    setLocale('zh-CN', { persist: false });
    expect(getAllFeatures().find((feature) => feature.id === 'orders')?.title).toBe('订单');
  });
});

  it('App en 拖拽遮罩/导入错误无中文', async () => {
    setLocale('en', { persist: false });
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    await wrapper.find('.app-shell').trigger('dragenter');
    await flushPromises();
    const overlay = wrapper.find('.drop-overlay').text();
    expect(overlay).not.toMatch(CJK);
    expect(overlay).toContain('Drop to import YAML files');
    expect(overlay).toContain('Supports orders.yml / focus/*.yml / menu/*.yml');

    const input = wrapper.find('input.visually-hidden[type="file"]');
    const file = new File(['x'], 'bad.txt', { type: 'text/plain' });
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
    await input.trigger('change');
    await flushPromises();
    const toast = wrapper.find('.toast-message').text();
    expect(toast).not.toMatch(CJK);
    expect(toast).toContain('Select .yml / .yaml files');
    wrapper.unmount();
  });

describe('shell UI 英文无中文', () => {
  it('空状态工作台/总览/占位/问题列表/Toast 关闭按钮', async () => {
    setLocale('en', { persist: false });

    const dashboard = mount(ProjectDashboard, { attachTo: document.body });
    await flushPromises();
    expect(dashboard.text()).not.toMatch(CJK);
    expect(dashboard.text()).toContain('Project workspace');
    dashboard.unmount();

    const overview = mount(ProjectOverview, { attachTo: document.body });
    await flushPromises();
    expect(overview.text()).not.toMatch(CJK);
    expect(overview.text()).toContain('Project overview');
    overview.unmount();

    const placeholder = mount(FeaturePlaceholder, {
      props: { featureId: 'orders', title: '订单', icon: '📋' },
    });
    expect(placeholder.text()).not.toMatch(CJK);
    expect(placeholder.text()).toContain('Feature placeholder');
    placeholder.unmount();

    const issues = mount(IssueList, { props: { issues: [] } });
    expect(issues.text()).not.toMatch(CJK);
    expect(issues.text()).toContain('No issues found');
    issues.unmount();

    const issue = mount(IssueList, {
      props: {
        issues: [
          {
            severity: 'error' as const,
            message: 'synthetic message',
            file: 'orders.yml',
            code: 'SYN-1',
            line: 3,
            column: 4,
          },
        ],
      },
    });
    expect(issue.text()).not.toMatch(CJK);
    expect(issue.text()).toContain('Error');
    expect(issue.text()).toContain('line 3, column 4');
    issue.unmount();

    pushToast('synthetic toast', 'info');
    const toast = mount(ToastHost);
    expect(toast.find('.toast-close').attributes('aria-label')).toBe('Dismiss notification');
    toast.unmount();
    clearToasts();

    setLocale('zh-CN', { persist: false });
  });

  it('ExportDialog 英文文案', async () => {
    const store = useProjectStore();
    store.importFiles([{ path: 'orders.yml', text: fixtureText('orders.yml') }]);
    openExportDialog('orders.yml');
    setLocale('en', { persist: false });
    const wrapper = mount(ExportDialog, { attachTo: document.body });
    await flushPromises();
    expect(wrapper.text()).not.toMatch(CJK);
    expect(wrapper.text()).toContain('Export YAML file');
    expect(wrapper.text()).toContain('Download .yml');
    wrapper.unmount();
    closeExportDialog();
    setLocale('zh-CN', { persist: false });
  });

  it('projectFileOps / zip 的提示随 locale 切换', () => {
    setLocale('en', { persist: false });
    const plan = planYamlImports([{ path: 'unknown.yml', text: 'hello: world\n' }]);
    expect(plan.skipped[0]?.reason).not.toMatch(CJK);
    const parsed = parseProjectJson('not json');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).not.toMatch(CJK);
    setLocale('zh-CN', { persist: false });
  });

  it('切换语言不丢项目、不改写文件，切回中文正常', async () => {
    const store = useProjectStore();
    store.importFiles([{ path: 'orders.yml', text: fixtureText('orders.yml') }]);
    const original = store.files['orders.yml']!.text;
    const wrapper = mount(ProjectDashboard, { attachTo: document.body });
    await flushPromises();
    setLocale('en');
    await flushPromises();
    expect(store.files['orders.yml']!.text).toBe(original);
    expect(store.fileList).toHaveLength(1);
    // 校验消息仍由 t29 本地化；此处只验证壳层/项目状态。
    expect(wrapper.text()).toContain('Project workspace');
    setLocale('zh-CN');
    await flushPromises();
    expect(wrapper.text()).toContain('项目工作台');
    wrapper.unmount();
  });
});
