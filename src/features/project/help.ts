import { t } from '../../i18n';
import { QUEST_TYPES as ORDER_QUEST_TYPES, REWARD_TYPES as ORDER_REWARD_TYPES } from '../orders/catalog';
import { CONDITION_KEYS, ACTION_KEYS, EFFECT_KEYS } from '../focus/catalog';

/** gettext 风格帮助文案：中文原文为 key，en/help 提供译文，zh 直接返回原文。 */
function helpText(source: string, params?: Record<string, string | number>): string {
  return t(`help.${encodeURIComponent(source).replace(/\./g, '%2E')}`, params);
}

export const HELP_LABELS = {
  get questReward() {
    return helpText('订单 quest / reward');
  },
  get target() {
    return helpText('目标');
  },
  get focusLimits() {
    return helpText('专精限制');
  },
  get menuLanguage() {
    return helpText('菜单与语言文件');
  },
  get activation() {
    return helpText('生效方式');
  },
  get file() {
    return helpText('文件');
  },
  get mode() {
    return helpText('生效方式');
  },
  get detail() {
    return helpText('说明');
  },
  get deployment() {
    return helpText('部署摘要');
  },
};

export const QUEST_TYPES = ORDER_QUEST_TYPES.map((meta) => ({
  id: meta.value,
  get label() {
    return meta.helpLabelKey ? helpText(meta.helpLabelKey) : meta.label;
  },
  target: meta.target,
}));

export const REWARD_TYPES = ORDER_REWARD_TYPES.map((meta) => ({
  id: meta.value,
  syntax: meta.syntax,
  get label() {
    return meta.label;
  },
}));

export type FocusLimitKind = 'condition' | 'action' | 'effect';

/** 稳定前缀/后缀 + catalog keys；新增 key 不需要新增翻译条目。 */
export function focusLimitText(kind: FocusLimitKind, keys: string[]): string {
  const list = keys.join(' / ');
  if (kind === 'condition') return helpText('condition：{list}。', { list });
  if (kind === 'action') return helpText('action：{list}（none 无效果）。', { list });
  return helpText('effect：{list}（键必须小写）。', { list });
}

export const FOCUS_LIMITS = [
  {
    get text() {
      return helpText('可加载 focus 文件固定为 focus/none.yml、focus/mob.yml，不能新增/删除/重命名。');
    },
  },
  {
    get text() {
      return helpText('其他 focus 文件只作为参考，不进入导出 ZIP；可复制节点到 none/mob 迁移。');
    },
  },
  {
    get text() {
      return helpText(
        'expertise 的 value_type 只写 value_type（boolean/integer/double/string），旧 value-type 仅导入迁移。',
      );
    },
  },
  {
    get text() {
      return focusLimitText('condition', CONDITION_KEYS);
    },
  },
  {
    get text() {
      return focusLimitText('action', ACTION_KEYS);
    },
  },
  {
    get text() {
      return focusLimitText('effect', EFFECT_KEYS);
    },
  },
];

export const MENU_LIMITS = [
  {
    get text() {
      return helpText('菜单固定 18 个 id；未知 id 的文件不会被插件加载。');
    },
  },
  {
    get text() {
      return helpText('size 必须是 9 的倍数且 9..54；slot/slots 必须 0 ≤ slot < size。');
    },
  },
  {
    get text() {
      return helpText('菜单文本（标题/物品名/lore）来自 lang/<language>.yml，不写入 menu/*.yml。');
    },
  },
  {
    get text() {
      return helpText(
        'orders 的 order 模板必须有槽位，order-per-page 与生成槽位/固定按钮不能冲突（按页判定）。',
      );
    },
  },
  {
    get text() {
      return helpText('menus.yml 是死配置（global.no-perm 仅赋值未使用），编辑器只读展示、不导出。');
    },
  },
];

export const ACTIVATION_ROWS = [
  {
    file: 'orders.yml',
    get mode() {
      return helpText('修改后需重启服务器');
    },
    get detail() {
      return helpText('EmployeeOrders.init 不在 reload 链路');
    },
  },
  {
    file: 'focus/*.yml',
    get mode() {
      return helpText('可 /mycompany reload，但建议重启');
    },
    get detail() {
      return helpText('reload 会重复 focus 列表，可能出现重复条目');
    },
  },
  {
    file: 'menu/*.yml',
    get mode() {
      return helpText('可 /mycompany reload');
    },
    get detail() {
      return helpText('MenuUtil.createFiles() 在 reload 中重新执行');
    },
  },
  {
    file: 'focus.yml / menus.yml',
    get mode() {
      return helpText('不生效');
    },
    get detail() {
      return helpText('解析代码已注释/无使用者；只读展示');
    },
  },
  {
    file: 'lang/*.yml',
    get mode() {
      return helpText('可 reload（本文不编辑）');
    },
    get detail() {
      return helpText('标题/物品文本实际来源');
    },
  },
];

export const DEPLOYMENT_STEPS = [
  {
    get text() {
      return helpText('在 GitHub 新建仓库，把项目 push 到 main（不要提交 dist/node_modules）。');
    },
  },
  {
    get text() {
      return helpText('仓库 Settings → Actions → General，允许 GitHub Actions 运行 workflow。');
    },
  },
  {
    get text() {
      return helpText('Settings → Pages → Build and deployment → Source 选择 GitHub Actions。');
    },
  },
  {
    get text() {
      return helpText('等待 .github/workflows/deploy.yml 运行完成，访问 Pages 给出的 URL。');
    },
  },
  {
    get text() {
      return helpText('如使用自定义域名，在 Pages 设置 Custom domain 并按提示配置 DNS。');
    },
  },
  {
    get text() {
      return helpText('发布后用子路径 URL 打开 dist 页面，确认相对资源（./assets/...）与 .nojekyll 生效。');
    },
  },
];
