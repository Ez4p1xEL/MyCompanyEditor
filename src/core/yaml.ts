import {
  Document,
  isAlias,
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  type Node,
  type DocumentOptions,
  type ParseOptions,
  type ToStringOptions,
} from 'yaml';

/**
 * 统一 YAML 引擎。
 *
 * 约束（来自 docs/mycompany-spec/constraints.md §9）：
 * - 使用 yaml 的 Document/CST 方案，尽量保留注释与键序；
 * - 禁用锚点/别名；
 * - 输出 UTF-8 无 BOM、LF 换行、末尾单个换行；
 * - 数字类型不漂移（parse → dump → parse 语义一致）。
 */

export interface YamlIssue {
  message: string;
  line: number;
  column: number;
  code?: string;
}

export interface DuplicateKeyInfo {
  path: string;
  key: string;
  line: number;
}

export interface ParsedYaml {
  /** 语法合法且不含锚点/别名（重复键不算致命错误，由校验层报告）。 */
  ok: boolean;
  doc?: Document;
  /** 第一个阻断性问题（语法错误或锚点/别名）。 */
  error?: YamlIssue;
  /** 仅语法错误。 */
  syntaxError?: YamlIssue;
  duplicates: DuplicateKeyInfo[];
  anchorsOrAliases: YamlIssue[];
  warnings: string[];
  normalizedText: string;
  hadBom: boolean;
  hadCrlf: boolean;
  lineCount: number;
}

export interface DocumentSummary {
  nodeKind: 'map' | 'seq' | 'scalar' | 'empty' | 'other';
  topLevelKeys: string[];
  topLevelKeyCount: number;
}

const PARSE_OPTIONS: ParseOptions & DocumentOptions = {
  prettyErrors: true,
  // 重复键不在解析阶段抛出：保留完整 CST，由校验层给出可定位的错误。
  uniqueKeys: false,
  logLevel: 'silent',
};

const DUMP_OPTIONS: ToStringOptions = {
  lineWidth: 0,
  indent: 2,
  minContentWidth: 0,
};

export function normalizeYamlText(input: string): {
  text: string;
  hadBom: boolean;
  hadCrlf: boolean;
} {
  let text = input;
  const hadBom = text.charCodeAt(0) === 0xfeff;
  if (hadBom) text = text.slice(1);
  const hadCrlf = text.includes('\r');
  if (hadCrlf) text = text.replace(/\r\n?/g, '\n');
  return { text, hadBom, hadCrlf };
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  const lines = text.split('\n');
  return text.endsWith('\n') ? lines.length - 1 : lines.length;
}

function lineAt(text: string, offset: number | undefined): number {
  if (offset === undefined || offset < 0) return 1;
  const end = Math.min(offset, text.length);
  let line = 1;
  for (let index = 0; index < end; index += 1) {
    if (text.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function firstLine(message: string): string {
  return message.split('\n')[0]?.trim() ?? message;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function keyLabel(key: Node | null | undefined): string {
  if (!key) return '[空键]';
  if (isScalar(key)) {
    const value = key.value;
    return value === null || value === undefined ? 'null' : String(value);
  }
  if (isAlias(key)) return `*${key.source}`;
  if (isMap(key)) return '[映射键]';
  if (isSeq(key)) return '[列表键]';
  return '[未知键]';
}

function collectDuplicates(
  node: Node,
  text: string,
  path: string,
  out: DuplicateKeyInfo[],
): void {
  if (isMap(node)) {
    const seen = new Set<string>();
    for (const pair of node.items) {
      const key = keyLabel(pair.key as Node | null);
      const childPath = path ? `${path}.${key}` : key;
      if (seen.has(key)) {
        out.push({
          path: childPath,
          key,
          line: lineAt(text, (pair.key as Node | null)?.range?.[0]),
        });
      }
      seen.add(key);
      if (pair.value) collectDuplicates(pair.value as Node, text, childPath, out);
    }
    return;
  }
  if (isSeq(node)) {
    node.items.forEach((item, index) => {
      if (item) collectDuplicates(item as Node, text, `${path}[${index}]`, out);
    });
  }
}

function collectAnchorIssues(node: Node, text: string, out: YamlIssue[]): void {
  if (isAlias(node)) {
    out.push({
      message: `不支持别名 “*${node.source}”：请展开为实际内容后再导入`,
      line: lineAt(text, node.range?.[0]),
      column: 1,
      code: 'ANCHOR_ALIAS',
    });
  } else {
    const anchor = (node as { anchor?: string }).anchor;
    if (anchor) {
      out.push({
        message: `不支持锚点 “&${anchor}”：请展开为实际内容后再导入`,
        line: lineAt(text, node.range?.[0]),
        column: 1,
        code: 'ANCHOR_ALIAS',
      });
    }
  }

  if (isMap(node)) {
    for (const pair of node.items) {
      if (pair.key) collectAnchorIssues(pair.key as Node, text, out);
      if (pair.value) collectAnchorIssues(pair.value as Node, text, out);
    }
    return;
  }
  if (isSeq(node)) {
    for (const item of node.items) {
      if (item) collectAnchorIssues(item as Node, text, out);
    }
  }
}

export function parseYamlText(input: string): ParsedYaml {
  const normalized = normalizeYamlText(input);
  const text = normalized.text;
  const base = {
    normalizedText: text,
    hadBom: normalized.hadBom,
    hadCrlf: normalized.hadCrlf,
    lineCount: countLines(text),
  };

  try {
    const doc = parseDocument(text, PARSE_OPTIONS);
    const duplicates: DuplicateKeyInfo[] = [];
    const anchorsOrAliases: YamlIssue[] = [];
    if (doc.contents) {
      collectDuplicates(doc.contents, text, '', duplicates);
      collectAnchorIssues(doc.contents, text, anchorsOrAliases);
    }
    const warnings = doc.warnings.map((warning) => firstLine(warning.message));

    if (doc.errors.length > 0) {
      const first = doc.errors[0] as {
        message: string;
        code?: string;
        pos?: [number, number];
        linePos?: { line: number; col: number }[];
      };
      const position = first.linePos?.[0];
      const issue: YamlIssue = {
        message: firstLine(first.message),
        line: position?.line ?? lineAt(text, first.pos?.[0]),
        column: position?.col ?? 1,
        code: first.code,
      };
      return {
        ...base,
        ok: false,
        doc,
        error: issue,
        syntaxError: issue,
        duplicates,
        anchorsOrAliases,
        warnings,
      };
    }

    if (anchorsOrAliases.length > 0) {
      return {
        ...base,
        ok: false,
        doc,
        error: anchorsOrAliases[0],
        duplicates,
        anchorsOrAliases,
        warnings,
      };
    }

    return {
      ...base,
      ok: true,
      doc,
      duplicates,
      anchorsOrAliases,
      warnings,
    };
  } catch (error) {
    const issue: YamlIssue = {
      message: `YAML 解析失败：${errorMessage(error)}`,
      line: 1,
      column: 1,
    };
    return {
      ...base,
      ok: false,
      error: issue,
      syntaxError: issue,
      duplicates: [],
      anchorsOrAliases: [],
      warnings: [],
    };
  }
}

export function stringifyYamlDocument(doc: Document): string {
  const raw = String(doc.toString(DUMP_OPTIONS));
  const { text } = normalizeYamlText(raw);
  return text.endsWith('\n') ? text : `${text}\n`;
}

function canonicalize(node: Node | null | undefined): unknown {
  if (!node) return { kind: 'empty' };
  if (isAlias(node)) return { kind: 'alias', source: node.source };
  if (isScalar(node)) {
    const value = node.value;
    if (value === null || value === undefined) return { kind: 'scalar', type: 'null' };
    if (typeof value === 'number') {
      return {
        kind: 'scalar',
        type: 'number',
        value: Number.isNaN(value) ? 'NaN' : String(value),
      };
    }
    if (typeof value === 'boolean') {
      return { kind: 'scalar', type: 'boolean', value };
    }
    if (typeof value === 'bigint') {
      return { kind: 'scalar', type: 'bigint', value: String(value) };
    }
    if (value instanceof Date) {
      return { kind: 'scalar', type: 'date', value: value.toISOString() };
    }
    return { kind: 'scalar', type: 'string', value: String(value) };
  }
  if (isMap(node)) {
    const entries = node.items
      .map((pair) => {
        const key = JSON.stringify(canonicalize(pair.key as Node | null));
        const value = JSON.stringify(canonicalize(pair.value as Node | null));
        return [key, value] as const;
      })
      .sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
    return { kind: 'map', entries };
  }
  if (isSeq(node)) {
    return {
      kind: 'seq',
      items: node.items.map((item) => canonicalize(item as Node | null)),
    };
  }
  return { kind: 'unknown' };
}

/** 语义比较：忽略映射键顺序与注释/引号风格，保留标量类型与数组顺序。 */
export function documentsSemanticallyEqual(left: Document, right: Document): boolean {
  return (
    JSON.stringify(canonicalize(left.contents)) === JSON.stringify(canonicalize(right.contents))
  );
}

export function describeDocument(doc: Document): DocumentSummary {
  const contents = doc.contents;
  if (!contents) {
    return { nodeKind: 'empty', topLevelKeys: [], topLevelKeyCount: 0 };
  }
  if (isMap(contents)) {
    const keys = contents.items.map((pair) => keyLabel(pair.key as Node | null));
    return { nodeKind: 'map', topLevelKeys: keys, topLevelKeyCount: keys.length };
  }
  if (isSeq(contents)) {
    return { nodeKind: 'seq', topLevelKeys: [], topLevelKeyCount: contents.items.length };
  }
  if (isScalar(contents)) {
    return { nodeKind: 'scalar', topLevelKeys: [], topLevelKeyCount: 0 };
  }
  return { nodeKind: 'other', topLevelKeys: [], topLevelKeyCount: 0 };
}

/** 把 Document 转为普通 JS 值（只读用途）。 */
export function yamlPlainValue(doc: Document): unknown {
  return doc.toJS();
}
