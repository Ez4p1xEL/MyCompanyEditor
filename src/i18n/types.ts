export type Locale = 'zh-CN' | 'en';

export interface MessageTree {
  [key: string]: string | MessageTree;
}

/** 将 zh-CN 的字典形状映射成“同类结构、任意字符串”的类型，用于 en 对齐检查。 */
export type MessageShape<T> = {
  [Key in keyof T]: T[Key] extends string ? string : MessageShape<T[Key]>;
};

export type LocaleCatalog = Record<string, MessageTree>;
export type MessagesByLocale = Record<Locale, LocaleCatalog>;
export type MessageParams = Record<string, string | number>;

export interface LocaleState {
  locale: Locale;
}
