import { describe, expect, it } from 'vitest';
import {
  addItem,
  clearItemSlots,
  deleteItem,
  deleteOption,
  duplicateItem,
  itemSlots,
  itemSlotMode,
  moveItem,
  optionValueFromInput,
  parseMenuFile,
  renameItem,
  serializeMenu,
  setItemMaterial,
  setItemSlot,
  setItemSlots,
  setOption,
  setSize,
} from '../../src/features/menu/menuDoc';
import { MENU_META } from '../../src/features/menu/menuConstants';
import { documentsSemanticallyEqual, parseYamlText } from '../../src/core/yaml';
import { fixtureText } from '../foundation/fixtures';

const MAIN = fixtureText('menu/main.yml');
const ORDERS = fixtureText('menu/orders.yml');
const INTERNAL = fixtureText('menu/internal_store.yml');
const FOCUS = fixtureText('menu/focus.yml');

function roundtrip(text: string, path: string) {
  const parsed = parseMenuFile(path, text);
  expect(parsed.parsed.ok, parsed.parsed.error?.message).toBe(true);
  expect(parsed.doc).not.toBeNull();
  const output = serializeMenu(parsed.doc!);
  const reread = parseYamlText(output);
  expect(reread.ok).toBe(true);
  expect(documentsSemanticallyEqual(parsed.doc!, reread.doc!)).toBe(true);
  return parsed;
}

describe('menu 文件解析与往返', () => {
  it('18 个 fixture 全部解析、往返语义等价', () => {
    for (const meta of MENU_META) {
      const path = `menu/${meta.id}.yml`;
      const parsed = roundtrip(fixtureText(path), path);
      expect(parsed.model.known, path).toBe(true);
      expect(parsed.model.sizeNumber, path).toBeGreaterThan(0);
      expect(parsed.model.items.length, path).toBeGreaterThan(0);
    }
  });

  it('main.yml 读取 size/items/default/特殊 material', () => {
    const parsed = parseMenuFile('menu/main.yml', MAIN);
    expect(parsed.model.sizeNumber).toBe(45);
    expect(parsed.model.items.find((item) => item.id === 'default')?.material).toBe(
      'BLACK_STAINED_GLASS_PANE',
    );
    const head = parsed.model.items.find((item) => item.id === 'user_info')!;
    expect(head.material).toBe('PLAYER_HEAD;%PLAYER%');
    expect(itemSlots(head)).toEqual([3]);
    expect(itemSlotMode(head)).toBe('slot');
  });

  it('orders 的 options/order 模板槽位', () => {
    const parsed = parseMenuFile('menu/orders.yml', ORDERS);
    expect(parsed.model.options.find((option) => option.key === 'order-per-page')?.raw).toBe('5');
    expect(parsed.model.options[0]?.inferred).toBe('integer');
    const order = parsed.model.items.find((item) => item.id === 'order')!;
    expect(itemSlots(order)).toEqual([20]);
    expect(itemSlotMode(order)).toBe('slot');
  });

  it('internal_store 的 slots 多槽位顺序保留', () => {
    const parsed = parseMenuFile('menu/internal_store.yml', INTERNAL);
    const bar = parsed.model.items.find((item) => item.id === 'bar')!;
    expect(itemSlotMode(bar)).toBe('slots');
    expect(itemSlots(bar)).toEqual([46, 47, 48, 50, 51, 52, 53]);
  });

  it('focus 的自定义材质物品没有槽位也合法', () => {
    const parsed = parseMenuFile('menu/focus.yml', FOCUS);
    const custom = parsed.model.items.find((item) => item.id === 'expertise_zombie_loot_1')!;
    expect(custom.slots).toBeUndefined();
    expect(custom.slot).toBeUndefined();
    expect(itemSlotMode(custom)).toBe('none');
  });
});

describe('menu 编辑操作', () => {
  it('size、material、slot/slots 修改', () => {
    const parsed = parseMenuFile('menu/main.yml', MAIN);
    const doc = parsed.doc!;
    setSize(doc, 54);
    expect(setItemMaterial(doc, 'user_info', 'PLAYER_HEAD;%player%')).toBe(true);
    expect(setItemSlot(doc, 'user_info', 10)).toBe(true);
    expect(setItemSlots(doc, 'user_info', [10, 11, 12])).toBe(true);
    const reread = parseMenuFile('menu/main.yml', serializeMenu(doc));
    expect(reread.model.sizeNumber).toBe(54);
    const item = reread.model.items.find((entry) => entry.id === 'user_info')!;
    expect(item.material).toBe('PLAYER_HEAD;%player%');
    expect(item.slot).toBeUndefined();
    expect(itemSlots(item)).toEqual([10, 11, 12]);
    clearItemSlots(doc, 'user_info');
    expect(itemSlotMode(parseMenuFile('menu/main.yml', serializeMenu(doc)).model.items.find((entry) => entry.id === 'user_info')!)).toBe('none');
  });

  it('新增/复制/重命名/排序/删除物品保留未知字段', () => {
    const parsed = parseMenuFile('menu/main.yml', MAIN);
    const doc = parsed.doc!;
    expect(addItem(doc, 'new_item', { material: 'PAPER', slot: 13, custom_flag: true })).toBe(true);
    expect(addItem(doc, 'new_item', { material: 'PAPER' })).toBe(false);
    expect(renameItem(doc, 'new_item', 'renamed_item')).toBe(true);
    expect(renameItem(doc, 'renamed_item', 'user_info')).toBe(false);
    expect(duplicateItem(doc, 'renamed_item', 'copied_item')).toBe(true);
    expect(moveItem(doc, 0, 2)).toBe(true);
    expect(deleteItem(doc, 'copied_item')).toBe(true);
    const reread = parseMenuFile('menu/main.yml', serializeMenu(doc));
    expect(reread.model.items.some((item) => item.id === 'renamed_item')).toBe(true);
    expect(reread.model.items.some((item) => item.id === 'copied_item')).toBe(false);
    expect(reread.model.items.find((item) => item.id === 'renamed_item')?.extras[0]?.key).toBe(
      'custom_flag',
    );
  });

  it('options 新增/删除/类型推断', () => {
    const parsed = parseMenuFile('menu/orders.yml', ORDERS);
    const doc = parsed.doc!;
    expect(setOption(doc, 'custom-flag', true)).toBe(true);
    expect(setOption(doc, 'custom-num', 12)).toBe(true);
    expect(deleteOption(doc, 'custom-flag')).toBe(true);
    const reread = parseMenuFile('menu/orders.yml', serializeMenu(doc));
    expect(reread.model.options.find((entry) => entry.key === 'custom-num')?.inferred).toBe('integer');
    expect(optionValueFromInput('12')).toBe(12);
    expect(optionValueFromInput('true')).toBe(true);
    expect(optionValueFromInput('text')).toBe('text');
  });

  it('带引号的 slot 不参与实际槽位，slots 可回退', () => {
    const parsed = parseMenuFile(
      'menu/main.yml',
      MAIN.replace('slot: 3', 'slot: "3"').replace(
        'items:\n',
        'items:\n  fallback:\n    material: PAPER\n    slots:\n      - 30\n',
      ),
    );
    const quoted = parsed.model.items.find((item) => item.id === 'user_info')!;
    expect(quoted.slot?.kind).toBe('string');
    expect(itemSlots(quoted)).toEqual([]);
    const fallback = parsed.model.items.find((item) => item.id === 'fallback')!;
    expect(itemSlots(fallback)).toEqual([30]);
  });
});
