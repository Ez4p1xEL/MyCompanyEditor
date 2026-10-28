import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { PROJECT_STORAGE_KEY, useProjectStore } from '../../src/store/project';
import { fixtureText } from './fixtures';
import type { ProjectStore } from '../../src/store/project';

function seed(store: ProjectStore) {
  return store.importFiles([
    { path: 'orders.yml', text: fixtureText('orders.yml') },
    { path: 'menu/main.yml', text: fixtureText('menu/main.yml') },
    { path: 'focus/none.yml', text: fixtureText('focus/none.yml') },
  ]);
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('项目 store', () => {
  it('导入文件后识别类型、计算校验并选中首个文件', () => {
    const store = useProjectStore();
    const result = seed(store);
    expect(result.imported).toHaveLength(3);
    expect(store.fileList).toHaveLength(3);
    expect(store.filesByKind('orders')).toHaveLength(1);
    expect(store.filesByKind('menu')).toHaveLength(1);
    expect(store.filesByKind('focus')).toHaveLength(1);
    expect(store.activePath).toBe('orders.yml');
    expect(store.errorCount).toBe(0);
  });

  it('单个文件按内容识别并归一化到插件标准路径', () => {
    const store = useProjectStore();
    const result = store.importFiles([{ path: 'my-orders.yml', text: fixtureText('orders.yml') }]);
    expect(result.imported).toContain('orders.yml');
    expect(store.files['orders.yml']).toBeDefined();
  });

  it('非法 YAML 不抛异常并留下行列错误', () => {
    const store = useProjectStore();
    expect(() => store.importFiles([{ path: 'orders.yml', text: 'a: [1' }])).not.toThrow();
    expect(store.errorCount).toBeGreaterThan(0);
    expect(store.files['orders.yml'].parseError?.line).toBeGreaterThanOrEqual(1);
  });

  it('同一路径重复导入会替换而不是重复', () => {
    const store = useProjectStore();
    store.importFiles([{ path: 'orders.yml', text: fixtureText('orders.yml') }]);
    const second = store.importFiles([{ path: 'orders.yml', text: fixtureText('orders.yml') }]);
    expect(store.fileList).toHaveLength(1);
    expect(second.replaced).toContain('orders.yml');
  });

  it('保存到 localStorage 并恢复', () => {
    const store = useProjectStore();
    seed(store);
    expect(store.saveToLocalStorage()).toBe(true);
    expect(localStorage.getItem(PROJECT_STORAGE_KEY)).toContain('orders.yml');

    setActivePinia(createPinia());
    const restored = useProjectStore();
    expect(restored.restoreFromLocalStorage()).toBe(true);
    expect(restored.fileList).toHaveLength(3);
    expect(restored.files['orders.yml'].text).toBe(fixtureText('orders.yml'));
    expect(restored.activePath).toBe('orders.yml');
  });

  it('损坏的 localStorage 数据不会导致崩溃', () => {
    localStorage.setItem(PROJECT_STORAGE_KEY, '{not-json');
    const store = useProjectStore();
    expect(() => store.restoreFromLocalStorage()).not.toThrow();
    expect(store.restoreFromLocalStorage()).toBe(false);
    expect(store.fileList).toHaveLength(0);
  });

  it('未导出修改状态可被标记与清除', () => {
    const store = useProjectStore();
    expect(store.isDirty).toBe(false);
    store.importFiles([{ path: 'orders.yml', text: fixtureText('orders.yml') }]);
    expect(store.isDirty).toBe(true);
    store.markExported();
    expect(store.isDirty).toBe(false);
    store.importFiles([{ path: 'menu/main.yml', text: fixtureText('menu/main.yml') }]);
    expect(store.isDirty).toBe(true);
  });

  it('区分本地保存状态与未导出状态', () => {
    const store = useProjectStore();
    expect(store.isLocallySaved).toBe(true);
    store.importFiles([{ path: 'orders.yml', text: fixtureText('orders.yml') }]);
    expect(store.isLocallySaved).toBe(false);
    expect(store.isDirty).toBe(true);

    expect(store.saveToLocalStorage()).toBe(true);
    expect(store.isLocallySaved).toBe(true);
    expect(store.isDirty).toBe(true);

    expect(store.markExported()).toBeUndefined();
    expect(store.isDirty).toBe(false);

    store.importFiles([{ path: 'menu/main.yml', text: fixtureText('menu/main.yml') }]);
    expect(store.isLocallySaved).toBe(false);
    expect(store.isDirty).toBe(true);
  });

  it('载入 23 个示例文件', () => {
    const store = useProjectStore();
    const result = store.loadSample();
    expect(result.imported).toHaveLength(23);
    expect(store.fileList).toHaveLength(23);
    expect(store.filesByKind('orders')).toHaveLength(1);
    expect(store.filesByKind('focus')).toHaveLength(3);
    expect(store.filesByKind('menu')).toHaveLength(18);
    expect(store.filesByKind('focus-tree')).toHaveLength(0);
    expect(store.filesByKind('menus-config')).toHaveLength(1);
  });

  it('删除文件后自动切换选中项', () => {
    const store = useProjectStore();
    seed(store);
    store.removeFile('orders.yml');
    expect(store.files['orders.yml']).toBeUndefined();
    expect(store.activePath).toBe('focus/none.yml');
    store.removeFile('focus/none.yml');
    store.removeFile('menu/main.yml');
    expect(store.activePath).toBeNull();
  });

  it('清空项目', () => {
    const store = useProjectStore();
    seed(store);
    store.clearProject();
    expect(store.fileList).toHaveLength(0);
    expect(store.activePath).toBeNull();
    expect(store.isDirty).toBe(false);
  });
});
