import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import ProjectDashboard from '../../src/features/project/ProjectDashboard.vue';
import {
  ACTIVATION_ROWS,
  DEPLOYMENT_STEPS,
  FOCUS_LIMITS,
  HELP_LABELS,
  MENU_LIMITS,
  QUEST_TYPES,
} from '../../src/features/project/help';
import enHelpMessages from '../../src/i18n/locales/en/help';
import { checkCatalogAlignment, setLocale } from '../../src/i18n';
import { conditionTypeMeta } from '../../src/features/focus/catalog/conditionTypes';
import { useProjectStore } from '../../src/store/project';
import { fixtureText } from '../foundation/fixtures';

const HAN = /[\u4e00-\u9fff]/;

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  setLocale('zh-CN', { persist: false, notify: false });
  document.body.innerHTML = '';
});

function helpTexts(): string[] {
  return [
    ...Object.values(HELP_LABELS),
    ...QUEST_TYPES.map((quest) => quest.label),
    ...FOCUS_LIMITS.map((line) => line.text),
    ...MENU_LIMITS.map((line) => line.text),
    ...ACTIVATION_ROWS.flatMap((row) => [row.mode, row.detail]),
    ...DEPLOYMENT_STEPS.map((step) => step.text),
  ];
}

describe('help i18n', () => {
  it('help 目录对齐，en 所有帮助文案无中文', () => {
    expect(checkCatalogAlignment('help')).toEqual({ missing: [], extra: [] });
    expect(Object.values(enHelpMessages).every((message) => !HAN.test(message))).toBe(true);
    setLocale('en', { persist: false });
    for (const text of helpTexts()) expect(text).not.toMatch(HAN);
    expect(HELP_LABELS.questReward).toBe('Orders: quest / reward');
    expect(HELP_LABELS.focusLimits).toBe('Focus limits');
    expect(HELP_LABELS.menuLanguage).toBe('Chest Menu and language files');
    expect(helpTexts().join('\n')).toContain('Display name');
    expect(helpTexts().join('\n')).not.toContain('item name');
    expect(helpTexts().join('\n')).toMatch(/Chest Menus?/);
    expect(helpTexts().join('\n')).not.toContain('Chest menus and');
    expect(FOCUS_LIMITS[2]!.text).toContain('generate-default-config=true');
    expect(FOCUS_LIMITS[2]!.text).toContain('label/description');
    expect(HELP_LABELS.activation).toBe('Activation');
    expect(HELP_LABELS.deployment).toBe('Deployment summary');
    expect(QUEST_TYPES[0]!.label).toBe('Break block');
    expect(ACTIVATION_ROWS[0]!.mode).toBe('Server restart required after changes');
    expect(DEPLOYMENT_STEPS[0]!.text).toContain('GitHub');
  });

  it('中文帮助保持原语义，代码/路径/Minecraft 枚举不翻译', () => {
    setLocale('zh-CN', { persist: false });
    expect(HELP_LABELS.questReward).toBe('订单 quest / reward');
    expect(HELP_LABELS.focusLimits).toBe('专精限制');
    expect(QUEST_TYPES[0]!.label).toBe('破坏方块');
    expect(FOCUS_LIMITS[0]!.text).toContain('focus/none.yml');
    expect(MENU_LIMITS[1]!.text).toContain('0 ≤ slot < size');
    expect(ACTIVATION_ROWS[0]!.mode).toBe('修改后需重启服务器');
    expect(DEPLOYMENT_STEPS[0]!.text).toContain('dist/node_modules');
    setLocale('en', { persist: false });
    expect(FOCUS_LIMITS[0]!.text).toContain('focus/none.yml');
    expect(MENU_LIMITS[1]!.text).toContain('0 ≤ slot < size');
    expect(ACTIVATION_ROWS[0]!.file).toBe('orders.yml');
    expect(DEPLOYMENT_STEPS[0]!.text).toContain('dist/node_modules');
    expect(DEPLOYMENT_STEPS[4]!.text).toContain('DNS');
  });

  it('company_log 提示同时包含两个计数日志与大小写规则', () => {
    setLocale('zh-CN', { persist: false });
    const zh = conditionTypeMeta('company_log')!.hint;
    expect(zh).toContain('mob_kill_count,ENTITY');
    expect(zh).toContain('block_break_count,MATERIAL');
    expect(zh).toContain('大写');
    expect(zh).toContain('不会累加');

    setLocale('en', { persist: false });
    const en = conditionTypeMeta('company_log')!.hint;
    expect(en).not.toMatch(HAN);
    expect(en).toContain('mob_kill_count,ENTITY');
    expect(en).toContain('block_break_count,MATERIAL');
    expect(en).toContain('uppercase');
    expect(en).toContain('do not aggregate into other blocks');
  });

  it('ProjectDashboard en 帮助面板始终渲染且无中文，切 zh 恢复', async () => {
    setLocale('en', { persist: false });
    useProjectStore().importFiles([{ path: 'orders.yml', text: fixtureText('orders.yml') }]);
    const wrapper = mount(ProjectDashboard, { attachTo: document.body });
    await flushPromises();
    const panel = wrapper.find('[data-testid="project-help"]');
    expect(panel.exists()).toBe(true);
    expect(wrapper.find('.help-grid').exists()).toBe(true);
    const english = panel.text();
    expect(english).not.toMatch(HAN);
    expect(english).toContain('Orders: quest / reward');
    expect(english).toContain('Break block');
    expect(english).toContain('Focus limits');
    expect(english).toContain('Chest Menu and language files');
    expect(english).toContain('Activation');
    expect(english).toContain('Deployment summary');
    expect(english).toContain('item;<MATERIAL>;<amount>');
    expect(english).toContain('focus/none.yml');

    setLocale('zh-CN', { persist: false });
    await flushPromises();
    const chinese = wrapper.find('[data-testid="project-help"]').text();
    expect(chinese).toMatch(HAN);
    expect(chinese).toContain('订单 quest / reward');
    expect(chinese).toContain('专精限制');
    expect(chinese).toContain('部署摘要');
    wrapper.unmount();
  });
});
