const RAW_SAMPLES = import.meta.glob('./samples/**/*.yml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

export interface SampleFile {
  path: string;
  text: string;
}

/** 内置示例：构建时直接打包 samples，不依赖 docs/fixtures 路径。 */
export function sampleFiles(): SampleFile[] {
  return Object.entries(RAW_SAMPLES)
    .map(([path, text]) => ({
      path: path.replace(/^\.\/samples\//, ''),
      text,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}
