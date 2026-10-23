import { t } from '../../i18n';

/** gettext 风格帮助文案：中文原文为 key，en/help 提供译文，zh 直接返回原文。 */
function helpText(source: string): string {
  return t(`help.${encodeURIComponent(source).replace(/\./g, '%2E')}`);
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

export const QUEST_TYPES = [
  {
    id: 'break_block',
    get label() {
      return helpText('破坏方块');
    },
    target: 'item',
  },
  {
    id: 'place_block',
    get label() {
      return helpText('放置方块');
    },
    target: 'item',
  },
  {
    id: 'fish',
    get label() {
      return helpText('钓鱼');
    },
    target: 'item',
  },
  {
    id: 'mob_kill',
    get label() {
      return helpText('击杀实体');
    },
    target: 'mob',
  },
  {
    id: 'feed',
    get label() {
      return helpText('喂食动物');
    },
    target: 'mob',
  },
];

export const REWARD_TYPES = [
  { id: 'item', syntax: 'item;<MATERIAL>;<amount>' },
  { id: 'company_income', syntax: 'company_income;<amount>' },
  { id: 'money', syntax: 'money;<amount>' },
  { id: 'experience', syntax: 'experience;<amount>' },
  { id: 'console_command', syntax: 'console_command;<command>' },
];

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
      return helpText('condition：company_money / expertise / expertises / company_log。');
    },
  },
  {
    get text() {
      return helpText(
        'action：console_command / enable_expertise / disable_expertise / set_price_group（none 无效果）。',
      );
    },
  },
  {
    get text() {
      return helpText('effect：mob_drops_add / mob_damage_multiply（键必须小写）。');
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
