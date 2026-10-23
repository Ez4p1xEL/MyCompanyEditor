<script setup lang="ts">
import { computed } from 'vue';
import { useProjectStore } from '../store/project';
import { openExportDialog } from '../core/exportDialog';
import { pushToast } from '../core/toast';
import { formatTime } from '../core/format';
import { useI18n } from '../i18n';

const emit = defineEmits<{ (event: 'import-request'): void }>();
const store = useProjectStore();
const { t, locale, setLocale } = useI18n();
const counts = computed(() => store.issueCounts);

const saveHint = computed(() => {
  if (!store.hasFiles) return t('common.toolbar.autosave.empty');
  if (!store.isLocallySaved) return t('common.toolbar.autosave.saving');
  if (store.lastSavedAt) return t('common.toolbar.autosave.savedAt', { time: formatTime(store.lastSavedAt) });
  return t('common.toolbar.autosave.saved');
});

function requestImport(): void {
  emit('import-request');
}

function requestExport(): void {
  if (!store.hasFiles) {
    pushToast(t('common.toast.importFirst'), 'warning');
    return;
  }
  openExportDialog(store.activePath);
}

function loadSample(): void {
  const result = store.loadSample();
  const params = {
    imported: result.imported.length,
    replaced: result.replaced.length,
    total: result.imported.length + result.replaced.length,
  };
  const key =
    result.replaced.length > 0
      ? 'common.toast.sampleLoadedReplaced'
      : 'common.toast.sampleLoaded';
  pushToast(t(key, params), 'success');
}

function clearProject(): void {
  if (!store.hasFiles) return;
  if (window.confirm(t('common.confirm.clearProject'))) {
    store.clearProject();
    pushToast(t('common.toast.projectCleared'), 'info');
  }
}
</script>

<template>
  <header class="toolbar">
    <div class="toolbar-brand">
      <div class="brand-block" aria-hidden="true">MC</div>
      <div class="brand-text">
        <strong>{{ t('common.toolbar.brand') }}</strong>
        <span>{{ t('common.toolbar.subtitle') }}</span>
      </div>
    </div>

    <div class="toolbar-actions">
      <button class="mc-button primary" data-action="import" @click="requestImport">
        {{ t('common.toolbar.import') }}
      </button>
      <button class="mc-button" data-action="export" :disabled="!store.hasFiles" @click="requestExport">
        {{ t('common.toolbar.export') }}
      </button>

      <div class="toolbar-counters" :aria-label="t('common.toolbar.countersLabel')">
        <span class="counter counter-error" :class="{ zero: counts.error === 0 }">
          {{ t('common.toolbar.errors', { count: counts.error }) }}
        </span>
        <span class="counter counter-warning" :class="{ zero: counts.warning === 0 }">
          {{ t('common.toolbar.warnings', { count: counts.warning }) }}
        </span>
        <span class="counter counter-info" :class="{ zero: counts.info === 0 }">
          {{ t('common.toolbar.infos', { count: counts.info }) }}
        </span>
      </div>
    </div>

    <div class="toolbar-meta">
      <div class="toolbar-lang" role="group" :aria-label="t('common.toolbar.languageLabel')">
        <button
          class="lang-button"
          :class="{ active: locale === 'zh-CN' }"
          type="button"
          data-locale="zh-CN"
          :aria-pressed="locale === 'zh-CN'"
          @click="setLocale('zh-CN')"
        >
          {{ t('common.toolbar.languageZh') }}
        </button>
        <button
          class="lang-button"
          :class="{ active: locale === 'en' }"
          type="button"
          data-locale="en"
          :aria-pressed="locale === 'en'"
          @click="setLocale('en')"
        >
          {{ t('common.toolbar.languageEn') }}
        </button>
      </div>

      <span v-if="store.isDirty" class="dirty-badge">{{ t('common.toolbar.dirty') }}</span>
      <span v-else-if="store.hasFiles" class="clean-badge">{{ t('common.toolbar.clean') }}</span>
      <span class="autosave-hint">{{ saveHint }}</span>
      <details class="project-menu">
        <summary class="mc-button small">{{ t('common.toolbar.projectMenu') }}</summary>
        <div class="project-menu-panel">
          <button class="menu-entry" data-action="menu-load-sample" @click="loadSample">
            {{ t('common.toolbar.loadSample') }}
          </button>
          <button class="menu-entry danger" data-action="menu-clear" :disabled="!store.hasFiles" @click="clearProject">
            {{ t('common.toolbar.clearProject') }}
          </button>
          <p class="menu-note">{{ t('common.toolbar.localStorageNote') }}</p>
        </div>
      </details>
      <span class="version-badge">
        {{ t('common.toolbar.version', { spec: '6764e01', plugin: '0.8.50' }) }}
      </span>
    </div>
  </header>
</template>

<style scoped>
.toolbar-lang {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 2px;
  overflow: hidden;
}
.lang-button {
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  padding: 3px 7px;
}
.lang-button + .lang-button {
  border-left: 1px solid var(--border);
}
.lang-button:hover {
  color: var(--text);
}
.lang-button.active {
  background: rgba(126, 200, 80, 0.16);
  color: var(--accent);
}
</style>
