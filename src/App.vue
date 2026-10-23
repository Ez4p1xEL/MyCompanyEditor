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
import { onLocaleChange, useI18n } from './i18n';

const store = useProjectStore();
const { t } = useI18n();
const unsubscribeLocale = onLocaleChange(() => {
  // 语言切换只触发重新校验，不修改文件内容；校验器可据此刷新本地化消息。
  store.validateAll();
});
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
    pushToast(t('shell.app.invalidFiles'), 'warning');
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
        result.replaced.length > 0 ? t('shell.app.replacedSuffix', { count: result.replaced.length }) : '';
      pushToast(t('shell.app.imported', { count: result.imported.length }) + replaced, 'success');
    }
    if (result.skipped.length > 0) {
      pushToast(
        t('shell.app.skipped', { count: result.skipped.length, reason: result.skipped[0]?.reason ?? '' }),
        'warning',
      );
    }
    if (ignored > 0) pushToast(t('shell.app.ignored', { count: ignored }), 'warning');
    if (result.issueCount > 0) {
      pushToast(t('shell.app.issues', { count: result.issueCount }), 'warning');
    }
  } catch (error) {
    console.error('[MyCompanyEditor] 读取文件失败', error);
    pushToast(t('shell.app.readFailed'), 'error');
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
  unsubscribeLocale();
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
        <strong>{{ t('shell.app.dropTitle') }}</strong>
        <span class="muted">{{ t('shell.app.dropHint') }}</span>
      </div>
    </div>
  </div>
</template>
