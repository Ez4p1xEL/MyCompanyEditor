import { getLocale } from '../../i18n';
import enOrders from '../../i18n/locales/en/orders';

/** 轻量 gettext 风格：中文原文作 key，en 表提供译文；zh 直接返回原文。 */
export function ordersText(key: string, params?: Record<string, string | number>): string {
  const lookup = encodeURIComponent(key);
  const template = getLocale() === 'zh-CN' ? key : (enOrders[lookup] ?? key);
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match: string, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}
