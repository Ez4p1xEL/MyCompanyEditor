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
import { fileKindLabel } from '../core/fileTypes';
import type { ValidationIssue } from '../core/types';

const store = useProjectStore();
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
  pushToast(`已选中 ${file}，可在项目总览查看校验问题`, 'info');
  window.setTimeout(() => {
    document.querySelector<HTMLElement>('[data-nav="project"]')?.click();
  }, 0);
}

function confirmExport(): void {
  if (projectBlockers.value.length > 0) {
    pushToast(`存在 ${projectBlockers.value.length} 条错误/阻断项，已禁止导出`, 'error');
    return;
  }
  const file = targetFile.value;
  if (!file) {
    pushToast('没有可导出的文件', 'warning');
    return;
  }
  const trimmed = filename.value.trim();
  const nameError = validateExportFilename(trimmed);
  if (nameError) {
    filenameError.value = nameError;
    return;
  }
  const result = prepareExport(file);
  if (!result.ok) {
    selfCheckIssues.value = result.issues;
    pushToast('导出被阻止：当前文件无法通过导出前自检', 'error');
    return;
  }
  downloadTextFile(trimmed, result.payload.text);
  store.markExported(file.path);
  pushToast(`已导出 ${trimmed}（${formatBytes(result.payload.bytes)}）`, 'success');
  closeExportDialog();
}

function exportAll(): void {
  if (projectBlockers.value.length > 0) {
    pushToast(`存在 ${projectBlockers.value.length} 条错误/阻断项，已禁止全部导出`, 'error');
    return;
  }
  const result = prepareAllExports(store.fileList);
  if (!result.ok) {
    selfCheckIssues.value = result.issues;
    pushToast('全部导出被阻止：存在无法通过自检的文件', 'error');
    return;
  }
  for (const payload of result.payloads) {
    downloadTextFile(payload.filename, payload.text);
  }
  store.markExported();
  pushToast(`已导出全部 ${result.payloads.length} 个文件（逐个下载，警告/提示不阻断）`, 'success');
  closeExportDialog();
}
</script>

<template>
  <div v-if="exportDialogState.open" class="modal-overlay" @click.self="close">
    <section class="modal export-dialog" role="dialog" aria-modal="true" aria-label="导出文件">
      <header class="modal-header">
        <h2>导出 YAML 文件</h2>
        <button class="modal-close" aria-label="关闭" @click="close">×</button>
      </header>

      <div class="modal-body">
        <label class="field">
          <span class="field-label">选择文件</span>
          <select v-model="targetPath" class="mc-select">
            <option v-for="file in store.fileList" :key="file.path" :value="file.path">
              {{ file.path }}（{{ fileKindLabel(file.kind) }}）
            </option>
          </select>
        </label>

        <label class="field">
          <span class="field-label">保存文件名</span>
          <input v-model="filename" class="mc-input" spellcheck="false" />
          <span v-if="filenameError" class="field-error">{{ filenameError }}</span>
        </label>

        <div v-if="targetFile" class="export-meta">
          <span>共 {{ targetFile.stats.lineCount }} 行</span>
          <span>{{ formatBytes(targetFile.stats.byteSize) }}</span>
          <span>导出后大小约 {{ preparation?.ok ? formatBytes(preparation.payload.bytes) : '—' }}</span>
          <span v-if="fileIssueCount > 0" class="warn-text">本文件有 {{ fileIssueCount }} 条错误/警告</span>
        </div>

        <div v-if="blockerGroups.length > 0" class="export-blocked" data-testid="export-blockers">
          <p class="export-blocked-title">
            已阻止导出：全项目存在 {{ projectBlockers.length }} 条错误/阻断项
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
                定位此文件
              </button>
            </div>
            <ul>
              <li v-for="(issue, index) in group.issues" :key="`${issue.code}-${index}`">
                <code v-if="issue.code" class="blocker-code">{{ issue.code }}</code>
                {{ issue.message }}
                <span v-if="issue.path" class="blocker-path">· {{ issue.path }}</span>
                <span v-if="issue.line" class="blocker-path">· 第 {{ issue.line }} 行</span>
              </li>
            </ul>
          </div>
          <p class="muted">
            修正全部错误/阻断项后才能导出；纯警告/提示不会阻止导出。
          </p>
        </div>

        <div v-if="selfCheckIssues.length > 0" class="export-blocked" data-testid="export-self-check">
          <p class="export-blocked-title">导出前自检失败：</p>
          <ul>
            <li v-for="issue in selfCheckIssues" :key="`${issue.code}-${issue.line}`">
              {{ issue.message }}<template v-if="issue.line">（第 {{ issue.line }} 行）</template>
            </li>
          </ul>
        </div>

        <div v-if="preparation?.ok" class="export-preview">
          <p class="field-label">预览（前 14 行）</p>
          <pre>{{ preview }}</pre>
        </div>
      </div>

      <footer class="modal-footer">
        <button class="mc-button" @click="close">取消</button>
        <button
          class="mc-button"
          data-action="export-all"
          :disabled="!canExportAll"
          :title="canExportAll ? '逐个下载项目全部文件' : '存在错误/阻断项或没有文件'"
          @click="exportAll"
        >
          导出全部（{{ store.fileList.length }} 个）
        </button>
        <button
          class="mc-button primary"
          data-action="confirm-export"
          :disabled="!canDownload"
          :title="canDownload ? '下载当前文件' : '存在错误/阻断项，禁止导出'"
          @click="confirmExport"
        >
          下载 .yml
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
