import { beforeEach, describe, expect, it } from 'vitest';
import { ensureMenuValidatorRegistered, validateMenuText } from '../../src/features/menu/menuValidation';
import { MENU_META } from '../../src/features/menu/menuConstants';
import { parseMenuFile, serializeMenu } from '../../src/features/menu/menuDoc';
import { fixtureText } from '../foundation/fixtures';

const MAIN = fixtureText('menu/main.yml');
const ORDERS = fixtureText('menu/orders.yml');

function issues(text: string, path = 'menu/main.yml') {
  return validateMenuText(text, path);
}
function codes(text: string, path = 'menu/main.yml') {
  return issues(text, path).map((issue) => issue.code);
}
function blocking(text: string, path = 'menu/main.yml') {
  return issues(text, path).filter((issue) => issue.blocking || issue.severity === 'error').length;
}

function minimal(overrides: Partial<{ size: string; items: string; options: string }> = {}): string {
  return `size: ${overrides.size ?? '27'}
${overrides.options ?? ''}
items:
${overrides.items ?? `  default:
    material: BLACK_STAINED_GLASS_PANE
  button:
    material: PAPER
    slot: 13
`}`;
}

beforeEach(() => {
  ensureMenuValidatorRegistered();
});

describe('menu 基础规则', () => {
  it('18 个 fixture 无阻断错误', () => {
    for (const meta of MENU_META) {
      const text = fixtureText(`menu/${meta.id}.yml`);
      expect(blocking(text, `menu/${meta.id}.yml`), meta.id).toBe(0);
    }
  });

  it('size 必须 9..54 且为 9 的倍数', () => {
    expect(codes(minimal({ size: '0' }))).toContain('MEN-02');
    expect(codes(minimal({ size: '55' }))).toContain('MEN-02');
    expect(codes(minimal({ size: '10' }))).toContain('MEN-02');
    expect(codes(minimal({ size: '"27"' }))).toContain('MEN-02');
    expect(codes(minimal({ size: '27' }))).not.toContain('MEN-02');
  });

  it('items/material 缺失阻断，未知菜单 id 提示', () => {
    expect(codes('size: 27\n')).toContain('MEN-03');
    const missingMaterial = minimal({
      items: `  default:
    material: AIR
  broken:
    slot: 1
`,
    });
    expect(codes(missingMaterial)).toContain('MEN-04');
    expect(codes(MAIN, 'menu/farming.yml')).toContain('MEN-01');
  });

  it('槽位越界、重复、带引号 slot、slot+slots', () => {
    const outOfBounds = minimal({
      items: `  default:
    material: AIR
  a:
    material: PAPER
    slot: 27
`,
    });
    expect(codes(outOfBounds)).toContain('MEN-09');
    const duplicate = minimal({
      items: `  default:
    material: AIR
  a:
    material: PAPER
    slot: 1
  b:
    material: STONE
    slot: 1
`,
    });
    expect(codes(duplicate)).toContain('MEN-10');
    const quoted = MAIN.replace('slot: 3', 'slot: "3"');
    expect(codes(quoted)).toContain('MEN-12');
    const both = minimal({
      items: `  default:
    material: AIR
  a:
    material: PAPER
    slot: 1
    slots:
      - 2
`,
    });
    expect(codes(both)).toContain('MEN-11');
  });

  it('material 特殊值与非法值', () => {
    expect(codes(MAIN)).toContain('MEN-07');
    expect(blocking(MAIN)).toBe(0);
    const lower = minimal({
      items: `  default:
    material: AIR
  head:
    material: player_head;%player%
    slot: 1
`,
    });
    expect(codes(lower)).toContain('MEN-06');
    const namespaced = minimal({
      items: `  default:
    material: AIR
  paper:
    material: minecraft:paper
    slot: 1
`,
    });
    expect(codes(namespaced)).not.toContain('MEN-05');
    const invalid = minimal({
      items: `  default:
    material: AIR
  bad:
    material: NOT_A_MATERIAL
    slot: 1
`,
    });
    expect(codes(invalid)).toContain('MEN-05');
    expect(blocking(invalid)).toBeGreaterThan(0);
  });

  it('options 显式空值阻断，列表/map 警告，未知键保留', () => {
    const empty = minimal({ options: 'options:\n  custom:\n' });
    expect(codes(empty)).toContain('MEN-18');
    expect(blocking(empty)).toBeGreaterThan(0);
    const list = minimal({ options: 'options:\n  custom:\n    - 1\n' });
    expect(codes(list)).toContain('MEN-18');
    expect(blocking(list)).toBe(0);
    const parsed = parseMenuFile('menu/main.yml', MAIN.replace('items:', 'options:\n  custom_unknown: 7\nitems:'));
    expect(parsed.model.options.find((option) => option.key === 'custom_unknown')?.raw).toBe('7');
    expect(serializeMenu(parsed.doc!)).toContain('custom_unknown');
  });
});

describe('列表模板与 orders 约束', () => {
  it('orders 缺模板/模板无槽位/列号 >4', () => {
    const missing = minimal({ size: '45' });
    expect(codes(missing, 'menu/orders.yml')).toContain('LST-01');
    const noSlot = minimal({
      size: '45',
      items: `  default:
    material: AIR
  order:
    material: PAPER
  back_to_main:
    material: NETHER_STAR
    slot: 36
`,
    });
    expect(codes(noSlot, 'menu/orders.yml')).toContain('LST-01');
    const badColumn = ORDERS.replace('slot: 20', 'slot: 23');
    expect(codes(badColumn, 'menu/orders.yml')).toContain('LST-04');
  });

  it('order-per-page 必须 ≥1，越界/冲突被校验', () => {
    const zero = ORDERS.replace('order-per-page: 5', 'order-per-page: 0');
    expect(codes(zero, 'menu/orders.yml')).toContain('PAG-01');
    const negative = ORDERS.replace('order-per-page: 5', 'order-per-page: -1');
    expect(codes(negative, 'menu/orders.yml')).toContain('PAG-01');
    const huge = ORDERS.replace('order-per-page: 5', 'order-per-page: 30');
    expect(codes(huge, 'menu/orders.yml')).toContain('LST-05');
    expect(blocking(huge, 'menu/orders.yml')).toBeGreaterThan(0);
    const pageButton = ORDERS.replace('order-per-page: 5', 'order-per-page: 12');
    const pageIssues = issues(pageButton, 'menu/orders.yml');
    expect(pageIssues.some((issue) => issue.code === 'LST-05' && issue.severity === 'warning')).toBe(true);
    const fixedConflict = ORDERS.replace('slot: 36', 'slot: 22');
    expect(codes(fixedConflict, 'menu/orders.yml')).toContain('LST-05');
  });

  it('confirmation 必须同时有 confirm/cancel', () => {
    const text = `size: 27\nitems:\n  default:\n    material: AIR\n  confirm:\n    material: LIME_WOOL\n    slot: 11\n`;
    expect(codes(text, 'menu/confirmation.yml')).toContain('LST-06');
  });

  it('language 字段提示不写入 menu；未知顶层保留', () => {
    const text = minimal({
      items: `  default:
    material: AIR
  a:
    material: PAPER
    slot: 1
    display_name: 'Should be in lang'
  custom_top: keep
`,
    });
    expect(codes(text)).toContain('LANG-01');
    const withTop = minimal().replace('items:', 'custom_top: keep\nitems:');
    expect(codes(withTop)).toContain('GEN-03');
  });
});
