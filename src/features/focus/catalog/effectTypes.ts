import { focusText } from '../focusText';

/** Effect 组的 key 语义：实体、方块 Material 或物品 Material / item-type。 */
export type EffectGroupKind = 'entity' | 'block' | 'item';

/** 每种 effect 的参数行编辑器形态。 */
export type EffectRowKind = 'drop' | 'damage' | 'chance' | 'haste' | 'durability';

export interface EffectTypeMeta {
  value: string;
  label: string;
  groupKind: EffectGroupKind;
  rowKind: EffectRowKind;
  defaultGroup: string;
  defaultRow: string;
  hint: string;
}

/**
 * Effect 类型目录，顺序与插件 EffectType 一致。
 * 行格式都来自插件解析器：段数不足会 AIOOBE，数字非法会 NFE，因此编辑器按阻断处理。
 */
export const EFFECT_TYPES: EffectTypeMeta[] = [
  {
    value: 'mob_drops_add',
    get label() {
      return focusText('mob_drops_add（掉落增量）');
    },
    groupKind: 'entity',
    rowKind: 'drop',
    defaultGroup: 'ALL',
    defaultRow: 'STONE,+1,100',
    get hint() {
      return focusText('每个实体 key 下是字符串列表：“ITEM,[+|*]N,CHANCE”。');
    },
  },
  {
    value: 'mob_damage_multiply',
    get label() {
      return focusText('mob_damage_multiply（伤害倍率）');
    },
    groupKind: 'entity',
    rowKind: 'damage',
    defaultGroup: 'ALL',
    defaultRow: '1.0,100',
    get hint() {
      return focusText('每个实体 key 下是字符串列表：“MULTIPLIER,CHANCE”。');
    },
  },
  {
    value: 'block_drops_add',
    get label() {
      return focusText('block_drops_add（方块掉落增量）');
    },
    groupKind: 'block',
    rowKind: 'drop',
    defaultGroup: 'ALL',
    defaultRow: 'COAL,+1,100',
    get hint() {
      return focusText('每个方块 key 下是字符串列表：“ITEM,[+|*]N,CHANCE”；组 key 为 ALL 或方块 Material。');
    },
  },
  {
    value: 'ore_smelt',
    get label() {
      return focusText('ore_smelt（原矿熔炼）');
    },
    groupKind: 'block',
    rowKind: 'chance',
    defaultGroup: 'ALL',
    defaultRow: '15',
    get hint() {
      return focusText('每个方块 key 下是字符串列表：“CHANCE”（恰好 1 段）；只对配置表里的 raw→ingot 掉落生效。');
    },
  },
  {
    value: 'mining_haste',
    get label() {
      return focusText('mining_haste（挖掘加速）');
    },
    groupKind: 'block',
    rowKind: 'haste',
    defaultGroup: 'ALL',
    defaultRow: '0,100,25',
    get hint() {
      return focusText('每个方块 key 下是字符串列表：“AMPLIFIER,DURATION_TICKS,CHANCE”（恰好 3 段）。');
    },
  },
  {
    value: 'item_durability_save',
    get label() {
      return focusText('item_durability_save（耐久保护）');
    },
    groupKind: 'item',
    rowKind: 'durability',
    defaultGroup: 'pickaxe',
    defaultRow: '1.0,20',
    get hint() {
      return focusText('每个目标 key 下是字符串列表：“PERCENTAGE,CHANCE”（恰好 2 段）；组 key 为 ALL、物品 Material 或 item-type（如 pickaxe）。');
    },
  },
];

export const EFFECT_KEYS = EFFECT_TYPES.map((meta) => meta.value);

export function effectTypeMeta(key: string): EffectTypeMeta | undefined {
  return EFFECT_TYPES.find((meta) => meta.value === key);
}
