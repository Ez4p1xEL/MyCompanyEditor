export const QUEST_TYPES = [
  { id: 'break_block', label: '破坏方块', target: 'item' },
  { id: 'place_block', label: '放置方块', target: 'item' },
  { id: 'fish', label: '钓鱼', target: 'item' },
  { id: 'mob_kill', label: '击杀实体', target: 'mob' },
  { id: 'feed', label: '喂食动物', target: 'mob' },
];

export const REWARD_TYPES = [
  { id: 'item', syntax: 'item;<MATERIAL>;<amount>' },
  { id: 'company_income', syntax: 'company_income;<amount>' },
  { id: 'money', syntax: 'money;<amount>' },
  { id: 'experience', syntax: 'experience;<amount>' },
  { id: 'console_command', syntax: 'console_command;<command>' },
];

export const FOCUS_LIMITS = [
  '可加载 focus 文件固定为 focus/none.yml、focus/mob.yml，不能新增/删除/重命名。',
  '其他 focus 文件只作为参考，不进入导出 ZIP；可复制节点到 none/mob 迁移。',
  'expertise 的 value_type 只写 value_type（boolean/integer/double/string），旧 value-type 仅导入迁移。',
  'condition：company_money / expertise / expertises / company_log。',
  'action：console_command / enable_expertise / disable_expertise / set_price_group（none 无效果）。',
  'effect：mob_drops_add / mob_damage_multiply（键必须小写）。',
];

export const MENU_LIMITS = [
  '菜单固定 18 个 id；未知 id 的文件不会被插件加载。',
  'size 必须是 9 的倍数且 9..54；slot/slots 必须 0 ≤ slot < size。',
  '菜单文本（标题/物品名/lore）来自 lang/<language>.yml，不写入 menu/*.yml。',
  'orders 的 order 模板必须有槽位，order-per-page 与生成槽位/固定按钮不能冲突（按页判定）。',
  'menus.yml 是死配置（global.no-perm 仅赋值未使用），编辑器只读展示、不导出。',
];

export const ACTIVATION_ROWS = [
  { file: 'orders.yml', mode: '修改后需重启服务器', detail: 'EmployeeOrders.init 不在 reload 链路' },
  { file: 'focus/*.yml', mode: '可 /mycompany reload，但建议重启', detail: 'reload 会重复 focus 列表，可能出现重复条目' },
  { file: 'menu/*.yml', mode: '可 /mycompany reload', detail: 'MenuUtil.createFiles() 在 reload 中重新执行' },
  { file: 'focus.yml / menus.yml', mode: '不生效', detail: '解析代码已注释/无使用者；只读展示' },
  { file: 'lang/*.yml', mode: '可 reload（本文不编辑）', detail: '标题/物品文本实际来源' },
];

export const DEPLOYMENT_STEPS = [
  '在 GitHub 新建仓库，把项目 push 到 main（不要提交 dist/node_modules）。',
  '仓库 Settings → Actions → General，允许 GitHub Actions 运行 workflow。',
  'Settings → Pages → Build and deployment → Source 选择 GitHub Actions。',
  '等待 .github/workflows/deploy.yml 运行完成，访问 Pages 给出的 URL。',
  '如使用自定义域名，在 Pages 设置 Custom domain 并按提示配置 DNS。',
  '发布后用子路径 URL 打开 dist 页面，确认相对资源（./assets/...）与 .nojekyll 生效。',
];
