/**
 * 示例项目：直接以 ?raw 方式读取知识库 fixtures（只读，不复制、不修改）。
 *
 * fixtures 是上游 commit 85e3947 的 git blob（LF）副本；编辑器导出会统一为 LF 并在
 * 文件末尾补单个换行，因此对上游 blob 末尾无换行的 3 个文件
 * （orders.yml、menus.yml、menu/found.yml）导出字节数会比 blob 多 1 字节，
 * 内容语义等价，导出不保证字节级一致。
 */
const RAW_FIXTURES = import.meta.glob('../../docs/fixtures/mycompany/**/*.yml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const FIXTURE_ROOT = '../../docs/fixtures/mycompany/';

export interface SampleFile {
  path: string;
  text: string;
}

/** 生成“载入示例”结果文案：同时报告新增与替换，避免误以为是纯新增。 */
export function describeSampleImport(result: {
  imported: string[];
  replaced: string[];
}): string {
  const imported = result.imported.length;
  const replaced = result.replaced.length;
  const total = imported + replaced;
  const suffix = replaced > 0 ? '；同名文件已用示例替换' : '';
  return '已载入示例项目：新增 ' + imported + ' 个，替换 ' + replaced + ' 个（共 ' + total + ' 个' + suffix + '）';
}

export const sampleFiles: SampleFile[] = Object.entries(RAW_FIXTURES)
  .map(([key, text]) => ({
    path: key.startsWith(FIXTURE_ROOT) ? key.slice(FIXTURE_ROOT.length) : key,
    text: String(text),
  }))
  .sort((left, right) => left.path.localeCompare(right.path));
