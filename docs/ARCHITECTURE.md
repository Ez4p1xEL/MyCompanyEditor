# 架构说明：MyCompany YAML 编辑器

> 本文描述 t2 交付的工程骨架与后续任务（t4/t6/t8/t10）的接入契约。
> 规范依据见 `docs/mycompany-spec/`；样例见 `docs/fixtures/mycompany/`（只读）。

## 1. 设计目标与约束

| 目标 | 实现方式 |
| --- | --- |
| 纯前端、可静态托管 | Vue 3 + Vite，`base: './'`；无后端、无运行时 CDN 依赖 |
| 不静默丢数据 | `yaml` Document/CST 保留注释与键序；未知字段原样保留 |
| 解析失败不崩 | `parseYamlText` 永不抛异常，返回 `{ ok, error: { line, column } }` |
| 导出可自证 | parse → dump → re-parse → 语义比较，不一致拒绝写文件 |
| 多文件项目 | Pinia 项目 store，路径为键；localStorage 自动保存 |
| 可扩展 | 功能模块通过 `src/features/*/index.ts` 自动发现；校验规则通过 `registerValidator` 注册 |
| 贴合插件规范 | 文件类型、固定文件名、文本来源、硬限制全部来自知识库文档 |

不引入 `vue-router`：四个导航入口是应用内的功能视图切换，GitHub Pages 子路径刷新不会 404。

## 2. 总览与数据流

```text
                 ┌────────────────────────────────────────────────┐
  文件选择/拖拽 → │ App.vue ingestFiles()                           │
                 │   → store.importFiles([{path,text}])            │
                 └───────────────┬────────────────────────────────┘
                                 ↓
                    detectFileKind(path, text)       ← 文件名优先，内容兜底
                                 ↓
                    canonicalProjectPath(name, kind) ← 单文件映射到插件标准路径
                                 ↓
                    createProjectFile(path, text)    ← 解析统计 + 原文保存
                                 ↓
                    store.validateAll()
                                 ↓
        validateProject(files) ── 通用校验（YAML 语法/重复键/编码/类型）
                                 └─ registerValidator 注册的功能校验（orders/focus/menu）
                                 ↓
                    ProjectFile.issues / parseError / stats 更新
                                 ↓
  第 4 个导航视图 ← features/registry.ts ← Discovery（import.meta.glob）
                                 ↓
              App.vue 渲染 lazy component 或 FeaturePlaceholder
```

导出链路：

```text
ExportDialog → collectExportBlockers(store.fileList)
   任一 blocking / severity=error → 禁止下载（单文件与全部导出同规则），
                                     按文件列出 code/path/message 并提供定位
   prepareExport(file) / prepareAllExports(files)
   parseYamlText(file.text)           失败 → 阻断（带行列）
   stringifyYamlDocument(doc)         统一 LF / 末尾换行
   parseYamlText(output) + 语义比较   不一致 → EXPORT_SELF_CHECK 阻断
   downloadTextFile(filename, text)   Blob 下载（全部导出为逐个文件）
   store.markExported(path)           记录导出指纹
```

## 3. 模块职责

| 路径 | 职责 |
| --- | --- |
| `src/core/types.ts` | 公共类型：`ProjectFile`、`ValidationIssue`、`FeatureModule`、`ImportResult` 等 |
| `src/core/yaml.ts` | 统一 YAML 引擎：`parseYamlText` / `stringifyYamlDocument` / `documentsSemanticallyEqual` / `describeDocument` |
| `src/core/fileTypes.ts` | 18 菜单 id / 3 focus id、路径归一化、类型识别、标准路径映射、类型中文名 |
| `src/core/projectFile.ts` | `createProjectFile`、项目/单文件内容指纹 |
| `src/core/validation.ts` | 通用校验、`registerValidator` 扩展点、`validateProject` |
| `src/core/export.ts` | 导出文件名规则、导出自检 |
| `src/core/samples.ts` | `?raw` 读取 `docs/fixtures/mycompany/**/*.yml` 作为示例项目 |
| `src/store/project.ts` | 多文件状态、导入/替换/删除、`validateAll`、localStorage 持久化 |
| `src/features/registry.ts` | 功能模块自动发现、四个固定导航入口、内置项目总览 |
| `src/views/ProjectOverview.vue` | 空状态、统计、文件列表、解析预览、问题列表、示例加载 |
| `src/components/` | 工具栏、侧栏、导出对话框、占位页、问题列表、Toast |
| `src/styles/` | Minecraft 风格主题（桌面优先，1280px 以上完整布局） |
| `scripts/validate-fixtures.mjs` | 与前端同一个 `yaml.ts`，对 23 个 fixtures 做解析 + 语义往返 |
| `tests/foundation/` | YAML 往返/非法输入/锚点/重复键、文件识别、校验框架、store、应用壳 |

**边界**：`docs/mycompany-spec/`、`docs/fixtures/`、`reference/` 只读；`samples.ts` 只读取，
测试与校验脚本也只读取，不写入。

## 4. 项目状态模型

```ts
interface ProjectFile {
  path: string;                 // 项目内相对路径：orders.yml / focus/none.yml / menu/main.yml
  kind: FileKind;               // orders | focus | focus-tree | menu | menus-config | unknown
  text: string;                 // 原文（导入后不变，编辑功能直接替换 text）
  updatedAt: number;
  issues: ValidationIssue[];    // validateAll 后写入
  parseError?: YamlIssue;       // 语法错误（含行列）
  stats: { lineCount; byteSize; topLevelKeys; topLevelKeyCount };
}

interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  file: string;                 // 项目内路径；项目级问题可为空串
  path?: string;                // YAML 路径，如 stone_breaker.quest.1.amount
  line?: number; column?: number;
  message: string;
  fixHint?: string;
  code?: string;                // 规则 ID（对齐 validation-rules.md）
  blocking?: boolean;           // true = 禁止导出
}
```

Store 关键状态：

| 字段 | 说明 |
| --- | --- |
| `files: Record<path, ProjectFile>` | 项目文件；路径唯一，同路径导入即替换 |
| `projectIssues` | 不属于任何文件的校验问题（功能校验器可产生） |
| `activePath` | 当前选中文件；删除后自动切到列表首个 |
| `activeFeatureId` | 当前功能视图 id（project/orders/focus/menu） |
| `exportedHashes: Record<path, hash>` | 每个文件最近一次成功导出的内容指纹 |
| `lastSavedAt` / `lastValidatedAt` | 自动保存 / 校验时间 |

公开 getter：`fileList`、`filesByKind(kind)`、`activeFile`、`kindCounts`、`allIssues`、
`issueCounts`、`errorCount`/`warningCount`/`infoCount`、`projectSignature`、`isDirty`。

公开 action：`importFiles`、`upsertFile`、`removeFile`、`setActive`、`setActiveFeature`、
`validateAll`、`loadSample`、`saveToLocalStorage`、`restoreFromLocalStorage`、
`markExported(path?)`、`clearProject`。

`isDirty` 按“文件当前内容指纹 ≠ 最近导出指纹”逐文件判断，因此导出单个文件不会误清掉
其他文件的未导出状态。

### localStorage

键：`mycompany-editor:project:v1`，值为：

```json
{
  "version": 1,
  "savedAt": 1730000000000,
  "activePath": "orders.yml",
  "exportedHashes": { "orders.yml": "…" },
  "files": [{ "path": "orders.yml", "text": "…", "kind": "orders" }]
}
```

App.vue 监听 `projectSignature`，450ms 防抖后保存；main.ts 启动时恢复并重新校验。
损坏/不可用的存储不会阻止应用启动（`restoreFromLocalStorage` 返回 false）。

## 5. YAML 引擎

- 解析：`parseDocument(text, { prettyErrors, uniqueKeys: false, logLevel: 'silent' })`。
  重复键不抛异常，解析后自行遍历 CST 报告，便于给出可定位错误并保留原文。
- 拒绝锚点/别名：遍历 CST，任何 `&anchor` / `*alias` 都记为 `anchorsOrAliases`，
  `ok=false`（编辑器不支持合并语义，避免导出后行为不确定）。
- 归一化：去 BOM、CRLF→LF；`hadBom` / `hadCrlf` 返回给校验层做 warning。
- 输出：`doc.toString({ lineWidth: 0, indent: 2, minContentWidth: 0 })`，统一 LF、
  末尾单换行；注释与键序由 Document 保留。
- 语义比较 `documentsSemanticallyEqual`：基于 CST 逐节点规范化（映射按键排序、数组保序、
  标量保留 number/string/boolean/null 类型），供测试、`validate:fixtures` 与导出自检共用。
- `describeDocument` 提供顶层键（orders 的订单 id、menu 的 items 等），用于总览展示。

## 6. 校验分层

### 6.1 通用层（本任务内置，`src/core/validation.ts`）

| code | 等级 | 说明 |
| --- | --- | --- |
| `YAML_PARSE` | error / blocking | 语法错误，带行列 |
| `YAML_ANCHOR_ALIAS` | error / blocking | 锚点/别名不受支持 |
| `YAML_DUPLICATE_KEY` | error | 重复键，后值覆盖前值 |
| `YAML_BOM` / `YAML_CRLF` | warning / info | 导入时归一化，导出统一 LF |
| `FILE_EMPTY` | warning | 空文件 |
| `FILE_UNKNOWN_KIND` | warning | 无法识别类型，仅按普通 YAML 保存 |
| `FILE_LEGACY` | info | `focus.yml` / `menus.yml` 为遗留配置，不生效 |
| `VALIDATOR_FAILED` | error | 功能校验器抛异常时隔离，不拖垮其他校验 |

功能规则（ORD/RWD/FOC/CON/ACT/EFF/MEN/LST/PAG/X 等）**不在 t2 实现**，由 t4/t6/t8 按
`docs/mycompany-spec/validation-rules.md` 注册，保持通用层不写死业务逻辑。

### 6.2 功能层扩展点

```ts
import { registerValidator } from '../../core/validation';
import type { ValidationContext, ValidationIssue } from '../../core/types';

registerValidator((context: ValidationContext): ValidationIssue[] => {
  const rules: ValidationIssue[] = [];
  for (const file of context.files) {
    if (file.kind !== 'orders') continue;
    const parsed = context.parsed[file.path]; // 同一份 ParsedYaml（含 doc/duplicates/…）
    // …按规则产生 { severity, file, path, message, fixHint, code, blocking }
  }
  return rules;
});
```

- 功能模块在 `index.ts` 顶层调用 `registerValidator`；`registry.ts` 以 eager glob 导入，
  因此校验器在项目启动时即生效。
- 校验器内抛异常会被 `validateProject` 捕获并生成 `VALIDATOR_FAILED`，其余结果保留。
- 严重级别、`blocking` 与导出拦截策略见 `validation-rules.md` §0；会导致启动失败、
  菜单打不开、订单卡死的规则必须 `blocking: true`。

## 7. 导入与文件识别

1. 文件选择器 / 拖拽得到 `{ path: file.webkitRelativePath || file.name, text }`。
2. `normalizeProjectPath`：反斜杠转 `/`、去 `./`、丢弃 `..`（防路径穿越）。
3. `detectFileKind`：
   - 目录/固定名优先：`orders.yml`、`focus.yml`、`menus.yml`、`menu/*`、`focus/*`；
   - 单文件被选中时只剩文件名，根目录的 `orders.yml` / `focus.yml` 与菜单 id 重名，
     用内容启发式兜底（顶层 `expertise` → focus；`size/items/options` → menu；
     顶层值的第二层含 `quest/reward` → orders；`focus-tree`/`global` → 遗留配置）。
4. `canonicalProjectPath` 把单文件映射回插件结构：`main.yml` → `menu/main.yml`、
   `mob.yml` → `focus/mob.yml`、任意订单内容 → `orders.yml`；ZIP 导入的相对路径本就标准，
   映射是幂等的。
5. 同路径再次导入即替换（`ImportResult.replaced` 会记录），不会产生重复文件。

## 8. 导出

- 支持单文件导出与“导出全部”（逐个文件下载；全量 ZIP 归 t10）。导出对话框可选择文件、
  编辑文件名（必须以 `.yml`/`.yaml` 结尾，禁止路径分隔符与 `..`）。
- **导出前先聚合全项目 issues**：只要存在 `blocking: true` 或 `severity === 'error'`，
  单文件导出与全部导出都被禁止，并在对话框中按文件列出 `code` / `path` / `message`，
  可定位到问题文件；纯 warning/info 不阻断（`validation-rules.md` §0）。
- 通过阻断检查后，`prepareExport` 重新解析当前 `text`，dump 后再次解析并做语义比较；
  任何一步失败都阻止下载并展示原因（`EXPORT_BLOCKED` / `EXPORT_SELF_CHECK`）。
- 下载内容为 UTF-8 无 BOM、LF、末尾换行；文件名只是下载名，不改变项目内路径。
- 成功后 `store.markExported(path)` 记录该文件指纹，工具栏“未导出修改”按文件粒度更新。
- 示例项目直接读取 `docs/fixtures`（上游 LF git blob）；其中 3 个文件（`orders.yml`、
  `menus.yml`、`menu/found.yml`）无末尾换行，编辑器导出会补单个 LF，
  因此按语义等价处理，而不是字节级一致。

## 9. 功能模块接入契约（t4/t6/t8/t10 必读）

后续任务**只需新增** `src/features/<id>/` 目录，不得要求修改 `App.vue`、`registry.ts`、
`core/` 或 `store/`。

```ts
// src/features/orders/index.ts
import type { FeatureModule } from '../../core/types';
import { registerValidator } from '../../core/validation';
// …注册 orders 校验规则

const feature: FeatureModule = {
  id: 'orders',
  title: '订单',
  icon: '📋',
  component: () => import('./OrdersEditor.vue'), // 懒加载 SFC
};

export default feature;
```

| 约定 | 说明 |
| --- | --- |
| 发现方式 | `import.meta.glob('../features/*/index.ts', { eager: true })`，取 `default` 导出 |
| 必填字段 | `id`、`title`、`icon`、`component`；`component` 返回 `import('./XxxEditor.vue')` |
| 导航 | 固定四个入口：project/orders/focus/menu。有模块 → 渲染懒加载组件；无 → `FeaturePlaceholder`（文案含“功能占位”），构建不失败 |
| 状态 | 只能通过 `useProjectStore()` 的公开 action/getter 读写；文件路径用项目相对路径 |
| 校验 | 通过 `registerValidator` 注册；返回 `ValidationIssue[]`，不得直接改 `ProjectFile.issues` |
| 解析 | 复用 `core/yaml.ts` 的 `parseYamlText` / `describeDocument` / `Document#setIn` 等，禁止另起一套 parse→JSON→stringify |
| 文本边界 | menu 文本在 `lang/<language>.yml`，编辑器只能提示来源，不得声称会随 menu 文件导出 |
| 固定文件 | 不得删除/新增 18 个 `menu/*.yml`、`focus/none|mob|ore.yml`、`orders.yml`（校验规则负责阻断） |

t10 可用 `src/features/project/index.ts` 覆盖内置的项目总览；registry 会优先使用发现到的模块。

## 10. GitHub Pages 部署拓扑

```text
GitHub repo (main)
   │ push
   ▼
.github/workflows/deploy.yml
   ├─ actions/checkout@v4
   ├─ actions/setup-node@v4 (Node 24)
   ├─ npm ci
   ├─ npm run build          → dist/（index.html + assets/*.js|css + .nojekyll）
   ├─ actions/configure-pages@v5
   ├─ actions/upload-pages-artifact@v3 (path: dist)
   └─ actions/deploy-pages@v4
   ▼
https://<user>.github.io/<repo>/
   index.html 引用 ./assets/…（相对路径，可放任意子路径）
```

- Permissions：`contents: read`、`pages: write`、`id-token: write`；并发组 `pages`。
- `base: './'` + 无前端路由 = 子路径托管与刷新都安全。
- `dist/.nojekyll` 由 `vite.config.ts` 中的 `mycompany-emit-nojekyll` 插件写入
  （`public/.nojekyll` 作为源码层备份）。

## 11. 环境与工具链适配

当前 DSH 沙箱禁止子进程使用管道 stdio、且 npm 缓存默认在工作区外，因此：

| 配置 | 原因 | 影响 |
| --- | --- | --- |
| `.npmrc`：`cache=.npm-cache` | 默认缓存目录不可写 | 缓存落在项目内（已 gitignore） |
| `.npmrc`：`ignore-scripts=true` | esbuild 的 postinstall 以管道 spawn 校验二进制，沙箱报 EPERM | esbuild/rollup 二进制来自平台可选依赖，构建/测试正常 |
| `vite.config.ts` 动态导入插件 | Vite 的 bundle 配置加载器解析静态依赖时触发 Windows `net use` 子进程 | 配置行为与静态 import 等价 |
| `resolve.preserveSymlinks: true` | 关闭 realpath 规范化，避免 `net use` 探测 | 本项目无符号链接依赖 |
| Vitest `pool: 'threads'` | forks 池通过管道通信，沙箱 EPERM | 测试使用 worker threads |

这些适配只影响“命令能否在受限环境执行”，不改变产物的运行时行为；普通本地环境与
GitHub Actions 同样可用。

## 12. 验证矩阵（t2 验收对应）

| 验收项 | 命令 / 证据 |
| --- | --- |
| 工程可安装、可构建 | `npm ci`、`npm run build` |
| 测试 | `npm run test -- --run`（YAML 往返/非法输入/识别/store/应用壳） |
| fixtures 全部可解析且语义往返 | `npm run validate:fixtures`（23/23） |
| 导入 orders.yml 可解析展示 | 应用壳“载入示例”后总览显示 `orders.yml` 的 10 个订单 id |
| 非法 YAML 不崩、显示行列 | `YAML_PARSE` issue；`tests/foundation/validation.test.ts` |
| 导出语义等价、数字不字符串化 | `tests/foundation/export.test.ts` + 导出自检 |
| 相对路径子路径托管 | `dist/index.html` 中 `./assets/...`；`vite preview` / 任意静态服务器 |
| Pages workflow / .nojekyll / README | `.github/workflows/deploy.yml`、`dist/.nojekyll`、README §部署 |
| 四个导航入口与空状态 | `tests/foundation/appShell.test.ts` + 浏览器实测 |

## 13. 后续任务边界

| 任务 | 新增内容 | 不得修改 |
| --- | --- | --- |
| t4 订单编辑器 | `src/features/orders/`（表单、quest/reward 行编辑、ORD/RWD 校验） | App.vue、registry.ts、core、store |
| t6 专精编辑器 | `src/features/focus/`（节点编辑、条件/动作/效果、依赖环检测、FOC/CON/ACT/EFF 校验） | 同上 |
| t8 菜单编辑器 | `src/features/menu/`（箱子槽位可视化、材质/模板、MEN/LST/PAG 校验） | 同上 |
| t10 项目整合 | `src/features/project/`（可覆盖总览）、ZIP 导入导出、全量往返 | 同上（可新增 core 之外的工具模块，但不应破坏公开 API） |

所有业务规则以 `docs/mycompany-spec/validation-rules.md` 的最新修订为准；知识库随上游快照
更新（当前 v2 修订），功能任务需逐条映射规则 ID 到 `ValidationIssue.code`。
