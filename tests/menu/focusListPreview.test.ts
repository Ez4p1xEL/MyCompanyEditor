import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import MenuEditor from '../../src/features/menu/MenuEditor.vue';
import { MENU_META, menuPath } from '../../src/features/menu/menuConstants';
import { itemSlots, parseMenuFile } from '../../src/features/menu/menuDoc';
import { setLocale } from '../../src/i18n';
import { useProjectStore } from '../../src/store/project';
import { fixtureText } from '../foundation/fixtures';

const FOCUS_LIST = 'menu/focus_list.yml';
const HAN = /[\u4e00-\u9fff]/;

function seedMenus(): void {
  const store = useProjectStore();
  store.importFiles(
    MENU_META.map((meta) => ({
      path: menuPath(meta.id),
      text: fixtureText(menuPath(meta.id)),
    })),
  );
}

function seedFixedFocus(paths: string[]): void {
  const store = useProjectStore();
  store.importFiles(
    paths.map((path) => ({
      path,
      text: fixtureText(path),
    })),
  );
}

function seedProject(): void {
  seedMenus();
  seedFixedFocus(['focus/none.yml', 'focus/mob.yml', 'focus/ore.yml']);
}

async function mountFocusList() {
  const wrapper = mount(MenuEditor, { attachTo: document.body });
  await flushPromises();
  await wrapper.find('[data-menu-id="focus_list"]').trigger('click');
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  setLocale('zh-CN', { persist: false, notify: false });
});

describe('focus_list automatic layout preview', () => {
  it('shows none/mob/ore at 20/21/22 without writing slots', async () => {
    seedProject();
    const wrapper = await mountFocusList();

    const slot20 = wrapper.find('[data-slot="20"]');
    const slot21 = wrapper.find('[data-slot="21"]');
    const slot22 = wrapper.find('[data-slot="22"]');
    expect(slot20.attributes('data-auto')).toBe('true');
    expect(slot21.attributes('data-auto')).toBe('true');
    expect(slot22.attributes('data-auto')).toBe('true');
    expect(slot20.text()).toContain('focus_none');
    expect(slot20.attributes('title')).toContain('PAPER');
    expect(slot21.text()).toContain('focus_mob');
    expect(slot21.attributes('title')).toContain('ZOMBIE_HEAD');
    expect(slot22.text()).toContain('focus_ore');
    expect(slot22.attributes('title')).toContain('DIAMOND_ORE');
    expect(wrapper.find('[data-focus-preview-slot="22"]').text()).toContain('DIAMOND_ORE');

    const store = useProjectStore();
    const parsed = parseMenuFile(FOCUS_LIST, store.files[FOCUS_LIST]!.text);
    expect(itemSlots(parsed.model.items.find((item) => item.id === 'focus_ore')!)).toEqual([]);
  });

  it('limits the automatic preview to the current focus-per-page value', async () => {
    seedMenus();
    seedFixedFocus(['focus/none.yml', 'focus/mob.yml', 'focus/ore.yml']);
    const store = useProjectStore();
    const limited = fixtureText(FOCUS_LIST).replace('focus-per-page: 5', 'focus-per-page: 2');
    store.upsertFile(FOCUS_LIST, limited);
    const wrapper = await mountFocusList();

    expect(wrapper.findAll('[data-auto="true"]')).toHaveLength(2);
    expect(wrapper.find('[data-slot="20"]').text()).toContain('focus_none');
    expect(wrapper.find('[data-slot="21"]').text()).toContain('focus_mob');
    expect(wrapper.find('[data-slot="22"]').attributes('data-auto')).toBeUndefined();
    expect(wrapper.find('[data-focus-preview-slot="22"]').exists()).toBe(false);

    const parsed = parseMenuFile(FOCUS_LIST, store.files[FOCUS_LIST]!.text);
    expect(itemSlots(parsed.model.items.find((item) => item.id === 'focus_ore')!)).toEqual([]);
    expect(store.files[FOCUS_LIST]!.text).toContain('focus-per-page: 2');
  });

  it('does not assign a real slot when the preview cell is clicked', async () => {
    seedProject();
    const wrapper = await mountFocusList();
    const store = useProjectStore();
    const before = store.files[FOCUS_LIST]!.text;

    await wrapper.find('[data-menu-item="focus_ore"]').trigger('click');
    await wrapper.find('[data-slot="22"]').trigger('click');
    await flushPromises();

    expect(store.files[FOCUS_LIST]!.text).toBe(before);
    const parsed = parseMenuFile(FOCUS_LIST, store.files[FOCUS_LIST]!.text);
    expect(itemSlots(parsed.model.items.find((item) => item.id === 'focus_ore')!)).toEqual([]);
  });

  it('only previews fixed focus files that are actually loaded, in none→mob→ore order', async () => {
    seedMenus();
    seedFixedFocus(['focus/mob.yml', 'focus/ore.yml']);
    const wrapper = await mountFocusList();

    expect(wrapper.find('[data-slot="20"]').attributes('data-auto')).toBe('true');
    expect(wrapper.find('[data-slot="20"]').text()).toContain('focus_mob');
    expect(wrapper.find('[data-slot="21"]').attributes('data-auto')).toBe('true');
    expect(wrapper.find('[data-slot="21"]').text()).toContain('focus_ore');
    expect(wrapper.find('[data-slot="22"]').attributes('data-auto')).toBeUndefined();
  });

  it('shows only the loaded file and keeps later slots free when one focus file is missing', async () => {
    seedMenus();
    seedFixedFocus(['focus/none.yml']);
    const wrapper = await mountFocusList();

    expect(wrapper.find('[data-slot="20"]').attributes('data-auto')).toBe('true');
    expect(wrapper.find('[data-slot="20"]').text()).toContain('focus_none');
    expect(wrapper.find('[data-slot="21"]').attributes('data-auto')).toBeUndefined();
    expect(wrapper.find('[data-slot="22"]').attributes('data-auto')).toBeUndefined();
  });

  it('shows the empty note when no fixed focus file or no focus template is available', async () => {
    seedMenus();
    let wrapper = await mountFocusList();
    expect(wrapper.findAll('[data-auto="true"]')).toHaveLength(0);
    expect(wrapper.find('[data-focus-preview]').text()).toContain('focus 模板槽位');

    const noTemplate = `size: 45
items:
  default:
    material: BLACK_STAINED_GLASS_PANE
  focus_none:
    material: PAPER
  focus_mob:
    material: ZOMBIE_HEAD
  focus_ore:
    material: DIAMOND_ORE
`;
    useProjectStore().upsertFile(FOCUS_LIST, noTemplate);
    seedFixedFocus(['focus/none.yml', 'focus/mob.yml', 'focus/ore.yml']);
    wrapper = await mountFocusList();
    expect(wrapper.findAll('[data-auto="true"]')).toHaveLength(0);
    expect(wrapper.find('[data-focus-preview]').text()).toContain('focus 模板槽位');
  });

  it('keeps focus template name/lore and only takes material from the override', async () => {
    seedMenus();
    seedFixedFocus(['focus/none.yml', 'focus/mob.yml', 'focus/ore.yml']);
    const custom = `size: 45
items:
  default:
    material: BLACK_STAINED_GLASS_PANE
  focus:
    material: ENCHANTED_BOOK
    slot: 20
    name: "Template Name"
    lore:
      - "Template Lore"
  focus_none:
    material: PAPER
  focus_mob:
    material: ZOMBIE_HEAD
  focus_ore:
    material: DIAMOND_ORE
    name: "Override Name"
    lore:
      - "Override Lore"
`;
    useProjectStore().upsertFile(FOCUS_LIST, custom);
    const wrapper = await mountFocusList();
    const preview = (wrapper.vm as any).$.setupState.focusPreview as Array<{
      id: string;
      item: { material: string; extras: Array<{ key: string; preview: string }> };
    }>;
    const ore = preview.find((entry) => entry.id === 'focus_ore')!;
    expect(ore.item.material).toBe('DIAMOND_ORE');
    const extras = ore.item.extras.map((extra) => `${extra.key}=${extra.preview}`).join('\n');
    expect(extras).toContain('Template Name');
    expect(extras).toContain('Template Lore');
    expect(extras).not.toContain('Override Name');
    expect(extras).not.toContain('Override Lore');
  });

  it('renders the automatic layout note in English without Chinese', async () => {
    seedProject();
    setLocale('en', { persist: false, notify: false });
    const wrapper = await mountFocusList();
    const note = wrapper.find('[data-focus-preview]');
    expect(note.exists()).toBe(true);
    expect(note.text()).not.toMatch(HAN);
    expect(note.text()).toContain('focus_ore');
    expect(note.text()).toContain('material');
  });
});
