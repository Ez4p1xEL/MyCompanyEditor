import { describe, expect, it } from 'vitest';
import {
  MENU_IDS,
  canonicalProjectPath,
  detectFileKind,
  fileKindLabel,
  normalizeProjectPath,
} from '../../src/core/fileTypes';
import { fixtureText } from './fixtures';

describe('文件类型识别', () => {
  it('按标准路径识别四类文件', () => {
    expect(detectFileKind('orders.yml', '')).toBe('orders');
    expect(detectFileKind('menu/main.yml', '')).toBe('menu');
    expect(detectFileKind('focus/none.yml', '')).toBe('focus');
    expect(detectFileKind('focus.yml', '')).toBe('focus-tree');
    expect(detectFileKind('menus.yml', '')).toBe('menus-config');
  });

  it('文件名不规范时按内容识别', () => {
    expect(detectFileKind('copy.yml', fixtureText('orders.yml'))).toBe('orders');
    expect(detectFileKind('copy.yml', fixtureText('menu/orders.yml'))).toBe('menu');
    expect(detectFileKind('copy.yml', fixtureText('focus/mob.yml'))).toBe('focus');
    expect(detectFileKind('copy.yml', fixtureText('focus.yml'))).toBe('focus-tree');
    expect(detectFileKind('copy.yml', fixtureText('menus.yml'))).toBe('menus-config');
    expect(detectFileKind('copy.yml', 'hello: world')).toBe('unknown');

    // 根目录同名文件与菜单文件重名时，用内容判定真正类型。
    expect(detectFileKind('orders.yml', fixtureText('menu/orders.yml'))).toBe('menu');
    expect(detectFileKind('focus.yml', fixtureText('menu/focus.yml'))).toBe('menu');
  });

  it('把单个文件映射回插件标准路径', () => {
    expect(canonicalProjectPath('my-orders.yml', 'orders')).toBe('orders.yml');
    expect(canonicalProjectPath('main.yml', 'menu')).toBe('menu/main.yml');
    expect(canonicalProjectPath('orders.yml', 'menu')).toBe('menu/orders.yml');
    expect(canonicalProjectPath('mob.yml', 'focus')).toBe('focus/mob.yml');
    expect(canonicalProjectPath('focus.yml', 'focus-tree')).toBe('focus.yml');
    expect(canonicalProjectPath('menus.yml', 'menus-config')).toBe('menus.yml');
    expect(canonicalProjectPath('notes.yml', 'unknown')).toBe('notes.yml');
  });

  it('路径归一化跨平台', () => {
    expect(normalizeProjectPath('.\\menu\\main.yml')).toBe('menu/main.yml');
    expect(normalizeProjectPath('./focus/none.yml')).toBe('focus/none.yml');
    expect(normalizeProjectPath('  orders.yml  ')).toBe('orders.yml');
  });

  it('18 个菜单 id 固定', () => {
    expect(MENU_IDS).toHaveLength(18);
    expect(MENU_IDS).toContain('main');
    expect(MENU_IDS).toContain('confirmation');
    expect(MENU_IDS).toContain('position_permission_list');
  });

  it('提供中文类型名', () => {
    expect(fileKindLabel('orders')).toBe('订单');
    expect(fileKindLabel('focus')).toBe('专精');
    expect(fileKindLabel('menu')).toBe('菜单');
    expect(fileKindLabel('unknown')).toBe('未知文件');
  });
});
