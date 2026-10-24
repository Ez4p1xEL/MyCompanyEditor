import { ordersText } from '../ordersText';

/**
 * Quest 类型目录（EmployeeOrders.java:184-210）。
 * 复用现有 target（item/mob）语义时，新增类型只需在此加一条 + 中英 label/hint；
 * 新 target 语义需另行评审。
 */
export interface QuestTypeMeta {
  value: string;
  label: string;
  target: 'item' | 'mob';
  hint: string;
  /** help 表沿用原标签（UI label 不变时可选）。 */
  helpLabelKey?: string;
}

export const QUEST_TYPES: QuestTypeMeta[] = [
  {
    value: 'break_block',
    get label() {
      return ordersText('破坏方块');
    },
    target: 'item',
    get hint() {
      return ordersText('破坏指定材料方块时计数（忽略大小写，必须是 Bukkit Material 枚举名）');
    },
  },
  {
    value: 'place_block',
    get label() {
      return ordersText('放置方块');
    },
    target: 'item',
    get hint() {
      return ordersText('放置指定材料方块时计数（必须是 Bukkit Material 枚举名）');
    },
  },
  {
    value: 'fish',
    get label() {
      return ordersText('钓鱼');
    },
    target: 'item',
    get hint() {
      return ordersText('钓到指定物品时计数（必须是 Bukkit Material 枚举名）');
    },
  },
  {
    value: 'mob_kill',
    helpLabelKey: '击杀实体',
    get label() {
      return ordersText('击杀生物');
    },
    target: 'mob',
    get hint() {
      return ordersText('玩家击杀指定实体时计数（必须是 Bukkit EntityType 枚举名）');
    },
  },
  {
    value: 'feed',
    get label() {
      return ordersText('喂食动物');
    },
    target: 'mob',
    get hint() {
      return ordersText('喂食指定动物时计数；仅支持 12 种可喂食动物');
    },
  },
];

export const QUEST_TYPE_KEYS = QUEST_TYPES.map((meta) => meta.value);

export function questTypeMeta(type: string): QuestTypeMeta | undefined {
  return QUEST_TYPES.find((meta) => meta.value === type);
}
