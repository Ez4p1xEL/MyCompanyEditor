import { readonly, ref } from 'vue';
import type { Locale } from './types';

export const LOCALE_STORAGE_KEY = 'mycompany-editor:locale';
const SUPPORTED_LOCALES: Locale[] = ['zh-CN', 'en'];

const currentLocale = ref<Locale>('zh-CN');
const listeners = new Set<(locale: Locale) => void>();

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function readStoredLocale(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export interface DetectLocaleOptions {
  stored?: string | null;
  language?: string;
}

/** 纯函数检测：localStorage 优先；否则 zh* → zh-CN，其余 → en。 */
export function detectLocale(options: DetectLocaleOptions = {}): Locale {
  const stored = options.stored === undefined ? readStoredLocale() : options.stored;
  if (isLocale(stored)) return stored;
  const language =
    options.language ??
    (typeof navigator !== 'undefined' && typeof navigator.language === 'string'
      ? navigator.language
      : 'en');
  return language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function syncHtmlLang(locale: Locale = currentLocale.value): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

function persistLocale(locale: Locale): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // localStorage 不可用时只保留内存状态。
  }
}

function notify(locale: Locale): void {
  for (const listener of [...listeners]) {
    try {
      listener(locale);
    } catch (error) {
      console.error('[i18n] locale listener failed', error);
    }
  }
}

export interface SetLocaleOptions {
  persist?: boolean;
  notify?: boolean;
}

export function setLocale(locale: Locale, options: SetLocaleOptions = {}): void {
  if (!isLocale(locale)) return;
  const changed = currentLocale.value !== locale;
  currentLocale.value = locale;
  syncHtmlLang(locale);
  if (options.persist !== false) persistLocale(locale);
  if (changed && options.notify !== false) notify(locale);
}

export interface InitLocaleOptions extends DetectLocaleOptions, SetLocaleOptions {}

/** 应用启动时调用：检测首次语言并写入状态；默认不写 localStorage（切换时才写）。 */
export function initLocale(options: InitLocaleOptions = {}): Locale {
  const locale = detectLocale(options);
  setLocale(locale, { persist: options.persist ?? false, notify: options.notify ?? false });
  return locale;
}

export function getLocale(): Locale {
  return currentLocale.value;
}

export function onLocaleChange(listener: (locale: Locale) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLocale() {
  return {
    locale: readonly(currentLocale),
    setLocale,
  };
}
