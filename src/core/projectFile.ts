import { detectFileKind } from './fileTypes';
import type { FileKind, ProjectFile } from './types';
import { describeDocument, parseYamlText } from './yaml';

export interface CreateProjectFileOptions {
  kind?: FileKind;
  now?: number;
}

/** 创建项目文件记录（原文保留 + 解析统计）。 */
export function createProjectFile(
  path: string,
  text: string,
  options: CreateProjectFileOptions = {},
): ProjectFile {
  const kind = options.kind ?? detectFileKind(path, text);
  const parsed = parseYamlText(text);
  const summary = parsed.doc ? describeDocument(parsed.doc) : undefined;
  return {
    path,
    kind,
    text,
    updatedAt: options.now ?? Date.now(),
    issues: [],
    parseError: parsed.syntaxError ?? parsed.error,
    stats: {
      lineCount: parsed.lineCount,
      byteSize: new TextEncoder().encode(text).length,
      topLevelKeys: summary?.topLevelKeys ?? [],
      topLevelKeyCount: summary?.topLevelKeyCount ?? 0,
    },
  };
}

/**
 * 项目内容指纹（用于“未导出修改”提示与自动保存去重）。
 * 与文件顺序无关，但不忽略任何文本变化。
 */
export function computeProjectSignature(
  files: Array<Pick<ProjectFile, 'path' | 'text'>>,
): string {
  const sorted = [...files].sort((left, right) => left.path.localeCompare(right.path));
  let hash = 0x811c9dc5;
  let totalLength = 0;
  for (const file of sorted) {
    const chunk = `${file.path}\u0000${file.text}\u0000`;
    totalLength += file.text.length;
    for (let index = 0; index < chunk.length; index += 1) {
      hash ^= chunk.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return `${(hash >>> 0).toString(16)}-${sorted.length}-${totalLength}`;
}

/** 单文件内容指纹（导出状态跟踪用）。 */
export function hashFileText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(16)}-${text.length}`;
}
