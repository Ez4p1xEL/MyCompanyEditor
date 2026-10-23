# 部署到 GitHub Pages

本项目是**纯前端** Vue 应用，构建产物在 `dist/`，不依赖服务器。本文件给出从空仓库到 Pages 可访问 URL 的可照做步骤，并说明仓库里已经具备的配置。

## 1. 前置条件

- Node.js `^22.18.0 || >=24.0.0`（见 `package.json` engines）
- npm（仓库带有 `package-lock.json`，CI 使用 `npm ci`）
- 一个 GitHub 账号；不需要服务器、数据库或后端 API

本地先确认：

```bash
npm ci
npm run build
npm run test -- --run
npm run validate:fixtures
```

`npm run build` 会生成 `dist/`（含 `index.html`、`assets/` 与 `.nojekyll`）。

## 2. 新建仓库并推送

1. 在 GitHub 新建仓库（public 或 private 均可，Pages 对私有仓库的可用性取决于账号计划）。
2. 在本地仓库添加 remote 并推送 `main` 分支：

```bash
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

> 不要提交 `dist/`、`node_modules/`、`.npm-cache/`；仓库的 `.gitignore` 已忽略这些构建产物。

## 3. 开启 Actions 与 Pages

1. 打开仓库 **Settings → Actions → General**，确认 Actions 允许运行（默认即可）。
2. 打开 **Settings → Pages**：
   - **Build and deployment → Source** 选择 **GitHub Actions**（不要选 “Deploy from a branch”）。
3. 仓库已包含 `.github/workflows/deploy.yml`：
   - `on.push.branches: [main]` 或手动 `workflow_dispatch`
   - `permissions: pages: write, id-token: write`
   - `npm ci` → `npm run build` → `actions/upload-pages-artifact`（`path: dist`）→ `actions/deploy-pages`

## 4. 等待部署并访问

1. 在仓库 **Actions** 页查看 “Deploy to GitHub Pages” 运行结果。
2. 运行成功后，在 **Settings → Pages** 或部署 job 的 `page_url` 得到 URL，形如：

```
https://<owner>.github.io/<repo>/
```

3. 项目使用 `base: './'`，构建产物全部是相对路径，因此可以部署在**任意子路径**下；直接打开上面的 URL 即可。
4. 如果页面空白，检查：
   - Pages Source 是否为 **GitHub Actions**
   - workflow 是否上传了 `dist`（而不是仓库根目录）
   - 浏览器 Network 中 `./assets/...` 是否 200；`dist/.nojekyll` 是否存在

## 5. 自定义域名（可选）

1. 在仓库 **Settings → Pages → Custom domain** 填入域名并保存。
2. 按 GitHub 提示在 DNS 添加：
   - 根域名：`A` 记录指向 GitHub Pages 的 IP（以 GitHub 文档当前值为准）
   - 子域名：`CNAME` 指向 `<owner>.github.io`
3. 等待 DNS 生效；需要 HTTPS 时勾选 **Enforce HTTPS**。
4. 本项目不需要修改 `base`：`./` 同样适用于自定义域名根路径。

## 6. 部署配置核验清单

| 项 | 当前仓库状态 | 如何核验 |
| --- | --- | --- |
| Vite base | `base: './'`（`vite.config.ts`） | `grep "base:" vite.config.ts` |
| `.nojekyll` | Vite 插件显式写入 `dist/.nojekyll` | `ls dist/.nojekyll`；构建后应为空文件 |
| Pages workflow | `.github/workflows/deploy.yml` 使用官方 `configure-pages@v5` / `upload-pages-artifact@v3` / `deploy-pages@v4` | 打开 workflow 文件或在 Actions 查看 |
| 构建入口 | `npm run build` 生成 `dist/index.html` | 构建后检查 `dist/index.html` |
| 相对资源 | 构建产物引用 `./assets/...`，不出现 `/assets/...` | `grep -o 'assets/[^"]*' dist/index.html` |
| 子路径托管 | 用任意静态服务器把 `dist` 挂到 `/sub/path/`，访问 `/sub/path/` 应正常渲染 | 见下方本地模拟 |
| 测试 | `npm run test -- --run` / `npm run validate:fixtures` | 全绿后再推送 |

### 本地模拟子路径托管

```bash
npm run build
# 用任意静态服务器把 dist 挂到子路径，例如：
npx serve dist
# 或使用一个临时目录：
mkdir -p /tmp/pages-demo/sub
cp -r dist/* /tmp/pages-demo/sub/
npx serve /tmp/pages-demo
# 访问 http://localhost:3000/sub/
```

由于 `base: './'`，只要 `index.html` 与 `assets/` 相对位置不变，放在 `/sub/` 下也能加载。

## 7. 常见问题

- **刷新后 404**：Pages 对未知路径返回 404；本应用使用单页 hash/内部状态，不依赖 history 路由，正常刷新根路径即可。
- **资源 404**：确认部署的是 `dist/` 而非源码根目录；确认 `base` 未被改回 `/`。
- **没有 `dist/.nojekyll`**：本仓库通过 Vite 插件生成；若自行改了构建配置，需要在 `public/` 或插件中保留它，否则 GitHub Pages 的 Jekyll 会忽略 `_` 开头文件。
- **Actions 没有权限**：检查 Settings → Actions → General 与 Pages 的 Source 是否为 GitHub Actions。
- **不要提交真实服务器配置/密钥**：本项目只编辑 YAML，默认示例为公开 fixture，不包含任何 token。

## 8. 回滚

GitHub Pages 每次部署对应一次 Actions artifact。可在 Actions 中重新运行上一成功提交的 workflow，或 revert 对应提交后重新 push `main`。
