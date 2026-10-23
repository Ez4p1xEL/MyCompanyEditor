<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useProjectStore } from '../store/project';
import { closeExportDialog, exportDialogState } from '../core/exportDialog';
import {
  collectExportBlockers,
  groupExportBlockers,
  prepareAllExports,
  prepareExport,
  suggestedFilename,
  validateExportFilename,
} from '../core/export';
import { downloadTextFile } from '../core/download';
import { pushToast } from '../core/toast';
import { formatBytes } from '../core/format';
import { useI18n } from '../i18n';
import type { ValidationIssue } from '../core/types';

const store = useProjectStore();
const { t, locale } = useI18n();

function paren(text: string): string {
  return locale.value === 'en' ? ` (${text})` : `（${text}）`;
}

function kindLabel(kind: string): string {
  const known: Record<string, string> = {
    orders: t('shell.kind.orders'),
    focus: t('shell.kind.focus'),
    menu: t('shell.kind.menu'),
    'focus-tree': t('shell.kind.focusTree'),
    'menus-config': t('shell.kind.menusConfig'),
    unknown: t('shell.kind.unknown'),
  };
  return known[kind] ?? kind;
}
const targetPath = ref('');
const filename = ref('');
const filenameError = ref<string | null>(null);
const selfCheckIssues = ref<ValidationIssue[]>([]);

const targetFile = computed(() =>
  targetPath.value ? (store.files[targetPath.value] ?? null) : null,
);
const preparation = computed(() => (targetFile.value ? prepareExport(targetFile.value) : null));

/** 全项目阻断项：单文件导出与全部导出都必须先通过这一关。 */
const projectBlockers = computed(() => collectExportBlockers(store.fileList));
const blockerGroups = computed(() => groupExportBlockers(projectBlockers.value));

const preview = computed(() => {
  if (!preparation.value?.ok) return '';
  const lines = preparation.value.payload.text.split('\n');
  const head = lines.slice(0, 14).join('\n');
  return lines.length > 14 ? `${head}\n…` : head;
});

const fileIssueCount = computed(() => {
  const file = targetFile.value;
  if (!file) return 0;
  return file.issues.filter((issue) => issue.severity !== 'info').length;
});

const canDownload = computed(
  () => projectBlockers.value.length === 0 && Boolean(preparation.value?.ok),
);
const canExportAll = computed(
  () => store.fileList.length > 0 && projectBlockers.value.length === 0,
);

watch(
  () => exportDialogState.open,
  (open) => {
    if (!open) return;
    const preferred =
      exportDialogState.initialPath && store.files[exportDialogState.initialPath]
        ? exportDialogState.initialPath
        : (store.activePath ?? store.fileList[0]?.path ?? '');
    targetPath.value = preferred;
    filename.value = preferred ? suggestedFilename(preferred) : '';
    filenameError.value = null;
    selfCheckIssues.value = [];
  },
  { immediate: true },
);

watch(targetPath, (path) => {
  if (path) filename.value = suggestedFilename(path);
  filenameError.value = null;
  selfCheckIssues.value = [];
});

function close(): void {
  closeExportDialog();
}

/**
 * 定位到问题文件：选中文件、打开“项目总览”（通过侧栏真实点击，避免修改 App.vue），
 * 用户即可看到该文件的 errors 与详情。
 */
function locateFile(file: string): void {
  store.setActive(file);
  close();
  pushToast(t('shell.export.locating', { file }), 'info');
  window.setTimeout(() => {
    document.querySelector<HTMLElement>('[data-nav="project"]')?.click();
  }, 0);
}

function confirmExport(): void {
  if (projectBlockers.value.length > 0) {
    pushToast(t('shell.export.blockedCount', { count: projectBlockers.value.length }), 'error');
    return;
  }
  const file = targetFile.value;
  if (!file) {
    pushToast(t('shell.export.noFiles'), 'warning');
    return;
  }
  const trimmed = filename.value.trim();
  const nameError = validateExportFilename(trimmed);
  if (nameError) {
    filenameError.value = locale.value === 'zh-CN' ? nameError : t('shell.export.invalidFilename');
    return;
  }
  const result = prepareExport(file);
  if (!result.ok) {
    selfCheckIssues.value = result.issues;
    pushToast(t('shell.export.selfCheckBlocked'), 'error');
    return;
  }
  downloadTextFile(trimmed, result.payload.text);
  store.markExported(file.path);
  pushToast(t('shell.export.exported', { name: trimmed, size: formatBytes(result.payload.bytes) }), 'success');
  closeExportDialog();
}

function exportAll(): void {
  if (projectBlockers.value.length > 0) {
    pushToast(t('shell.export.blockedAllCount', { count: projectBlockers.value.length }), 'error');
    return;
  }
  const result = prepareAllExports(store.fileList);
  if (!result.ok) {
    selfCheckIssues.value = result.issues;
    pushToast(t('shell.export.allSelfCheckBlocked'), 'error');
    return;
  }
  for (const payload of result.payloads) {
    downloadTextFile(payload.filename, payload.text);
  }
  store.markExported();
  pushToast(t('shell.export.allExported', { count: result.payloads.length }), 'success');
  closeExportDialog();
}
</script>

<template>
  <div v-if="exportDialogState.open" class="modal-overlay" @click.self="close">
    <section class="modal export-dialog" role="dialog" aria-modal="true" :aria-label="t('shell.export.aria')">
      <header class="modal-header">
        <h2>{{ t('shell.export.title') }}</h2>
        <button class="modal-close" :aria-label="t('shell.export.close')" @click="close">×</button>
      </header>

      <div class="modal-body">
        <label class="field">
          <span class="field-label">{{ t('shell.export.selectFile') }}</span>
          <select v-model="targetPath" class="mc-select">
            <option v-for="file in store.fileList" :key="file.path" :value="file.path">
              {{ file.path }}{{ paren(kindLabel(file.kind)) }}
            </option>
          </select>
        </label>

        <label class="field">
          <span class="field-label">{{ t('shell.export.filename') }}</span>
          <input v-model="filename" class="mc-input" spellcheck="false" />
          <span v-if="filenameError" class="field-error">{{ filenameError }}</span>
        </label>

        <div v-if="targetFile" class="export-meta">
          <span>{{ t('shell.export.lines', { count: targetFile.stats.lineCount }) }}</span>
          <span>{{ formatBytes(targetFile.stats.byteSize) }}</span>
          <span>{{ t('shell.export.estimatedSize', { size: preparation?.ok ? formatBytes(preparation.payload.bytes) : '—' }) }}</span>
          <span v-if="fileIssueCount > 0" class="warn-text">{{ t('shell.export.fileIssueCount', { count: fileIssueCount }) }}</span>
        </div>

        <div v-if="blockerGroups.length > 0" class="export-blocked" data-testid="export-blockers">
          <p class="export-blocked-title">
            {{ t('shell.export.blockedTitle', { count: projectBlockers.length }) }}
          </p>
          <div v-for="group in blockerGroups" :key="group.file" class="blocker-group">
            <div class="blocker-file">
              <code>{{ group.file }}</code>
              <button
                class="link-button"
                type="button"
                data-action="locate-blocker-file"
                @click="locateFile(group.file)"
              >
                {{ t('shell.export.locateFile') }}
              </button>
            </div>
            <ul>
              <li v-for="(issue, index) in group.issues" :key="`${issue.code}-${index}`">
                <code v-if="issue.code" class="blocker-code">{{ issue.code }}</code>
                {{ issue.message }}
                <span v-if="issue.path" class="blocker-path">· {{ issue.path }}</span>
                <span v-if="issue.line" class="blocker-path">· {{ t('shell.issue.line', { line: issue.line }) }}</span>
              </li>
            </ul>
          </div>
          <p class="muted">
            {{ t('shell.export.blockersFixHint') }}
          </p>
        </div>

        <div v-if="selfCheckIssues.length > 0" class="export-blocked" data-testid="export-self-check">
          <p class="export-blocked-title">{{ t('shell.export.selfCheckTitle') }}</p>
          <ul>
            <li v-for="issue in selfCheckIssues" :key="`${issue.code}-${issue.line}`">
              {{ issue.message }}<template v-if="issue.line">{{ paren(t('shell.issue.line', { line: issue.line })) }}</template>
            </li>
          </ul>
        </div>

        <div v-if="preparation?.ok" class="export-preview">
          <p class="field-label">{{ t('shell.export.preview') }}</p>
          <pre>{{ preview }}</pre>
        </div>
      </div>

      <footer class="modal-footer">
        <button class="mc-button" @click="close">{{ t('shell.export.cancel') }}</button>
        <button
          class="mc-button"
          data-action="export-all"
          :disabled="!canExportAll"
          :title="canExportAll ? t('shell.export.exportAllTitle') : t('shell.export.exportAllDisabled')"
          @click="exportAll"
        >
          {{ t('shell.export.exportAll', { count: store.fileList.length }) }}
        </button>
        <button
          class="mc-button primary"
          data-action="confirm-export"
          :disabled="!canDownload"
          :title="canDownload ? t('shell.export.downloadTitle') : t('shell.export.downloadDisabled')"
          @click="confirmExport"
        >
          {{ t('shell.export.download') }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.blocker-group {
  margin-top: 8px;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(224, 100, 90, 0.35);
}

.blocker-file {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 4px;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
}

.blocker-file code {
  color: var(--mc-diamond);
  font-size: 11.5px;
}

.blocker-group ul {
  margin: 6px 0 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11.5px;
}

.blocker-code {
  margin-right: 4px;
  color: #ffb3aa;
  font-size: 10.5px;
}

.blocker-path {
  color: var(--mc-muted);
  font-family: var(--mc-mono);
  font-size: 10.5px;
}
</style>
