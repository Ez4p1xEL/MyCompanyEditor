import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  buildProjectJson,
  collectProjectExportBlockers,
  exportableFiles,
  parseProjectJson,
  planYamlImports,
  prepareProjectZip,
  referenceFocusFiles,
} from '../../src/features/project/projectFileOps';
import { sampleFiles } from '../../src/features/project/samples';
import { buildZip, readZip } from '../../src/features/project/zip';
import { useProjectStore } from '../../src/store/project';
import { documentsSemanticallyEqual, parseYamlText } from '../../src/core/yaml';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('内置示例与全量 ZIP', () => {
  it('示例 23 个文件覆盖 orders/focus/menu，构建不依赖 docs', () => {
    const samples = sampleFiles();
    expect(samples).toHaveLength(23);
    expect(samples.filter((file) => file.path === 'orders.yml')).toHaveLength(1);
    expect(samples.filter((file) => file.path.startsWith('focus/') && file.path.endsWith('.yml'))).toHaveLength(2);
    expect(samples.filter((file) => file.path.startsWith('menu/'))).toHaveLength(18);
    expect(samples.some((file) => file.path === 'focus.yml')).toBe(true);
    expect(samples.some((file) => file.path === 'menus.yml')).toBe(true);
  });

  it('全量 ZIP 只含 orders/focus 固定/menu，LF 且可回读重导', async () => {
    const store = useProjectStore();
    store.importFiles(sampleFiles());
    const prepared = prepareProjectZip(store.fileList);
    expect(prepared.ok).toBe(true);
    expect(prepared.entries).toHaveLength(21);
    expect(prepared.entries.map((entry) => entry.name).sort()).toEqual(
      [
        'orders.yml',
        'focus/mob.yml',
        'focus/none.yml',
        ...Array.from({ length: 18 }, (_, index) => `menu/${[
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
        ][index]}.yml`),
      ].sort(),
    );
    for (const entry of prepared.entries) {
      expect(entry.name.startsWith('focus/') || entry.name.startsWith('menu/') || entry.name === 'orders.yml').toBe(true);
      expect(entry.text.endsWith('\n')).toBe(true);
      expect(entry.text.includes('\r')).toBe(false);
      expect(entry.text.charCodeAt(0)).not.toBe(0xfeff);
      const parsed = parseYamlText(entry.text);
      expect(parsed.ok, entry.name).toBe(true);
      const original = store.files[entry.name];
      expect(original).toBeDefined();
      const originalParsed = parseYamlText(original!.text);
      expect(documentsSemanticallyEqual(originalParsed.doc!, parsed.doc!), entry.name).toBe(true);
    }
    expect(prepared.entries.some((entry) => entry.name === 'menus.yml')).toBe(false);
    expect(prepared.entries.some((entry) => entry.name === 'focus.yml')).toBe(false);

    const bytes = buildZip(prepared.entries);
    const reread = await readZip(bytes);
    expect(reread.map((entry) => entry.name).sort()).toEqual(prepared.entries.map((entry) => entry.name).sort());
    for (const entry of reread) {
      expect(entry.text).toBe(prepared.entries.find((source) => source.name === entry.name)!.text);
    }

    setActivePinia(createPinia());
    const restored = useProjectStore();
    const plan = planYamlImports(reread.map((entry) => ({ path: entry.name, text: entry.text })));
    expect(plan.skipped).toHaveLength(0);
    expect(plan.planned).toHaveLength(21);
    for (const item of plan.planned) restored.upsertFile(item.path, item.text, item.kind);
    expect(restored.fileList).toHaveLength(21);
    for (const entry of reread) {
      const original = parseYamlText(entry.text);
      const imported = parseYamlText(restored.files[entry.name]!.text);
      expect(documentsSemanticallyEqual(original.doc!, imported.doc!), entry.name).toBe(true);
    }
  });

  it('参考 focus 不进入 ZIP，也不参与导出阻断', () => {
    const store = useProjectStore();
    store.importFiles(sampleFiles());
    store.importFiles([
      {
        path: 'focus/farming.yml',
        text: `id: farming
label: Farming
expertise:
  crops:
    label: Crops
    condition: {}
    value_type: boolean
    default:
      value: 'false'
    action: {}
    effect: {}
`,
      },
    ]);
    expect(referenceFocusFiles(store.fileList).map((file) => file.path)).toContain('focus/farming.yml');
    expect(exportableFiles(store.fileList).map((file) => file.path)).not.toContain('focus/farming.yml');
    const prepared = prepareProjectZip(store.fileList);
    expect(prepared.ok).toBe(true);
    expect(prepared.entries.some((entry) => entry.name.includes('farming'))).toBe(false);
  });

  it('全局错误阻止导出并列出文件/路径', () => {
    const store = useProjectStore();
    store.importFiles(sampleFiles());
    store.upsertFile('orders.yml', 'a: [1', 'orders');
    const blockers = collectProjectExportBlockers(store.fileList);
    expect(blockers.length).toBeGreaterThan(0);
    expect(blockers.some((issue) => issue.file === 'orders.yml')).toBe(true);
    const prepared = prepareProjectZip(store.fileList);
    expect(prepared.ok).toBe(false);
    expect(prepared.issues.length).toBeGreaterThan(0);
  });
});

describe('项目 JSON 与多文件识别', () => {
  it('项目 JSON 带版本，保存/恢复文件与 kind', () => {
    const store = useProjectStore();
    store.importFiles(sampleFiles());
    const data = buildProjectJson(store.fileList, 'menu');
    expect(data.format).toBe('mycompany-editor-project');
    expect(data.version).toBe(1);
    expect(data.files).toHaveLength(23);
    const parsed = parseProjectJson(JSON.stringify(data));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.files.map((file) => file.path).sort()).toEqual(store.fileList.map((file) => file.path).sort());
    expect(parsed.data.activeFeatureId).toBe('menu');
    expect(parseProjectJson('{"format":"other"}').ok).toBe(false);
    expect(parseProjectJson('not json').ok).toBe(false);
  });

  it('多文件按名称/内容识别，未知文件跳过不阻断', () => {
    const plan = planYamlImports([
      { path: 'orders.yml', text: 'stone_breaker:\n  quest: {}\n' },
      { path: 'focus/mob.yml', text: "expertise:\n  a:\n    condition: {}\n" },
      { path: 'menu/main.yml', text: 'size: 27\nitems: {}\n' },
      { path: 'unknown.yml', text: 'hello: world\n' },
      { path: 'readme.txt', text: 'nope' },
    ]);
    expect(plan.planned.map((item) => item.path)).toEqual(['orders.yml', 'focus/mob.yml', 'menu/main.yml']);
    expect(plan.planned.map((item) => item.kind)).toEqual(['orders', 'focus', 'menu']);
    expect(plan.skipped.map((item) => item.path)).toEqual(['unknown.yml', 'readme.txt']);
  });
});
