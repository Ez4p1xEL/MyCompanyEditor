import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../../src/App.vue';
import { checkCatalogAlignment, setLocale } from '../../src/i18n';
import enValidationMessages from '../../src/i18n/locales/en/validation';
import { validationText } from '../../src/core/validation';
import { MENU_META } from '../../src/features/menu/menuConstants';
import { useProjectStore } from '../../src/store/project';
import { fixtureText } from '../foundation/fixtures';

const HAN = /[\u4e00-\u9fff]/;

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  setLocale('zh-CN', { persist: false, notify: false });
  document.body.innerHTML = '';
});

function allFiles() {
  return [
    { path: 'orders.yml', text: fixtureText('orders.yml') },
    { path: 'focus/none.yml', text: fixtureText('focus/none.yml') },
    { path: 'focus/mob.yml', text: fixtureText('focus/mob.yml') },
    { path: 'focus.yml', text: fixtureText('focus.yml') },
    { path: 'menus.yml', text: fixtureText('menus.yml') },
    ...MENU_META.map((meta) => ({
      path: `menu/${meta.id}.yml`,
      text: fixtureText(`menu/${meta.id}.yml`),
    })),
  ];
}

describe('validation i18n', () => {
  it('validation 目录 zh/en key 对齐，en 值无中文', () => {
    expect(checkCatalogAlignment('validation')).toEqual({ missing: [], extra: [] });
    setLocale('en', { persist: false });
    expect(Object.values(enValidationMessages).every((message) => !HAN.test(message))).toBe(true);
    expect(validationText('文件为空')).toBe('The file is empty');
    expect(validationText('YAML 解析失败：{p0}', { p0: 'bad' })).toBe('YAML parsing failed: bad');
    expect(validationText('文件为空')).not.toMatch(HAN);
    setLocale('zh-CN', { persist: false });
    expect(validationText('文件为空')).toBe('文件为空');
  });

  it('en 下全部 fixture 的 message/fixHint 无中文，issue code/path/blocking 不变', () => {
    setLocale('en', { persist: false });
    const store = useProjectStore();
    store.importFiles(allFiles());
    const issues = store.allIssues;
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(issue.message, issue.code).not.toMatch(HAN);
      if (issue.fixHint) expect(issue.fixHint, issue.code).not.toMatch(HAN);
    }
    const before = issues.map((issue) => ({
      code: issue.code,
      file: issue.file,
      path: issue.path,
      severity: issue.severity,
      blocking: issue.blocking,
    }));
    setLocale('zh-CN', { persist: false });
    store.validateAll();
    const after = store.allIssues.map((issue) => ({
      code: issue.code,
      file: issue.file,
      path: issue.path,
      severity: issue.severity,
      blocking: issue.blocking,
    }));
    expect(after).toEqual(before);
    expect(store.allIssues.some((issue) => HAN.test(issue.message))).toBe(true);
  });

  it('切换语言触发 App 重新校验后现有 issues 立即换语言，文件内容不变', async () => {
    const store = useProjectStore();
    store.importFiles(allFiles());
    const filesBefore = Object.fromEntries(store.fileList.map((file) => [file.path, file.text]));
    const codesBefore = store.allIssues.map((issue) => issue.code);
    expect(store.allIssues.some((issue) => HAN.test(issue.message))).toBe(true);

    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    setLocale('en');
    await flushPromises();
    expect(store.allIssues.some((issue) => HAN.test(issue.message))).toBe(false);
    expect(store.allIssues.map((issue) => issue.code)).toEqual(codesBefore);
    expect(Object.fromEntries(store.fileList.map((file) => [file.path, file.text]))).toEqual(filesBefore);

    setLocale('zh-CN');
    await flushPromises();
    expect(store.allIssues.some((issue) => HAN.test(issue.message))).toBe(true);
    wrapper.unmount();
  });

  it('无效 YAML 与无效订单在 en 下也是英文，code 不变', () => {
    setLocale('en', { persist: false });
    const store = useProjectStore();
    store.importFiles([
      { path: 'bad.yml', text: 'a: [\n' },
      { path: 'orders.yml', text: 'bad.id:\n  label: Bad\n  quest: {}\n  reward: []\n' },
    ]);
    const yamlIssue = store.allIssues.find((issue) => issue.file === 'bad.yml');
    expect(yamlIssue?.code).toBe('YAML_PARSE');
    expect(yamlIssue?.message).not.toMatch(HAN);
    const orderIssue = store.allIssues.find((issue) => issue.file === 'orders.yml' && issue.code?.startsWith('ORD-'));
    expect(orderIssue?.message).not.toMatch(HAN);
    setLocale('zh-CN', { persist: false });
  });
});
