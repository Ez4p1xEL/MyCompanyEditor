import type { FileKind, ProjectFile, ValidationIssue } from '../../core/types';
import { prepareExport } from '../../core/export';
import { isBlockingIssue } from '../../core/validation';
import {
  FIXED_FOCUS_PATHS,
  FIXED_MENU_PATHS,
  MENU_IDS,
  canonicalProjectPath,
  detectFileKind,
  normalizeProjectPath,
} from '../../core/fileTypes';
import type { ZipTextEntry } from './zip';

export const PROJECT_JSON_FORMAT = 'mycompany-editor-project';
export const PROJECT_JSON_VERSION = 1;

export function isFixedFocusPath(path: string): boolean {
  return (FIXED_FOCUS_PATHS as readonly string[]).includes(path);
}

export function isFixedMenuPath(path: string): boolean {
  return (FIXED_MENU_PATHS as readonly string[]).includes(path);
}

/** 只导出插件真正会加载的文件；参考 focus / menus.yml / focus.yml 都不进入 ZIP。 */
export function isExportableFile(file: ProjectFile): boolean {
  if (file.path === 'orders.yml' && file.kind === 'orders') return true;
  if (isFixedFocusPath(file.path) && file.kind === 'focus') return true;
  if (isFixedMenuPath(file.path) && file.kind === 'menu') return true;
  return false;
}

export function exportableFiles(files: ProjectFile[]): ProjectFile[] {
  return files.filter(isExportableFile);
}

export function referenceFocusFiles(files: ProjectFile[]): ProjectFile[] {
  return files.filter(
    (file) =>
      (file.kind === 'focus' && !isFixedFocusPath(file.path)) ||
      (file.kind === 'unknown' && file.path.startsWith('focus-reference/')),
  );
}

export function collectProjectExportBlockers(files: ProjectFile[]): ValidationIssue[] {
  return exportableFiles(files).flatMap((file) => file.issues.filter(isBlockingIssue));
}

export interface ProjectZipPreparation {
  ok: boolean;
  entries: ZipTextEntry[];
  issues: ValidationIssue[];
}

/** 全量导出：orders.yml、focus/none.yml、focus/mob.yml、menu/<id>.yml。 */
export function prepareProjectZip(files: ProjectFile[]): ProjectZipPreparation {
  const blockers = collectProjectExportBlockers(files);
  if (blockers.length > 0) return { ok: false, entries: [], issues: blockers };
  const byPath = new Map(files.map((file) => [file.path, file]));
  const ordered: ProjectFile[] = [];
  const orders = byPath.get('orders.yml');
  if (orders && orders.kind === 'orders') ordered.push(orders);
  for (const path of FIXED_FOCUS_PATHS) {
    const file = byPath.get(path);
    if (file && file.kind === 'focus') ordered.push(file);
  }
  for (const id of MENU_IDS) {
    const file = byPath.get(`menu/${id}.yml`);
    if (file && file.kind === 'menu') ordered.push(file);
  }
  const entries: ZipTextEntry[] = [];
  for (const file of ordered) {
    const prepared = prepareExport(file);
    if (!prepared.ok) {
      return { ok: false, entries: [], issues: prepared.issues };
    }
    entries.push({ name: file.path, text: prepared.payload.text });
  }
  return { ok: true, entries, issues: [] };
}

export interface ImportInput {
  path: string;
  text: string;
}

export interface PlannedImport {
  path: string;
  text: string;
  kind: FileKind;
  warning?: string;
}

export interface ImportPlan {
  planned: PlannedImport[];
  skipped: Array<{ path: string; reason: string }>;
}

/** 按路径/文件名与内容识别导入类型；无法识别的文件不阻断其它文件。 */
export function planYamlImports(inputs: ImportInput[]): ImportPlan {
  const planned: PlannedImport[] = [];
  const skipped: ImportPlan['skipped'] = [];
  for (const input of inputs) {
    const path = normalizeProjectPath(input.path);
    if (!/\.(ya?ml)$/i.test(path)) {
      skipped.push({ path: input.path, reason: '不是 .yml/.yaml 文件' });
      continue;
    }
    const kind = detectFileKind(path, input.text);
    if (kind === 'unknown') {
      skipped.push({ path: input.path, reason: '无法识别为 orders/focus/menu 文件' });
      continue;
    }
    const base = path.split('/').pop() ?? path;
    let target = path;
    if (path.includes('/') && path.startsWith('menu/') && kind === 'menu') target = path;
    else if (path.includes('/') && path.startsWith('focus/') && kind === 'focus') target = path;
    else if (kind === 'menu') {
      const id = base.replace(/\.ya?ml$/i, '');
      target = `menu/${id}.yml`;
    } else {
      target = canonicalProjectPath(base, kind);
    }
    const warning =
      kind === 'menu' && !(MENU_IDS as readonly string[]).includes(base.replace(/\.ya?ml$/i, ''))
        ? `menu/${base} 不在固定 18 个菜单 id 中，插件不会加载`
        : undefined;
    planned.push({ path: target, text: input.text, kind, warning });
  }
  return { planned, skipped };
}

export interface ProjectJsonFile {
  path: string;
  text: string;
  kind: FileKind;
}

export interface ProjectJsonData {
  format: typeof PROJECT_JSON_FORMAT;
  version: number;
  savedAt: string;
  activeFeatureId: string;
  files: ProjectJsonFile[];
}

export function buildProjectJson(files: ProjectFile[], activeFeatureId: string): ProjectJsonData {
  return {
    format: PROJECT_JSON_FORMAT,
    version: PROJECT_JSON_VERSION,
    savedAt: new Date().toISOString(),
    activeFeatureId,
    files: files.map((file) => ({ path: file.path, text: file.text, kind: file.kind })),
  };
}

export function parseProjectJson(
  text: string,
): { ok: true; data: ProjectJsonData } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `JSON 解析失败：${error instanceof Error ? error.message : String(error)}` };
  }
  if (!raw || typeof raw !== 'object') return { ok: false, error: '项目文件必须是 JSON 对象' };
  const record = raw as Record<string, unknown>;
  if (record.format !== PROJECT_JSON_FORMAT) {
    return { ok: false, error: '不是 MyCompany 编辑器项目文件（format 不匹配）' };
  }
  if (record.version !== PROJECT_JSON_VERSION) {
    return { ok: false, error: `不支持的项目版本 ${String(record.version)}（当前 ${PROJECT_JSON_VERSION}）` };
  }
  if (!Array.isArray(record.files)) return { ok: false, error: '项目文件缺少 files 数组' };
  const files: ProjectJsonFile[] = [];
  const seen = new Set<string>();
  for (const entry of record.files) {
    if (!entry || typeof entry !== 'object') return { ok: false, error: 'files 中存在非对象条目' };
    const item = entry as Record<string, unknown>;
    if (typeof item.path !== 'string' || typeof item.text !== 'string') {
      return { ok: false, error: 'files 条目的 path/text 必须是字符串' };
    }
    const path = normalizeProjectPath(item.path);
    if (!path) return { ok: false, error: 'files 存在空路径' };
    if (seen.has(path)) return { ok: false, error: `files 存在重复路径 ${path}` };
    seen.add(path);
    const kind = typeof item.kind === 'string' ? item.kind : 'unknown';
    const allowed: FileKind[] = ['orders', 'focus', 'menu', 'focus-tree', 'menus-config', 'unknown'];
    if (!allowed.includes(kind as FileKind)) return { ok: false, error: `未知文件类型 ${kind}` };
    files.push({ path, text: item.text, kind: kind as FileKind });
  }
  return {
    ok: true,
    data: {
      format: PROJECT_JSON_FORMAT,
      version: PROJECT_JSON_VERSION,
      savedAt: typeof record.savedAt === 'string' ? record.savedAt : new Date().toISOString(),
      activeFeatureId: typeof record.activeFeatureId === 'string' ? record.activeFeatureId : 'project',
      files,
    },
  };
}
