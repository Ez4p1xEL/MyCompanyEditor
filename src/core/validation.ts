import { t } from '../i18n';
import type { ProjectFile, ValidationIssue } from './types';
import { parseYamlText, setYamlTranslator, type ParsedYaml } from './yaml';

export function validationKey(source: string): string {
  return encodeURIComponent(source).replace(/\./g, '%2E');
}

export function validationText(source: string, params?: Record<string, string | number>): string {
  return t(`validation.${validationKey(source)}`, params);
}

setYamlTranslator((source, params) => validationText(source, params));

/**
 * 校验框架。
 *
 * 分层：
 * 1) 通用层（validateProject 内置）：YAML 语法、重复键、锚点/别名、编码/换行、未知文件类型；
 * 2) 功能层：t4/t6/t8 等任务通过 registerValidator 注册 orders/focus/menu 专属规则，
 *    不需要修改 store 或本文件的通用逻辑。
 */

export interface ValidationContext {
  files: ProjectFile[];
  parsed: Record<string, ParsedYaml>;
}

export type FeatureValidator = (context: ValidationContext) => ValidationIssue[];

export interface ValidationCounts {
  error: number;
  warning: number;
  info: number;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  byFile: Record<string, ValidationIssue[]>;
  parsed: Record<string, ParsedYaml>;
  counts: ValidationCounts;
}

const featureValidators: FeatureValidator[] = [];

export function registerValidator(validator: FeatureValidator): void {
  featureValidators.push(validator);
}

/** 测试专用：清空已注册的功能校验器。 */
export function resetValidators(): void {
  featureValidators.length = 0;
}

function validateYamlBasics(file: ProjectFile, parsed: ParsedYaml): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (parsed.syntaxError) {
    issues.push({
      severity: 'error',
      file: file.path,
      path: '$',
      line: parsed.syntaxError.line,
      column: parsed.syntaxError.column,
      code: 'YAML_PARSE',
      message: validationText("YAML 解析失败：{p0}", { p0: parsed.syntaxError.message }),
      fixHint: validationText("修正语法后会自动重新校验；导出前必须消除该错误"),
      blocking: true,
    });
  }

  for (const anchor of parsed.anchorsOrAliases) {
    issues.push({
      severity: 'error',
      file: file.path,
      path: '$',
      line: anchor.line,
      column: anchor.column,
      code: 'YAML_ANCHOR_ALIAS',
      message: anchor.message,
      fixHint: validationText("编辑器不支持锚点/别名，请展开为普通 YAML 后再导入"),
      blocking: true,
    });
  }

  for (const duplicate of parsed.duplicates) {
    issues.push({
      severity: 'error',
      file: file.path,
      path: duplicate.path,
      line: duplicate.line,
      code: 'YAML_DUPLICATE_KEY',
      message: validationText("重复键 “{p0}”：后者会覆盖前者，行为不可预测", { p0: duplicate.key }),
      fixHint: validationText("重命名或删除重复键"),
    });
  }

  if (parsed.hadBom) {
    issues.push({
      severity: 'warning',
      file: file.path,
      path: '$',
      code: 'YAML_BOM',
      message: validationText("文件包含 UTF-8 BOM，导出时会自动移除"),
      fixHint: validationText("保存为无 BOM 的 UTF-8 文件"),
    });
  }

  if (parsed.hadCrlf) {
    issues.push({
      severity: 'info',
      file: file.path,
      path: '$',
      code: 'YAML_CRLF',
      message: validationText("文件使用 CRLF 换行，导出时会统一为 LF（语义不变）"),
      fixHint: validationText("如需统一源文件，可保存为 LF 换行"),
    });
  }

  if (!file.text.trim()) {
    issues.push({
      severity: 'warning',
      file: file.path,
      path: '$',
      code: 'FILE_EMPTY',
      message: validationText("文件为空"),
      fixHint: validationText("导入有效的 YAML 内容或删除该文件"),
    });
  }

  if (file.kind === 'unknown') {
    issues.push({
      severity: 'warning',
      file: file.path,
      path: '$',
      code: 'FILE_UNKNOWN_KIND',
      message: validationText("无法识别文件类型，仅按普通 YAML 原样保存"),
      fixHint: validationText("确认文件名（orders.yml / focus/*.yml / menu/*.yml）或内容结构"),
    });
  }

  if (file.kind === 'focus-tree' || file.kind === 'menus-config') {
    issues.push({
      severity: 'info',
      file: file.path,
      path: '$',
      code: 'FILE_LEGACY',
      message:
        file.kind === 'focus-tree'
          ? validationText("focus.yml（专精树）是遗留配置：当前插件版本不读取，修改不会生效")
          : validationText("menus.yml 是遗留配置：当前插件版本不读取，修改不会生效"),
      fixHint: validationText("保留原样即可；如需调整请修改对应的 focus/*.yml 或 menu/*.yml"),
    });
  }

  return issues;
}

/**
 * 统一阻断判定：blocking 或 severity=error 都禁止导出；
 * warning/info 只提示（validation-rules.md §0）。
 */
export function isBlockingIssue(issue: ValidationIssue): boolean {
  return issue.blocking === true || issue.severity === 'error';
}

/** 聚合所有文件的阻断项（按文件顺序）。 */
export function collectBlockingIssues(files: ProjectFile[]): ValidationIssue[] {
  return files.flatMap((file) => file.issues.filter(isBlockingIssue));
}

export function validateProject(files: ProjectFile[]): ValidationResult {
  const parsed: Record<string, ParsedYaml> = {};
  const byFile: Record<string, ValidationIssue[]> = {};
  const issues: ValidationIssue[] = [];

  for (const file of files) {
    const result = parseYamlText(file.text);
    parsed[file.path] = result;
    const fileIssues = validateYamlBasics(file, result);
    byFile[file.path] = fileIssues;
    issues.push(...fileIssues);
  }

  const context: ValidationContext = { files, parsed };
  for (const validator of featureValidators) {
    try {
      const extra = validator(context) ?? [];
      for (const issue of extra) {
        issues.push(issue);
        byFile[issue.file]?.push(issue);
      }
    } catch (error) {
      issues.push({
        severity: 'error',
        file: '',
        path: '$',
        code: 'VALIDATOR_FAILED',
        message: validationText("功能校验器执行失败：{p0}", { p0: error instanceof Error ? error.message : String(error) }),
        fixHint: validationText("该问题通常意味着编辑器缺陷，请反馈；其余校验结果仍然有效"),
      });
    }
  }

  const counts: ValidationCounts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) counts[issue.severity] += 1;

  return { issues, byFile, parsed, counts };
}
