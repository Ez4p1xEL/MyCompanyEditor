import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOCALE_STORAGE_KEY,
  checkCatalogAlignment,
  detectLocale,
  getLocale,
  initLocale,
  onLocaleChange,
  setLocale,
  t,
  translate,
  useI18n,
  useLocale,
} from '../../src/i18n';

beforeEach(() => {
  localStorage.clear();
  setLocale('zh-CN', { persist: false, notify: false });
});

describe('locale 检测与持久化', () => {
  it('localStorage 优先，其次 zh* → zh-CN，其余 → en', () => {
    expect(detectLocale({ stored: 'en', language: 'zh-CN' })).toBe('en');
    expect(detectLocale({ stored: 'zh-CN', language: 'en-US' })).toBe('zh-CN');
    expect(detectLocale({ stored: null, language: 'zh-TW' })).toBe('zh-CN');
    expect(detectLocale({ stored: null, language: 'zh' })).toBe('zh-CN');
    expect(detectLocale({ stored: null, language: 'en-US' })).toBe('en');
    expect(detectLocale({ stored: null, language: 'fr-FR' })).toBe('en');
    expect(detectLocale({ stored: 'invalid', language: 'zh-CN' })).toBe('zh-CN');
  });

  it('切换写入 localStorage、同步 html lang、通知监听器', () => {
    const seen: string[] = [];
    const unsubscribe = onLocaleChange((locale) => seen.push(locale));
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('MyCompany Editor · orders / focus / menu');
    expect(seen).toEqual(['en']);

    setLocale('zh-CN');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.title).toBe('MyCompany 编辑器 · orders / focus / menu');
    expect(seen).toEqual(['en', 'zh-CN']);
    unsubscribe();
    setLocale('en');
    expect(seen).toEqual(['en', 'zh-CN']);
    setLocale('zh-CN');
  });

  it('initLocale 按检测结果初始化且不强制写 storage', () => {
    localStorage.clear();
    expect(initLocale({ stored: null, language: 'zh-CN' })).toBe('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
    expect(initLocale({ stored: 'en', language: 'zh-CN' })).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('MyCompany Editor · orders / focus / menu');
    setLocale('zh-CN', { persist: false });
  });
});

describe('字典与翻译', () => {
  it('common 目录 zh-CN / en 的 key 完全对齐', () => {
    expect(checkCatalogAlignment('common')).toEqual({ missing: [], extra: [] });
  });

  it('嵌套 key 与参数插值、useI18n/useLocale', () => {
    setLocale('zh-CN', { persist: false });
    expect(t('common.toolbar.errors', { count: 3 })).toBe('错误 3');
    expect(t('common.toolbar.autosave.savedAt', { time: '12:00:00' })).toBe(
      '已自动保存 12:00:00',
    );
    setLocale('en', { persist: false });
    expect(t('common.toolbar.errors', { count: 3 })).toBe('3 errors');
    expect(t('common.toolbar.errors', { count: 1 })).toBe('1 error');
    expect(t('common.toolbar.infos', { count: 2 })).toBe('2 info');
    expect(t('common.toolbar.version', { spec: '6764e01', plugin: '0.8.50' })).toBe(
      'Spec 6764e01 · Plugin 0.8.50',
    );
    const i18n = useI18n();
    expect(typeof i18n.t).toBe('function');
    expect(typeof i18n.setLocale).toBe('function');
    expect(useLocale().locale.value).toBe('en');
    setLocale('zh-CN', { persist: false });
  });

  it('缺失 key 回退 zh-CN，再缺失返回 key 并给 dev warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const custom = {
      'zh-CN': { common: { known: '中文回退' } },
      en: { common: {} },
    };
    expect(translate('en', 'common.known', undefined, custom)).toBe('中文回退');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('回退 zh-CN'));

    setLocale('en', { persist: false });
    expect(t('common.missing.key')).toBe('common.missing.key');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('缺少 key'));
    warn.mockRestore();
    setLocale('zh-CN', { persist: false });
  });
});
