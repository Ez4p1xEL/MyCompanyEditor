import { ordersText } from '../ordersText';

/**
 * Reward 类型目录（EmployeeOrder.java:131-210）。
 * 复用现有 format（分号分隔）语义时，新增类型只需加一条 + 中英 label/hint；
 * 新 format/执行语义需另行评审。
 */
export interface RewardTypeMeta {
  value: string;
  syntax: string;
  label: string;
  hint: string;
}

export const REWARD_TYPES: RewardTypeMeta[] = [
  {
    value: 'item',
    syntax: 'item;<MATERIAL>;<amount>',
    get label() {
      return ordersText('物品');
    },
    get hint() {
      return ordersText('格式：item;材料;数量（数量必须为正整数）');
    },
  },
  {
    value: 'company_income',
    syntax: 'company_income;<amount>',
    get label() {
      return ordersText('公司收入');
    },
    get hint() {
      return ordersText('格式：company_income;金额（≥0，可小数）');
    },
  },
  {
    value: 'money',
    syntax: 'money;<amount>',
    get label() {
      return ordersText('玩家金钱');
    },
    get hint() {
      return ordersText('格式：money;金额（≥0，可小数）');
    },
  },
  {
    value: 'experience',
    syntax: 'experience;<amount>',
    get label() {
      return ordersText('经验值');
    },
    get hint() {
      return ordersText('格式：experience;整数经验（≥0）');
    },
  },
  {
    value: 'console_command',
    syntax: 'console_command;<command>',
    get label() {
      return ordersText('控制台命令');
    },
    get hint() {
      return ordersText('格式：console_command;命令（不能含 ;，建议不带前导 /，%player% 会被替换）');
    },
  },
];

export const REWARD_TYPE_KEYS = REWARD_TYPES.map((meta) => meta.value);

export function rewardTypeMeta(type: string): RewardTypeMeta | undefined {
  return REWARD_TYPES.find((meta) => meta.value === type.toLowerCase());
}
