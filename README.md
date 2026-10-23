# MyCompany YAML 在线编辑器

MyCompany Minecraft 插件的**纯前端** YAML 编辑器：在浏览器中导入、可视化编辑、校验并导出
`orders.yml`、`focus/*.yml` 与 `menu/*.yml`。所有解析与校验都在本地完成，不上传任何服务器。

> 规范基准：上游 commit `6764e01473e9814f012dc6bdc2fde1fa0f5b0d0f`（MyCompany `0.8.50`，2026-10-23）。
> 提交的仓库包含 `docs/fixtures/mycompany/`（23 个文件，只读）；完整知识库 `docs/mycompany-spec/`
> 是本地开发资料，不随仓库提交（见 `.gitignore`）。

## 交付状态

**已完成最终交付**：订单 / 专精 / 菜单三个可视化编辑器、项目工作台、全量 ZIP 导入导出、
项目 JSON、全局校验、帮助面板与 GitHub Pages 部署均已实现。

| 能力 | 状态 |
| --- | --- |
| 中文应用壳、四个导航入口（项目工作台 / 订单 / 专精 / 菜单）、空状态 | ✅ |
| 项目工作台：18 个固定菜单、none/mob 专精、orders 卡片与校验统计、跳转编辑 | ✅ |
| 订单可视化编辑：订单 / quest / reward 增删改排序、颜色预览、未知字段保留 | ✅ |
| 专精可视化编辑：condition / action / effect / 默认值、value_type、依赖检查、固定列表保护 | ✅ |
| 菜单可视化编辑：9×N 箱子网格、拖拽排版、slot/slots、材质与分页约束、语言片段 | ✅ |
| YAML 引擎（注释保留、禁用锚点/别名、行列错误、parse→dump→parse 语义校验） | ✅ |
| 文件选择器 / 拖拽 / 多选 / ZIP / 项目 JSON 导入，按文件名与内容识别 | ✅ |
| 统一校验框架（`ValidationIssue` + `registerValidator`）、全局筛选与定位 | ✅ |
| 单文件导出 + 全量 ZIP（orders.yml + focus/none.yml、mob.yml + 18 menu/*.yml） | ✅ |
| 项目 JSON（版本化）下载/恢复；localStorage 自动保存与刷新恢复 | ✅ |
| 帮助面板：字段速查、插件硬限制、生效方式矩阵、部署摘要 | ✅ |
| 构建与 GitHub Pages 部署（相对路径、`.nojekyll`、Actions workflow） | ✅ |

缺失的功能模块仍会显示“功能占位”，不影响构建；新增功能只需添加
`src/features/<id>/index.ts` 即可自动接入（见 `docs/ARCHITECTURE.md` §9）。当前四个导航入口均有实现。

## 技术栈

- Vue 3（`<script setup>`）+ Vite 8 + TypeScript
- Pinia（项目状态）
- `yaml`（Document/CST，保留注释与键序）
- ZIP：`package.json` 含 `jszip@^3.10.1` 依赖；当前全量 ZIP 导出/导入由**内置 ZIP 实现**完成
  （导出 store 模式；导入兼容 store 与 deflate，deflate 通过浏览器 `DecompressionStream` 解压），
  运行时不调用 JSZip；早先 README 中的“JSZip 预留”说明已移除。
- Vitest + jsdom：**19 个测试文件 / 168 用例**
- GitHub Pages：官方 Actions（`configure-pages` / `upload-pages-artifact` / `deploy-pages`）

## 快速开始

要求 Node.js **^22.18.0 || >=24.0.0**（`npm run validate:fixtures` 直接运行 TS 源文件，依赖 Node 的类型擦除）。

```bash
npm ci          # 按 package-lock.json 安装（首次也可用 npm install）
npm run dev     # 开发服务器，默认 http://localhost:5173
```

常用命令：

```bash
npm run test -- --run     # 单元/组件/集成测试（19 文件，168 用例）
npm run validate:fixtures # 解析并往返校验 docs/fixtures/mycompany 下全部 YAML（23/23）
npm run build             # 类型检查 + 生产构建，产物在 dist/
npm run preview           # 本地预览 dist/
```

## GitHub Pages 部署

完整步骤（含自定义域名、子路径验证、排错与回滚）见 [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)。

最短路径：

1. 把仓库默认分支设为 `main`（workflow 监听 `main` 的 push；也可在 Actions 页手动
   `workflow_dispatch`）。
2. 打开仓库 **Settings → Pages → Build and deployment**，Source 选择 **GitHub Actions**。
3. 推送到 `main` 后，`.github/workflows/deploy.yml` 会执行：`npm ci` → `npm run build`
   → 上传 `dist/` → `actions/deploy-pages` 发布。
4. 站点地址形如 `https://<user>.github.io/<repo>/`；如需自定义域名，在 Pages 设置
   Custom domain 并按 `docs/DEPLOYMENT.md` 配置 DNS。

子路径托管的关键点：

- `vite.config.ts` 使用 `base: './'`，`dist/index.html` 与资源引用全部是相对路径
  （`./assets/...`），复制到任意子目录、静态服务器都能加载。
- 构建会同时产出 `dist/.nojekyll`（由 Vite 插件显式 emit），防止 GitHub Pages 的
  Jekyll 处理静态资源。
- 应用不使用前端路由，刷新子路径不会 404。
- 仓库不包含任何远程推送脚本；部署由 GitHub Actions 在仓库侧完成。

## 目录结构

```text
.
├─ index.html                  # 应用入口
├─ vite.config.ts              # base './'、Vue 插件、Vitest 配置
├─ src/
│  ├─ App.vue                  # 应用壳：工具栏 + 侧栏 + 功能视图
│  ├─ main.ts                  # 恢复 localStorage、全局错误处理、挂载
│  ├─ core/                    # 与 UI 无关的纯逻辑
│  │  ├─ types.ts              # ProjectFile / ValidationIssue / FeatureModule 等公共类型
│  │  ├─ yaml.ts               # 统一 parse/dump、语义比较、锚点/重复键检测
│  │  ├─ fileTypes.ts          # 路径归一化、文件类型识别、标准路径映射
│  │  ├─ projectFile.ts        # 项目文件构造、内容指纹
│  │  ├─ validation.ts         # 校验框架 + registerValidator 扩展点
│  │  ├─ export.ts             # 导出前自解析回读与文件名校验
│  │  ├─ samples.ts            # 基础示例读取（项目工作台使用独立 samples）
│  │  ├─ toast.ts / download.ts / exportDialog.ts / format.ts
│  ├─ store/project.ts         # 多文件项目状态、导入/校验/持久化
│  ├─ features/registry.ts     # import.meta.glob 自动发现功能模块
│  ├─ features/orders/         # 订单可视化编辑器（index.ts / OrdersEditor.vue / ordersDoc.ts ...）
│  ├─ features/focus/          # 专精可视化编辑器（条件 / 动作 / 效果 / 固定列表保护）
│  ├─ features/menu/           # 菜单可视化编辑器（箱子网格 / 拖拽 / 语言片段 / ZIP）
│  ├─ features/project/        # 项目工作台、全量 ZIP/JSON、全局校验、帮助、samples/
│  ├─ components/              # 工具栏、侧栏、导出对话框、问题列表等
│  └─ styles/                  # Minecraft 风格主题
├─ tests/
│  ├─ foundation/              # YAML / 文件识别 / 校验 / store / 应用壳测试
│  ├─ orders/                  # 订单解析、校验与编辑器测试
│  ├─ focus/                   # 专精解析、校验与编辑器测试
│  ├─ menu/                    # 菜单解析、校验、编辑器与 ZIP 测试
│  └─ integration/             # tests/integration：项目工作台、全量 ZIP、项目 JSON、部署配置
├─ scripts/validate-fixtures.mjs
├─ public/.nojekyll
├─ .github/workflows/deploy.yml
└─ docs/
   ├─ fixtures/mycompany/      # 上游默认文件（只读，随仓库提交）
   ├─ DEPLOYMENT.md            # GitHub Pages 完整部署/排错/回滚
   └─ ARCHITECTURE.md          # 本编辑器架构说明
```

> 本地 `docs/mycompany-spec/` 是开发知识库，不随仓库提交；仓库只保留项目文档与 fixtures。

## 数据与安全

- **本地处理**：YAML 解析、校验、导出与项目 JSON 均在浏览器内完成，没有后端，不上传数据。
- **示例项目**：项目工作台使用 `src/features/project/samples/` 内置样例（23 个文件），
  构建不依赖 `docs/` 路径；`docs/fixtures/mycompany/` 只读，仅作为知识库校验基准。
- **不静默丢数据**：未知字段/未知段原样保留；YAML 引擎保留注释与键序，导出前会做一次
  “自解析回读 + 语义比较”，不一致则拒绝导出。
- **ZIP 导出边界**：只导出 orders、focus 固定文件与 18 个菜单；`menus.yml`、`focus.yml`、
  参考 focus 不进入 ZIP，避免把插件不会加载的文件放进部署目录。
- **语言文本边界**：菜单标题/物品名/lore 来自 `lang/<language>.yml`，不写入 `menu/*.yml`；
  语言片段只作为独立 YAML 片段导出，需手动合并到语言文件。
- **自动保存**：项目写入 `localStorage`（键 `mycompany-editor:project:v1`），刷新自动恢复；
  项目 JSON 可手动备份全部文件（含参考/遗留配置）。
- **只读目录**：`docs/fixtures/mycompany/` 禁止写入；`reference/` 是本地开发快照（已 gitignore）。
- **图标 CDN（可选）**：菜单物品图标会尝试从公开 CDN 加载，失败时回退为彩色占位；
  编辑与校验不依赖网络。

## 规范基准

编辑器行为依据上游 MyCompany `0.8.50` / commit `6764e01` 的 Java 源码与默认 YAML。
完整知识库位于本地 `docs/mycompany-spec/`（不随仓库提交）；仓库保留
`docs/fixtures/mycompany/` 作为测试与示例基准。运行时的校验规则实现在
`src/features/orders|focus|menu/`。

规范更新时，编辑器校验规则需随本地知识库的 `validation-rules.md` 同步。

## 环境适配说明

当前开发环境（DSH 沙箱）限制子进程使用管道 stdio，且 npm 默认缓存在工作区外。
仓库内的以下几处适配**不改变应用行为**，只保证命令可复现：

- `.npmrc`：`cache=.npm-cache` 把缓存放进项目；`ignore-scripts=true` 跳过 postinstall
  （esbuild/rollup 的二进制来自平台可选依赖，不需要安装脚本）。
- `vite.config.ts`：不使用静态 `import` 加载插件（改用变量形式的动态 import），并设置
  `resolve.preserveSymlinks: true`，避开 Vite 在 Windows 上通过 `net use` 探测网络盘的子进程。
- Vitest 使用 `pool: 'threads'`（沙箱禁止 forks 池的管道通信）。

在普通本地/CI 环境中这些配置同样可用。

## 非目标

- 不修改插件源码，不实际运行 Minecraft/Paper 服务端。
- 不修改知识库目录与 fixtures。
- 不提供菜单语言文件完整编辑器；只进行语言片段编辑/导出，需手动合并。
- 不创建或推送远程 GitHub 仓库。

## 最终验证

- `npm run build` 通过，产物在 `dist/`（含 `.nojekyll`，资源相对引用）。
- `npm run test -- --run` 通过：**19 个测试文件 / 168 用例**。
- `npm run validate:fixtures` 通过：**23/23** 个 fixture 解析并语义往返。
- GitHub Pages 部署步骤见 [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)。
