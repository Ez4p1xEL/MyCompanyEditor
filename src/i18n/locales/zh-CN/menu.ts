import enMessages from '../en/menu';

// 中文原文即 key；保持与 en 相同 key 形状，便于 checkCatalogAlignment。
const messages: Record<string, string> = Object.fromEntries(
  Object.keys(enMessages).map((key) => [key, key]),
);

export default messages;
