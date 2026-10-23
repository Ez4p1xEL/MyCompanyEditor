import { catalogs, warnCatalogAlignment } from './catalog';
import {
  getLocale,
  initLocale as initLocaleState,
  setLocale as setLocaleState,
  useLocale as useLocaleState,
} from './locale';
import type { InitLocaleOptions, SetLocaleOptions } from './locale';
import type { Locale, MessageParams, MessageTree, MessagesByLocale } from './types';

export * from './types';
export * from './catalog';
export {
  LOCALE_STORAGE_KEY,
  detectLocale,
  getLocale,
  isLocale,
  onLocaleChange,
  syncHtmlLang,
} from './locale';
export type { DetectLocaleOptions, InitLocaleOptions, SetLocaleOptions } from './locale';

warnCatalogAlignment();

const warned = new Set<string>();

function findMessage(tree: MessageTree | undefined, path: string[]): string | MessageTree | undefined {
  let current: string | MessageTree | undefined = tree;
  for (const part of path) {
    if (!current || typeof current === 'string') return undefined;
    current = current[part];
  }
  return current;
}

function selectMessage(value: string | MessageTree | undefined, params?: MessageParams): string | undefined {
  if (typeof value === 'string') return value;
  if (value && params?.count !== undefined) {
    const form = value[Number(params.count) === 1 ? 'one' : 'other'];
    if (typeof form === 'string') return form;
  }
  return undefined;
}

function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

function warnMissing(message: string): void {
  if (!import.meta.env.DEV || warned.has(message)) return;
  warned.add(message);
  console.warn(`[i18n] ${message}`);
}

/** 底层翻译：缺失 key 先回退 zh-CN，再回退 key 本身；不抛异常。 */
export function translate(
  locale: Locale,
  key: string,
  params?: MessageParams,
  dictionaries: MessagesByLocale = catalogs,
): string {
  const parts = key.split('.').filter(Boolean);
  if (parts.length < 2) {
    warnMissing(`key “${key}” 需要 “domain.key” 形式`);
    return key;
  }
  const [domain, ...rest] = parts;
  const direct = selectMessage(findMessage(dictionaries[locale]?.[domain!], rest), params);
  if (direct !== undefined) return interpolate(direct, params);

  const fallback = selectMessage(findMessage(dictionaries['zh-CN']?.[domain!], rest), params);
  if (fallback !== undefined) {
    if (locale !== 'zh-CN') {
      warnMissing(`en 缺少 “${key}”，已回退 zh-CN`);
    }
    return interpolate(fallback, params);
  }

  warnMissing(`缺少 key “${key}”`);
  return key;
}

/** 组件内使用的 t；读取 locale ref，模板/计算属性可正常追踪语言变化。 */
export function t(key: string, params?: MessageParams): string {
  return translate(getLocale(), key, params);
}

function syncDocumentTitle(): void {
  if (typeof document === 'undefined') return;
  const title = t('shell.documentTitle');
  if (title !== 'shell.documentTitle') document.title = title;
}

/** 应用侧统一入口：切语言时同步 document.title（不进 App.vue/main.ts）。 */
export function setLocale(locale: Locale, options?: SetLocaleOptions): void {
  setLocaleState(locale, options);
  syncDocumentTitle();
}

export function initLocale(options?: InitLocaleOptions): Locale {
  const locale = initLocaleState(options);
  syncDocumentTitle();
  return locale;
}

export function useLocale() {
  const { locale } = useLocaleState();
  return { locale, setLocale };
}

export function useI18n() {
  const { locale } = useLocale();
  return {
    locale,
    t,
    setLocale,
  };
}

