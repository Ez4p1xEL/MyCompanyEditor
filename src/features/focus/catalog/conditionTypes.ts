import { focusText } from '../focusText';

/**
 * Condition 类型目录。
 * 复用现有 kind（number/expertise/expertises/logs）语义时，新增类型只需加一条 + 中英 label/hint；
 * 新 kind 语义需另行评审。
 */
export interface ConditionTypeMeta {
  value: string;
  label: string;
  kind: 'number' | 'expertise' | 'expertises' | 'logs';
  hint: string;
}

export const CONDITION_TYPES: ConditionTypeMeta[] = [
  {
    value: 'company_money',
    get label() {
      return focusText('公司资金');
    },
    kind: 'number',
    get hint() {
      return focusText('组件公司资金 ≥ N；解锁 expertise 时扣除（focus 级设置不扣款）。负数会恒真且可能加钱，必须阻断。');
    },
  },
  {
    value: 'expertise',
    get label() {
      return focusText('前置专精（单个）');
    },
    kind: 'expertise',
    get hint() {
      return focusText('同 focus 内某个节点已解锁；空串永远不满足。');
    },
  },
  {
    value: 'expertises',
    get label() {
      return focusText('前置专精组（列表）');
    },
    kind: 'expertises',
    get hint() {
      return focusText('列表项之间 AND；单项内用逗号分隔表示 OR，例如 “a,b”。');
    },
  },
  {
    value: 'company_log',
    get label() {
      return focusText('公司计数（日志）');
    },
    kind: 'logs',
    get hint() {
      return focusText('每行 “mob_kill_count,ENTITY,数值” 或 “block_break_count,MATERIAL,数值”；段数必须为 3。mob_kill_count 的实体和 block_break_count 的方块 Material 都必须大写，不能写 ALL；方块计数不会累加到其他方块。');
    },
  },
];

export const CONDITION_KEYS = CONDITION_TYPES.map((meta) => meta.value);

export function conditionTypeMeta(key: string): ConditionTypeMeta | undefined {
  return CONDITION_TYPES.find((meta) => meta.value === key);
}
