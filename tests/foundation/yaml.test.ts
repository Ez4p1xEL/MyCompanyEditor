import { describe, expect, it } from 'vitest';
import type { Document } from 'yaml';
import {
  documentsSemanticallyEqual,
  parseYamlText,
  stringifyYamlDocument,
  type ParsedYaml,
} from '../../src/core/yaml';
import { fixtureFiles, fixtureText } from './fixtures';

function mustParse(text: string): ParsedYaml & { doc: Document } {
  const parsed = parseYamlText(text);
  expect(parsed.ok, parsed.error?.message).toBe(true);
  if (!parsed.ok || !parsed.doc) {
    throw new Error(parsed.error?.message ?? 'YAML 解析失败');
  }
  return parsed as ParsedYaml & { doc: Document };
}

describe('YAML 引擎', () => {
  it('解析 orders.yml 并保留数字类型', () => {
    const parsed = mustParse(fixtureText('orders.yml'));
    const value = parsed.doc.toJS() as Record<string, any>;
    expect(value.stone_breaker.label).toBe('Stone Breaker');
    expect(value.stone_breaker.quest['1'].amount).toBe(16);
    expect(typeof value.stone_breaker.quest['1'].amount).toBe('number');
    expect(value.miner.quest['2'].item).toBe('gold_ore');
  });

  it('23 个 fixture 全部解析且导出后语义往返一致', () => {
    expect(fixtureFiles).toHaveLength(23);
    for (const file of fixtureFiles) {
      const parsed = mustParse(file.text);
      const output = stringifyYamlDocument(parsed.doc);
      const reparsed = mustParse(output);
      expect(documentsSemanticallyEqual(parsed.doc, reparsed.doc), file.path).toBe(true);
      expect(output.endsWith('\n'), file.path).toBe(true);
      expect(output.includes('\r'), file.path).toBe(false);
      expect(output.startsWith('\uFEFF'), file.path).toBe(false);
    }
  });

  it('保留注释', () => {
    const menu = mustParse(fixtureText('menu/main.yml'));
    const menuOutput = stringifyYamlDocument(menu.doc);
    expect(menuOutput).toContain('# default for all empty slots');

    const mob = mustParse(fixtureText('focus/mob.yml'));
    const mobOutput = stringifyYamlDocument(mob.doc);
    expect(mobOutput).toContain('# Mob focus tree');
  });

  it('非法 YAML 返回可读的行列错误', () => {
    const parsed = parseYamlText('orders:\n  broken: [1, 2\n');
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBeDefined();
    expect(parsed.error?.line).toBeGreaterThanOrEqual(1);
    expect(parsed.error?.column).toBeGreaterThanOrEqual(1);
    expect(parsed.error?.message.length).toBeGreaterThan(0);
  });

  it('拒绝锚点与别名', () => {
    const parsed = parseYamlText('base: &base\n  a: 1\nalias: *base\n');
    expect(parsed.ok).toBe(false);
    expect(parsed.anchorsOrAliases.length).toBeGreaterThan(0);
    expect(parsed.error?.message).toMatch(/锚点|别名/);
  });

  it('检测重复键但不静默丢弃', () => {
    const parsed = parseYamlText('a: 1\na: 2\n');
    expect(parsed.duplicates).toHaveLength(1);
    expect(parsed.duplicates[0].key).toBe('a');
    expect(parsed.duplicates[0].line).toBe(2);
  });

  it('归一化 BOM 与 CRLF', () => {
    const parsed = parseYamlText('\uFEFFa: 1\r\nb: 2\r\n');
    expect(parsed.hadBom).toBe(true);
    expect(parsed.hadCrlf).toBe(true);
    expect(parsed.normalizedText).toBe('a: 1\nb: 2\n');
    expect(parsed.ok).toBe(true);
  });

  it('字符串与数字类型不漂移', () => {
    const parsed = mustParse('size: 45\nname: "45"\nslots: [1, 2]\n');
    const reparsed = mustParse(stringifyYamlDocument(parsed.doc));
    const value = reparsed.doc.toJS() as Record<string, unknown>;
    expect(value.size).toBe(45);
    expect(value.name).toBe('45');
    expect(value.slots).toEqual([1, 2]);
  });
});
