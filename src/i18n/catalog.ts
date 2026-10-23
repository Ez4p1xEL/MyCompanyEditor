import type { Locale, LocaleCatalog, MessageTree, MessagesByLocale } from './types';

const localeModules = import.meta.glob('./locales/*/*.ts', {
  eager: true,
}) as Record<string, { default?: MessageTree }>;

function buildCatalogs(): MessagesByLocale {
  const catalogs: MessagesByLocale = { 'zh-CN': {}, en: {} };
  for (const [path, module] of Object.entries(localeModules)) {
    const match = /^\.\/locales\/(zh-CN|en)\/([^/]+)\.ts$/.exec(path);
    if (!match) continue;
    const locale = match[1] as Locale;
    const domain = match[2]!;
    if (module.default && typeof module.default === 'object') {
      catalogs[locale][domain] = module.default;
    }
  }
  return catalogs;
}

/** 运行时目录：后续任务新增 locales/<locale>/<domain>.ts 会自动 merge，无需改 index。 */
export const catalogs: MessagesByLocale = buildCatalogs();

export function collectLeafKeys(tree: MessageTree, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') keys.push(path);
    else if (value && typeof value === 'object') keys.push(...collectLeafKeys(value, path));
  }
  return keys.sort();
}

export function catalogKeys(locale: Locale, domain = 'common'): string[] {
  const tree = catalogs[locale]?.[domain];
  return tree ? collectLeafKeys(tree) : [];
}

/** zh-CN / en 的 common 叶子 key 必须完全一致；返回缺失/多余项供 CI 或测试断言。 */
export function checkCatalogAlignment(domain = 'common'): {
  missing: string[];
  extra: string[];
} {
  const zhKeys = new Set(catalogKeys('zh-CN', domain));
  const enKeys = new Set(catalogKeys('en', domain));
  return {
    missing: [...zhKeys].filter((key) => !enKeys.has(key)).sort(),
    extra: [...enKeys].filter((key) => !zhKeys.has(key)).sort(),
  };
}

/** 开发期自动检查；运行时仍会逐 key 回退 zh-CN，不会因缺 key 崩溃。 */
export function warnCatalogAlignment(): void {
  if (!import.meta.env.DEV) return;
  const { missing, extra } = checkCatalogAlignment('common');
  if (missing.length > 0) {
    console.warn(`[i18n] en/common 缺少 ${missing.length} 个 key：${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    console.warn(`[i18n] en/common 多出 ${extra.length} 个 key：${extra.join(', ')}`);
  }
}

/** 供测试/工具使用：按 locale/domain 取目录。 */
export function getCatalog(locale: Locale, domain = 'common'): LocaleCatalog[string] | undefined {
  return catalogs[locale]?.[domain];
}
