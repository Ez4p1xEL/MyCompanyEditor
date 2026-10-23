<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  ref,
  watch,
  type Component,
} from 'vue';
import AppToolbar from './components/AppToolbar.vue';
import AppSidebar from './components/AppSidebar.vue';
import FeaturePlaceholder from './components/FeaturePlaceholder.vue';
import ExportDialog from './components/ExportDialog.vue';
import ToastHost from './components/ToastHost.vue';
import { getFeature, getNavItems } from './features/registry';
import { useProjectStore } from './store/project';
import { pushToast } from './core/toast';

const store = useProjectStore();
const navItems = getNavItems();
const activeFeatureId = ref(store.activeFeatureId || 'project');
const fileInput = ref<HTMLInputElement | null>(null);
const dragging = ref(false);
const dragDepth = ref(0);

const feature = computed(() => getFeature(activeFeatureId.value));
const navItem = computed(
  () => navItems.find((item) => item.id === activeFeatureId.value) ?? navItems[0],
);

const componentCache = new Map<string, Component>();
const activeComponent = computed<Component | null>(() => {
  const featureModule = feature.value;
  if (!featureModule) return null;
  const cached = componentCache.get(featureModule.id);
  if (cached) return cached;
  const asyncComponent = defineAsyncComponent(featureModule.component);
  componentCache.set(featureModule.id, asyncComponent);
  return asyncComponent;
});

function selectFeature(id: string): void {
  activeFeatureId.value = id;
  store.setActiveFeature(id);
}

function openFilePicker(): void {
  fileInput.value?.click();
}

async function ingestFiles(files: File[]): Promise<void> {
  const yamlFiles = files.filter((file) => /\.ya?ml$/i.test(file.name));
  if (yamlFiles.length === 0) {
    pushToast('请选择 .yml / .yaml 文件', 'warning');
    return;
  }
  const ignored = files.length - yamlFiles.length;
  try {
    const inputs = await Promise.all(
      yamlFiles.map(async (file) => ({
        path:
          (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
        text: await file.text(),
      })),
    );
    const result = store.importFiles(inputs);
    if (result.imported.length > 0) {
      const replaced =
        result.replaced.length > 0 ? `，替换 ${result.replaced.length} 个同名文件` : '';
      pushToast(`已导入 ${result.imported.length} 个文件${replaced}`, 'success');
    }
    if (result.skipped.length > 0) {
      pushToast(`跳过 ${result.skipped.length} 个文件：${result.skipped[0]?.reason ?? ''}`, 'warning');
    }
    if (ignored > 0) pushToast(`忽略 ${ignored} 个非 YAML 文件`, 'warning');
    if (result.issueCount > 0) {
      pushToast(`校验发现 ${result.issueCount} 条错误/警告，请在项目总览查看`, 'warning');
    }
  } catch (error) {
    console.error('[MyCompanyEditor] 读取文件失败', error);
    pushToast('读取文件失败，请重试', 'error');
  }
}

function handleFilePicked(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    void ingestFiles(Array.from(input.files));
  }
  input.value = '';
}

function handleDragEnter(event: DragEvent): void {
  event.preventDefault();
  dragDepth.value += 1;
  dragging.value = true;
}

function handleDragLeave(event: DragEvent): void {
  event.preventDefault();
  dragDepth.value = Math.max(0, dragDepth.value - 1);
  if (dragDepth.value === 0) dragging.value = false;
}

function handleDrop(event: DragEvent): void {
  event.preventDefault();
  dragDepth.value = 0;
  dragging.value = false;
  const files = event.dataTransfer?.files;
  if (files && files.length > 0) void ingestFiles(Array.from(files));
}

let saveTimer: number | undefined;
function scheduleSave(): void {
  if (!store.hasFiles) return;
  if (saveTimer !== undefined) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined;
    store.saveToLocalStorage();
  }, 450);
}

watch(() => store.projectSignature, scheduleSave);
watch(() => store.activePath, scheduleSave);

onBeforeUnmount(() => {
  if (saveTimer !== undefined) window.clearTimeout(saveTimer);
  saveTimer = undefined;
});
</script>

<template>
  <div
    class="app-shell"
    @dragenter.prevent="handleDragEnter"
    @dragover.prevent
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleDrop"
  >
    <AppToolbar @import-request="openFilePicker" />

    <div class="app-body">
      <AppSidebar :items="navItems" :active-id="activeFeatureId" @select="selectFeature" />

      <main class="app-main">
        <component :is="activeComponent" v-if="activeComponent" :key="activeFeatureId" />
        <FeaturePlaceholder
          v-else
          :feature-id="activeFeatureId"
          :title="navItem?.title ?? activeFeatureId"
          :icon="navItem?.icon ?? '🧩'"
        />
      </main>
    </div>

    <input
      ref="fileInput"
      class="visually-hidden"
      type="file"
      accept=".yml,.yaml,text/yaml,application/x-yaml"
      multiple
      @change="handleFilePicked"
    />

    <ExportDialog />
    <ToastHost />

    <div v-if="dragging" class="drop-overlay">
      <div class="drop-card">
        <span class="drop-icon" aria-hidden="true">📥</span>
        <strong>松开以导入 YAML 文件</strong>
        <span class="muted">支持 orders.yml / focus/*.yml / menu/*.yml</span>
      </div>
    </div>
  </div>
</template>
