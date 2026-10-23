<script setup lang="ts">
import { computed } from 'vue';
import { useProjectStore } from '../store/project';
import { openExportDialog } from '../core/exportDialog';
import { pushToast } from '../core/toast';
import { describeSampleImport } from '../core/samples';
import { formatTime } from '../core/format';

const emit = defineEmits<{ (event: 'import-request'): void }>();
const store = useProjectStore();
const counts = computed(() => store.issueCounts);

const saveHint = computed(() => {
  if (!store.hasFiles) return '尚未载入项目';
  if (!store.isLocallySaved) return '正在保存到本地…';
  if (store.lastSavedAt) return `已自动保存 ${formatTime(store.lastSavedAt)}`;
  return '已保存到本地';
});

function requestImport(): void {
  emit('import-request');
}

function requestExport(): void {
  if (!store.hasFiles) {
    pushToast('请先导入 YAML 文件', 'warning');
    return;
  }
  openExportDialog(store.activePath);
}

function loadSample(): void {
  const result = store.loadSample();
  pushToast(describeSampleImport(result), 'success');
}

function clearProject(): void {
  if (!store.hasFiles) return;
  if (window.confirm('确定清空当前项目？已下载的文件不会被删除。')) {
    store.clearProject();
    pushToast('项目已清空', 'info');
  }
}
</script>

<template>
  <header class="toolbar">
    <div class="toolbar-brand">
      <div class="brand-block" aria-hidden="true">MC</div>
      <div class="brand-text">
        <strong>MyCompany 编辑器</strong>
        <span>orders / focus / menu · 纯前端本地处理</span>
      </div>
    </div>

    <div class="toolbar-actions">
      <button class="mc-button primary" data-action="import" @click="requestImport">导入</button>
      <button class="mc-button" data-action="export" :disabled="!store.hasFiles" @click="requestExport">
        导出
      </button>

      <div class="toolbar-counters" aria-label="校验计数">
        <span class="counter counter-error" :class="{ zero: counts.error === 0 }">
          错误 {{ counts.error }}
        </span>
        <span class="counter counter-warning" :class="{ zero: counts.warning === 0 }">
          警告 {{ counts.warning }}
        </span>
        <span class="counter counter-info" :class="{ zero: counts.info === 0 }">
          提示 {{ counts.info }}
        </span>
      </div>
    </div>

    <div class="toolbar-meta">
      <span v-if="store.isDirty" class="dirty-badge">● 未导出修改</span>
      <span v-else-if="store.hasFiles" class="clean-badge">● 已同步</span>
      <span class="autosave-hint">{{ saveHint }}</span>
      <details class="project-menu">
        <summary class="mc-button small">项目</summary>
        <div class="project-menu-panel">
          <button class="menu-entry" data-action="menu-load-sample" @click="loadSample">载入示例（23 个文件）</button>
          <button class="menu-entry danger" data-action="menu-clear" :disabled="!store.hasFiles" @click="clearProject">
            清空当前项目
          </button>
          <p class="menu-note">项目会自动保存在浏览器 localStorage 中。</p>
        </div>
      </details>
      <span class="version-badge">规范 6764e01 · 插件 0.8.50</span>
    </div>
  </header>
</template>
