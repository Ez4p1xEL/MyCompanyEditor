# MyCompany 编辑器术语表与英文风格指南（zh-CN → en）

> 适用范围：编辑器 UI 的中英双语文案、校验消息、导出/导入提示、帮助文本。
> 只定义**术语与风格**，不涉及实现；代码与规则以 `docs/mycompany-spec/` 为准。
> 规范基准：MyCompany `6764e01`（0.8.50）。

## 0. 使用规则（TL;DR）

1. **固定译法优先**：§1 的英文是唯一写法；同一概念不得出现第二个英文词。
2. **英文界面不出现中文**（包括中文标点「，。、」）；中文界面不夹带英文整句（产品名、YAML 键、枚举、代码除外）。
3. **不翻译**：用户 YAML 的键与值、Minecraft 枚举/材质名、占位符、颜色码、校验 code、文件路径、命令、权限名。
4. **按钮/菜单项/字段标签/页面标题用 sentence case**（仅首词与专有名词大写）；术语本身的词形以 §1/§2 为准。
5. 新增 UI 文案时先查本表；查不到再按 §3 规则造词，并回写本表。

## 1. 固定译法（必须一致）

| 中文 | 固定英文 | 说明 / 禁止译成 |
| --- | --- | --- |
| 专精 | **Focus** | 插件里的 focus（`focus/*.yml`、`focus.yml` 遗留）；不要译成 Specialization / Specialty |
| 专精节点 | **Expertise** | `expertise.<id>` 节点；不要译成 Focus node / Specialty node |
| 专精树 | **Focus tree** | 概念名。插件 GUI 的官方英文标题是 “Expertise Tree”（`lang/en.yml`），复用官方字符串时保留原文 |
| 箱子菜单 | **Chest Menu** | `menu/*.yml` 描述的箱子 GUI；不要译成 Box menu / Inventory menu |
| 员工订单 | **Employee Orders** | `orders.yml` 的订单集合；页面标题按 sentence case 写 “Employee orders” |
| 订单 | **Order** | 顶层条目；不要与 Quest 混用 |
| 任务 | **Quest** | `order.quest.<id>`；不要译成 Task / Mission |
| 奖励 | **Reward** | `order.reward` 行；不要译成 Prize |
| 公司收入 | **Company income** | reward 类型 `company_income` |
| 经验 | **Experience** | reward 类型 `experience` |
| 条件 | **Condition** | expertise/focus 的 condition 段 |
| 动作 | **Action** | expertise 的 action 段 |
| 效果 | **Effect** | expertise 的 effect 段 |
| 价值类型 | **value_type** | 不翻译、不改写；YAML 键原样保留 |
| 默认值 | **Default value** | `default.value`；键名不翻译 |
| 公司 | **Company** | — |
| 雇主 | **Employer** | 插件职位 `employer` |
| 员工 | **Employee** | 插件职位 `employee` |
| 职位 | **Position** | 不要译成 Role / Rank |
| 薪资 | **Salary** | — |
| 税 | **Tax** | — |
| 公司领地 | **Company area** | `menu/areas.yml`、area 相关；不要译成 Territory |
| 箱子商店 | **Chest shop** | 插件菜单标题为 “Chestshop”；UI 用 Chest shop |
| 内置商店 | **Internal store** | `menu/internal_store.yml` |
| 雇佣 | **Employ**（Hire 可作同义词） | 插件命令/权限用 employ；正式文案优先 Employ |
| 校验 | **Validation** | 名词；动词用 Validate |
| 错误 | **Error** | 严重级别 |
| 警告 | **Warning** | 严重级别 |
| 提示 | **Info** | 严重级别；不要用 Hint（Hint 专指修复建议） |
| 阻断 | **Blocking** | 形容词/徽标；动作写 Block export |
| 修复 | **Fix** | 动作；修复建议 = Fix hint |
| 定位 | **Locate** | 跳到问题位置；不要译成 Position（= 职位） |
| 重载 | **Reload** | `/mycompany reload`，热重载配置 |
| 重启 | **Restart** | 重启服务器；不要与 Reload 混用 |
| 载入示例 | **Load sample** | 载入 23 个 fixtures 示例项目 |
| 导出全部 / 全量导出 | **Export all** | 不要用 Full export |
| 原文模式 | **Raw mode** | 按行编辑 YAML 原文（reward 列表）；不要用 Original text mode |

## 2. 术语表（80 条）

> 「说明」列给插件语境含义；`固定` 列 ✔ 表示必须使用 §1 的英文，不得另造同义词。
> 英文列采用 **sentence case 规范写法**（页面标题/按钮直接可用）；作为**术语引用**时按 §1 的 Title Case 写法。

### 2.1 订单（Orders，14 条）

| # | 中文 | English | 说明（插件语境） | 固定 |
| --- | --- | --- | --- | --- |
| 1 | 员工订单 | Employee orders | `orders.yml` 里的订单定义集合；每天随机抽 5 个发给员工 | ✔ |
| 2 | 订单 | Order | 顶层 key，如 `stone_breaker`；有 label/description/quest/reward | ✔ |
| 3 | 订单 ID | Order ID | 顶层 YAML key；不能含 `.`、`:`，不能叫 `default` | ✔ |
| 4 | 任务 | Quest | `quest.<id>`，包含 type 与目标 | ✔ |
| 5 | 任务类型 | Quest type | `break_block` / `place_block` / `fish` / `mob_kill` / `feed`（值不翻译） | ✔ |
| 6 | 目标物品 | Target item | `quest.item`（`break_block`/`place_block`/`fish`） | ✔ |
| 7 | 目标生物 | Target mob | `quest.mob`（`mob_kill`/`feed`） | ✔ |
| 8 | 目标数量 | Amount | `quest.amount`，裸整数 ≥ 1 | ✔ |
| 9 | 订单进度 | Order progress | 玩家在 `<uid>.yml` 里的 `orders.progress` | ✔ |
| 10 | 奖励 | Reward | `reward` 字符串列表，一条一个奖励 | ✔ |
| 11 | 公司收入 | Company income | reward 类型 `company_income` | ✔ |
| 12 | 经验 | Experience | reward 类型 `experience` | ✔ |
| 13 | 控制台命令 | Console command | reward 类型 `console_command`，以控制台执行 | ✔ |
| 14 | 每日刷新 | Daily refresh | 每天重置进度并重新抽 5 个订单 | ✔ |

### 2.2 专精（Focus，17 条）

| # | 中文 | English | 说明（插件语境） | 固定 |
| --- | --- | --- | --- | --- |
| 15 | 专精 | Focus | `focus/none.yml`、`focus/mob.yml`；文件名即 focus id | ✔ |
| 16 | 专精树 | Focus tree | focus 下的 expertise 节点组成的分支结构 | ✔ |
| 17 | 专精节点 | Expertise | `expertise.<id>`，含 label/description/value_type/condition/action/effect | ✔ |
| 18 | 条件 | Condition | 解锁 expertise 的前置条件（company_money 等） | ✔ |
| 19 | 动作 | Action | 解锁 expertise 时执行（console_command 等） | ✔ |
| 20 | 效果 | Effect | 解锁后持续生效（mob_drops_add 等） | ✔ |
| 21 | 价值类型 | value_type | 节点值类型：boolean/integer/double/string；**键名不翻译** | ✔ |
| 22 | 默认值 | Default value | `default.value`，字符串形态；**键名不翻译** | ✔ |
| 23 | 前置专精 | Prerequisite expertise | `condition.expertise` / `expertises` 引用的节点 | ✔ |
| 24 | 解锁 | Unlock | 学习 expertise 的动作（动词） | ✔ |
| 25 | 已解锁 / 锁定 | Learned / Locked | 插件状态文案 `focus.status.*`（LEARNED/LOCKED） | ✔ |
| 26 | 启用 / 禁用 | Enabled / Disabled | 节点是否参与效果计算；禁用节点在菜单中隐藏 | ✔ |
| 27 | 掉落加成 | Mob drop bonus | `mob_drops_add`：按概率增加/乘算掉落数量 | ✔ |
| 28 | 伤害倍率 | Mob damage multiplier | `mob_damage_multiply`：按概率放大对生物伤害 | ✔ |
| 29 | 概率 | Chance | 0–100 的百分比（可两位小数） | ✔ |
| 30 | 公司日志 | Company log | `condition.company_log` 用的计数器（当前只有 `mob_kill_count`） | ✔ |
| 31 | 公司资金 | Company money | 条件键 `company_money`；指公司现金（cash） | ✔ |

### 2.3 菜单（Menu，17 条）

| # | 中文 | English | 说明（插件语境） | 固定 |
| --- | --- | --- | --- | --- |
| 32 | 箱子菜单 | Chest menu | `menu/<id>.yml` 描述的箱子 GUI；固定 18 个文件 | ✔ |
| 33 | 菜单 | Menu | 泛指菜单定义；也用于导航入口名 | ✔ |
| 34 | 图形界面 | GUI | 通用技术缩写；首次出现可写 “graphical user interface (GUI)”，之后用 GUI | — |
| 35 | 槽位 | Slot | 单个槽位号（`slot`），0 ≤ slot < size | ✔ |
| 36 | 多槽位 | Slots | `slots` 列表；与 Slot 区分 | ✔ |
| 37 | 物品 | Item | `items.<id>` 条目 | ✔ |
| 38 | 材质 | Material | `material` 的 Bukkit 枚举名（如 `DIAMOND`）；值不翻译 | ✔ |
| 39 | 显示名称 | Display name | 物品名；文本来自语言文件，不在 menu 文件 | ✔ |
| 40 | 描述 | Lore | 物品 lore 行；文本来自语言文件；`#remove#` 会删除整行 | ✔ |
| 41 | 默认物品 | Default item | `items.default`，用于填充空槽；不参与普通渲染 | ✔ |
| 42 | 选项 | Options | `options` 段（分页参数等） | ✔ |
| 43 | 每页订单数 | Orders per page | `options.order-per-page`；键名不翻译 | ✔ |
| 44 | 页码 | Page | 列表分页的当前页 | ✔ |
| 45 | 上一页 / 下一页 | Previous page / Next page | 分页按钮 id 为 `previous_page` / `next_page`，不翻译 id | ✔ |
| 46 | 模板物品 | Template item | 列表页被复制/改写的物品（`order`、`area`、`personnel`…） | ✔ |
| 47 | 玩家头颅 | Player head | `PLAYER_HEAD;%PLAYER%` / `%player%` 特殊材质 | ✔ |
| 48 | 语言文件 | Language file | `lang/<language>.yml`，菜单标题/物品名/lore 的真正来源 | ✔ |

### 2.4 公司（Company，11 条）

| # | 中文 | English | 说明（插件语境） | 固定 |
| --- | --- | --- | --- | --- |
| 49 | 公司 | Company | 插件主体数据 | ✔ |
| 50 | 雇主 | Employer | 公司创建者；`employer` 职位 | ✔ |
| 51 | 员工 | Employee | 公司成员；`employee` 职位 | ✔ |
| 52 | 职位 | Position | 如 employer/employee/自定义职位 | ✔ |
| 53 | 薪资 | Salary | 按职位配置的工资 | ✔ |
| 54 | 税 | Tax | 管理费/财产税/所得税 | ✔ |
| 55 | 公司领地 | Company area | `menu/areas.yml` 与 area 管理 | ✔ |
| 56 | 箱子商店 | Chest shop | `menu/chestshop.yml`；创建/删除权限 | ✔ |
| 57 | 内置商店 | Internal store | `menu/internal_store.yml`，把原版物品卖给公司 | ✔ |
| 58 | 雇佣 | Employ (Hire) | 发送雇佣合同/录用；插件内部用 employ | ✔ |
| 59 | 权限 | Permission | 职位权限（`FOCUS_SET` 等）；权限名不翻译 | ✔ |

### 2.5 校验与编辑器（Validation & editor，21 条）

| # | 中文 | English | 说明（插件语境） | 固定 |
| --- | --- | --- | --- | --- |
| 60 | 校验 | Validation | 解析 + 规则检查的总称；动词 Validate | ✔ |
| 61 | 校验规则 | Validation rule | `validation-rules.md` 中的一条规则（ORD-24 等） | ✔ |
| 62 | 错误 | Error | 严重级别；会导致导出被阻止 | ✔ |
| 63 | 警告 | Warning | 严重级别；不阻止导出 | ✔ |
| 64 | 提示 | Info | 严重级别；纯提示 | ✔ |
| 65 | 阻断 | Blocking | 布尔标记；为 true 时禁止导出 | ✔ |
| 66 | 修复 | Fix | 动作/按钮；自动修复用 Auto-fix | ✔ |
| 67 | 修复建议 | Fix hint | issue 的建议文本（`fixHint`） | ✔ |
| 68 | 定位 | Locate | 跳到问题所在文件/字段 | ✔ |
| 69 | 问题 | Issue | 一条校验结果（error/warning/info） | ✔ |
| 70 | 导入 | Import | 读取用户 YAML/ZIP | ✔ |
| 71 | 导出 | Export | 生成下载文件 | ✔ |
| 72 | 导出全部 / 全量导出 | Export all | 逐个文件导出；不是 ZIP | ✔ |
| 73 | 载入示例 | Load sample | 载入 `docs/fixtures` 的 23 个文件 | ✔ |
| 74 | 原文模式 | Raw mode | 直接按行编辑 YAML 原文（reward 列表）；“应用原文” = Apply raw text | ✔ |
| 75 | 重载 | Reload | `/mycompany reload`；不重载 orders.yml | ✔ |
| 76 | 重启 | Restart | 重启服务器；改 orders.yml 后必需 | ✔ |
| 77 | 项目 | Project | 编辑器内的多文件集合 | ✔ |
| 78 | 文件 | File | 项目内一个 YAML（路径为键） | ✔ |
| 79 | 未导出修改 | Unexported changes | 内容指纹与最近导出一致性标记 | ✔ |
| 80 | 自检 | Self-check | 导出前 parse→dump→re-parse 语义比较 | ✔ |

## 3. 英文风格指南

### 3.1 大小写与标点

- **按钮、菜单项、字段标签、页面标题：sentence case**。例：`Load sample`、`Export all`、`Employee orders`、`Chest menu`、`Raw mode`。
- 专有名词保持原样：`MyCompany`、`Minecraft`、`YAML`、`Java`、`GitHub Pages`。
- 术语引用可用 §1 的 Title Case（如文档/表头中的 `Employee Orders`），但 UI 落地用 sentence case。
- **复用插件官方英文时不要套用 sentence case**：`lang/en.yml` 的官方标题如 `Internal Store`、`Company Focus`、
  `Expertise Tree`、`Chestshop`、`Company Money` 原样保留；只有编辑器自造文案才按本规范。两组易混映射见 §6.2
  （`Chestshop` ↔ `Chest shop`、`Expertise Tree` ↔ `Focus tree`）。
- 标签/按钮**不加句号**；完整句子（校验消息、说明）加句号。
- 使用 ASCII 标点（`,` `.` `:` `"`），不要中文标点；省略号用 `…`。
- 计数用复数规则：`1 issue` / `2 issues`；实现可用 ICU plural。

### 3.2 校验消息

- 短句、直接，先主语后问题；**不要** “Please”、“Sorry”、“Oops”、感叹号。
- 推荐句式：
  - `Amount must be a positive integer.`
  - `Slot 20 is already used by "order".`
  - `"item" rewards need at least three segments.`
  - `Unknown quest type "break_blok".`
  - `orders.yml is missing the required "label" field.`
  - `Cannot export: 2 blocking issues.`
- `code` / `path` / `line` 由 UI 单独渲染，不要塞进 message；message 不重复文件路径（除文件级问题）。
- 严重级别只用 `Error` / `Warning` / `Info`；阻断徽标用 `Blocking`；修复按钮 `Fix`；定位按钮 `Locate`。

### 3.3 不要翻译 / 不要改写

| 类别 | 示例 | 规则 |
| --- | --- | --- |
| YAML 键 | `value_type`、`order-per-page`、`default`、`slot`、`slots`、`size`、`items`、`options` | 原样保留，包括下划线与连字符 |
| YAML 值（枚举） | `break_block`、`mob_drops_add`、`console_command`、`boolean` | 原样保留，不改大小写 |
| Minecraft 枚举/材质 | `DIAMOND`、`BLACK_STAINED_GLASS_PANE`、`ZOMBIE`、`PLAYER_HEAD` | 保留大写枚举名；不要翻译成中文/小写 |
| 占位符 | `%player%`、`%company%`、`%order%`、`%label%`、`%amount%` | 大小写敏感，原样保留 |
| 颜色码 | `&a`、`&7`、`&#RRGGBB` | 原样保留 |
| 校验 code | `ORD-24`、`RWD-01`、`YAML_CRLF`、`EXPORT_SELF_CHECK` | 原样保留，作为 UI 技术标识 |
| 文件/路径 | `orders.yml`、`focus/none.yml`、`menu/main.yml`、`plugins/MyCompany/` | 原样保留 |
| 命令/权限 | `/mycompany reload`、`mycompany.commands.admin`、`FOCUS_SET` | 原样保留 |
| 面板/字段 ID | `order`、`area`、`area_rent`、`default`、`previous_page` | 作为技术 id 保留，不译成中文 |

### 3.4 一致性红线

- `Order` ≠ `Quest`；`Reward` ≠ `Prize`；`Focus` ≠ `Specialization`；`Expertise` ≠ `Specialty`。
- `Chest menu` 不写成 `Inventory`；`Chest shop` 不写成 `Vending machine`。
- `Position`（职位）与 `Slot`（槽位）都与“位置”有关，但英文必须分开。
- `Reload`（热重载）与 `Restart`（重启服务器）不能混用。
- `Info`（级别）与 `Hint`（修复建议）不能混用。
- 官方玩家文案里的 **Learn**（学专精）与 **missions**（= Quest）是**既有官方字符串**，复用原文时保留；
  **不要把 Learn/missions 判为错译**；编辑器自造文案用 `Unlock` / `Quest`（详见 §6.2）。
- 中文统一用「专精」，不要用「焦点」；统一用「箱子菜单/菜单」，不要用「界面/背包」指菜单。

## 4. 易错示例（10 组）

| # | 中文 | ✅ 推荐 | ❌ 避免 | 原因 |
| --- | --- | --- | --- | --- |
| 1 | 载入示例 | Load sample | Load example / Import demo | “示例项目”是固定概念；sample 与 fixtures 对应 |
| 2 | 全量导出 / 导出全部 | Export all | Full export / Export everything | 固定按钮文案，短且一致 |
| 3 | 原文模式 | Raw mode | Original text mode / Source-text mode | 指按行编辑 YAML 原文，不是“原始文件” |
| 4 | 定位 | Locate | Position / Jump | Position = 职位，会造成歧义 |
| 5 | 阻断导出 | Export blocked（状态）/ Block export（动作） | Intercept export / Prevent export | 与 `Blocking` 级别一致 |
| 6 | 校验 | Validate（动词）/ Validation（名词） | Check | Check 语义太泛；自检是 Self-check |
| 7 | 提示（级别） | Info | Hint / Tip | Hint 专指 Fix hint |
| 8 | 专精 | Focus | Specialization / Specialty | 与插件文件名、类名一致 |
| 9 | 专精节点 | Expertise | Focus node / Specialty | 节点就是 Expertise，避免冗余 |
| 10 | 箱子菜单 | Chest menu | Box menu / Inventory menu | 与插件 `menu/*.yml` 的箱子 GUI 一致 |

补充说明（不单列为示例）：`Employee orders` 不写 `Staff orders`；`Company area` 不写 `Territory`；
`Employ` 不写 `Recruit`。这三条已分别体现在 §1 固定译法与 §2 术语表中。

## 5. 界面文案对照（建议直接采用）

| 中文（现状） | English |
| --- | --- |
| 导入 | Import |
| 导出 | Export |
| 载入示例（23 个文件） | Load sample (23 files) |
| 项目总览 | Project overview |
| 文件统计 | File summary |
| 订单 / 专精 / 菜单 | Orders / Focus / Menu |
| 错误 / 警告 / 提示 | Errors / Warnings / Info |
| 校验计数 | Validation |
| 未导出修改 | Unexported changes |
| 定位此文件 | Locate this file |
| 修复建议 | Fix hint |
| 已阻止导出：全项目存在 N 条错误/阻断项 | Export blocked: N errors or blocking issues in the project. |
| 修正全部错误/阻断项后才能导出；纯警告/提示不会阻止导出。 | Fix all errors and blocking issues before exporting. Warnings and info do not block export. |
| 存在非字符串奖励行，原文模式不可用 | Raw mode is unavailable because some reward entries are not strings. |
| 订单 ID 不能包含 “.” 或 “:” | Order IDs cannot contain "." or ":". |
| 修改 orders.yml 后需重启服务器 | Restart the server after changing orders.yml. |

## 6. 权威来源与不确定项

### 6.1 权威来源（按优先级）

1. **插件源码 @ `6764e01473e9814f012dc6bdc2fde1fa0f5b0d0f`**
   - `mycompany-core/src/main/resources/lang/en.yml`：插件官方英文（菜单标题、`focus.status`、`rewards`、
     `action-description`、`position-permission`）。
   - Java 类/字段/枚举：`EmployeeOrders`、`EmployeeOrder`、`FocusUtil`、`Expertise`、`MenuUtil`、`MenuItem`、
     `ActionType`、`EffectType` 等（术语词形来源）。
   - 默认 YAML：`orders.yml`、`focus/*.yml`、`menu/*.yml`、`menus.yml`（字段与 id）。
2. **知识库规范**：`docs/mycompany-spec/`（订单/专精/菜单/限制/校验规则），校验 code 与 §0 等级定义。
3. **编辑器工程约定**：`docs/ARCHITECTURE.md`（`ValidationIssue`、导出/阻断/自检、文件类型与中文名）、
   现有 `src/` 文案（仅作为“现状”，不当作英文权威）。
4. **插件 wiki**（https://github.com/Ez4p1xEL/MyCompany/wiki）：仅在源码无法判断时参考；
   与源码冲突时**以源码为准**。

### 6.2 不确定项 / 待确认

| 项 | 现状与决定 | 待确认 |
| --- | --- | --- |
| 雇佣：Employ vs Hire | 插件命令/权限/语言文件用 **employ**；本表固定 **Employ**，Hire 仅作同义词 | 产品文案是否统一用 Hire（若统一，需全表替换） |
| 专精树英文 | 概念用 **Focus tree**；插件 GUI 官方标题是 **Expertise Tree**（`en.yml`） | 编辑器页面标题用哪个：建议 “Focus tree (expertise tree)” 或保持 “Expertise tree” |
| 已解锁状态 | 插件状态为 **Learned/Locked**；动作是 **Unlock** | 是否在 UI 同时展示 “Unlocked” 同义词（不建议） |
| 任务：Quest vs 官方 “missions” | 官方玩家文案 `en.yml:133`（`quest-completed`）写 “One of the missions in the order …”；编辑器固定 **Quest**（YAML 键 `quest`）。直接复用官方字符串时保留 “missions”；自造文案用 Quest | 是否把官方玩家文案也改成 Quest（需改插件，不在编辑器范围） |
| 解锁动词：Unlock vs 官方 “learn” | 官方 `en.yml:1061`（`focus.locked.left`）是 “Left click to learn the expertise”，状态为 **LEARNED**（`:1063` “You have learned this expertise!”）；编辑器动作可用 **Unlock**，复用官方文案时保留 **Learn**，不要把 Learn 判为禁用词 | 是否统一玩家侧动词为 Learn、编辑器侧为 Unlock（当前双轨） |
| 公司资金术语 | 条件键 `company_money` → **Company money**；余额展示可用 **Company balance** | 是否统一为 “Company funds” |
| 箱子商店拼写 | 插件菜单标题 “Chestshop”，类名 `GUIChestShop`；本表用 **Chest shop** | 是否保留官方 “Chestshop” 作为菜单标题原样 |
| 原文模式范围 | 目前只用于 reward 列表的按行编辑；英文 **Raw mode** | 若未来支持整文件原始 YAML 编辑，改称 **Raw YAML mode** |
| “提示”与 “通知” | 级别用 **Info**；toast 仍可称 notice | 是否引入独立 “Notice” 术语 |
| 现有中文不一致 | 代码中出现「焦点文件」（`AppSidebar.vue`），本表规定用「专精文件」 | 前端后续统一（本任务不改代码） |
| 菜单 vs 箱子菜单 | 导航入口用 **Menu**；具体文件语境用 **Chest menu** | 是否所有标题统一为 “Chest menu” |
| 多槽位 | `slots` → **Slots**；与单槽 **Slot** 区分 | 无 |

## 7. 维护约定

- 新增术语：先在本表登记（中文、英文、语境、固定与否），再写进代码文案。
- 修改英文：同时检查 `docs/ARCHITECTURE.md` 的 code/字段名与本文档示例，避免同一概念两种写法。
- 与插件上游同步：每次更新 `docs/mycompany-spec/` 的基准 commit 时，复核 `lang/en.yml` 的官方英文是否变化。
