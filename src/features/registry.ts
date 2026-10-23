import type {
  FeatureComponentLoader,
  FeatureModule,
  FeatureNavItem,
} from '../core/types';

/**
 * 功能模块自动发现。
 *
 * 契约：后续任务只需新增 src/features/<id>/index.ts 并在默认导出中提供
 * { id, title, icon, component }，App.vue / registry.ts / core / store 均不需要修改。
 * component 用 () => import('./XxxEditor.vue') 懒加载。
 */
const discoveredEntries = import.meta.glob('../features/*/index.ts', {
  eager: true,
}) as Record<string, { default?: unknown }>;

function isFeatureModule(value: unknown): value is FeatureModule {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.title === 'string' &&
    typeof record.icon === 'string' &&
    typeof record.component === 'function'
  );
}

function collectDiscoveredModules(): FeatureModule[] {
  const modules: FeatureModule[] = [];
  for (const [path, entry] of Object.entries(discoveredEntries)) {
    const candidate = entry?.default ?? entry;
    if (isFeatureModule(candidate)) modules.push(candidate);
    else console.warn(`[MyCompanyEditor] 忽略无效的功能模块：${path}`);
  }
  return modules.sort(
    (left, right) =>
      (left.order ?? 100) - (right.order ?? 100) || left.id.localeCompare(right.id),
  );
}

const DISCOVERED = collectDiscoveredModules();

/** 项目总览是壳自带视图（t10 可用 src/features/project/index.ts 覆盖）。 */
const BUILTIN_PROJECT: FeatureModule = {
  id: 'project',
  title: '项目总览',
  icon: '🏠',
  order: 0,
  description: '项目文件、校验结果与导入导出入口',
  component: () => import('../views/ProjectOverview.vue'),
};

/** 四个固定导航入口（缺失功能模块时显示“功能占位”）。 */
const NAV_BASE: Array<Pick<FeatureNavItem, 'id' | 'title' | 'icon'>> = [
  { id: 'project', title: '项目总览', icon: '🏠' },
  { id: 'orders', title: '订单', icon: '📋' },
  { id: 'focus', title: '专精', icon: '✨' },
  { id: 'menu', title: '菜单', icon: '🧰' },
];

export function getFeature(id: string): FeatureModule | undefined {
  const discovered = DISCOVERED.find((module) => module.id === id);
  if (discovered) return discovered;
  if (id === BUILTIN_PROJECT.id) return BUILTIN_PROJECT;
  return undefined;
}

export function getAllFeatures(): FeatureModule[] {
  const modules = [...DISCOVERED];
  if (!modules.some((module) => module.id === BUILTIN_PROJECT.id)) {
    modules.push(BUILTIN_PROJECT);
  }
  return modules.sort(
    (left, right) =>
      (left.order ?? 100) - (right.order ?? 100) || left.id.localeCompare(right.id),
  );
}

export function getNavItems(): FeatureNavItem[] {
  return NAV_BASE.map((base) => {
    const feature = getFeature(base.id);
    return {
      ...base,
      title: feature?.title ?? base.title,
      icon: feature?.icon ?? base.icon,
      available: Boolean(feature),
    };
  });
}

export type { FeatureComponentLoader };
