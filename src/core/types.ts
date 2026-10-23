import type { Component } from 'vue';
import type { YamlIssue } from './yaml';

/** 项目文件类型（orders / focus / menu 与两类遗留配置）。 */
export type FileKind =
  | 'orders'
  | 'focus'
  | 'focus-tree'
  | 'menu'
  | 'menus-config'
  | 'unknown';

export type IssueSeverity = 'error' | 'warning' | 'info';

/**
 * 统一校验问题模型（校验框架契约）。
 * 扩展字段 code/line/column/blocking 便于定位与导出拦截，不影响核心字段。
 */
export interface ValidationIssue {
  severity: IssueSeverity;
  /** 项目内相对路径，例如 orders.yml / menu/main.yml。 */
  file: string;
  /** YAML 路径，例如 stone_breaker.quest.1.amount。 */
  path?: string;
  line?: number;
  column?: number;
  message: string;
  fixHint?: string;
  /** 规则 ID（对齐 docs/mycompany-spec/validation-rules.md）。 */
  code?: string;
  /** true 表示禁止导出（会导致插件启动失败/菜单打不开/订单卡死）。 */
  blocking?: boolean;
}

export interface FileStats {
  lineCount: number;
  byteSize: number;
  topLevelKeys: string[];
  topLevelKeyCount: number;
}

/** 项目中的一个文件：原文始终保留，校验结果附着其上。 */
export interface ProjectFile {
  path: string;
  kind: FileKind;
  text: string;
  updatedAt: number;
  issues: ValidationIssue[];
  parseError?: YamlIssue;
  stats: FileStats;
}

/** 功能模块的懒加载组件签名。 */
export type FeatureComponentLoader = () => Promise<Component | { default: Component }>;

/**
 * 功能模块契约（src/features/<id>/index.ts 默认导出）：
 * { id, title, icon, component }，component 用 () => import('./XxxEditor.vue')。
 */
export interface FeatureModule {
  id: string;
  title: string;
  icon: string;
  component: FeatureComponentLoader;
  order?: number;
  description?: string;
  /** 可选：功能模块可注册自己的校验规则（不得修改 core/store）。 */
}

export interface ImportedFile {
  path: string;
  text: string;
}

export interface ImportSkip {
  path: string;
  reason: string;
}

export interface ImportResult {
  imported: string[];
  replaced: string[];
  skipped: ImportSkip[];
  issueCount: number;
}

export interface FeatureNavItem {
  id: string;
  title: string;
  icon: string;
  available: boolean;
}
