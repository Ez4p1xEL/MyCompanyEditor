<script setup lang="ts">
import { computed } from 'vue';
import { useProjectStore } from '../store/project';
import type { FeatureNavItem } from '../core/types';

const props = defineProps<{
  items: FeatureNavItem[];
  activeId: string;
}>();

const emit = defineEmits<{ (event: 'select', id: string): void }>();
const store = useProjectStore();

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
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-label">工作区</div>
    <nav class="sidebar-nav">
      <button
        v-for="item in props.items"
        :key="item.id"
        class="nav-item"
        :class="{ active: item.id === props.activeId, placeholder: !item.available }"
        :data-nav="item.id"
        :aria-label="item.title + (item.available ? '' : '（功能占位）')"
        @click="emit('select', item.id)"
      >
        <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
        <span class="nav-title">{{ item.title }}</span>
        <span v-if="!item.available" class="nav-placeholder">占位</span>
        <span class="nav-count">{{ countFor(item.id) }}</span>
      </button>
    </nav>

    <div class="sidebar-label">文件统计</div>
    <dl class="sidebar-stats">
      <div><dt>订单</dt><dd>{{ counts.orders }}</dd></div>
      <div><dt>专精文件</dt><dd>{{ counts.focus }}</dd></div>
      <div><dt>菜单</dt><dd>{{ counts.menu }}</dd></div>
      <div><dt>遗留配置</dt><dd>{{ counts['focus-tree'] + counts['menus-config'] }}</dd></div>
      <div v-if="counts.unknown > 0"><dt>未知文件</dt><dd>{{ counts.unknown }}</dd></div>
    </dl>

    <div class="sidebar-footer">
      <p>菜单文本（标题 / 物品名 / lore）在 <code>lang/&lt;language&gt;.yml</code>，不在 menu 文件内。</p>
      <p><code>orders.yml</code> 修改后需重启服务器；menu / focus 可 <code>/mycompany reload</code>。</p>
      <p class="muted">焦点文件固定为 none / mob，菜单固定 18 个，均不能新增文件。</p>
    </div>
  </aside>
</template>
