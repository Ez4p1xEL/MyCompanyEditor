// 测试用：直接以 ?raw 方式读取知识库 fixtures（只读，不修改）。
const fixtureModules = import.meta.glob('../../docs/fixtures/mycompany/**/*.yml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const FIXTURE_ROOT = '../../docs/fixtures/mycompany/';

export interface FixtureFile {
  path: string;
  text: string;
}

export const fixtureFiles: FixtureFile[] = Object.entries(fixtureModules)
  .map(([key, text]) => ({
    path: key.startsWith(FIXTURE_ROOT) ? key.slice(FIXTURE_ROOT.length) : key,
    text: String(text),
  }))
  .sort((a, b) => a.path.localeCompare(b.path));

export function fixtureText(relPath: string): string {
  const found = fixtureFiles.find((file) => file.path === relPath);
  if (!found) {
    throw new Error(`fixture not found: ${relPath}（已发现 ${fixtureFiles.length} 个文件）`);
  }
  return found.text;
}
