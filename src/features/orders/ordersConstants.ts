import { ENTITY_TYPE_NAMES, ITEM_MATERIAL_NAMES, MATERIAL_NAMES } from './data/minecraftEnums';

/** quest type 枚举（EmployeeOrders.java:184-210）。 */
export interface QuestTypeMeta {
  value: string;
  label: string;
  target: 'item' | 'mob';
  hint: string;
}

export const QUEST_TYPES: QuestTypeMeta[] = [
  {
    value: 'break_block',
    label: '破坏方块',
    target: 'item',
    hint: '破坏指定材料方块时计数（忽略大小写，必须是 Bukkit Material 枚举名）',
  },
  {
    value: 'place_block',
    label: '放置方块',
    target: 'item',
    hint: '放置指定材料方块时计数（必须是 Bukkit Material 枚举名）',
  },
  {
    value: 'fish',
    label: '钓鱼',
    target: 'item',
    hint: '钓到指定物品时计数（必须是 Bukkit Material 枚举名）',
  },
  {
    value: 'mob_kill',
    label: '击杀生物',
    target: 'mob',
    hint: '玩家击杀指定实体时计数（必须是 Bukkit EntityType 枚举名）',
  },
  {
    value: 'feed',
    label: '喂食动物',
    target: 'mob',
    hint: '喂食指定动物时计数；仅支持 12 种可喂食动物',
  },
];

export function questTypeMeta(type: string): QuestTypeMeta | undefined {
  return QUEST_TYPES.find((meta) => meta.value === type);
}

/** reward type 枚举（EmployeeOrder.java:131-210）。 */
export interface RewardTypeMeta {
  value: string;
  label: string;
  hint: string;
}

export const REWARD_TYPES: RewardTypeMeta[] = [
  { value: 'item', label: '物品', hint: '格式：item;材料;数量（数量必须为正整数）' },
  { value: 'company_income', label: '公司收入', hint: '格式：company_income;金额（≥0，可小数）' },
  { value: 'money', label: '玩家金钱', hint: '格式：money;金额（≥0，可小数）' },
  { value: 'experience', label: '经验值', hint: '格式：experience;整数经验（≥0）' },
  {
    value: 'console_command',
    label: '控制台命令',
    hint: '格式：console_command;命令（不能含 ;，建议不带前导 /，%player% 会被替换）',
  },
];

export function rewardTypeMeta(type: string): RewardTypeMeta | undefined {
  return REWARD_TYPES.find((meta) => meta.value === type.toLowerCase());
}

/** feed 支持的可喂食动物（OrderListener.java:43-59，共 12 种）。 */
export const FEEDABLE_ANIMALS = [
  'COW',
  'SHEEP',
  'HORSE',
  'LLAMA',
  'PIG',
  'RABBIT',
  'CHICKEN',
  'PARROT',
  'FOX',
  'TURTLE',
  'WOLF',
  'CAT',
] as const;

export const FEEDABLE_ANIMAL_SET: ReadonlySet<string> = new Set(FEEDABLE_ANIMALS);

export const KNOWN_ORDER_KEYS = ['label', 'description', 'quest', 'reward'] as const;
export const KNOWN_QUEST_KEYS = ['type', 'item', 'mob', 'amount'] as const;

export interface ParsedName {
  /** 去掉命名空间并大写后的枚举名。 */
  name: string;
  /** 原始输入是否带 minecraft: 前缀。 */
  namespaced: boolean;
}

export function parseEnumName(raw: unknown): ParsedName | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const namespaced = trimmed.includes(':');
  const name = (namespaced ? trimmed.slice(trimmed.lastIndexOf(':') + 1) : trimmed).toUpperCase();
  return { name, namespaced };
}

export function isKnownMaterial(name: string): boolean {
  return MATERIAL_NAMES.has(name);
}

export function isKnownEntityType(name: string): boolean {
  return ENTITY_TYPE_NAMES.has(name);
}

/**
 * Material#isItem() 的离线近似：按 minecraft-data 1.21.1 物品注册表判断。
 * LEGACY_* 名称由 matchMaterial 处理，保守视为可用。
 */
export function isItemMaterial(name: string): boolean {
  if (name === 'AIR') return false;
  if (name.startsWith('LEGACY_')) return MATERIAL_NAMES.has(name);
  return ITEM_MATERIAL_NAMES.has(name);
}

export function isFeedableAnimal(name: string): boolean {
  return FEEDABLE_ANIMAL_SET.has(name);
}

export function normalizeQuestType(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizeRewardType(raw: string): string {
  return raw.trim().toLowerCase();
}

export interface ColorSegment {
  text: string;
  color: string | null;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  obfuscated: boolean;
}

const COLOR_CODES: Record<string, string> = {
  '0': '#000000',
  '1': '#0000AA',
  '2': '#00AA00',
  '3': '#00AAAA',
  '4': '#AA0000',
  '5': '#AA00AA',
  '6': '#FFAA00',
  '7': '#AAAAAA',
  '8': '#555555',
  '9': '#5555FF',
  a: '#55FF55',
  b: '#55FFFF',
  c: '#FF5555',
  d: '#FF55FF',
  e: '#FFFF55',
  f: '#FFFFFF',
};

interface ColorState {
  color: string | null;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  obfuscated: boolean;
}

function resetState(): ColorState {
  return {
    color: null,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    obfuscated: false,
  };
}

function applyCode(state: ColorState, code: string): void {
  const lower = code.toLowerCase();
  if (COLOR_CODES[lower]) {
    state.color = COLOR_CODES[lower];
    // 颜色码会重置格式（Minecraft 行为）。
    state.bold = false;
    state.italic = false;
    state.underline = false;
    state.strike = false;
    state.obfuscated = false;
    return;
  }
  switch (lower) {
    case 'k':
      state.obfuscated = true;
      break;
    case 'l':
      state.bold = true;
      break;
    case 'm':
      state.strike = true;
      break;
    case 'n':
      state.underline = true;
      break;
    case 'o':
      state.italic = true;
      break;
    case 'r':
      Object.assign(state, resetState());
      break;
    default:
      break;
  }
}

/** 把 & 颜色码拆成可预览的片段；非法 & 序列按普通文本保留。 */
export function renderColorSegments(text: string): ColorSegment[] {
  const segments: ColorSegment[] = [];
  const state = resetState();
  let buffer = '';
  const flush = () => {
    if (!buffer) return;
    segments.push({ text: buffer, ...state });
    buffer = '';
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char !== '&') {
      buffer += char;
      continue;
    }
    const next = text[index + 1];
    if (next === '#') {
      const hex = text.slice(index + 2, index + 8);
      if (/^[0-9a-fA-F]{6}$/.test(hex)) {
        flush();
        state.color = `#${hex}`;
        state.bold = false;
        state.italic = false;
        state.underline = false;
        state.strike = false;
        state.obfuscated = false;
        index += 7;
        continue;
      }
      buffer += char;
      continue;
    }
    if (next && /[0-9a-fk-or]/i.test(next)) {
      flush();
      applyCode(state, next);
      index += 1;
      continue;
    }
    buffer += char;
  }
  flush();
  return segments;
}

/** 返回 label/description 中形如 &x（非法颜色码）的片段。 */
export function findInvalidColorCodes(text: string): string[] {
  const invalid: string[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '&') continue;
    const next = text[index + 1];
    if (!next) continue;
    if (next === '#') {
      const hex = text.slice(index + 2, index + 8);
      if (!/^[0-9a-fA-F]{6}$/.test(hex)) invalid.push(text.slice(index, Math.min(index + 8, text.length)));
      index += 7;
      continue;
    }
    if (/[0-9a-fk-or]/i.test(next)) {
      index += 1;
      continue;
    }
    invalid.push(`&${next}`);
  }
  return [...new Set(invalid)];
}
