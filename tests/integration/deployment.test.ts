// @ts-expect-error Node 内置模块仅测试使用；tsconfig 的 types 只有 vite/client。
import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const VITE = readFileSync('vite.config.ts', 'utf8');
const WORKFLOW = readFileSync('.github/workflows/deploy.yml', 'utf8');
const README = readFileSync('README.md', 'utf8');
const DEPLOYMENT = readFileSync('docs/DEPLOYMENT.md', 'utf8');

describe('GitHub Pages 部署配置', () => {
  it('vite base 为相对路径，且显式输出 .nojekyll', () => {
    expect(VITE).toContain("base: './'");
    expect(VITE).toContain('.nojekyll');
    expect(VITE).toContain("outDir: 'dist'");
  });

  it('Actions workflow 使用 npm ci、构建 dist 并部署 Pages', () => {
    expect(WORKFLOW).toContain('actions/configure-pages');
    expect(WORKFLOW).toContain('actions/upload-pages-artifact');
    expect(WORKFLOW).toContain('actions/deploy-pages');
    expect(WORKFLOW).toContain('npm ci');
    expect(WORKFLOW).toContain('npm run build');
    expect(WORKFLOW).toContain('path: dist');
    expect(WORKFLOW).toContain('pages: write');
    expect(WORKFLOW).toContain('id-token: write');
    expect(WORKFLOW).toMatch(/branches:\s*\[main\]/);
  });

  it('README 与 docs/DEPLOYMENT.md 给出可照做的 Pages 步骤', () => {
    expect(README).toContain('GitHub Pages 部署');
    expect(README).toContain('GitHub Actions');
    expect(README).toContain(".nojekyll");
    expect(DEPLOYMENT).toContain('Settings → Pages');
    expect(DEPLOYMENT).toContain('GitHub Actions');
    expect(DEPLOYMENT).toContain('Custom domain');
    expect(DEPLOYMENT).toContain('自定义域名');
    expect(DEPLOYMENT).toContain('base: \'./\'');
    expect(DEPLOYMENT).toContain('.nojekyll');
    expect(DEPLOYMENT).toContain('子路径');
  });

  it('构建产物存在时，资源引用为相对路径', () => {
    if (!existsSync('dist/index.html')) return;
    const html = readFileSync('dist/index.html', 'utf8');
    expect(html).toContain('./assets/');
    expect(html).not.toMatch(/(?:src|href)="\/assets\//);
    expect(existsSync('dist/.nojekyll')).toBe(true);
  });
});
