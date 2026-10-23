<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useProjectStore } from '../store/project';
import { fileKindIcon } from '../core/fileTypes';
import { formatBytes } from '../core/format';
import { openExportDialog } from '../core/exportDialog';
import { pushToast } from '../core/toast';
import { useI18n } from '../i18n';
import IssueList from '../components/IssueList.vue';
import type { FileKind, ProjectFile } from '../core/types';

const emit = defineEmits<{ (event: 'import-request'): void }>();

const store = useProjectStore();
const { t } = useI18n();

function kindLabel(kind: string): string {
  return t(`shell.kind.${kind === 'focus-tree' ? 'focusTree' : kind === 'menus-config' ? 'menusConfig' : kind}`);
}
const selectedPath = ref<string | null>(null);

const hasFiles = computed(() => store.hasFiles);
const counts = computed(() => store.kindCounts);
const issueCounts = computed(() => store.issueCounts);
/** 用户手动选中的文件；未手动选择时跟随 store.activePath（导入后自动展示首个文件）。 */
const currentPath = computed(() => selectedPath.value ?? store.activePath);
const selectedFile = computed<ProjectFile | null>(() =>
  currentPath.value ? (store.files[currentPath.value] ?? null) : null,
);

interface FileGroup {
  kind: FileKind;
  label: string;
  icon: string;
  files: ProjectFile[];
}

const fileGroups = computed<FileGroup[]>(() => {
  const groups: FileGroup[] = [];
  for (const file of store.fileList) {
    let group = groups.find((candidate) => candidate.kind === file.kind);
    if (!group) {
      group = {
        kind: file.kind,
        label: kindLabel(file.kind),
        icon: fileKindIcon(file.kind),
        files: [],
      };
      groups.push(group);
    }
    group.files.push(file);
  }
  return groups;
});

const topLevelKeys = computed(() => selectedFile.value?.stats.topLevelKeys ?? []);
const menuId = computed(() => {
  const path = selectedFile.value?.path ?? '';
  return path.replace(/^menu\//, '').replace(/\.ya?ml$/, '');
});
const previewText = computed(() => {
  if (!selectedFile.value) return '';
  const lines = selectedFile.value.text.split('\n');
  const head = lines.slice(0, 80).join('\n');
  return lines.length > 80 ? `${head}\n${t('shell.overview.previewTruncated')}` : head;
});
const errorIssues = computed(() => (selectedFile.value?.issues ?? []).filter((issue) => issue.severity === 'error'));

// 导出对话框“定位”只更新 store.activePath；这里同步详情面板，以便跳转后立即看到该文件。
watch(
  () => store.activePath,
  (path) => {
    if (path) selectedPath.value = path;
  },
);

function selectFile(file: ProjectFile): void {
  selectedPath.value = file.path;
  store.setActive(file.path);
}

function requestImport(): void {
  emit('import-request');
}

function loadSample(): void {
  const result = store.loadSample();
  selectedPath.value = 'orders.yml';
  store.setActive('orders.yml');
  const sampleParams = { imported: result.imported.length, replaced: result.replaced.length, total: result.imported.length + result.replaced.length };
  pushToast(
    t(result.replaced.length > 0 ? 'common.toast.sampleLoadedReplaced' : 'common.toast.sampleLoaded', sampleParams),
    'success',
  );
  if (result.issueCount > 0) {
    pushToast(t('shell.overview.sampleIssueCount', { count: result.issueCount }), 'warning');
  }
}

function exportSelected(): void {
  if (selectedFile.value) openExportDialog(selectedFile.value.path);
}
</script>

<template>
  <section class="overview">
    <header class="overview-header">
      <div>
        <h1>{{ t('shell.overview.title') }}</h1>
        <p class="overview-subtitle">
          {{ t('shell.overview.subtitle') }}
        </p>
      </div>
      <div class="overview-actions">
        <button class="mc-button" data-action="overview-import" @click="requestImport">{{ t('shell.overview.importYaml') }}</button>
        <button class="mc-button primary" data-action="load-sample" @click="loadSample">
          {{ t('shell.overview.loadSample') }}
        </button>
      </div>
    </header>

    <div v-if="!hasFiles" class="empty-state">
      <div class="empty-art" aria-hidden="true">
        <div class="grass-block"></div>
        <div class="dirt-block"></div>
      </div>
      <h2>{{ t('shell.overview.emptyTitle') }}</h2>
      <p>{{ t('shell.overview.emptyText') }}</p>
      <div class="empty-actions">
        <button class="mc-button primary" data-action="empty-import" @click="requestImport">
          {{ t('shell.overview.emptyImport') }}
        </button>
        <button class="mc-button" data-action="load-sample" @click="loadSample">{{ t('shell.overview.loadSample') }}</button>
      </div>
      <ul class="empty-hints">
        <li>{{ t('shell.overview.emptyHint1') }}</li>
        <li>{{ t('shell.overview.emptyHint2') }}</li>
        <li>{{ t('shell.overview.emptyHint3') }}</li>
      </ul>
      <p class="version-line">{{ t('shell.overview.versionLine') }}</p>
    </div>

    <template v-else>
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-label">{{ t('shell.overview.statFiles') }}</span><strong>{{ store.fileCount }}</strong>
          <span class="stat-note">orders / focus / menu</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">{{ t('shell.overview.statOrders') }}</span><strong>{{ counts.orders }}</strong>
          <span class="stat-note">orders.yml</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">{{ t('shell.overview.statFocus') }}</span><strong>{{ counts.focus }}</strong>
          <span class="stat-note">focus/none.yml · focus/mob.yml</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">{{ t('shell.overview.statMenus') }}</span><strong>{{ counts.menu }}</strong>
          <span class="stat-note">{{ t('shell.overview.statFixedMenus') }}</span>
        </div>
        <div class="stat-card stat-error">
          <span class="stat-label">{{ t('shell.overview.statErrors') }}</span><strong>{{ issueCounts.error }}</strong>
          <span class="stat-note">{{ t('shell.overview.statBlocksExport') }}</span>
        </div>
        <div class="stat-card stat-warning">
          <span class="stat-label">{{ t('shell.overview.statWarnings') }}</span>
          <strong>{{ issueCounts.warning }} / {{ issueCounts.info }}</strong>
          <span class="stat-note">{{ t('shell.overview.statNoBlock') }}</span>
        </div>
      </div>

      <div class="workspace-grid">
        <div class="file-panel">
          <div class="panel-title">
            <h2>{{ t('shell.overview.projectFiles') }}</h2>
            <span class="muted">{{ t('shell.overview.fileCount', { count: store.fileCount }) }}</span>
          </div>
          <div v-for="group in fileGroups" :key="group.kind" class="file-group">
            <div class="file-group-title">
              <span aria-hidden="true">{{ group.icon }}</span>
              <span>{{ group.label }}</span>
              <span class="file-group-count">{{ group.files.length }}</span>
            </div>
            <button
              v-for="file in group.files"
              :key="file.path"
              class="file-row"
              :class="{ active: file.path === currentPath }"
              :data-file="file.path"
              @click="selectFile(file)"
            >
              <span class="file-path">{{ file.path }}</span>
              <span v-if="file.issues.some((issue) => issue.severity === 'error')" class="file-dot error">
                {{ file.issues.filter((issue) => issue.severity === 'error').length }}
              </span>
              <span
                v-else-if="file.issues.some((issue) => issue.severity === 'warning')"
                class="file-dot warning"
              >
                {{ file.issues.filter((issue) => issue.severity === 'warning').length }}
              </span>
              <span v-else class="file-dot ok">✓</span>
              <span class="file-size">{{ formatBytes(file.stats.byteSize) }}</span>
            </button>
          </div>
        </div>

        <div class="detail-panel">
          <template v-if="selectedFile">
            <div class="detail-header">
              <div>
                <h2>{{ selectedFile.path }}</h2>
                <p class="muted">{{ kindLabel(selectedFile.kind) }} · {{ fileKindIcon(selectedFile.kind) }}</p>
              </div>
              <button class="mc-button small" data-action="export-file" @click="exportSelected">{{ t('shell.overview.exportFile') }}</button>
            </div>

            <div v-if="errorIssues.length > 0" class="detail-alert">
              <strong>{{ t('shell.overview.syntaxErrors') }}</strong>
              <p v-for="issue in errorIssues" :key="`${issue.code}-${issue.line}`">
                {{ issue.message }}<template v-if="issue.line">（<template v-if="issue.column">{{ t('shell.issue.lineColumn', { line: issue.line, column: issue.column }) }}</template><template v-else>{{ t('shell.issue.line', { line: issue.line }) }}</template>）</template>
              </p>
            </div>

            <dl class="detail-meta">
              <div><dt>{{ t('shell.overview.lineCount') }}</dt><dd>{{ selectedFile.stats.lineCount }}</dd></div>
              <div><dt>{{ t('shell.overview.size') }}</dt><dd>{{ formatBytes(selectedFile.stats.byteSize) }}</dd></div>
              <div><dt>{{ t('shell.overview.topLevel') }}</dt><dd>{{ selectedFile.stats.topLevelKeyCount }}</dd></div>
              <div><dt>{{ t('shell.overview.issues') }}</dt><dd>{{ selectedFile.issues.length }}</dd></div>
            </dl>

            <div v-if="selectedFile.kind === 'menu'" class="source-note">
              {{ t('shell.overview.menuSource', { menuId }) }}
            </div>
            <div v-if="selectedFile.kind === 'focus-tree' || selectedFile.kind === 'menus-config'" class="source-note legacy">
              {{ t('shell.overview.legacySource') }}
            </div>

            <div v-if="topLevelKeys.length > 0" class="key-section">
              <h3>{{ t('shell.overview.topLevelTitle', { count: selectedFile.stats.topLevelKeyCount }) }}</h3>
              <div class="key-chips">
                <span v-for="key in topLevelKeys.slice(0, 40)" :key="key" class="key-chip">{{ key }}</span>
                <span v-if="topLevelKeys.length > 40" class="key-chip more">
                  +{{ topLevelKeys.length - 40 }}
                </span>
              </div>
            </div>

            <div class="issues-section">
              <h3>{{ t('shell.overview.validation') }}</h3>
              <IssueList :issues="selectedFile.issues" :empty-text="t('shell.overview.noIssues')" />
            </div>

            <div class="raw-section">
              <h3>{{ t('shell.overview.rawPreview') }}</h3>
              <pre class="yaml-preview">{{ previewText }}</pre>
            </div>
          </template>
          <div v-else class="detail-empty">
            <p>{{ t('shell.overview.detailEmpty') }}</p>
            <p class="muted">{{ t('shell.overview.detailEmptyHint') }}</p>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
