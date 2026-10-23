import { MATERIAL_NAMES } from './data/materials';

export type MenuCategory = '主界面' | '订单与商店' | '领地' | '人事' | '专精';

export interface MenuMeta {
  id: string;
  label: string;
  category: MenuCategory;
  pageOption?: { key: string; defaultValue: number };
  templates: string[];
  requiresConfirm?: boolean;
}

export const MENU_CATEGORIES: MenuCategory[] = ['主界面', '订单与商店', '领地', '人事', '专精'];

export const MENU_META: MenuMeta[] = [
  { id: 'main', label: '公司主菜单', category: '主界面', templates: [] },
  { id: 'found', label: '未加入公司', category: '主界面', templates: [] },
  { id: 'confirmation', label: '二次确认对话框', category: '主界面', templates: [], requiresConfirm: true },
  {
    id: 'orders',
    label: '每日订单列表',
    category: '订单与商店',
    pageOption: { key: 'order-per-page', defaultValue: 5 },
    templates: ['order'],
  },
  { id: 'internal_store', label: '公司内部商店', category: '订单与商店', templates: [] },
  { id: 'chestshop', label: '箱子商店帮助', category: '订单与商店', templates: [] },
  { id: 'areas', label: '领地管理入口', category: '领地', templates: [] },
  { id: 'area_trade_market', label: '领地上架入口', category: '领地', templates: [] },
  {
    id: 'area_rent_market',
    label: '领地租赁市场',
    category: '领地',
    pageOption: { key: 'area-per-page', defaultValue: 10 },
    templates: ['area'],
  },
  {
    id: 'area_sale_market',
    label: '领地出售市场',
    category: '领地',
    pageOption: { key: 'area-per-page', defaultValue: 10 },
    templates: ['area'],
  },
  {
    id: 'area_list',
    label: '公司领地列表',
    category: '领地',
    pageOption: { key: 'area-per-page', defaultValue: 10 },
    templates: ['area', 'area_rent'],
  },
  {
    id: 'personnel',
    label: '公司人员列表',
    category: '人事',
    pageOption: { key: 'personnel-per-page', defaultValue: 10 },
    templates: ['personnel'],
  },
  {
    id: 'player_list',
    label: '待雇佣玩家列表',
    category: '人事',
    pageOption: { key: 'player-per-page', defaultValue: 10 },
    templates: ['player'],
  },
  {
    id: 'position_list',
    label: '职位选择列表',
    category: '人事',
    pageOption: { key: 'position-per-page', defaultValue: 10 },
    templates: ['position'],
  },
  {
    id: 'position',
    label: '职位管理',
    category: '人事',
    pageOption: { key: 'position-per-page', defaultValue: 10 },
    templates: ['position'],
  },
  {
    id: 'position_permission_list',
    label: '职位权限开关',
    category: '人事',
    pageOption: { key: 'permission-per-page', defaultValue: 10 },
    templates: ['permission'],
  },
  {
    id: 'focus',
    label: '专精树',
    category: '专精',
    pageOption: { key: 'expertise-per-page', defaultValue: 10 },
    templates: ['expertise'],
  },
  {
    id: 'focus_list',
    label: '选择公司 focus',
    category: '专精',
    pageOption: { key: 'focus-per-page', defaultValue: 5 },
    templates: ['focus'],
  },
];

export const MENU_IDS = MENU_META.map((meta) => meta.id);

export function menuMeta(id: string): MenuMeta | undefined {
  return MENU_META.find((meta) => meta.id === id);
}

export function isKnownMenuId(id: string): boolean {
  return MENU_IDS.includes(id);
}

export function menuPath(id: string): string {
  return `menu/${id}.yml`;
}

export function menuIdFromPath(path: string): string {
  const name = path.split('/').pop() ?? path;
  return name.replace(/\.ya?ml$/i, '');
}

export const SIZE_OPTIONS = [9, 18, 27, 36, 45, 54];

export function isValidMenuSize(value: number): boolean {
  return Number.isInteger(value) && value >= 9 && value <= 54 && value % 9 === 0;
}

/** 自定义材质物品：无槽位是合法设计。 */
export function isCustomMaterialItem(id: string): boolean {
  return /^(expertise|focus|permission)_/.test(id);
}

export interface MaterialCheck {
  valid: boolean;
  kind: 'normal' | 'namespaced' | 'head' | 'air' | 'invalid';
  reason?: string;
  /** PLAYER_HEAD; 后的 owner（可能为空） */
  owner?: string;
}

/** 按 MenuItem.java 的语义校验 material（不依赖 Bukkit 运行时）。 */
export function checkMaterial(raw: string): MaterialCheck {
  const value = raw.trim();
  if (!value) return { valid: false, kind: 'invalid', reason: 'material 不能为空' };
  if (value.startsWith('PLAYER_HEAD;')) {
    const parts = value.split(';');
    if (parts.length !== 2) {
      return { valid: false, kind: 'invalid', reason: 'PLAYER_HEAD 后只能有 1 段 owner（用分号分隔）' };
    }
    return { valid: true, kind: 'head', owner: parts[1] ?? '' };
  }
  if (/^player_head;/i.test(value)) {
    return {
      valid: false,
      kind: 'invalid',
      reason: 'PLAYER_HEAD 前缀必须大写（小写不会被识别为玩家头颅）',
    };
  }
  if (value.includes(';')) {
    return { valid: false, kind: 'invalid', reason: '只有 PLAYER_HEAD;owner 支持分号语法' };
  }
  if (value.toUpperCase() === 'PLAYER_HEAD') return { valid: true, kind: 'head', owner: '' };
  if (/^minecraft:[a-z0-9_]+$/i.test(value)) {
    const name = value.slice(value.indexOf(':') + 1).toUpperCase();
    if (MATERIAL_NAMES.has(name)) return { valid: true, kind: 'namespaced' };
    return { valid: false, kind: 'invalid', reason: `minecraft:${name.toLowerCase()} 不是合法 Material` };
  }
  if (value.includes(':')) {
    return { valid: false, kind: 'invalid', reason: '只有 minecraft: 命名空间可被 matchMaterial 识别' };
  }
  const upper = value.toUpperCase();
  if (!MATERIAL_NAMES.has(upper)) {
    return { valid: false, kind: 'invalid', reason: `未知 Material “${value}”，插件会静默变成 AIR` };
  }
  if (upper === 'AIR') return { valid: true, kind: 'air' };
  return { valid: true, kind: 'normal' };
}

/** 静态菜单只替换小写 %player%。 */
export function usesUppercasePlayerPlaceholder(raw: string): boolean {
  return raw.includes('%PLAYER%');
}

export const MATERIAL_OPTIONS = [...MATERIAL_NAMES].sort();

export const PLAYER_HEAD_PRESETS = [
  { label: 'PLAYER_HEAD;%player%（静态菜单/打开者）', value: 'PLAYER_HEAD;%player%' },
  { label: 'PLAYER_HEAD;%PLAYER%（列表模板/条目玩家）', value: 'PLAYER_HEAD;%PLAYER%' },
  { label: 'PLAYER_HEAD（无 owner）', value: 'PLAYER_HEAD' },
];

/** 由 material 推导图标 CDN；失败时 MenuIcon 使用本地占位。 */
export function materialIconUrl(raw: string): string | null {
  const check = checkMaterial(raw);
  if (!check.valid) return null;
  if (check.kind === 'head') {
    const owner = (check.owner ?? '').replace(/^%player%$/i, 'MHF_Steve');
    if (!owner || owner.startsWith('%')) return null;
    return `https://mc-heads.net/avatar/${encodeURIComponent(owner)}/64`;
  }
  if (check.kind === 'air') return null;
  const base = raw.trim().replace(/^minecraft:/i, '').toUpperCase();
  return `https://cdn.jsdelivr.net/gh/InventivetalentDev/minecraft-assets@1.21.1/assets/minecraft/textures/item/${base.toLowerCase()}.png`;
}

export function materialPlaceholderColor(raw: string): string {
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) % 360;
  }
  return `hsl(${hash} 45% 38%)`;
}
