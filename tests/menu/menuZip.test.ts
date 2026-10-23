import { describe, expect, it } from 'vitest';
import { buildZip } from '../../src/features/menu/menuZip';

const decoder = new TextDecoder();

describe('menu ZIP 打包', () => {
  it('生成 store 模式 ZIP，包含文件目录与内容', () => {
    const data = buildZip([
      { name: 'menu/main.yml', text: 'size: 45\n' },
      { name: 'menu/orders.yml', text: 'size: 45\n' },
    ]);
    expect(data.length).toBeGreaterThan(100);
    // 本地文件头 / 中央目录 / EOCD 签名。
    expect(Array.from(data.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const text = decoder.decode(data);
    expect(text).toContain('menu/main.yml');
    expect(text).toContain('menu/orders.yml');
    expect(text).toContain('size: 45');
    expect(data[data.length - 22]).toBe(0x50);
    expect(data[data.length - 21]).toBe(0x4b);
    expect(data[data.length - 20]).toBe(0x05);
    expect(data[data.length - 19]).toBe(0x06);
  });

  it('空条目录也是合法 ZIP', () => {
    const data = buildZip([]);
    expect(data.length).toBe(22);
    expect(Array.from(data.slice(0, 4))).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });
});
