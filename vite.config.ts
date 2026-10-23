// 说明：这里刻意不使用静态 import。
// Vite 默认的「bundle」配置加载器在解析配置文件的静态依赖时会调用 Windows
// 安全 realpath（内部通过 `net use` 子进程探测网络盘），在受限沙箱/离线环境
// 下会直接 EPERM。改用变量形式的动态 import（打包器无法静态解析，会原样保留），
// 由 Node 在运行时解析，功能与静态 import 完全等价。
const VUE_PLUGIN_ID = ['@vitejs', 'plugin-vue'].join('/');

type VuePlugin = (options?: Record<string, unknown>) => unknown;

// public/ 里的 dotfile 在部分平台不会被复制，这里显式写入 dist/.nojekyll。
const emitNoJekyll = {
  name: 'mycompany-emit-nojekyll',
  generateBundle(this: { emitFile: (file: { type: 'asset'; fileName: string; source: string }) => void }) {
    this.emitFile({ type: 'asset', fileName: '.nojekyll', source: '' });
  },
};

export default async function viteConfig() {
  const { default: vue } = (await import(VUE_PLUGIN_ID)) as { default: VuePlugin };

  return {
    // GitHub Pages 子路径部署：所有产物使用相对路径。
    base: './',
    plugins: [vue(), emitNoJekyll],
    // Windows 上没有符号链接需求；关闭 realpath 规范化，避免 Vite 通过
    // `net use` 子进程探测网络盘（受限沙箱/离线环境会 EPERM）。
    resolve: {
      preserveSymlinks: true,
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
    },
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.ts'],
      restoreMocks: true,
      // 受限沙箱禁止子进程使用管道 stdio，forks 池无法启动；使用线程池。
      pool: 'threads',
    },
  };
}
