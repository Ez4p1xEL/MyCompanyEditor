import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectExportBlockers,
  groupExportBlockers,
  prepareAllExports,
  prepareExport,
  validateExportFilename,
} from '../../src/core/export';
import { closeExportDialog, openExportDialog } from '../../src/core/exportDialog';
import { createProjectFile } from '../../src/core/projectFile';
import { describeSampleImport } from '../../src/core/samples';
import { clearToasts, useToasts } from '../../src/core/toast';
import { validateProject } from '../../src/core/validation';
import { parseYamlText } from '../../src/core/yaml';
import { useProjectStore } from '../../src/store/project';
import AppToolbar from '../../src/components/AppToolbar.vue';
import ExportDialog from '../../src/components/ExportDialog.vue';
import { fixtureText } from './fixtures';

function validatedFile(path: string, text: string) {
  const file = createProjectFile(path, text);
  const result = validateProject([file]);
  file.issues = result.byFile[path] ?? [];
  return file;
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

describe('单文件导出', () => {
  it('orders.yml 导出后语义等价且保持数值类型', () => {
    const file = createProjectFile('orders.yml', fixtureText('orders.yml'));
    const prepared = prepareExport(file);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.payload.filename).toBe('orders.yml');
    expect(prepared.payload.text.endsWith('\n')).toBe(true);
    expect(prepared.payload.text.includes('\r')).toBe(false);
    const reparsed = parseYamlText(prepared.payload.text);
    expect(reparsed.ok).toBe(true);
    const value = reparsed.doc?.toJS() as Record<string, any>;
    expect(value.stone_breaker.quest['1'].amount).toBe(16);
    expect(value.miner.reward).toContain('company_income;3000.0');
  });

  it('非法 YAML 拒绝导出并给出行列错误', () => {
    const file = createProjectFile('orders.yml', 'orders: [1');
    const prepared = prepareExport(file);
    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.issues[0].severity).toBe('error');
    expect(prepared.issues[0].line).toBeGreaterThanOrEqual(1);
  });

  it('导出文件名必须合法且以 .yml/.yaml 结尾', () => {
    expect(validateExportFilename('orders.yml')).toBeNull();
    expect(validateExportFilename('my-orders.yaml')).toBeNull();
    expect(validateExportFilename('')).not.toBeNull();
    expect(validateExportFilename('orders.txt')).not.toBeNull();
    expect(validateExportFilename('menu/main.yml')).not.toBeNull();
    expect(validateExportFilename('..\\orders.yml')).not.toBeNull();
  });
});

describe('导出阻断聚合', () => {
  it('blocking / error 阻止；warning/info 不阻止', () => {
    const duplicate = validatedFile('orders.yml', 'a: 1\na: 2\n');
    expect(duplicate.issues.some((issue) => issue.code === 'YAML_DUPLICATE_KEY')).toBe(true);
    const blockers = collectExportBlockers([duplicate]);
    expect(blockers.some((issue) => issue.code === 'YAML_DUPLICATE_KEY')).toBe(true);
    const groups = groupExportBlockers(blockers);
    expect(groups).toHaveLength(1);
    expect(groups[0].file).toBe('orders.yml');

    const valid = validatedFile('orders.yml', fixtureText('orders.yml'));
    expect(collectExportBlockers([valid])).toHaveLength(0);

    const warningOnly = validatedFile('focus.yml', 'focus-tree: {}\n');
    expect(warningOnly.issues.some((issue) => issue.severity === 'info')).toBe(true);
    expect(collectExportBlockers([warningOnly])).toHaveLength(0);
  });

  it('prepareAllExports：有 error 时阻断，合法文件全部生成 payload', () => {
    const duplicate = validatedFile('orders.yml', 'a: 1\na: 2\n');
    const blocked = prepareAllExports([duplicate]);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.issues.some((issue) => issue.code === 'YAML_DUPLICATE_KEY')).toBe(true);

    const orders = validatedFile('orders.yml', fixtureText('orders.yml'));
    const menu = validatedFile('menu/main.yml', fixtureText('menu/main.yml'));
    const allowed = prepareAllExports([orders, menu]);
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(allowed.payloads).toHaveLength(2);
      expect(allowed.payloads.map((payload) => payload.filename)).toEqual([
        'orders.yml',
        'menu-main.yml',
      ]);
      expect(new Set(allowed.payloads.map((payload) => payload.filename)).size).toBe(2);
    }
  });

  it('全部导出文件名唯一，避免 menu/focus.yml 与 focus.yml 覆盖', () => {
    setActivePinia(createPinia());
    const store = useProjectStore();
    store.loadSample();
    const prepared = prepareAllExports(store.fileList);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const names = prepared.payloads.map((payload) => payload.filename);
    expect(names).toHaveLength(23);
    expect(new Set(names).size).toBe(23);
    expect(names).toContain('focus-ore.yml');
    expect(names).toContain('menu-focus.yml');
    expect(names).toContain('orders.yml');
    expect(names).toContain('menu-orders.yml');
  });
});

describe('导出对话框阻断（回归 T3-F1）', () => {
  beforeEach(() => {
    localStorage.clear();
    clearToasts();
    closeExportDialog();
    setActivePinia(createPinia());
    document.body.innerHTML = '';
  });

  it('重复顶层键 orders.yml 被阻止：列出 YAML_DUPLICATE_KEY，两个导出按钮不可用', async () => {
    const store = useProjectStore();
    store.importFiles([{ path: 'orders.yml', text: 'a: 1\na: 2\n' }]);
    openExportDialog('orders.yml');
    const wrapper = mount(ExportDialog, { attachTo: document.body });
    await flushPromises();

    expect(wrapper.find('[data-testid="export-blockers"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('YAML_DUPLICATE_KEY');
    expect(wrapper.text()).toContain('orders.yml');
    expect(wrapper.find('[data-action="confirm-export"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-action="export-all"]').attributes('disabled')).toBeDefined();
    expect(wrapper.findAll('[data-action="locate-blocker-file"]')).toHaveLength(1);
    wrapper.unmount();
  });

  it('合法文件仍可导出，且 parse→dump→parse 自检保持', async () => {
    const store = useProjectStore();
    store.importFiles([{ path: 'orders.yml', text: fixtureText('orders.yml') }]);
    openExportDialog('orders.yml');
    const wrapper = mount(ExportDialog, { attachTo: document.body });
    await flushPromises();

    expect(wrapper.find('[data-testid="export-blockers"]').exists()).toBe(false);
    const button = wrapper.find('[data-action="confirm-export"]');
    expect(button.attributes('disabled')).toBeUndefined();

    const { blobs, restore } = stubDownloads();
    await button.trigger('click');
    await flushPromises();
    expect(blobs).toHaveLength(1);
    const exported = parseYamlText(await blobs[0].text());
    expect(exported.ok).toBe(true);
    expect(store.isDirty).toBe(false);
    restore();
    wrapper.unmount();
  });

  it('错误清除后可以导出', async () => {
    const store = useProjectStore();
    store.importFiles([{ path: 'orders.yml', text: 'a: 1\na: 2\n' }]);
    openExportDialog('orders.yml');
    const wrapper = mount(ExportDialog, { attachTo: document.body });
    await flushPromises();
    expect(wrapper.find('[data-action="confirm-export"]').attributes('disabled')).toBeDefined();

    store.upsertFile('orders.yml', fixtureText('orders.yml'), 'orders');
    await flushPromises();
    expect(wrapper.find('[data-testid="export-blockers"]').exists()).toBe(false);
    expect(wrapper.find('[data-action="confirm-export"]').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('全部导出同样受阻断规则约束，合法项目可全部导出', async () => {
    const blockedStore = useProjectStore();
    blockedStore.importFiles([
      { path: 'orders.yml', text: 'a: 1\na: 2\n' },
      { path: 'menu/main.yml', text: fixtureText('menu/main.yml') },
    ]);
    openExportDialog('orders.yml');
    const blockedWrapper = mount(ExportDialog, { attachTo: document.body });
    await flushPromises();
    expect(blockedWrapper.find('[data-action="export-all"]').attributes('disabled')).toBeDefined();
    blockedWrapper.unmount();

    closeExportDialog();
    setActivePinia(createPinia());
    const store = useProjectStore();
    store.importFiles([
      { path: 'orders.yml', text: fixtureText('orders.yml') },
      { path: 'menu/main.yml', text: fixtureText('menu/main.yml') },
    ]);
    openExportDialog('orders.yml');
    const wrapper = mount(ExportDialog, { attachTo: document.body });
    await flushPromises();
    const { blobs, restore } = stubDownloads();
    await wrapper.find('[data-action="export-all"]').trigger('click');
    await flushPromises();
    expect(blobs).toHaveLength(2);
    expect(store.isDirty).toBe(false);
    restore();
    wrapper.unmount();
  });
});

describe('自动保存状态与示例文案', () => {
  beforeEach(() => {
    localStorage.clear();
    clearToasts();
    closeExportDialog();
    setActivePinia(createPinia());
    document.body.innerHTML = '';
  });

  it('恢复后显示已自动保存，不再长期显示等待自动保存', async () => {
    const store = useProjectStore();
    store.importFiles([{ path: 'orders.yml', text: fixtureText('orders.yml') }]);
    expect(store.isLocallySaved).toBe(false);
    store.saveToLocalStorage();
    expect(store.isLocallySaved).toBe(true);

    setActivePinia(createPinia());
    const restored = useProjectStore();
    expect(restored.restoreFromLocalStorage()).toBe(true);
    expect(restored.isLocallySaved).toBe(true);

    const wrapper = mount(AppToolbar);
    await flushPromises();
    expect(wrapper.text()).toContain('已自动保存');
    expect(wrapper.text()).not.toContain('等待自动保存');
    expect(wrapper.text()).toContain('未导出修改');
    wrapper.unmount();
  });

  it('载入示例 toast 同时报告新增与替换', async () => {
    const wrapper = mount(AppToolbar);
    await flushPromises();
    await wrapper.find('[data-action="menu-load-sample"]').trigger('click');
    await flushPromises();
    let latest = useToasts().items.at(-1)?.message ?? '';
    expect(latest).toContain('新增 23');
    expect(latest).toContain('替换 0');

    await wrapper.find('[data-action="menu-load-sample"]').trigger('click');
    await flushPromises();
    latest = useToasts().items.at(-1)?.message ?? '';
    expect(latest).toContain('新增 0');
    expect(latest).toContain('替换 23');
    expect(latest).toContain('同名文件已用示例替换');
    wrapper.unmount();
  });

  it('describeSampleImport 文案', () => {
    expect(describeSampleImport({ imported: ['a'], replaced: [] })).toContain('新增 1 个，替换 0 个');
    expect(describeSampleImport({ imported: [], replaced: ['a'] })).toContain('替换 1 个');
    expect(describeSampleImport({ imported: [], replaced: ['a'] })).toContain('同名文件已用示例替换');
  });
});
