import { focusText } from '../focusText';

/**
 * Effect 类型目录。
 * 复用现有 kind（drops/damage）语义时，新增类型只需加一条 + 中英 label/hint；
 * 新 kind 语义需另行评审。
 */
export interface EffectTypeMeta {
  value: string;
  label: string;
  kind: 'drops' | 'damage';
  hint: string;
}

export const EFFECT_TYPES: EffectTypeMeta[] = [
  {
    value: 'mob_drops_add',
    get label() {
      return focusText('mob_drops_add（掉落增量）');
    },
    kind: 'drops',
    get hint() {
      return focusText('每个实体 key 下是字符串列表：“ITEM,[+|*]N,CHANCE”。');
    },
  },
  {
    value: 'mob_damage_multiply',
    get label() {
      return focusText('mob_damage_multiply（伤害倍率）');
    },
    kind: 'damage',
    get hint() {
      return focusText('每个实体 key 下是字符串列表：“MULTIPLIER,CHANCE”。');
    },
  },
];

export const EFFECT_KEYS = EFFECT_TYPES.map((meta) => meta.value);

export function effectTypeMeta(key: string): EffectTypeMeta | undefined {
  return EFFECT_TYPES.find((meta) => meta.value === key);
}
