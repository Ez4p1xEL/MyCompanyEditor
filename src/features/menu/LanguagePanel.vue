<script setup lang="ts">
import { menuText as tx } from './menuConstants';
import { computed, reactive, ref, watch } from 'vue';
import { Document } from 'yaml';
import { downloadTextFile } from '../../core/download';
import { pushToast } from '../../core/toast';
import { stringifyYamlDocument } from '../../core/yaml';

const props = defineProps<{
  menuId: string;
  items: string[];
  selectedItemId?: string | null;
}>();

interface LangEntry {
  title: string;
  displayName: string;
  lore: string;
}

const store = reactive<Record<string, LangEntry>>({});
const activeItem = ref<string>(props.selectedItemId ?? props.items[0] ?? '');

function keyFor(menuId: string, itemId: string): string {
  return `${menuId}\u0000${itemId}`;
}

function entryFor(menuId: string, itemId: string): LangEntry {
  const key = keyFor(menuId, itemId);
  if (!store[key]) store[key] = { title: '', displayName: '', lore: '' };
  return store[key]!;
}

const titleEntry = computed(() => entryFor(props.menuId, '__title__'));
const itemEntry = computed(() => entryFor(props.menuId, activeItem.value));

function syncActive(): void {
  if (!props.items.includes(activeItem.value)) {
    activeItem.value = props.selectedItemId && props.items.includes(props.selectedItemId)
      ? props.selectedItemId
      : (props.items[0] ?? '');
  }
}

watch(
  () => props.menuId,
  () => {
    activeItem.value = props.items[0] ?? '';
  },
);

watch(
  () => props.selectedItemId,
  (value) => {
    if (value && props.items.includes(value)) activeItem.value = value;
  },
);

watch(
  () => props.items.join('|'),
  () => syncActive(),
);

function exportSnippet(): void {
  const title = titleEntry.value.title.trim();
  const displayName = itemEntry.value.displayName;
  const lore = itemEntry.value.lore
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  if (!title && !displayName && lore.length === 0) {
    pushToast(tx('当前语言片段为空：请先填写标题、display_name 或 lore'), 'warning');
    return;
  }
  const plain: Record<string, unknown> = { menu: { [props.menuId]: {} } };
  const menuSection = (plain.menu as Record<string, Record<string, unknown>>)[props.menuId]!;
  if (title) menuSection.title = title;
  if (displayName || lore.length > 0) {
    menuSection.items = {
      [activeItem.value]: {
        ...(displayName ? { display_name: displayName } : {}),
        ...(lore.length > 0 ? { lore } : {}),
      },
    };
  }
  const doc = new Document({});
  doc.contents = doc.createNode(plain);
  const text = stringifyYamlDocument(doc);
  downloadTextFile(`menu-${props.menuId}-lang-snippet.yml`, text);
  pushToast(
    tx('已导出语言片段 menu-{menuId}-lang-snippet.yml；请手动合并到 lang/<language>.yml，不会写入 menu/*.yml', { menuId: props.menuId }),
    'success',
  );
}
</script>

<template>
  <section class="menu-card lang-panel">
    <h3>{{ tx("语言片段（lang 文件）") }}</h3>
    <p class="menu-hint"> {{ tx("菜单标题、物品 display_name 与 lore") }} <strong>{{ tx("不写入 menu/*.yml") }}</strong>{{ tx("；插件从") }} <code>lang/&lt;language&gt;.yml</code> {{ tx("读取。这里编辑的文本只存在浏览器内，并可导出为独立片段， 不会改动 menu 文件。") }} </p>
    <div class="lang-target">
      <label class="field">
        <span class="field-label">{{ tx("菜单标题键") }}</span>
        <code>menu.{{ menuId }}.title</code>
      </label>
      <input
        v-model="titleEntry.title"
        class="mc-input"
        data-field="lang-title"
        :placeholder="tx('菜单标题（支持 & 颜色码）')"
      />
    </div>
    <div class="lang-target">
      <label class="field">
        <span class="field-label">{{ tx("目标物品（文本键）") }}</span>
        <select v-model="activeItem" class="mc-select" data-field="lang-item">
          <option v-for="id in items" :key="id" :value="id">{{ id }}</option>
        </select>
      </label>
      <code>menu.{{ menuId }}.items.{{ activeItem }}</code>
    </div>
    <label class="field">
      <span class="field-label">display_name</span>
      <input
        v-model="itemEntry.displayName"
        class="mc-input"
        data-field="lang-display-name"
        :placeholder="tx('物品显示名')"
      />
    </label>
    <label class="field">
      <span class="field-label">{{ tx("lore（每行一条）") }}</span>
      <textarea
        v-model="itemEntry.lore"
        class="mc-input lang-lore"
        data-field="lang-lore"
        rows="4"
        :placeholder="tx('&7第一行 / &7第二行')"
      />
    </label>
    <div class="lang-actions">
      <button class="mc-button primary" data-action="lang-export" @click="exportSnippet"> {{ tx("导出语言片段 .yml") }} </button>
      <span class="menu-hint">{{ tx("导出后请合并到 lang/en.yml、zh_CN.yml 等；menu/*.yml 永不写入文本。") }}</span>
    </div>
  </section>
</template>

<style>
.lang-panel .lang-target {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  margin-bottom: 8px;
}
.lang-panel .lang-target .field {
  flex: 1;
}
.lang-lore {
  resize: vertical;
  min-height: 80px;
  font-family: var(--mono);
}
.lang-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 8px;
}
</style>
