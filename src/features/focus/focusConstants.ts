import { ENTITY_TYPE_NAMES, MATERIAL_NAMES } from './data/minecraftEnums';

export const FIXED_FOCUS_IDS = ['none', 'mob'] as const;
export type FixedFocusId = (typeof FIXED_FOCUS_IDS)[number];
export const FIXED_FOCUS_PATHS = ['focus/none.yml', 'focus/mob.yml'] as const;
export const REFERENCE_PREFIX = 'focus-reference/';
export const REFERENCE_SUFFIX = '.reference.yml';

export const VALUE_TYPES = [
  { value: 'boolean', label: 'boolean（布尔）' },
  { value: 'integer', label: 'integer（整数）' },
  { value: 'double', label: 'double（小数）' },
  { value: 'string', label: 'string（字符串）' },
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
  if (!isFocusValueType(type)) return `未知 value_type “${type}”`;
  if (type === 'integer' && !/^[+-]?\d+$/.test(value.trim())) {
    return `integer 的 default.value 必须是整数（当前 “${value}”），否则启动时 NumberFormatException`;
  }
  if (
    type === 'double' &&
    !/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(value.trim())
  ) {
    return `double 的 default.value 必须是数字（当前 “${value}”），否则启动时 NumberFormatException`;
  }
  if (type === 'string' && value.includes(';')) {
    return 'string 类型的 default.value 不能包含 “;”（会破坏持久化格式）';
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

export interface ConditionTypeMeta {
  value: string;
  label: string;
  kind: 'number' | 'expertise' | 'expertises' | 'logs';
  hint: string;
}

export const CONDITION_TYPES: ConditionTypeMeta[] = [
  {
    value: 'company_money',
    label: '公司资金',
    kind: 'number',
    hint: '组件公司资金 ≥ N；解锁 expertise 时扣除（focus 级设置不扣款）。负数会恒真且可能加钱，必须阻断。',
  },
  {
    value: 'expertise',
    label: '前置专精（单个）',
    kind: 'expertise',
    hint: '同 focus 内某个节点已解锁；空串永远不满足。',
  },
  {
    value: 'expertises',
    label: '前置专精组（列表）',
    kind: 'expertises',
    hint: '列表项之间 AND；单项内用逗号分隔表示 OR，例如 “a,b”。',
  },
  {
    value: 'company_log',
    label: '公司计数（日志）',
    kind: 'logs',
    hint: '每行 “mob_kill_count,ENTITY,数值”；段数必须为 3，ENTITY 必须是大写枚举名。',
  },
];

export function conditionTypeMeta(key: string): ConditionTypeMeta | undefined {
  return CONDITION_TYPES.find((meta) => meta.value === key);
}

/** 目前只有 mob_kill_count 会被 LogListener 写入。 */
export const LOG_IDS = ['mob_kill_count'] as const;

export interface ActionTypeMeta {
  value: string;
  label: string;
  kind: 'stringList' | 'string';
  hint: string;
}

export const ACTION_TYPES: ActionTypeMeta[] = [
  {
    value: 'console_command',
    label: '控制台命令',
    kind: 'stringList',
    hint: '字符串列表；命令含 %player% 时会对公司所有员工分别执行一次。',
  },
  {
    value: 'enable_expertise',
    label: '重新启用专精',
    kind: 'stringList',
    hint: '字符串列表：节点 id；只能救回被 disable 的节点。',
  },
  {
    value: 'disable_expertise',
    label: '禁用专精',
    kind: 'stringList',
    hint: '字符串列表：节点 id；被禁用节点从常规菜单隐藏、效果失效。',
  },
  {
    value: 'set_price_group',
    label: '设置价格组',
    kind: 'string',
    hint: '非空标量字符串（例如 mob-company），影响内置商店收购倍率。',
  },
];

export function actionTypeMeta(key: string): ActionTypeMeta | undefined {
  const lower = key.toLowerCase();
  return ACTION_TYPES.find((meta) => meta.value === lower);
}

export interface EffectTypeMeta {
  value: string;
  label: string;
  kind: 'drops' | 'damage';
  hint: string;
}

export const EFFECT_TYPES: EffectTypeMeta[] = [
  {
    value: 'mob_drops_add',
    label: 'mob_drops_add（掉落增量）',
    kind: 'drops',
    hint: '每个实体 key 下是字符串列表：“ITEM,[+|*]N,CHANCE”。',
  },
  {
    value: 'mob_damage_multiply',
    label: 'mob_damage_multiply（伤害倍率）',
    kind: 'damage',
    hint: '每个实体 key 下是字符串列表：“MULTIPLIER,CHANCE”。',
  },
];

export function effectTypeMeta(key: string): EffectTypeMeta | undefined {
  return EFFECT_TYPES.find((meta) => meta.value === key);
}

export const CONDITION_KEYS = CONDITION_TYPES.map((meta) => meta.value);
export const ACTION_KEYS = ACTION_TYPES.map((meta) => meta.value);
export const EFFECT_KEYS = EFFECT_TYPES.map((meta) => meta.value);

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

export function isAllOrEntity(entity: string): boolean {
  return entity === 'ALL' || ENTITY_TYPE_NAMES.has(entity.toUpperCase());
}

export function isAllOrMaterial(item: string): boolean {
  if (item === 'ALL') return true;
  if (item.includes(':')) return false;
  return MATERIAL_NAMES.has(item.toUpperCase());
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
    return { ...base, valid: false, reason: `需要 3 段（当前 ${parts.length} 段）` };
  }
  const quantity = parts[1]?.trim() ?? '';
  const signMatch = /^([+*]?)(-?\d+)$/.exec(quantity);
  if (!signMatch) {
    return { ...base, valid: false, reason: '数量必须形如 +N、*N 或 N' };
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
    return { ...base, valid: false, reason: `需要 2 段（当前 ${parts.length} 段）` };
  }
  return { ...base, valid: true };
}

export function composeDamageRow(multiplier: string, chance: string): string {
  return `${multiplier.trim()},${chance.trim()}`;
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
    return { ...base, valid: false, reason: '格式必须为 logId,ENTITY,数值（恰好 3 段且非空）' };
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
