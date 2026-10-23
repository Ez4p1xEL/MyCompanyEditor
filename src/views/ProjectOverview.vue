<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useProjectStore } from '../store/project';
import { fileKindIcon, fileKindLabel } from '../core/fileTypes';
import { formatBytes } from '../core/format';
import { openExportDialog } from '../core/exportDialog';
import { pushToast } from '../core/toast';
import { describeSampleImport } from '../core/samples';
import IssueList from '../components/IssueList.vue';
import type { FileKind, ProjectFile } from '../core/types';

const emit = defineEmits<{ (event: 'import-request'): void }>();

const store = useProjectStore();
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
        label: fileKindLabel(file.kind),
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
  return lines.length > 80 ? `${head}\n…（已省略剩余内容）` : head;
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
  pushToast(describeSampleImport(result), 'success');
  if (result.issueCount > 0) {
    pushToast(`示例项目有 ${result.issueCount} 条错误/警告，可在文件详情中查看`, 'warning');
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
        <h1>项目总览</h1>
        <p class="overview-subtitle">
          MyCompany 插件 YAML 项目：订单、专精与箱子菜单。所有解析与校验都在浏览器本地完成。
        </p>
      </div>
      <div class="overview-actions">
        <button class="mc-button" data-action="overview-import" @click="requestImport">导入 YAML</button>
        <button class="mc-button primary" data-action="load-sample" @click="loadSample">
          载入示例
        </button>
      </div>
    </header>

    <div v-if="!hasFiles" class="empty-state">
      <div class="empty-art" aria-hidden="true">
        <div class="grass-block"></div>
        <div class="dirt-block"></div>
      </div>
      <h2>开始你的 MyCompany 项目</h2>
      <p>
        导入服务器 <code>plugins/MyCompany/</code> 下的
        <code>orders.yml</code>、<code>focus/*.yml</code>、<code>menu/*.yml</code>，
        或先载入与插件 0.8.50 语义等价的示例项目（fixtures 为上游 LF 副本；
        其中 4 个文件无末尾换行，导出时会补单个 LF）。
      </p>
      <div class="empty-actions">
        <button class="mc-button primary" data-action="empty-import" @click="requestImport">
          导入 YAML 文件
        </button>
        <button class="mc-button" data-action="load-sample" @click="loadSample">载入示例</button>
      </div>
      <ul class="empty-hints">
        <li>支持点击选择或直接拖拽 .yml / .yaml 文件到窗口。</li>
        <li>项目自动保存在浏览器 localStorage，刷新不丢失。</li>
        <li>未知字段与无法识别的行会原样保留，并给出警告，不会静默丢失。</li>
      </ul>
      <p class="version-line">规范基准 6764e01 · MyCompany 0.8.50</p>
    </div>

    <template v-else>
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-label">文件</span><strong>{{ store.fileCount }}</strong>
          <span class="stat-note">orders / focus / menu</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">订单</span><strong>{{ counts.orders }}</strong>
          <span class="stat-note">orders.yml</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">专精文件</span><strong>{{ counts.focus }}</strong>
          <span class="stat-note">focus/none.yml · focus/mob.yml</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">菜单</span><strong>{{ counts.menu }}</strong>
          <span class="stat-note">18 个固定菜单</span>
        </div>
        <div class="stat-card stat-error">
          <span class="stat-label">错误</span><strong>{{ issueCounts.error }}</strong>
          <span class="stat-note">阻断导出</span>
        </div>
        <div class="stat-card stat-warning">
          <span class="stat-label">警告 / 提示</span>
          <strong>{{ issueCounts.warning }} / {{ issueCounts.info }}</strong>
          <span class="stat-note">不阻断，但建议核对</span>
        </div>
      </div>

      <div class="workspace-grid">
        <div class="file-panel">
          <div class="panel-title">
            <h2>项目文件</h2>
            <span class="muted">共 {{ store.fileCount }} 个</span>
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
                <p class="muted">{{ fileKindLabel(selectedFile.kind) }} · {{ fileKindIcon(selectedFile.kind) }}</p>
              </div>
              <button class="mc-button small" data-action="export-file" @click="exportSelected">导出此文件</button>
            </div>

            <div v-if="errorIssues.length > 0" class="detail-alert">
              <strong>解析/语法错误</strong>
              <p v-for="issue in errorIssues" :key="`${issue.code}-${issue.line}`">
                {{ issue.message }}<template v-if="issue.line">（第 {{ issue.line }} 行<template v-if="issue.column">，第 {{ issue.column }} 列</template>）</template>
              </p>
            </div>

            <dl class="detail-meta">
              <div><dt>行数</dt><dd>{{ selectedFile.stats.lineCount }}</dd></div>
              <div><dt>大小</dt><dd>{{ formatBytes(selectedFile.stats.byteSize) }}</dd></div>
              <div><dt>顶层条目</dt><dd>{{ selectedFile.stats.topLevelKeyCount }}</dd></div>
              <div><dt>问题</dt><dd>{{ selectedFile.issues.length }}</dd></div>
            </dl>

            <div v-if="selectedFile.kind === 'menu'" class="source-note">
              菜单标题 / 物品名 / lore 来自 <code>lang/&lt;language&gt;.yml</code> 的
              <code>menu.{{ menuId }}.*</code>，
              修改菜单文件不会改变文本。
            </div>
            <div v-if="selectedFile.kind === 'focus-tree' || selectedFile.kind === 'menus-config'" class="source-note legacy">
              该文件是遗留配置，当前插件版本不会读取。
            </div>

            <div v-if="topLevelKeys.length > 0" class="key-section">
              <h3>顶层条目（{{ selectedFile.stats.topLevelKeyCount }}）</h3>
              <div class="key-chips">
                <span v-for="key in topLevelKeys.slice(0, 40)" :key="key" class="key-chip">{{ key }}</span>
                <span v-if="topLevelKeys.length > 40" class="key-chip more">
                  +{{ topLevelKeys.length - 40 }}
                </span>
              </div>
            </div>

            <div class="issues-section">
              <h3>校验结果</h3>
              <IssueList :issues="selectedFile.issues" empty-text="该文件没有发现问题" />
            </div>

            <div class="raw-section">
              <h3>原文预览</h3>
              <pre class="yaml-preview">{{ previewText }}</pre>
            </div>
          </template>
          <div v-else class="detail-empty">
            <p>从左侧选择一个文件，查看解析结果、校验问题与原文。</p>
            <p class="muted">导入 <code>orders.yml</code> 后，这里会显示全部订单 id。</p>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
