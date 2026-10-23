<script setup lang="ts">
import { computed } from 'vue';
import { useProjectStore } from '../store/project';
import { useI18n } from '../i18n';
import type { FeatureNavItem } from '../core/types';

const props = defineProps<{
  items: FeatureNavItem[];
  activeId: string;
}>();

const emit = defineEmits<{ (event: 'select', id: string): void }>();
const store = useProjectStore();
const { t } = useI18n();

const counts = computed(() => store.kindCounts);

function countFor(id: string): number {
  switch (id) {
    case 'project':
      return store.fileCount;
    case 'orders':
      return counts.value.orders;
    case 'focus':
      return counts.value.focus;
    case 'menu':
      return counts.value.menu;
    default:
      return 0;
  }
}

function navTitle(id: string): string {
  const key = `shell.nav.${id}`;
  const translated = t(key);
  return translated === key ? id : translated;
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-label">{{ t('shell.sidebar.workspace') }}</div>
    <nav class="sidebar-nav">
      <button
        v-for="item in props.items"
        :key="item.id"
        class="nav-item"
        :class="{ active: item.id === props.activeId, placeholder: !item.available }"
        :data-nav="item.id"
        :aria-label="navTitle(item.id) + (item.available ? '' : t('shell.nav.placeholderSuffix'))"
        @click="emit('select', item.id)"
      >
        <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
        <span class="nav-title">{{ navTitle(item.id) }}</span>
        <span v-if="!item.available" class="nav-placeholder">{{ t('shell.sidebar.placeholder') }}</span>
        <span class="nav-count">{{ countFor(item.id) }}</span>
      </button>
    </nav>

    <div class="sidebar-label">{{ t('shell.sidebar.fileStats') }}</div>
    <dl class="sidebar-stats">
      <div><dt>{{ t('shell.sidebar.orders') }}</dt><dd>{{ counts.orders }}</dd></div>
      <div><dt>{{ t('shell.sidebar.focusFiles') }}</dt><dd>{{ counts.focus }}</dd></div>
      <div><dt>{{ t('shell.sidebar.menus') }}</dt><dd>{{ counts.menu }}</dd></div>
      <div><dt>{{ t('shell.sidebar.legacy') }}</dt><dd>{{ counts['focus-tree'] + counts['menus-config'] }}</dd></div>
      <div v-if="counts.unknown > 0"><dt>{{ t('shell.sidebar.unknown') }}</dt><dd>{{ counts.unknown }}</dd></div>
    </dl>

    <div class="sidebar-footer">
      <p>
        {{ t('shell.sidebar.menuLangPrefix') }}<code>lang/&lt;language&gt;.yml</code>{{ t('shell.sidebar.menuLangSuffix') }}
      </p>
      <p>
        <code>orders.yml</code>{{ t('shell.sidebar.reloadPrefix') }}<code>/mycompany reload</code>{{ t('shell.sidebar.reloadSuffix') }}
      </p>
      <p class="muted">{{ t('shell.sidebar.fixedNote') }}</p>
    </div>
  </aside>
</template>
