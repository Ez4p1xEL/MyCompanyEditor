import type { FileKind } from './types';
import { parseYamlText } from './yaml';

/** 文件类型：与知识库 docs/mycompany-spec/constraints.md 的分类一致。 */
export type { FileKind };

/** 18 个菜单 id 硬编码在 MenuUtil.java:21-25，不能新增菜单文件。 */
export const MENU_IDS = [
  'area_list',
  'area_rent_market',
  'area_sale_market',
  'area_trade_market',
  'areas',
  'chestshop',
  'confirmation',
  'focus',
  'focus_list',
  'found',
  'internal_store',
  'main',
  'orders',
  'personnel',
  'player_list',
  'position',
  'position_list',
  'position_permission_list',
] as const;

/** focus 固定为 none / mob（FixedFocusList.java:8-12）。 */
export const FOCUS_IDS = ['none', 'mob'] as const;

export const FIXED_FOCUS_PATHS = ['focus/none.yml', 'focus/mob.yml'] as const;
export const FIXED_MENU_PATHS = MENU_IDS.map((id) => `menu/${id}.yml`);

const KIND_ORDER: FileKind[] = ['orders', 'focus', 'menu', 'focus-tree', 'menus-config', 'unknown'];

const KIND_LABELS: Record<FileKind, string> = {
  orders: '订单',
  focus: '专精',
  'focus-tree': '专精树（遗留）',
  menu: '菜单',
  'menus-config': '菜单配置（遗留）',
  unknown: '未知文件',
};

const KIND_ICONS: Record<FileKind, string> = {
  orders: '📋',
  focus: '✨',
  'focus-tree': '🌳',
  menu: '🧰',
  'menus-config': '🗄️',
  unknown: '📄',
};

export function fileKindLabel(kind: FileKind): string {
  return KIND_LABELS[kind];
}

export function fileKindIcon(kind: FileKind): string {
  return KIND_ICONS[kind];
}

export function fileKindOrder(kind: FileKind): number {
  const index = KIND_ORDER.indexOf(kind);
  return index === -1 ? KIND_ORDER.length : index;
}

/** 归一路径：反斜杠转斜杠、去掉 ./ 与多余分隔符、去除 .. 段。 */
export function normalizeProjectPath(input: string): string {
  const normalized = (input ?? '').trim().replace(/\\/g, '/');
  const parts: string[] = [];
  for (const segment of normalized.split('/')) {
    if (!segment || segment === '.') continue;
    // 禁止路径穿越：直接丢弃 .. 段。
    if (segment === '..') continue;
    parts.push(segment);
  }
  return parts.join('/');
}

function baseName(path: string): string {
  const normalized = normalizeProjectPath(path);
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

function kindFromPath(path: string): FileKind | undefined {
  const normalized = normalizeProjectPath(path).toLowerCase();
  const name = baseName(normalized);
  const isYaml = name.endsWith('.yml') || name.endsWith('.yaml');
  if (!isYaml) return undefined;
  if (normalized.startsWith('menu/')) return 'menu';
  if (normalized.startsWith('focus/')) return 'focus';
  if (normalized === 'focus.yml' || normalized === 'focus.yaml') return 'focus-tree';
  if (normalized === 'menus.yml' || normalized === 'menus.yaml') return 'menus-config';
  if (normalized === 'orders.yml' || normalized === 'orders.yaml') return 'orders';
  return undefined;
}

/** 内容启发式识别（文件名不规范时的兜底）。 */
export function detectKindByContent(text: string): FileKind {
  if (!text.trim()) return 'unknown';
  const parsed = parseYamlText(text);
  const doc = parsed.doc;
  if (!doc || !doc.contents) return 'unknown';
  const contents = doc.contents;
  if (!('items' in contents) || !Array.isArray(contents.items)) return 'unknown';
  const keys = new Set<string>();
  const childKeySets: Set<string>[] = [];
  for (const pair of contents.items as Array<{
    key?: { value?: unknown };
    value?: { items?: Array<{ key?: { value?: unknown } }> };
  }>) {
    const key = pair.key?.value;
    if (key !== null && key !== undefined) keys.add(String(key));
    // 订单文件的顶层 key 是订单 id，需要看第二层是否含 quest/reward。
    if (pair.value && Array.isArray(pair.value.items)) {
      const childKeys = new Set<string>();
      for (const child of pair.value.items) {
        const childKey = child.key?.value;
        if (childKey !== null && childKey !== undefined) childKeys.add(String(childKey));
      }
      childKeySets.push(childKeys);
    }
  }
  if (keys.has('focus-tree')) return 'focus-tree';
  if (keys.has('global')) return 'menus-config';
  if (keys.has('expertise')) return 'focus';
  if (keys.has('size') || keys.has('items') || keys.has('options')) return 'menu';
  if (
    keys.has('quest') ||
    keys.has('reward') ||
    childKeySets.some((childKeys) => childKeys.has('quest') || childKeys.has('reward'))
  ) {
    return 'orders';
  }
  if (keys.has('label') && keys.has('description')) return 'orders';
  return 'unknown';
}

/**
 * 识别文件类型。
 * 路径信息优先；根目录的 orders.yml / focus.yml 等与菜单 id 重名时用内容兜底。
 */
export function detectFileKind(path: string, text: string): FileKind {
  const normalized = normalizeProjectPath(path);
  const byPath = kindFromPath(normalized);
  const byContent = detectKindByContent(text);
  if (!byPath) return byContent;
  if (byContent === 'unknown' || byContent === byPath) return byPath;
  const name = baseName(normalized).toLowerCase();
  const ambiguousBareName =
    !normalized.includes('/') && ['orders.yml', 'orders.yaml', 'focus.yml', 'focus.yaml'].includes(name);
  return ambiguousBareName ? byContent : byPath;
}

/** 把单文件导入映射回插件标准路径（用户选中文件时通常只有文件名）。 */
export function canonicalProjectPath(fileName: string, kind: FileKind): string {
  const normalized = normalizeProjectPath(fileName);
  const base = baseName(normalized) || 'file.yml';
  switch (kind) {
    case 'orders':
      return 'orders.yml';
    case 'focus-tree':
      return 'focus.yml';
    case 'menus-config':
      return 'menus.yml';
    case 'focus':
      return `focus/${base.endsWith('.yml') || base.endsWith('.yaml') ? base : `${base}.yml`}`;
    case 'menu':
      return `menu/${base.endsWith('.yml') || base.endsWith('.yaml') ? base : `${base}.yml`}`;
    default:
      return normalized || base;
  }
}

export function isKnownMenuId(id: string): boolean {
  return (MENU_IDS as readonly string[]).includes(id);
}

export function isEditableKind(kind: FileKind): kind is 'orders' | 'focus' | 'menu' {
  return kind === 'orders' || kind === 'focus' || kind === 'menu';
}
