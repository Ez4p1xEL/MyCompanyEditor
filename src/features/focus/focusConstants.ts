import { BLOCK_MATERIAL_NAMES, ENTITY_TYPE_NAMES, MATERIAL_NAMES } from './data/minecraftEnums';
import { CONDITION_TYPES, ACTION_TYPES, EFFECT_TYPES, CONDITION_KEYS, ACTION_KEYS, EFFECT_KEYS, conditionTypeMeta, actionTypeMeta, effectTypeMeta } from './catalog';
import type { ConditionTypeMeta, ActionTypeMeta, EffectTypeMeta } from './catalog';
import { focusText } from './focusText';

export { CONDITION_TYPES, ACTION_TYPES, EFFECT_TYPES, CONDITION_KEYS, ACTION_KEYS, EFFECT_KEYS, conditionTypeMeta, actionTypeMeta, effectTypeMeta };
export type { ConditionTypeMeta, ActionTypeMeta, EffectTypeMeta };
export { focusText };

export const FIXED_FOCUS_IDS = ['none', 'mob', 'ore'] as const;
export type FixedFocusId = (typeof FIXED_FOCUS_IDS)[number];
export const FIXED_FOCUS_PATHS = ['focus/none.yml', 'focus/mob.yml', 'focus/ore.yml'] as const;
export const REFERENCE_PREFIX = 'focus-reference/';
export const REFERENCE_SUFFIX = '.reference.yml';

export const VALUE_TYPES = [
  { value: 'boolean', get label() {
      return focusText("boolean（布尔）");
    } },
  { value: 'integer', get label() {
      return focusText("integer（整数）");
    } },
  { value: 'double', get label() {
      return focusText("double（小数）");
    } },
  { value: 'string', get label() {
      return focusText("string（字符串）");
    } },
] as const;

export type FocusValueType = (typeof VALUE_TYPES)[number]['value'];

export function isFocusValueType(value: string): value is FocusValueType {
  return VALUE_TYPES.some((meta) => meta.value === value);
}

export function defaultValueFor(type: FocusValueType): string {
  switch (type) {
    case 'integer':
      return '0';
    case 'double':
      return '0.0';
    case 'string':
      return '';
    default:
      return 'false';
  }
}

/** 返回 value_type 与 default.value 不匹配时的阻断原因；合法返回 null。 */
export function defaultValueError(type: string, value: string): string | null {
  if (!isFocusValueType(type)) return focusText('未知 value_type “{type}”', { type });
  if (type === 'integer' && !/^[+-]?\d+$/.test(value.trim())) {
    return focusText('integer 的 default.value 必须是整数（当前 “{value}”），否则启动时 NumberFormatException', { value });
  }
  if (
    type === 'double' &&
    !/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(value.trim())
  ) {
    return focusText('double 的 default.value 必须是数字（当前 “{value}”），否则启动时 NumberFormatException', { value });
  }
  if (type === 'string' && value.includes(';')) {
    return focusText('string 类型的 default.value 不能包含 “;”（会破坏持久化格式）');
  }
  return null;
}

/** value_type 切换时避免立即非法：当前默认值不符合新类型则给安全默认值。 */
export function coerceDefault(type: FocusValueType, current: string): string {
  if (type === 'boolean') return current === 'true' ? 'true' : 'false';
  if (type === 'integer') return /^[+-]?\d+$/.test(current.trim()) ? current : '0';
  if (type === 'double') {
    return /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(current.trim()) ? current : '0.0';
  }
  return current;
}

/** LogListener 会写入的计数日志：mob_kill_count 用 EntityType，block_break_count 用方块 Material。 */
export const LOG_IDS = ['mob_kill_count', 'block_break_count'] as const;
export type FocusLogId = (typeof LOG_IDS)[number];

/** 官方 item_durability_save 只内置 pickaxe 组；其他小写组会告警。 */
export const KNOWN_ITEM_TYPES = ['pickaxe'] as const;

export const KNOWN_FOCUS_KEYS = ['id', 'label', 'description', 'condition', 'expertise'];
export const KNOWN_NODE_KEYS = [
  'label',
  'description',
  'value_type',
  'value-type',
  'default',
  'action',
  'condition',
  'effect',
];

/** 插件用 equalsIgnoreCase 判断组 key，小写 all 与 ALL 等价。 */
function isAllValue(value: string): boolean {
  return value.toLowerCase() === 'all';
}

export function isAllOrEntity(entity: string): boolean {
  return isAllValue(entity) || ENTITY_TYPE_NAMES.has(entity.toUpperCase());
}

export function isAllOrMaterial(item: string): boolean {
  if (isAllValue(item)) return true;
  if (item.includes(':')) return false;
  return MATERIAL_NAMES.has(item.toUpperCase());
}

/** 方块 effect 的组 key：ALL/all 或方块 Material；物品 Material 会返回 null 并扩大范围。 */
export function isAllOrBlock(value: string): boolean {
  if (isAllValue(value)) return true;
  if (value.includes(':')) return false;
  return BLOCK_MATERIAL_NAMES.has(value.toUpperCase());
}

/** item_durability_save 的组 key：ALL/all、物品 Material 或小写 item-type（如 pickaxe）。 */
export function isAllOrItemType(value: string): boolean {
  return isAllValue(value) || /^[a-z][a-z0-9_-]*$/.test(value);
}

/** block_break_count 的 TYPE：必须是大写方块 Material，禁止 ALL/小写。 */
export function isBlockMaterialName(value: string): boolean {
  return value === value.toUpperCase() && BLOCK_MATERIAL_NAMES.has(value);
}

export interface DropRowParsed {
  raw: string;
  valid: boolean;
  item: string;
  sign: '+' | '*';
  amount: string;
  chance: string;
  reason?: string;
}

export function parseDropRow(raw: string): DropRowParsed {
  const parts = raw.split(',');
  const base = {
    raw,
    item: (parts[0] ?? '').trim(),
    sign: '+' as '+' | '*',
    amount: (parts[1] ?? '').trim().replace(/^[+*]/, ''),
    chance: (parts[2] ?? '').trim(),
  };
  if (parts.length !== 3) {
    return { ...base, valid: false, reason: focusText('需要 3 段（当前 {count} 段）', { count: parts.length }) };
  }
  const quantity = parts[1]?.trim() ?? '';
  const signMatch = /^([+*]?)(-?\d+)$/.exec(quantity);
  if (!signMatch) {
    return { ...base, valid: false, reason: focusText('数量必须形如 +N、*N 或 N') };
  }
  return {
    ...base,
    valid: true,
    sign: (signMatch[1] as '+' | '*') || '+',
    amount: signMatch[2] ?? '0',
  };
}

export function composeDropRow(item: string, sign: '+' | '*', amount: string, chance: string): string {
  return `${item.trim()},${sign}${amount.trim()},${chance.trim()}`;
}

export interface DamageRowParsed {
  raw: string;
  valid: boolean;
  multiplier: string;
  chance: string;
  reason?: string;
}

export function parseDamageRow(raw: string): DamageRowParsed {
  const parts = raw.split(',');
  const base = {
    raw,
    multiplier: (parts[0] ?? '').trim(),
    chance: (parts[1] ?? '').trim(),
  };
  if (parts.length !== 2) {
    return { ...base, valid: false, reason: focusText('需要 2 段（当前 {count} 段）', { count: parts.length }) };
  }
  return { ...base, valid: true };
}

export function composeDamageRow(multiplier: string, chance: string): string {
  return `${multiplier.trim()},${chance.trim()}`;
}

export interface ChanceRowParsed {
  raw: string;
  valid: boolean;
  chance: string;
  reason?: string;
}

/** ore_smelt：恰好 1 段概率。 */
export function parseChanceRow(raw: string): ChanceRowParsed {
  const parts = raw.split(',');
  const chance = (parts[0] ?? '').trim();
  if (parts.length !== 1) {
    return { raw, chance, valid: false, reason: focusText('需要 1 段（当前 {count} 段）', { count: parts.length }) };
  }
  return { raw, chance, valid: true };
}

export function composeChanceRow(chance: string): string {
  return chance.trim();
}

export interface HasteRowParsed {
  raw: string;
  valid: boolean;
  amplifier: string;
  duration: string;
  chance: string;
  reason?: string;
}

/** mining_haste：AMPLIFIER,DURATION_TICKS,CHANCE。 */
export function parseHasteRow(raw: string): HasteRowParsed {
  const parts = raw.split(',');
  const base = {
    raw,
    amplifier: (parts[0] ?? '').trim(),
    duration: (parts[1] ?? '').trim(),
    chance: (parts[2] ?? '').trim(),
  };
  if (parts.length !== 3) {
    return { ...base, valid: false, reason: focusText('需要 3 段（当前 {count} 段）', { count: parts.length }) };
  }
  return { ...base, valid: true };
}

export function composeHasteRow(amplifier: string, duration: string, chance: string): string {
  return `${amplifier.trim()},${duration.trim()},${chance.trim()}`;
}

export interface DurabilityRowParsed {
  raw: string;
  valid: boolean;
  percentage: string;
  chance: string;
  reason?: string;
}

/** item_durability_save：PERCENTAGE,CHANCE。 */
export function parseDurabilityRow(raw: string): DurabilityRowParsed {
  const parts = raw.split(',');
  const base = {
    raw,
    percentage: (parts[0] ?? '').trim(),
    chance: (parts[1] ?? '').trim(),
  };
  if (parts.length !== 2) {
    return { ...base, valid: false, reason: focusText('需要 2 段（当前 {count} 段）', { count: parts.length }) };
  }
  return { ...base, valid: true };
}

export function composeDurabilityRow(percentage: string, chance: string): string {
  return `${percentage.trim()},${chance.trim()}`;
}

export interface CompanyLogRowParsed {
  raw: string;
  valid: boolean;
  logId: string;
  entity: string;
  threshold: string;
  segmentCount: number;
  reason?: string;
}

export function parseCompanyLogRow(raw: string): CompanyLogRowParsed {
  const parts = raw.split(',');
  const base = {
    raw,
    logId: (parts[0] ?? '').trim(),
    entity: (parts[1] ?? '').trim(),
    threshold: (parts[2] ?? '').trim(),
    segmentCount: parts.length,
  };
  if (parts.length !== 3 || !base.logId || !base.entity || !base.threshold) {
    return { ...base, valid: false, reason: focusText('格式必须为 logId,ENTITY,数值（恰好 3 段且非空）') };
  }
  return { ...base, valid: true };
}

export function composeCompanyLogRow(logId: string, entity: string, threshold: string): string {
  return `${logId.trim()},${entity.trim()},${threshold.trim()}`;
}

/** 拆分 expertises 的一项（逗号 OR 组）。 */
export function splitOrGroup(group: string): string[] {
  return group
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function focusIdFromPath(path: string): string {
  const name = path.split('/').filter(Boolean).pop() ?? path;
  return name.replace(/\.reference\.ya?ml$/i, '').replace(/\.ya?ml$/i, '');
}

export function isFixedFocusPath(path: string): boolean {
  return (FIXED_FOCUS_PATHS as readonly string[]).includes(path);
}

export function isReferenceFocusPath(path: string): boolean {
  return path.startsWith(REFERENCE_PREFIX);
}

export function referencePathFor(focusId: string): string {
  const safe = focusId.replace(/[^A-Za-z0-9_-]/g, '_') || 'focus';
  return `${REFERENCE_PREFIX}${safe}${REFERENCE_SUFFIX}`;
}

export function exportFilenameFor(path: string, focusId: string): string {
  if (isFixedFocusPath(path)) return `${focusId}.yml`;
  return `${focusId}${REFERENCE_SUFFIX}`;
}
