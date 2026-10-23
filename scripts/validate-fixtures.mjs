#!/usr/bin/env node
/**
 * 解析并往返校验 docs/fixtures/mycompany 下全部 YAML（知识库只读，不修改）。
 *
 * 校验项：
 * 1) 文件集合与知识库声明的 23 个文件一致；
 * 2) 每个文件可解析（无语法错误、无锚点/别名、无重复键）；
 * 3) parse → dump → parse 语义等价（键值、数组顺序、数字/字符串类型不变）；
 * 4) 输出统一 UTF-8 无 BOM、LF、末尾换行；
 * 5) focus/none.yml 使用唯一标准写法 value_type。
 *
 * 说明：直接 import 前端同一份 src/core/yaml.ts（Node 22.18+ / 24 的 TypeScript
 * 类型擦除），避免脚本与编辑器实现出现两份解析逻辑。
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  documentsSemanticallyEqual,
  parseYamlText,
  stringifyYamlDocument,
} from '../src/core/yaml.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(ROOT, 'docs', 'fixtures', 'mycompany');

// 与 src/core/fileTypes.ts 的 MENU_IDS 保持一致（该文件含无扩展名相对导入，
// 不能直接被 Node 类型擦除加载，因此这里显式列出）。
const MENU_IDS = [
  'area_list',
  'area_rent_market',
  'area_sale_market',
  'area_trade_market',
  'areas',
  'chestshop',
  'confirmation',
  'focus',
  'focus_list',
  'found',
  'internal_store',
  'main',
  'orders',
  'personnel',
  'player_list',
  'position',
  'position_list',
  'position_permission_list',
];

const EXPECTED_FILES = [
  'orders.yml',
  'focus.yml',
  'menus.yml',
  'focus/none.yml',
  'focus/mob.yml',
  ...MENU_IDS.map((id) => `menu/${id}.yml`),
].sort();

async function collectYamlFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectYamlFiles(absolute, relative)));
    } else if (/\.ya?ml$/i.test(entry.name)) {
      files.push(relative);
    }
  }
  return files;
}

function fail(message) {
  failures.push(message);
}

const failures = [];
const checked = [];
let normalizedCrlf = 0;

let files = [];
try {
  files = (await collectYamlFiles(FIXTURES)).sort();
} catch (error) {
  console.error(`无法读取 fixtures 目录：${FIXTURES}`);
  console.error(error);
  process.exit(1);
}

console.log(`fixtures: ${FIXTURES}`);
console.log(`发现 ${files.length} 个 YAML 文件\n`);

if (files.length !== EXPECTED_FILES.length) {
  fail(`文件数量不一致：期望 ${EXPECTED_FILES.length}，实际 ${files.length}`);
}

for (const expected of EXPECTED_FILES) {
  if (!files.includes(expected)) fail(`缺少 fixture 文件：${expected}`);
}
for (const file of files) {
  if (!EXPECTED_FILES.includes(file)) fail(`出现未登记的文件（知识库应更新 README）：${file}`);
}

for (const file of files) {
  const text = await readFile(path.join(FIXTURES, file), 'utf8');
  const parsed = parseYamlText(text);
  if (!parsed.ok || !parsed.doc) {
    const error = parsed.error;
    fail(`${file}: 解析失败${error ? `（第 ${error.line} 行第 ${error.column} 列：${error.message}）` : ''}`);
    continue;
  }
  if (parsed.anchorsOrAliases.length > 0) {
    fail(`${file}: 含锚点/别名（编辑器不支持）`);
  }
  if (parsed.duplicates.length > 0) {
    fail(`${file}: 含重复键：${parsed.duplicates.map((item) => item.key).join(', ')}`);
  }
  if (parsed.hadBom) fail(`${file}: 含 UTF-8 BOM`);
  // 上游资源使用 CRLF（fixtures 与 6764e01 逐字节一致），导入时归一化即可；
  // 只要求编辑器导出结果为 LF（见下方 output 检查）。
  if (parsed.hadCrlf) normalizedCrlf += 1;

  const output = stringifyYamlDocument(parsed.doc);
  if (!output.endsWith('\n')) fail(`${file}: 导出结果缺少末尾换行`);
  if (output.includes('\r')) fail(`${file}: 导出结果含 CR`);
  if (output.startsWith('\uFEFF')) fail(`${file}: 导出结果含 BOM`);

  const reparsed = parseYamlText(output);
  if (!reparsed.ok || !reparsed.doc) {
    fail(`${file}: 导出结果无法重新解析：${reparsed.error?.message ?? '未知错误'}`);
  } else if (!documentsSemanticallyEqual(parsed.doc, reparsed.doc)) {
    fail(`${file}: 往返后语义不一致（键值/类型/数组顺序发生变化）`);
  }

  checked.push({ file, lines: parsed.lineCount, bytes: Buffer.byteLength(text, 'utf8') });
}

const noneFocus = await readFile(path.join(FIXTURES, 'focus/none.yml'), 'utf8');
if (!/^\s*value_type:/m.test(noneFocus)) fail('focus/none.yml: 未使用标准写法 value_type');
if (/^\s*value-type:/m.test(noneFocus)) fail('focus/none.yml: 仍含旧写法 value-type');

if (failures.length > 0) {
  console.error('\n校验失败：');
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}

console.log('文件'.padEnd(34) + '行数'.padStart(6) + '字节'.padStart(8) + '  往返');
for (const item of checked) {
  console.log(
    item.file.padEnd(34) +
      String(item.lines).padStart(6) +
      String(item.bytes).padStart(8) +
      '  ✓',
  );
}
console.log(
  `\nOK: ${checked.length} 个 fixture 全部解析成功，parse → dump → parse 语义等价（UTF-8 / LF / 无 BOM）。`,
);
if (normalizedCrlf > 0) {
  console.log(
    `注：${normalizedCrlf} 个上游 fixture 使用 CRLF 换行，导入时会归一化为 LF（不影响语义）。`,
  );
}
