import { getLocale } from '../../i18n';
import enFocus from '../../i18n/locales/en/focus';

export function focusText(key: string, params?: Record<string, string | number>): string {
  const lookup = encodeURIComponent(key);
  const template = getLocale() === 'zh-CN' ? key : (enFocus[lookup] ?? key);
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match: string, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}
