import { validationText } from './validation';
import type { ProjectFile, ValidationIssue } from './types';
import { isBlockingIssue } from './validation';
import { documentsSemanticallyEqual, parseYamlText, stringifyYamlDocument } from './yaml';

export interface PreparedExport {
  filename: string;
  text: string;
  bytes: number;
}

export type ExportPreparation =
  | { ok: true; payload: PreparedExport }
  | { ok: false; issues: ValidationIssue[] };

export interface ExportBlockerGroup {
  file: string;
  issues: ValidationIssue[];
}

/** 聚合整个项目里会阻断导出的 issue（blocking 或 error）。 */
export function collectExportBlockers(files: ProjectFile[]): ValidationIssue[] {
  return files.flatMap((file) => file.issues.filter(isBlockingIssue));
}

/** 按文件分组阻断项，便于导出对话框按文件列出原因。 */
export function groupExportBlockers(issues: ValidationIssue[]): ExportBlockerGroup[] {
  const groups = new Map<string, ValidationIssue[]>();
  for (const issue of issues) {
    const file = issue.file || validationText("(项目)");
    const list = groups.get(file) ?? [];
    list.push(issue);
    groups.set(file, list);
  }
  return [...groups.entries()]
    .map(([file, fileIssues]) => ({ file, issues: fileIssues }))
    .sort((left, right) => left.file.localeCompare(right.file));
}

export function suggestedFilename(path: string): string {
  const base = path.split('/').filter(Boolean).pop();
  return base && base.length > 0 ? base : 'export.yml';
}

/** 校验用户可编辑的导出文件名。返回 null 表示合法。 */
export function validateExportFilename(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return validationText("文件名不能为空");
  if (/[\\/:*?"<>|]/.test(trimmed)) return validationText("文件名不能包含路径分隔符或特殊字符");
  if (trimmed === '.' || trimmed === '..') return validationText("文件名不合法");
  if (!/\.ya?ml$/i.test(trimmed)) return validationText("文件名必须以 .yml 或 .yaml 结尾");
  return null;
}

/**
 * 生成单文件导出内容：parse → dump → 自解析回读，语义不一致则拒绝导出
 * （constraints.md §9.2 写入流程）。
 */
/**
 * 全部导出时的下载名：嵌套目录用 “-” 前缀，避免 root focus.yml 与 menu/focus.yml、
 * root orders.yml 与 menu/orders.yml 等同名文件互相覆盖。
 */
export function allExportFilename(path: string): string {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return 'export.yml';
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join('-')}-${parts[parts.length - 1]}`;
}

export type AllExportPreparation =
  | { ok: true; payloads: PreparedExport[] }
  | { ok: false; issues: ValidationIssue[] };

/** 全部导出：先聚合全项目阻断项，再逐文件执行 parse→dump→re-parse 自检。 */
export function prepareAllExports(files: ProjectFile[]): AllExportPreparation {
  const blockers = collectExportBlockers(files);
  if (blockers.length > 0) return { ok: false, issues: blockers };

  const payloads: PreparedExport[] = [];
  for (const file of files) {
    const prepared = prepareExport(file);
    if (!prepared.ok) return { ok: false, issues: prepared.issues };
    payloads.push({ ...prepared.payload, filename: allExportFilename(file.path) });
  }
  return { ok: true, payloads };
}

export function prepareExport(file: ProjectFile): ExportPreparation {
  const parsed = parseYamlText(file.text);
  if (!parsed.ok || !parsed.doc) {
    const issue = parsed.syntaxError ?? parsed.error;
    return {
      ok: false,
      issues: [
        {
          severity: 'error',
          file: file.path,
          path: '$',
          line: issue?.line ?? 1,
          column: issue?.column ?? 1,
          code: 'EXPORT_BLOCKED',
          message: issue ? validationText("无法导出：{p0}", { p0: issue.message }) : validationText("无法导出：YAML 解析失败"),
          fixHint: validationText("先修正 YAML 语法错误再导出"),
          blocking: true,
        },
      ],
    };
  }

  const text = stringifyYamlDocument(parsed.doc);
  const reparsed = parseYamlText(text);
  if (!reparsed.ok || !reparsed.doc || !documentsSemanticallyEqual(parsed.doc, reparsed.doc)) {
    return {
      ok: false,
      issues: [
        {
          severity: 'error',
          file: file.path,
          path: '$',
          code: 'EXPORT_SELF_CHECK',
          message: validationText("导出内容回读校验失败：生成结果与源文件语义不一致，已阻止导出"),
          fixHint: validationText("请保留原文件并反馈该问题；可先仅导出其他文件"),
          blocking: true,
        },
      ],
    };
  }

  return {
    ok: true,
    payload: {
      filename: suggestedFilename(file.path),
      text,
      bytes: new TextEncoder().encode(text).length,
    },
  };
}
