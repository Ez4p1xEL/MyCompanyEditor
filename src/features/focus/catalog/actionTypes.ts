import { focusText } from '../focusText';

/**
 * Action 类型目录。
 * 复用现有 kind（stringList/string）语义时，新增类型只需加一条 + 中英 label/hint；
 * 新 kind 语义需另行评审。
 */
export interface ActionTypeMeta {
  value: string;
  label: string;
  kind: 'stringList' | 'string';
  hint: string;
}

export const ACTION_TYPES: ActionTypeMeta[] = [
  {
    value: 'console_command',
    get label() {
      return focusText('控制台命令');
    },
    kind: 'stringList',
    get hint() {
      return focusText('字符串列表；命令含 %player% 时会对公司所有员工分别执行一次。');
    },
  },
  {
    value: 'enable_expertise',
    get label() {
      return focusText('重新启用专精');
    },
    kind: 'stringList',
    get hint() {
      return focusText('字符串列表：节点 id；只能救回被 disable 的节点。');
    },
  },
  {
    value: 'disable_expertise',
    get label() {
      return focusText('禁用专精');
    },
    kind: 'stringList',
    get hint() {
      return focusText('字符串列表：节点 id；被禁用节点从常规菜单隐藏、效果失效。');
    },
  },
  {
    value: 'set_price_group',
    get label() {
      return focusText('设置价格组');
    },
    kind: 'string',
    get hint() {
      return focusText('非空标量字符串（例如 mob-company），影响内置商店收购倍率。');
    },
  },
];

export const ACTION_KEYS = ACTION_TYPES.map((meta) => meta.value);

export function actionTypeMeta(key: string): ActionTypeMeta | undefined {
  const lower = key.toLowerCase();
  return ACTION_TYPES.find((meta) => meta.value === lower);
}
