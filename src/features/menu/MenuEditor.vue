<script setup lang="ts">
import { menuText as tx } from './menuConstants';
import { getLocale } from '../../i18n';
import { computed, ref, shallowRef, watch } from 'vue';
import type { Document } from 'yaml';
import { downloadTextFile } from '../../core/download';
import { prepareExport } from '../../core/export';
import { pushToast } from '../../core/toast';
import { isBlockingIssue } from '../../core/validation';
import { useProjectStore } from '../../store/project';
import LanguagePanel from './LanguagePanel.vue';
import MenuIcon from './MenuIcon.vue';
import {
  MENU_CATEGORIES,
  menuCategoryText,
  MENU_META,
  MATERIAL_OPTIONS,
  PLAYER_HEAD_PRESETS,
  SIZE_OPTIONS,
  checkMaterial,
  isCustomMaterialItem,
  isKnownMenuId,
  isValidMenuSize,
  menuIdFromPath,
  menuMeta,
  menuPath,
  usesUppercasePlayerPlaceholder,
} from './menuConstants';
import {
  addItem,
  buildMenuModel,
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
  renameOption,
  serializeMenu,
  setItemMaterial,
  setItemSlot,
  setItemSlots,
  setOption,
  setSize,
  type MenuFileModel,
  type MenuItemModel,
} from './menuDoc';
import { ensureMenuValidatorRegistered, type MenuIssue } from './menuValidation';
import { downloadZip, type ZipEntry } from './menuZip';

ensureMenuValidatorRegistered();

const store = useProjectStore();

function sizeOptionLabel(size: number): string {
  const rows = size / 9;
  if (getLocale() === 'en') return `${size} (${rows} ${rows === 1 ? 'row' : 'rows'})`;
  return `${size}（${rows} 行）`;
}
const doc = shallowRef<Document | null>(null);
const model = ref<MenuFileModel>(buildMenuModel(null, '', menuPath('main')));
const selectedId = ref<string | null>(null);
const selectedItemId = ref<string | null>(null);
const selectedSlot = ref<number | null>(null);
const search = ref('');
const newItemId = ref('');
const newOptionKey = ref('');
const showIssues = ref(false);
const importInput = ref<HTMLInputElement | null>(null);
const lastText = ref('');
const dragState = ref<{ itemId: string; sourceSlot: number | null } | null>(null);

interface Cell {
  slot: number;
  items: MenuItemModel[];
}

const menuFiles = computed(() =>
  store.fileList
    .filter((file) => file.kind === 'menu' && isKnownMenuId(menuIdFromPath(file.path)))
    .slice()
    .sort((left, right) => {
      const leftIndex = MENU_META.findIndex((meta) => meta.id === menuIdFromPath(left.path));
      const rightIndex = MENU_META.findIndex((meta) => meta.id === menuIdFromPath(right.path));
      return leftIndex - rightIndex;
    }),
);
const presentIds = computed(() => new Set(menuFiles.value.map((file) => menuIdFromPath(file.path))));
const file = computed(() => (selectedId.value ? (store.files[menuPath(selectedId.value)] ?? null) : null));
const meta = computed(() => (selectedId.value ? menuMeta(selectedId.value) : undefined));
const issues = computed<MenuIssue[]>(() => (file.value?.issues ?? []) as MenuIssue[]);
const blockingIssues = computed(() => issues.value.filter(isBlockingIssue));
const allBlockingIssues = computed(() =>
  menuFiles.value.flatMap((entry) => entry.issues.filter(isBlockingIssue)),
);
const selectedItem = computed<MenuItemModel | null>(
  () => model.value.items.find((item) => item.id === selectedItemId.value) ?? null,
);
const defaultItem = computed(() => model.value.items.find((item) => item.id === 'default') ?? null);
const previewSize = computed(() => {
  const size = model.value.sizeNumber;
  return size && isValidMenuSize(size) ? size : 27;
});
const rows = computed(() => previewSize.value / 9);
const gridSizeInvalid = computed(
  () => !model.value.sizeNumber || !isValidMenuSize(model.value.sizeNumber),
);
const occupancy = computed(() => {
  const map = new Map<number, MenuItemModel[]>();
  for (const item of model.value.items) {
    if (item.id === 'default') continue;
    for (const slot of itemSlots(item)) {
      const list = map.get(slot) ?? [];
      list.push(item);
      map.set(slot, list);
    }
  }
  return map;
});
const cells = computed<Cell[]>(() =>
  Array.from({ length: previewSize.value }, (_, slot) => ({
    slot,
    items: occupancy.value.get(slot) ?? [],
  })),
);
const selectedItemSlots = computed(() => (selectedItem.value ? itemSlots(selectedItem.value) : []));
const filteredItems = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) return model.value.items;
  return model.value.items.filter(
    (item) => item.id.toLowerCase().includes(query) || item.material.toLowerCase().includes(query),
  );
});
const defaultFill = computed(() => {
  const material = defaultItem.value?.material ?? '';
  return material && material.toUpperCase() !== 'AIR';
});
const pageOption = computed(() => {
  const info = meta.value;
  if (!info?.pageOption) return null;
  const option = model.value.options.find((entry) => entry.key === info.pageOption!.key);
  const value = option
    ? option.kind === 'number'
      ? Number(option.raw)
      : option.inferred === 'integer'
        ? Number(option.raw)
        : Number.NaN
    : info.pageOption.defaultValue;
  return { key: info.pageOption.key, defaultValue: info.pageOption.defaultValue, value, option };
});
const yamlPreview = computed(() => {
  // 依赖 model：每次 persist 后重建模型，确保预览随编辑实时更新。
  void model.value;
  if (!doc.value) return '';
  try {
    return serializeMenu(doc.value);
  } catch (error) {
    return tx('预览生成失败：{error}', { error: error instanceof Error ? error.message : String(error) });
  }
});

const categoryGroups = computed(() =>
  MENU_CATEGORIES.map((category) => ({
    category,
    items: MENU_META.filter((entry) => entry.category === category),
  })),
);

function loadSelected(): void {
  if (!selectedId.value) {
    doc.value = null;
    model.value = buildMenuModel(null, '', menuPath('main'));
    selectedItemId.value = null;
    lastText.value = '';
    return;
  }
  const current = store.files[menuPath(selectedId.value)];
  if (!current) {
    doc.value = null;
    model.value = buildMenuModel(null, '', menuPath(selectedId.value));
    selectedItemId.value = null;
    lastText.value = '';
    return;
  }
  const parsed = parseMenuFile(current.path, current.text);
  doc.value = parsed.doc;
  model.value = parsed.model;
  lastText.value = current.text;
  selectedItemId.value = parsed.model.items.find((item) => item.id !== 'default')?.id ?? null;
  selectedSlot.value = null;
}

function ensureSelection(): void {
  const ids = MENU_META.map((entry) => entry.id).filter((id) => presentIds.value.has(id));
  if (selectedId.value && ids.includes(selectedId.value)) return;
  selectedId.value = ids[0] ?? null;
}

function persist(): void {
  if (!doc.value || !selectedId.value) return;
  const text = serializeMenu(doc.value);
  lastText.value = text;
  store.upsertFile(menuPath(selectedId.value), text, 'menu');
  model.value = buildMenuModel(doc.value, text, menuPath(selectedId.value));
  if (
    selectedItemId.value &&
    !model.value.items.some((item) => item.id === selectedItemId.value)
  ) {
    selectedItemId.value = model.value.items.find((item) => item.id !== 'default')?.id ?? null;
  }
}

function triggerImport(): void {
  importInput.value?.click();
}

async function onImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (files.length === 0) return;
  const entries: Array<{ id: string; text: string }> = [];
  const unknown: string[] = [];
  for (const uploaded of files) {
    const id = uploaded.name.split(/[\\/]/).pop()?.replace(/\.ya?ml$/i, '') ?? '';
    if (!isKnownMenuId(id)) {
      unknown.push(uploaded.name);
      continue;
    }
    entries.push({ id, text: await uploaded.text() });
  }
  if (unknown.length > 0) {
    pushToast(tx('已跳过 {count} 个未知菜单 id：{ids}；插件不会加载', { count: unknown.length, ids: unknown.join(', ') }), 'warning');
  }
  if (entries.length === 0) return;
  const existing = entries.filter((entry) => store.files[menuPath(entry.id)]);
  if (existing.length > 0 && !window.confirm(tx('将替换 {count} 个已有菜单文件，继续？', { count: existing.length }))) return;
  for (const entry of entries) {
    store.upsertFile(menuPath(entry.id), entry.text, 'menu');
  }
  selectedId.value = entries[entries.length - 1]!.id;
  selectedItemId.value = null;
  pushToast(tx('已导入 {count} 个菜单文件', { count: entries.length }), 'success');
}

function chooseMenu(id: string): void {
  selectedId.value = id;
  selectedItemId.value = null;
  selectedSlot.value = null;
}

function setSizeValue(event: Event): void {
  if (!doc.value) return;
  const value = Number((event.target as HTMLSelectElement).value);
  if (!Number.isInteger(value)) return;
  setSize(doc.value, value);
  persist();
}

function selectItem(id: string): void {
  selectedItemId.value = id;
  selectedSlot.value = null;
}

function firstFreeSlot(): number | null {
  for (let slot = 0; slot < previewSize.value; slot += 1) {
    if (!occupancy.value.has(slot)) return slot;
  }
  return null;
}

function assignItemToSlot(item: MenuItemModel, slot: number, options: { copy?: boolean; fromSlot?: number | null } = {}): void {
  if (!doc.value) return;
  if (item.id === 'default') {
    pushToast(tx('default 是空槽填充物，不占用具体槽位'), 'info');
    return;
  }
  const mode = itemSlotMode(item);
  const fromSlot = options.fromSlot ?? null;
  if (fromSlot !== null) {
    if (mode === 'slots') {
      const current = itemSlots(item);
      const next = options.copy ? [...current] : current.filter((entry) => entry !== fromSlot);
      if (!next.includes(slot)) next.push(slot);
      setItemSlots(doc.value, item.id, next);
    } else if (mode === 'slot') {
      if (options.copy) setItemSlots(doc.value, item.id, [fromSlot, slot].filter((value, index, array) => array.indexOf(value) === index));
      else setItemSlot(doc.value, item.id, slot);
    } else {
      setItemSlot(doc.value, item.id, slot);
    }
  } else if (mode === 'slots') {
    const current = itemSlots(item);
    if (!current.includes(slot)) setItemSlots(doc.value, item.id, [...current, slot]);
  } else {
    setItemSlot(doc.value, item.id, slot);
  }
  persist();
  selectedItemId.value = item.id;
  selectedSlot.value = slot;
}

function onSlotClick(slot: number): void {
  selectedSlot.value = slot;
  const current = selectedItem.value;
  if (current && current.id !== 'default') {
    assignItemToSlot(current, slot);
    return;
  }
  const occupant = occupancy.value.get(slot)?.[0];
  if (occupant) selectItem(occupant.id);
}

function onDragStart(item: MenuItemModel, sourceSlot: number | null, event: DragEvent): void {
  dragState.value = { itemId: item.id, sourceSlot };
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData('text/plain', `menu-item:${item.id}:${sourceSlot ?? ''}`);
  }
}

function onDrop(slot: number, event: DragEvent): void {
  event.preventDefault();
  let itemId = dragState.value?.itemId ?? '';
  let sourceSlot = dragState.value?.sourceSlot ?? null;
  const payload = event.dataTransfer?.getData('text/plain') ?? '';
  if (payload.startsWith('menu-item:')) {
    const [, id, rawSlot] = payload.split(':');
    itemId = id ?? itemId;
    sourceSlot = rawSlot ? Number(rawSlot) : null;
  }
  const item = model.value.items.find((entry) => entry.id === itemId);
  if (item) {
    assignItemToSlot(item, slot, {
      copy: event.shiftKey || event.ctrlKey || event.metaKey || event.altKey,
      fromSlot: sourceSlot,
    });
  }
  dragState.value = null;
}

function onDragOver(event: DragEvent): void {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

function addNewItem(): void {
  if (!doc.value) return;
  const id = newItemId.value.trim();
  if (!id) {
    pushToast(tx('物品 id 不能为空'), 'error');
    return;
  }
  if (!/^[A-Za-z0-9_]+$/.test(id)) {
    pushToast(tx('物品 id 建议只使用字母、数字、下划线'), 'error');
    return;
  }
  if (id === 'default') {
    pushToast(tx('default 已保留为背景填充物'), 'error');
    return;
  }
  if (model.value.items.some((item) => item.id === id)) {
    pushToast(tx('物品 “{id}” 已存在', { id }), 'error');
    return;
  }
  const slot = firstFreeSlot();
  const plain: Record<string, unknown> = { material: 'PAPER' };
  if (slot !== null) plain.slot = slot;
  if (!addItem(doc.value, id, plain)) {
    pushToast(tx('新增失败：items 结构异常'), 'error');
    return;
  }
  newItemId.value = '';
  persist();
  selectedItemId.value = id;
  pushToast(tx('已新增物品 {id}', { id }), 'success');
}

function duplicateSelectedItem(): void {
  const item = selectedItem.value;
  if (!item || !doc.value) return;
  let index = 2;
  let id = `${item.id}_copy`;
  while (model.value.items.some((entry) => entry.id === id)) {
    id = `${item.id}_copy${index}`;
    index += 1;
  }
  if (!duplicateItem(doc.value, item.id, id)) return;
  persist();
  selectedItemId.value = id;
  pushToast(tx('已复制为 {id}', { id }), 'success');
}

function removeSelectedItem(): void {
  const item = selectedItem.value;
  if (!item || !doc.value) return;
  const required = meta.value?.templates.includes(item.id) || item.id === 'default';
  const message = required
    ? tx('“{id}” 是菜单关键物品（模板/default），删除后可能导致菜单打不开或无背景。确定删除？', { id: item.id })
    : tx('确定删除物品 “{id}”？', { id: item.id });
  if (!window.confirm(message)) return;
  const index = model.value.items.findIndex((entry) => entry.id === item.id);
  if (!deleteItem(doc.value, item.id)) return;
  selectedItemId.value = null;
  persist();
  selectedItemId.value =
    model.value.items[Math.min(index, model.value.items.length - 1)]?.id ?? null;
}

function moveSelectedItem(direction: -1 | 1): void {
  const item = selectedItem.value;
  if (!item || !doc.value) return;
  const from = model.value.items.findIndex((entry) => entry.id === item.id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= model.value.items.length) return;
  if (!moveItem(doc.value, from, to)) return;
  persist();
}

function renameSelectedItem(event: Event): void {
  const item = selectedItem.value;
  if (!item || !doc.value) return;
  const input = event.target as HTMLInputElement;
  const next = input.value.trim();
  if (next === item.id) return;
  if (!next || !/^[A-Za-z0-9_]+$/.test(next)) {
    pushToast(tx('物品 id 只能包含字母、数字、下划线'), 'error');
    input.value = item.id;
    return;
  }
  if (model.value.items.some((entry) => entry.id === next)) {
    pushToast(tx('物品 “{id}” 已存在', { id: next }), 'error');
    input.value = item.id;
    return;
  }
  if (!renameItem(doc.value, item.id, next)) {
    input.value = item.id;
    return;
  }
  selectedItemId.value = next;
  persist();
}

function setMaterial(event: Event): void {
  const item = selectedItem.value;
  if (!item || !doc.value) return;
  const material = (event.target as HTMLInputElement).value;
  if (!setItemMaterial(doc.value, item.id, material)) return;
  persist();
}

function applyMaterialPreset(preset: string): void {
  const item = selectedItem.value;
  if (!item || !doc.value) return;
  setItemMaterial(doc.value, item.id, preset);
  persist();
}

function setSingleSlot(event: Event): void {
  const item = selectedItem.value;
  if (!item || !doc.value) return;
  const slot = Number((event.target as HTMLInputElement).value);
  if (!Number.isInteger(slot)) return;
  setItemSlot(doc.value, item.id, slot);
  persist();
}

function makeSingleSlot(): void {
  const item = selectedItem.value;
  if (!item || !doc.value) return;
  const slot = selectedSlot.value ?? firstFreeSlot();
  if (slot === null) {
    pushToast(tx('没有可用空槽位'), 'warning');
    return;
  }
  setItemSlot(doc.value, item.id, slot);
  persist();
}

function makeMultiSlot(): void {
  const item = selectedItem.value;
  if (!item || !doc.value) return;
  const existing = itemSlots(item);
  const slot = selectedSlot.value ?? firstFreeSlot();
  const next = [...existing];
  if (slot !== null && !next.includes(slot)) next.push(slot);
  if (next.length === 0) {
    pushToast(tx('请先点击一个槽位或填写槽位号'), 'warning');
    return;
  }
  setItemSlots(doc.value, item.id, next);
  persist();
}

function addSlotNumber(): void {
  const item = selectedItem.value;
  if (!item || !doc.value) return;
  const input = document.querySelector<HTMLInputElement>('[data-field="menu-slot-add"]');
  const slot = Number(input?.value ?? '');
  if (!Number.isInteger(slot)) {
    pushToast(tx('槽位必须是整数'), 'error');
    return;
  }
  const current = itemSlots(item);
  if (current.includes(slot)) {
    pushToast(tx('槽位 {slot} 已在列表中', { slot }), 'warning');
    return;
  }
  setItemSlots(doc.value, item.id, [...current, slot]);
  if (input) input.value = '';
  persist();
}

function removeSlot(slot: number): void {
  const item = selectedItem.value;
  if (!item || !doc.value) return;
  const current = itemSlots(item).filter((entry) => entry !== slot);
  if (current.length === 0) clearItemSlots(doc.value, item.id);
  else setItemSlots(doc.value, item.id, current);
  persist();
}

function clearSlots(): void {
  const item = selectedItem.value;
  if (!item || !doc.value) return;
  clearItemSlots(doc.value, item.id);
  persist();
}

function addOption(): void {
  if (!doc.value) return;
  const key = newOptionKey.value.trim();
  if (!key) {
    pushToast(tx('options 键不能为空'), 'error');
    return;
  }
  if (model.value.options.some((option) => option.key === key)) {
    pushToast(tx('options.{key} 已存在', { key }), 'error');
    return;
  }
  if (!setOption(doc.value, key, '')) {
    pushToast(tx('options 结构异常，无法添加'), 'error');
    return;
  }
  newOptionKey.value = '';
  persist();
}

function addKnownPageOption(): void {
  if (!doc.value || !pageOption.value?.option) {
    if (!doc.value || !meta.value?.pageOption) return;
    setOption(doc.value, meta.value.pageOption.key, meta.value.pageOption.defaultValue);
    persist();
    return;
  }
}

function updateOptionValue(key: string, event: Event): void {
  if (!doc.value) return;
  const raw = (event.target as HTMLInputElement).value;
  setOption(doc.value, key, optionValueFromInput(raw));
  persist();
}

function renameOptionKey(oldKey: string, event: Event): void {
  if (!doc.value) return;
  const input = event.target as HTMLInputElement;
  const next = input.value.trim();
  if (!next || next === oldKey) {
    input.value = oldKey;
    return;
  }
  if (model.value.options.some((option) => option.key === next)) {
    pushToast(tx('options.{key} 已存在', { key: next }), 'error');
    input.value = oldKey;
    return;
  }
  if (!renameOption(doc.value, oldKey, next)) {
    input.value = oldKey;
    return;
  }
  persist();
}

function removeOption(key: string): void {
  if (!doc.value) return;
  deleteOption(doc.value, key);
  persist();
}

function locateIssue(issue: MenuIssue): void {
  if (issue.itemId) selectedItemId.value = issue.itemId;
  if (issue.slot !== undefined) selectedSlot.value = issue.slot;
  showIssues.value = true;
}

function exportSelected(): void {
  if (!file.value || !doc.value) return;
  if (blockingIssues.value.length > 0) {
    pushToast(tx('当前菜单存在 {count} 条错误/阻断项，已阻止导出', { count: blockingIssues.value.length }), 'error');
    showIssues.value = true;
    return;
  }
  const current = store.files[menuPath(selectedId.value!)]!;
  const prepared = prepareExport(current);
  if (!prepared.ok) {
    pushToast(tx('导出被阻止：{issue}', { issue: prepared.issues[0]?.message ?? tx('自检失败') }), 'error');
    return;
  }
  const filename = `${menuIdFromPath(current.path)}.yml`;
  downloadTextFile(filename, prepared.payload.text);
  store.markExported(current.path);
  pushToast(tx('已导出 {file}；放回 plugins/MyCompany/menu/ 后可用 /mycompany reload', { file: filename }), 'success');
}

function exportAllZip(): void {
  if (menuFiles.value.length === 0) {
    pushToast(tx('没有可导出的菜单文件'), 'error');
    return;
  }
  if (allBlockingIssues.value.length > 0) {
    pushToast(tx('菜单文件存在 {count} 条错误/阻断项，已阻止打包导出', { count: allBlockingIssues.value.length }), 'error');
    showIssues.value = true;
    return;
  }
  const entries: ZipEntry[] = [];
  for (const entry of menuFiles.value) {
    const prepared = prepareExport(entry);
    if (!prepared.ok) {
      pushToast(tx('导出 {path} 失败：{issue}', { path: entry.path, issue: prepared.issues[0]?.message ?? tx('自检失败') }), 'error');
      return;
    }
    entries.push({ name: entry.path, text: prepared.payload.text });
  }
  downloadZip('mycompany-menu.zip', entries);
  for (const entry of menuFiles.value) store.markExported(entry.path);
  const missing = MENU_META.map((entry) => entry.id).filter((id) => !presentIds.value.has(id));
  pushToast(
    tx('已打包导出 {count} 个菜单文件到 mycompany-menu.zip', { count: entries.length }) +
      (missing.length ? tx('；缺少 {ids}', { ids: missing.join(', ') }) : ''),
    missing.length ? 'warning' : 'success',
  );
}

watch(
  () => menuFiles.value.map((entry) => entry.path).join('|'),
  () => {
    if (!selectedId.value || !store.files[menuPath(selectedId.value)]) ensureSelection();
  },
);

watch(
  selectedId,
  (path, previous) => {
    if (path === previous) return;
    selectedItemId.value = null;
    selectedSlot.value = null;
    loadSelected();
  },
  { immediate: true },
);

watch(
  () => file.value?.text,
  (text) => {
    if (text !== undefined && text !== lastText.value) {
      const item = selectedItemId.value;
      loadSelected();
      if (item && model.value.items.some((entry) => entry.id === item)) selectedItemId.value = item;
    }
  },
);

ensureSelection();
</script>

<template>
  <div class="menu-editor" data-testid="menu-editor">
    <header class="menu-header">
      <div>
        <h1>{{ tx("菜单编辑器") }}</h1>
        <p class="menu-subtitle"> {{ tx("插件固定读取") }} <code>menu/&lt;id&gt;.yml</code> {{ tx("的 18 个菜单；标题与物品文本在") }} <code>lang/&lt;language&gt;.yml</code>{{ tx("，不写进 menu 文件。修改后可") }} <code>/mycompany reload</code>.
        </p>
      </div>
      <div class="menu-header-actions">
        <button class="mc-button" data-action="menu-import" @click="triggerImport">{{ tx("导入菜单文件") }}</button>
        <button
          class="mc-button primary"
          data-action="menu-export"
          :disabled="!file || !doc || blockingIssues.length > 0"
          :title="blockingIssues.length ? tx('存在 {count} 条错误，导出被阻止', { count: blockingIssues.length }) : tx('导出当前菜单')"
          @click="exportSelected"
        > {{ tx("导出当前菜单") }} </button>
        <button
          class="mc-button"
          data-action="menu-export-zip"
          :disabled="menuFiles.length === 0 || allBlockingIssues.length > 0"
          :title="allBlockingIssues.length ? tx('存在 {count} 条错误，打包被阻止', { count: allBlockingIssues.length }) : tx('打包导出全部菜单 ZIP')"
          @click="exportAllZip"
        > {{ tx("导出全部菜单 ZIP（") }}{{ menuFiles.length }}/18)
        </button>
        <input ref="importInput" type="file" accept=".yml,.yaml" multiple class="file-input" @change="onImport" />
      </div>
    </header>

    <div class="menu-layout">
      <aside class="menu-files">
        <h2>{{ tx("固定菜单（18）") }}</h2>
        <div v-for="group in categoryGroups" :key="group.category" class="menu-category">
          <h3>{{ menuCategoryText(group.category) }}</h3>
          <button
            v-for="entry in group.items"
            :key="entry.id"
            class="menu-file-button"
            :class="{ active: selectedId === entry.id, missing: !presentIds.has(entry.id) }"
            :data-menu-id="entry.id"
            @click="presentIds.has(entry.id) ? chooseMenu(entry.id) : pushToast(tx('请先导入 {id}.yml', { id: entry.id }), 'warning')"
          >
            <span class="menu-file-label">{{ entry.label }}</span>
            <code>{{ entry.id }}</code>
            <span v-if="!presentIds.has(entry.id)" class="badge missing">{{ tx("未导入") }}</span>
            <span
              v-else-if="store.files[menuPath(entry.id)]?.issues.some(isBlockingIssue)"
              class="badge error"
            >{{ tx("错误") }}</span>
          </button>
        </div>
        <p class="menu-hint"> {{ tx("未知菜单 id 会被跳过并提示“插件不会加载”；不能新建可加载菜单。") }} </p>
      </aside>

      <main class="menu-main">
        <div v-if="!file" class="menu-empty">
          <div class="menu-empty-icon" aria-hidden="true">🧰</div>
          <h2>{{ tx("还没有菜单文件") }}</h2>
          <p> {{ tx("导入服务器") }} <code>plugins/MyCompany/menu/*.yml</code>{{ tx("（可多选），或从示例项目载入 18 个固定菜单。 未知 id 不会被插件加载。") }} </p>
          <button class="mc-button primary" data-action="menu-empty-import" @click="triggerImport">{{ tx("导入菜单文件") }}</button>
        </div>

        <template v-else>
          <div class="menu-title-row">
            <div>
              <h2>
                <code>{{ file.path }}</code>
                <span class="menu-badge">{{ meta?.label ?? selectedId }}</span>
              </h2>
              <p class="menu-hint"> {{ tx("标题/物品名/lore 来自 lang，不会写入此文件；0-based 槽位；default 自动填充空槽。") }} </p>
            </div>
            <div class="menu-title-actions">
              <span v-if="blockingIssues.length" class="badge error">{{ blockingIssues.length }} {{ tx("错误") }}</span>
              <span v-else-if="issues.length" class="badge warning">{{ issues.length }} {{ tx("提示") }}</span>
              <button class="mc-button small" data-action="menu-toggle-issues" @click="showIssues = !showIssues">
                {{ showIssues ? tx('收起问题') : tx('显示问题') }}
              </button>
            </div>
          </div>

          <section class="menu-card menu-props">
            <h3>{{ tx("菜单属性") }}</h3>
            <div class="menu-props-grid">
              <label class="field">
                <span class="field-label">{{ tx("size（9 的倍数，9..54）") }}</span>
                <select class="mc-select" :value="model.sizeNumber ?? ''" data-field="menu-size" @change="setSizeValue">
                  <option v-if="gridSizeInvalid" :value="model.sizeNumber ?? ''"> {{ tx("非法：") }}{{ model.size ?? '缺失' }}
                  </option>
                  <option v-for="size in SIZE_OPTIONS" :key="size" :value="size">{{ sizeOptionLabel(size) }}</option>
                </select>
              </label>
              <div class="field">
                <span class="field-label">{{ tx("分页与关键物品") }}</span>
                <div class="menu-hint">
                  <span v-if="pageOption">
                    {{ pageOption.key }} = {{ Number.isNaN(pageOption.value) ? '非数字' : pageOption.value }} {{ tx("（默认") }} {{ pageOption.defaultValue }}）
                  </span>
                  <span v-else>{{ tx("无分页参数") }}</span>
                  <span v-if="meta?.templates.length"> {{ tx("· 模板：") }}{{ meta.templates.join(', ') }}</span>
                </div>
              </div>
            </div>

            <h3 class="menu-subheading">{{ tx("options（类型自动推断；未知键保留）") }}</h3>
            <div class="options-table">
              <div class="options-head">
                <span>key</span><span>value</span><span>{{ tx("推断类型") }}</span><span />
              </div>
              <div v-for="option in model.options" :key="option.key" class="options-row">
                <input
                  class="mc-input option-key"
                  :value="option.key"
                  :data-option-key="option.key"
                  @change="renameOptionKey(option.key, $event)"
                />
                <input
                  class="mc-input"
                  :value="option.raw"
                  :data-option-value="option.key"
                  @change="updateOptionValue(option.key, $event)"
                />
                <span class="badge" :class="{ warning: option.inferred === 'other' }">
                  {{ option.inferred }}
                </span>
                <button class="mc-button tiny danger" type="button" @click="removeOption(option.key)">{{ tx("删除") }}</button>
              </div>
            </div>
            <div class="options-add">
              <input
                v-model="newOptionKey"
                class="mc-input"
                data-field="menu-option-new"
                :placeholder="tx('新 option key')"
              />
              <button class="mc-button tiny" type="button" @click="addOption">{{ tx("+ 添加 option") }}</button>
              <button
                v-if="meta?.pageOption && !pageOption?.option"
                class="mc-button tiny"
                type="button"
                @click="addKnownPageOption"
              > {{ tx("+ 补") }} {{ meta.pageOption.key }}
              </button>
            </div>
            <p class="menu-hint"> {{ tx("数字输出裸整数、true/false 输出布尔；显式空值会导致加载 NPE，列表/map 会静默失效。") }} </p>
          </section>

          <section class="menu-card chest-card">
            <div class="chest-titlebar">
              <span class="chest-title">🧰 {{ selectedId }}.yml</span>
              <span class="chest-subtitle">
                {{ previewSize }} {{ tx("槽 ·") }} {{ rows }} {{ tx("行") }} <span v-if="gridSizeInvalid" class="badge error">{{ tx("size 非法，按 27 预览") }}</span>
              </span>
            </div>
            <div class="chest-grid" :style="{ gridTemplateColumns: 'repeat(9, minmax(0, 1fr))' }">
              <button
                v-for="cell in cells"
                :key="cell.slot"
                class="chest-slot"
                :class="{
                  occupied: cell.items.length > 0,
                  conflict: cell.items.length > 1,
                  'selected-item': selectedItemSlots.includes(cell.slot),
                  'selected-slot': selectedSlot === cell.slot,
                }"
                :data-slot="cell.slot"
                :title="
                  cell.items.length
                    ? `#${cell.slot} · ${cell.items.map((item) => `${item.id} (${item.material})`).join(' / ')}`
                    : tx('＃{slot} · 空{fill}', { slot: cell.slot, fill: defaultFill ? tx(' · 填充 {material}', { material: defaultItem?.material ?? '' }) : '' })
                "
                draggable="false"
                @click="onSlotClick(cell.slot)"
                @dragover="onDragOver"
                @drop="onDrop(cell.slot, $event)"
              >
                <span class="slot-number">{{ cell.slot }}</span>
                <template v-if="cell.items.length">
                  <span
                    class="slot-icon-wrap"
                    draggable="true"
                    @dragstart.stop="onDragStart(cell.items[0]!, cell.slot, $event)"
                  >
                    <MenuIcon :material="cell.items[0]!.material" :size="34" />
                  </span>
                  <span class="slot-item-id">{{ cell.items[0]!.id }}</span>
                  <span v-if="cell.items.length > 1" class="slot-conflict">!</span>
                </template>
                <template v-else-if="defaultFill">
                  <span class="slot-default">
                    <MenuIcon :material="defaultItem!.material" :size="30" />
                  </span>
                </template>
                <span v-else class="slot-empty" aria-hidden="true" />
              </button>
            </div>
            <div class="chest-legend">
              <span><i class="legend-dot occupied" /> {{ tx("已占用") }}</span>
              <span><i class="legend-dot default" /> {{ tx("default 填充") }}</span>
              <span><i class="legend-dot conflict" /> {{ tx("槽位冲突") }}</span>
              <span>{{ tx("点击槽位分配当前物品；拖拽移动；Shift/Ctrl 拖拽复制。") }}</span>
            </div>
          </section>

          <section v-if="showIssues" class="menu-card">
            <h3>{{ tx("校验问题（") }}{{ issues.length }})</h3>
            <p v-if="issues.length === 0" class="menu-hint">{{ tx("没有发现问题。") }}</p>
            <ul v-else class="menu-issues">
              <li v-for="(issue, index) in issues" :key="index" :class="issue.severity">
                <code>{{ issue.code }}</code>
                {{ issue.message }}
                <p v-if="issue.fixHint" class="issue-fix">{{ issue.fixHint }}</p>
                <button v-if="issue.itemId || issue.slot !== undefined" class="mc-button tiny" @click="locateIssue(issue)"> {{ tx("定位") }} </button>
              </li>
            </ul>
          </section>

          <details class="menu-card yaml-preview" data-testid="menu-yaml-preview">
            <summary>{{ tx("只读 YAML 预览（导出前核对）") }}</summary>
            <pre class="yaml-preview-text">{{ yamlPreview }}</pre>
            <p class="menu-hint"> {{ tx("此预览由 serializeMenu 实时生成；只读，不会写入文件。导出还会执行 parse→dump→re-parse 自检。") }} </p>
          </details>

          <LanguagePanel
            :menu-id="selectedId!"
            :items="model.items.map((item) => item.id)"
            :selected-item-id="selectedItemId"
          />
        </template>
      </main>

      <aside class="menu-items">
        <template v-if="file">
          <h2>{{ tx("物品（") }}{{ model.items.length }})</h2>
          <input
            v-model="search"
            class="mc-input"
            data-field="menu-item-search"
            :placeholder="tx('搜索 id / material')"
          />
          <div class="item-add-row">
            <input
              v-model="newItemId"
              class="mc-input"
              data-field="menu-new-item-id"
              :placeholder="tx('新物品 id')"
              @keydown.enter="addNewItem"
            />
            <button class="mc-button tiny primary" data-action="menu-add-item" @click="addNewItem">{{ tx("新增") }}</button>
          </div>
          <div class="item-list">
            <button
              v-for="item in filteredItems"
              :key="item.id"
              class="item-button"
              :class="{ active: selectedItemId === item.id }"
              :data-menu-item="item.id"
              draggable="true"
              @click="selectItem(item.id)"
              @dragstart="onDragStart(item, null, $event)"
            >
              <MenuIcon :material="item.material" :size="26" />
              <span class="item-meta">
                <span class="item-id">{{ item.id }}</span>
                <span class="item-material">
                  {{ item.material || tx('（缺 material）') }}
                  <span v-if="isCustomMaterialItem(item.id)" class="badge">{{ tx("自定义材质") }}</span>
                </span>
                <span class="item-slot">
                  {{
                    item.id === 'default'
                      ? tx('填充空槽')
                      : itemSlots(item).length
                        ? tx('槽位 {slots}', { slots: itemSlots(item).join(', ') })
                        : tx('无槽位')
                  }}
                </span>
              </span>
            </button>
            <p v-if="filteredItems.length === 0" class="menu-hint">{{ tx("没有匹配的物品。") }}</p>
          </div>

          <section v-if="selectedItem" class="menu-card item-editor">
            <div class="item-editor-head">
              <h3><code>{{ selectedItem.id }}</code></h3>
              <div class="item-editor-actions">
                <button class="mc-button tiny" data-action="menu-item-up" @click="moveSelectedItem(-1)">↑</button>
                <button class="mc-button tiny" data-action="menu-item-down" @click="moveSelectedItem(1)">↓</button>
                <button class="mc-button tiny" data-action="menu-item-copy" @click="duplicateSelectedItem">{{ tx("复制") }}</button>
                <button class="mc-button tiny danger" data-action="menu-item-delete" @click="removeSelectedItem">{{ tx("删除") }}</button>
              </div>
            </div>
            <label class="field">
              <span class="field-label">{{ tx("物品 id（map key）") }}</span>
              <input
                class="mc-input"
                :value="selectedItem.id"
                data-field="menu-item-id"
                @change="renameSelectedItem"
              />
            </label>
            <label class="field">
              <span class="field-label">material</span>
              <input
                class="mc-input"
                :value="selectedItem.material"
                data-field="menu-item-material"
                list="menu-material-options"
                @change="setMaterial"
              />
            </label>
            <div class="material-preview">
              <MenuIcon :material="selectedItem.material" :size="44" show-text />
              <span v-if="!checkMaterial(selectedItem.material).valid" class="inline-warning">
                {{ checkMaterial(selectedItem.material).reason }}
              </span>
              <span
                v-else-if="selectedId === 'main' && usesUppercasePlayerPlaceholder(selectedItem.material)"
                class="inline-warning"
              > {{ tx("主菜单是静态菜单，只替换 %player%；%PLAYER% 会变成字面 owner。") }} </span>
            </div>
            <div class="material-presets">
              <button
                v-for="preset in PLAYER_HEAD_PRESETS"
                :key="preset.value"
                class="mc-button tiny"
                type="button"
                @click="applyMaterialPreset(preset.value)"
              >
                {{ preset.label }}
              </button>
            </div>

            <div v-if="selectedItem.id !== 'default'" class="field">
              <span class="field-label">{{ tx("槽位（slot / slots）") }}</span>
              <p class="menu-hint"> {{ tx("当前：") }}{{ itemSlotMode(selectedItem) === 'none' ? '无槽位' : itemSlots(selectedItem).join(', ') }} {{ tx("· 点击网格槽位分配；Shift/Ctrl 点击可多选。") }} </p>
              <div class="slot-actions">
                <button class="mc-button tiny" type="button" data-action="menu-make-single" @click="makeSingleSlot"> {{ tx("设为单槽") }} </button>
                <button class="mc-button tiny" type="button" data-action="menu-make-multi" @click="makeMultiSlot"> {{ tx("设为多槽") }} </button>
                <button class="mc-button tiny" type="button" data-action="menu-clear-slots" @click="clearSlots"> {{ tx("清空槽位") }} </button>
              </div>
              <div v-if="itemSlotMode(selectedItem) === 'slot'" class="slot-single-row">
                <input
                  class="mc-input"
                  type="number"
                  min="0"
                  :max="previewSize - 1"
                  :value="itemSlots(selectedItem)[0] ?? ''"
                  data-field="menu-item-slot"
                  @change="setSingleSlot"
                />
              </div>
              <div v-else-if="itemSlotMode(selectedItem) === 'slots'" class="slot-chips">
                <span v-for="slot in itemSlots(selectedItem)" :key="slot" class="slot-chip">
                  {{ slot }}
                  <button type="button" :aria-label="tx('移除槽位')" @click="removeSlot(slot)">×</button>
                </span>
                <div class="slot-add-row">
                  <input
                    class="mc-input"
                    type="number"
                    min="0"
                    :max="previewSize - 1"
                    :placeholder="tx('槽位号')"
                    data-field="menu-slot-add"
                    @keydown.enter="addSlotNumber"
                  />
                  <button class="mc-button tiny" type="button" data-action="menu-slot-add" @click="addSlotNumber"> {{ tx("+ 槽位") }} </button>
                </div>
              </div>
            </div>

            <p v-if="selectedItem.id === 'default'" class="menu-hint"> {{ tx("default 物品自动填充所有空槽，不参与具体槽位；它的 material 无效时等价无填充。") }} </p>

            <details v-if="selectedItem.extras.length" class="menu-extras">
              <summary>{{ tx("未知字段") }} {{ selectedItem.extras.length }} {{ tx("个（原样保留）") }}</summary>
              <ul>
                <li v-for="extra in selectedItem.extras" :key="extra.key">
                  <code>{{ extra.key }}</code>: {{ extra.preview }}
                </li>
              </ul>
            </details>
          </section>
        </template>
      </aside>
    </div>

    <datalist id="menu-material-options">
      <option v-for="material in MATERIAL_OPTIONS" :key="material" :value="material" />
    </datalist>
  </div>
</template>

<style>
.menu-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 100%;
}
.menu-header {
  display: flex;
  gap: 16px;
  justify-content: space-between;
  align-items: flex-start;
}
.menu-header h1 {
  margin: 0 0 4px;
  font-size: 22px;
}
.menu-subtitle {
  margin: 0;
  color: var(--muted);
  max-width: 780px;
  line-height: 1.6;
}
.menu-header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.menu-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) clamp(380px, 24vw, 460px);
  min-width: 0;
  gap: 12px;
  align-items: start;
}
.menu-files,
.menu-card,
.menu-empty {
  border: 1px solid var(--border);
  background: var(--panel);
  padding: 10px;
}
.menu-files {
  max-height: 80vh;
  overflow: auto;
}
.menu-files h2,
.menu-items h2 {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--muted);
}
.menu-category h3 {
  margin: 10px 0 4px;
  font-size: 12px;
  color: var(--muted);
}
.menu-file-button {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 6px;
  width: 100%;
  padding: 6px 7px;
  border: 1px solid transparent;
  border-bottom-color: var(--border);
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.menu-file-button:hover {
  background: var(--panel-alt, #2b2b2b);
}
.menu-file-button.active {
  background: rgba(126, 200, 80, 0.12);
  box-shadow: inset 2px 0 var(--accent);
}
.menu-file-button.missing {
  opacity: 0.6;
}
.menu-file-label {
  font-size: 12px;
}
.menu-file-button code {
  grid-column: 1 / 2;
  color: var(--muted);
  font-size: 11px;
}
.menu-file-button .badge {
  grid-column: 2 / 3;
  grid-row: 1 / 3;
  align-self: center;
}
.badge {
  display: inline-block;
  padding: 1px 5px;
  border: 1px solid var(--border);
  font-size: 11px;
  line-height: 1.5;
}
.badge.error {
  border-color: #b34a4a;
  color: #ff8f8f;
}
.badge.warning {
  border-color: #8a6d1f;
  color: #d8a657;
}
.badge.missing {
  border-color: #b34a4a;
  color: #ff8f8f;
}
.menu-main {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.menu-title-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}
.menu-title-row h2 {
  margin: 0 0 2px;
  font-size: 17px;
}
.menu-badge {
  margin-left: 8px;
  padding: 1px 6px;
  border: 1px solid var(--accent);
  color: var(--accent);
  font-size: 12px;
}
.menu-title-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}
.menu-card h3 {
  margin: 0 0 8px;
  font-size: 15px;
}
.menu-subheading {
  margin-top: 14px !important;
}
.menu-props-grid {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 10px;
}
.menu-hint {
  margin: 3px 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}
.menu-issues {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
}
.menu-issues li {
  padding: 5px 7px;
  border-left: 3px solid var(--border);
  background: var(--panel-alt, #2b2b2b);
}
.menu-issues li.error {
  border-color: #b34a4a;
}
.menu-issues li.warning {
  border-color: #d8a657;
}
.menu-issues li.info {
  border-color: #6a9ac8;
}
.options-table {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.options-head,
.options-row {
  display: grid;
  grid-template-columns: 1fr 1.3fr 90px auto;
  gap: 6px;
  align-items: center;
}
.options-head {
  font-size: 11px;
  color: var(--muted);
}
.options-add {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  align-items: center;
}
.option-key {
  font-family: var(--mono);
}

.chest-card {
  padding: 0;
  overflow: hidden;
  background: #1f1f1f;
  border-color: #555;
}
.chest-titlebar {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  background: linear-gradient(#4a4a4a, #333);
  border-bottom: 2px solid #111;
  font-size: 13px;
}
.chest-title {
  font-weight: 700;
  text-shadow: 0 1px 0 #000;
}
.chest-subtitle {
  color: #ddd;
  font-size: 11px;
}
.chest-grid {
  display: grid;
  gap: 2px;
  padding: 8px;
  background: #2a2a2a;
  background-image: linear-gradient(rgba(0, 0, 0, 0.16) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 0, 0, 0.16) 1px, transparent 1px);
  background-size: 18px 18px;
}
.chest-slot {
  position: relative;
  aspect-ratio: 1;
  min-height: 46px;
  border: 2px solid #111;
  outline: 1px solid #6b6b6b;
  background: #8b8b8b;
  background-image: linear-gradient(135deg, rgba(255, 255, 255, 0.22), rgba(0, 0, 0, 0.22));
  color: #eee;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font: inherit;
}
.chest-slot:hover {
  outline-color: var(--accent);
}
.chest-slot.occupied {
  background: #373737;
  background-image: linear-gradient(135deg, #4b4b4b, #2b2b2b);
}
.chest-slot.conflict {
  outline: 2px solid #d64545;
}
.chest-slot.selected-item {
  outline: 2px solid #7ec850;
  box-shadow: inset 0 0 0 2px rgba(126, 200, 80, 0.4);
}
.chest-slot.selected-slot {
  box-shadow: inset 0 0 0 3px #ffd166;
}
.slot-number {
  position: absolute;
  top: 1px;
  left: 3px;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.65);
  font-family: var(--mono);
  pointer-events: none;
}
.slot-icon-wrap {
  cursor: grab;
}
.slot-item-id {
  position: absolute;
  bottom: 1px;
  left: 0;
  right: 0;
  font-size: 8px;
  color: #ddd;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  pointer-events: none;
  text-shadow: 0 1px 0 #000;
}
.slot-default {
  opacity: 0.36;
}
.slot-empty {
  width: 10px;
  height: 10px;
  border: 1px dashed rgba(255, 255, 255, 0.2);
}
.slot-conflict {
  position: absolute;
  top: 1px;
  right: 3px;
  color: #ff8f8f;
  font-weight: 700;
  font-size: 12px;
}
.chest-legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding: 6px 10px 8px;
  color: #ccc;
  font-size: 11px;
}
.legend-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  margin-right: 3px;
  background: #555;
}
.legend-dot.occupied {
  background: #7ec850;
}
.legend-dot.default {
  background: #888;
}
.legend-dot.conflict {
  background: #d64545;
}

.menu-items {
  min-width: 0;
  max-width: 100%;
  overflow-x: hidden;
  border: 1px solid var(--border);
  background: var(--panel);
  padding: 10px;
  max-height: 88vh;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  --menu-item-row-height: 62px;
  --menu-item-gap: 3px;
}
.item-add-row {
  display: flex;
  gap: 6px;
}
.item-list {
  display: flex;
  flex-direction: column;
  gap: var(--menu-item-gap);
  max-height: calc(9 * var(--menu-item-row-height) + 8 * var(--menu-item-gap) + 12px);
  flex: 0 0 auto;
  overflow: auto;
  border-top: 1px solid var(--border);
  padding-top: 6px;
}
.item-button {
  display: flex;
  gap: 7px;
  align-items: center;
  width: 100%;
  min-height: var(--menu-item-row-height);
  box-sizing: border-box;
  padding: 4px 5px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.item-button:hover {
  background: var(--panel-alt, #2b2b2b);
}
.item-button.active {
  border-color: var(--accent);
  background: rgba(126, 200, 80, 0.1);
}
.item-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.item-id {
  font-family: var(--mono);
  font-size: 12px;
}
.item-material,
.item-slot {
  color: var(--muted);
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-editor {
  border-color: var(--border);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  text-align: left;
  flex: 0 0 auto;
  padding: 8px;
  min-width: 0;
  max-width: 100%;
  overflow: visible;
}
.item-editor > .field,
.item-editor > .material-preview,
.item-editor > .material-presets,
.item-editor > .slot-actions,
.item-editor > .slot-single-row,
.item-editor > .slot-add-row,
.item-editor > .menu-extras {
  width: 100%;
  max-width: 100%;
}
.item-editor .field {
  align-items: stretch;
  width: 100%;
  max-width: 100%;
}
.item-editor .mc-input,
.item-editor .mc-select {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
.item-editor .material-preview,
.item-editor .material-presets,
.item-editor .slot-actions,
.item-editor .slot-chips,
.item-editor .slot-add-row {
  justify-content: flex-start;
  align-items: flex-start;
}
.item-editor > *,
.menu-items > * {
  min-width: 0;
  max-width: 100%;
}
.item-editor-head {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  align-items: flex-start;
  flex-wrap: wrap;
  min-width: 0;
}
.item-editor-head h3 {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  overflow-wrap: anywhere;
}
.item-editor-actions {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
}
.material-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  min-width: 0;
  margin-top: 6px;
  font-size: 11px;
  color: var(--muted);
  overflow-wrap: anywhere;
  word-break: break-word;
}
.material-presets {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  min-width: 0;
  margin-top: 4px;
}
.material-presets .mc-button {
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
  text-align: left;
}
.slot-actions,
.slot-add-row {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.slot-single-row {
  margin-top: 4px;
}
.slot-chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 4px;
  align-items: center;
}
.slot-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 4px 2px 6px;
  border: 1px solid var(--border);
  background: var(--panel-alt, #2b2b2b);
  font-family: var(--mono);
  font-size: 11px;
}
.slot-chip button {
  border: 0;
  background: transparent;
  color: #ff8f8f;
  cursor: pointer;
  font-size: 13px;
}
.menu-extras {
  margin-top: 8px;
  font-size: 11px;
  color: var(--muted);
}
.field {
  min-width: 0;
  max-width: 100%;
}
.menu-extras,
.menu-extras li,
.menu-extras code,
.slot-chip,
.inline-warning {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.menu-extras ul {
  min-width: 0;
  max-width: 100%;
  padding-left: 18px;
}
.yaml-preview {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 10px;
  overflow: hidden;
}
.yaml-preview summary {
  cursor: pointer;
  font-weight: 600;
}
.yaml-preview-text {
  margin: 8px 0 0;
  max-height: 340px;
  overflow: auto;
  padding: 8px;
  border: 1px solid var(--border);
  background: #171717;
  color: #d6d6d6;
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.5;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 8px;
}
.field-label {
  font-size: 11px;
  color: var(--muted);
}
.inline-warning {
  padding: 5px 6px;
  border-left: 3px solid #d8a657;
  background: rgba(216, 166, 87, 0.08);
  line-height: 1.5;
}
.menu-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 40px 20px;
  gap: 8px;
}
.menu-empty-icon {
  font-size: 42px;
}
.file-input {
  display: none;
}
.menu-card {
  display: block;
  width: 100%;
  cursor: default;
}
.menu-card.item-editor {
  display: flex;
  flex-direction: column;
}
.menu-props-grid {
  grid-template-columns: minmax(0, 220px) minmax(0, 1fr);
}
.options-table,
.options-head,
.options-row {
  min-width: 0;
  max-width: 100%;
}
.options-head,
.options-row {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 90px) auto;
}
.options-head > *,
.options-row > * {
  min-width: 0;
}
.options-add {
  flex-wrap: wrap;
}
.options-add .mc-input {
  flex: 1 1 140px;
  min-width: 0;
}
:deep(.lang-panel .lang-target) {
  flex-wrap: wrap;
}
:deep(.lang-panel .lang-target .field) {
  min-width: 0;
}
:deep(.lang-panel .lang-target code) {
  max-width: 100%;
  overflow-wrap: anywhere;
}
:deep(.lang-panel .mc-input),
:deep(.lang-panel .mc-select) {
  min-width: 0;
}
@media (max-width: 1200px) {
  .menu-layout {
    grid-template-columns: 190px minmax(0, 1fr);
  }
  .menu-items {
    grid-column: 1 / -1;
    max-height: none;
  }
}
</style>
