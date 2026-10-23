<script setup lang="ts">
import { computed, ref } from 'vue';
import { useProjectStore } from '../../store/project';
import { pushToast } from '../../core/toast';
import type { ProjectFile } from '../../core/types';
import { downloadTextFile } from '../../core/download';
import { parseYamlText } from '../../core/yaml';
import { MENU_IDS } from '../../core/fileTypes';
import {
  buildProjectJson,
  collectProjectExportBlockers,
  exportableFiles,
  parseProjectJson,
  planYamlImports,
  prepareProjectZip,
  referenceFocusFiles,
  type ProjectJsonData,
} from './projectFileOps';
import { sampleFiles } from './samples';
import { downloadZip, readZip } from './zip';
import {
  ACTIVATION_ROWS,
  DEPLOYMENT_STEPS,
  FOCUS_LIMITS,
  MENU_LIMITS,
  QUEST_TYPES,
  REWARD_TYPES,
} from './help';

const store = useProjectStore();
const selectedPath = ref<string | null>(store.activePath);
const selectedSeverity = ref<'all' | 'error' | 'warning' | 'info'>('all');
const selectedFileFilter = ref<string>('all');
const fileInput = ref<HTMLInputElement | null>(null);
const dragging = ref(false);
const busy = ref(false);

const files = computed(() => store.fileList);
const ordersFiles = computed(() => files.value.filter((file) => file.kind === 'orders'));
const fixedFocusFiles = computed(() =>
  ['focus/none.yml', 'focus/mob.yml']
    .map((path) => store.files[path])
    .filter((file) => Boolean(file) && file!.kind === 'focus'),
);
const referenceFocus = computed(() => referenceFocusFiles(files.value));
const menuCards = computed(() =>
  MENU_IDS.map((id) => ({ id, file: store.files[`menu/${id}.yml`] ?? null })),
);
const nonFixedMenus = computed(() =>
  files.value.filter((file) => {
    if (file.kind !== 'menu') return false;
    const id = file.path.split('/').pop()?.replace(/\.ya?ml$/i, '') ?? '';
    return !(MENU_IDS as readonly string[]).includes(id);
  }),
);
const legacyFiles = computed(() =>
  files.value.filter((file) => file.kind === 'focus-tree' || file.kind === 'menus-config'),
);
const otherFiles = computed(() =>
  files.value.filter(
    (file) =>
      file.kind === 'unknown' &&
      !file.path.startsWith('focus-reference/'),
  ),
);
const exportBlockers = computed(() => collectProjectExportBlockers(files.value));
const exportableCount = computed(() => exportableFiles(files.value).length);
const counts = computed(() => store.issueCounts);
const allIssues = computed(() => store.allIssues);
const issueFiles = computed(() => Array.from(new Set(allIssues.value.map((issue) => issue.file).filter(Boolean))));
const filteredIssues = computed(() =>
  allIssues.value.filter((issue) => {
    if (selectedSeverity.value !== 'all' && issue.severity !== selectedSeverity.value) return false;
    if (selectedFileFilter.value !== 'all' && issue.file !== selectedFileFilter.value) return false;
    return true;
  }),
);
const selectedFile = computed(() => (selectedPath.value ? store.files[selectedPath.value] ?? null : null));
const selectedDetail = computed(() => {
  if (!selectedFile.value) return null;
  const parsed = parseYamlText(selectedFile.value.text);
  let topKeys: string[] = [];
  if (parsed.ok && parsed.doc) {
    const value = parsed.doc.toJS();
    if (value && typeof value === 'object' && !Array.isArray(value)) topKeys = Object.keys(value);
  }
  return {
    file: selectedFile.value,
    parsedOk: parsed.ok,
    parseError: parsed.error?.message ?? '',
    parseLine: parsed.error?.line,
    parseColumn: parsed.error?.column,
    topKeys,
    issues: selectedFile.value.issues,
  };
});
const selectedIssueCounts = computed(() => {
  const result = { error: 0, warning: 0, info: 0 };
  for (const issue of selectedDetail.value?.issues ?? []) result[issue.severity] += 1;
  return result;
});
const totalStats = computed(() => ({
  orders: ordersFiles.value.length,
  focus: fixedFocusFiles.value.length,
  focusRefs: referenceFocus.value.length,
  menus: menuCards.value.filter((entry) => entry.file).length,
  menuRefs: nonFixedMenus.value.length,
  legacy: legacyFiles.value.length,
}));
const canExport = computed(() => exportBlockers.value.length === 0 && exportableCount.value > 0);

function issueCountsFor(path: string) {
  const file = store.files[path];
  const result = { error: 0, warning: 0, info: 0 };
  for (const issue of file?.issues ?? []) result[issue.severity] += 1;
  return result;
}

function fileBadge(file: ProjectFile): string {
  if (file.issues.some((issue) => issue.blocking || issue.severity === 'error')) return 'error';
  if (file.issues.length > 0) return 'warning';
  return 'ok';
}

function selectFile(path: string): void {
  selectedPath.value = path;
}

function featureFor(file: { kind: string }): string | null {
  if (file.kind === 'orders') return 'orders';
  if (file.kind === 'focus') return 'focus';
  if (file.kind === 'menu') return 'menu';
  return null;
}

function openInEditor(path: string): void {
  const file = store.files[path];
  if (!file) return;
  const feature = featureFor(file);
  store.setActive(path);
  if (!feature) {
    pushToast('该文件为只读/遗留配置，没有对应编辑器', 'info');
    return;
  }
  store.setActiveFeature(feature);
  document.querySelector<HTMLElement>(`[data-nav="${feature}"]`)?.click();
}

function locateIssue(issue: { file: string }): void {
  if (issue.file && store.files[issue.file]) {
    selectedPath.value = issue.file;
    selectedFileFilter.value = issue.file;
  }
}

async function loadSample(): Promise<void> {
  const samples = sampleFiles();
  if (store.fileList.length > 0 && !window.confirm('当前项目已有文件，载入示例会替换同名文件，继续？')) return;
  const result = store.importFiles(samples);
  selectedPath.value = 'orders.yml';
  pushToast(
    `已载入内置示例：新增 ${result.imported.length} 个，替换 ${result.replaced.length} 个（共 ${samples.length} 个文件）`,
    'success',
  );
}

function triggerImport(): void {
  fileInput.value?.click();
}

async function handleFiles(list: File[]): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    const yamlInputs: Array<{ path: string; text: string }> = [];
    for (const file of list) {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.zip')) {
        await importZipFile(file);
      } else if (lower.endsWith('.json')) {
        await importProjectJsonFile(file);
      } else if (lower.endsWith('.yml') || lower.endsWith('.yaml')) {
        yamlInputs.push({ path: file.name, text: await file.text() });
      } else {
        pushToast(`已跳过不支持的文件：${file.name}`, 'warning');
      }
    }
    if (yamlInputs.length > 0) importYamlFiles(yamlInputs);
  } finally {
    busy.value = false;
  }
}

async function onFileInput(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const list = Array.from(input.files ?? []);
  input.value = '';
  if (list.length > 0) await handleFiles(list);
}

async function onDrop(event: DragEvent): Promise<void> {
  dragging.value = false;
  const list = Array.from(event.dataTransfer?.files ?? []);
  if (list.length > 0) await handleFiles(list);
}

async function importZipFile(file: File): Promise<void> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const entries = await readZip(bytes);
    const yamlEntries = entries.filter((entry) => /\.(ya?ml)$/i.test(entry.name));
    if (yamlEntries.length === 0) {
      pushToast('ZIP 中没有 .yml/.yaml 文件', 'warning');
      return;
    }
    importYamlFiles(yamlEntries.map((entry) => ({ path: entry.name, text: entry.text })));
    const ignored = entries.length - yamlEntries.length;
    if (ignored > 0) pushToast(`ZIP 中另有 ${ignored} 个非 YAML 条目已忽略`, 'info');
  } catch (error) {
    pushToast(`ZIP 导入失败：${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

function importYamlFiles(inputs: Array<{ path: string; text: string }>): void {
  const plan = planYamlImports(inputs);
  if (plan.planned.length === 0) {
    pushToast(
      plan.skipped.length
        ? `未导入任何文件：${plan.skipped.map((entry) => `${entry.path}（${entry.reason}）`).join('；')}`
        : '没有可导入的 YAML 文件',
      'warning',
    );
    return;
  }
  const conflicts = plan.planned.filter((entry) => store.files[entry.path]);
  if (conflicts.length > 0 && !window.confirm(`将替换 ${conflicts.length} 个已存在文件，继续？`)) return;
  for (const entry of plan.planned) {
    store.upsertFile(entry.path, entry.text, entry.kind);
    if (entry.warning) pushToast(entry.warning, 'warning');
  }
  selectedPath.value = plan.planned[0]?.path ?? null;
  const warnings = plan.planned.map((entry) => entry.warning).filter(Boolean);
  pushToast(
    `已导入 ${plan.planned.length} 个文件` +
      (plan.skipped.length ? `，跳过 ${plan.skipped.length} 个` : '') +
      (warnings.length ? `（${warnings.length} 个未知菜单将持续警告）` : ''),
    plan.skipped.length || warnings.length ? 'warning' : 'success',
  );
}

async function importProjectJsonFile(file: File): Promise<void> {
  await importProjectJsonText(await file.text());
}

async function importProjectJsonText(text: string): Promise<void> {
  const parsed = parseProjectJson(text);
  if (!parsed.ok) {
    pushToast(`项目 JSON 导入失败：${parsed.error}`, 'error');
    return;
  }
  if (store.fileList.length > 0 && !window.confirm('导入项目 JSON 会替换当前项目，继续？')) return;
  applyProjectJson(parsed.data);
  pushToast(`已恢复项目：${parsed.data.files.length} 个文件（版本 ${parsed.data.version}）`, 'success');
}

function applyProjectJson(data: ProjectJsonData): void {
  store.clearProject();
  for (const file of data.files) {
    store.upsertFile(file.path, file.text, file.kind);
  }
  store.setActiveFeature(data.activeFeatureId);
  selectedPath.value = store.fileList[0]?.path ?? null;
}

function downloadProjectJson(): void {
  const data = buildProjectJson(files.value, store.activeFeatureId);
  downloadTextFile('mycompany-project.json', `${JSON.stringify(data, null, 2)}\n`);
  pushToast(`已下载项目 JSON（${data.files.length} 个文件，版本 ${data.version}）`, 'success');
}

function saveToBrowser(): void {
  const ok = store.saveToLocalStorage();
  pushToast(ok ? '已保存到浏览器 localStorage，刷新后自动恢复' : '保存失败：localStorage 不可用', ok ? 'success' : 'error');
}

function exportProjectZip(): void {
  if (exportBlockers.value.length > 0) {
    const first = exportBlockers.value[0]!;
    pushToast(
      `导出被阻止：${exportBlockers.value.length} 条错误/阻断项（${first.file}${first.path ? ` · ${first.path}` : ''}）`,
      'error',
    );
    return;
  }
  const prepared = prepareProjectZip(files.value);
  if (!prepared.ok) {
    pushToast(`导出被阻止：${prepared.issues[0]?.message ?? '全局校验失败'}`, 'error');
    return;
  }
  if (prepared.entries.length === 0) {
    pushToast('没有可导出的 orders/focus/menu 文件', 'warning');
    return;
  }
  downloadZip('mycompany-project.zip', prepared.entries);
  for (const entry of prepared.entries) store.markExported(entry.name);
  pushToast(
    `已导出 ${prepared.entries.length} 个文件到 mycompany-project.zip；menus.yml/focus 参考文件未包含`,
    'success',
  );
}

function onDropZone(event: DragEvent): void {
  dragging.value = true;
  event.preventDefault();
}
</script>

<template>
  <div
    class="project-dashboard"
    data-testid="project-dashboard"
    @dragover="onDropZone"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <header class="project-header">
      <div>
        <h1>项目工作台</h1>
        <p class="project-subtitle">
          统一管理 <code>orders.yml</code>、<code>focus/*.yml</code> 与 18 个 <code>menu/*.yml</code>。
          全部 YAML 在浏览器本地解析；红色错误会阻止全量导出。
        </p>
      </div>
      <div class="project-actions">
        <button class="mc-button" data-action="project-import" @click="triggerImport">导入文件 / ZIP / 项目 JSON</button>
        <button class="mc-button primary" data-action="load-sample" @click="loadSample">载入示例</button>
        <button class="mc-button" data-action="project-export-zip" :disabled="!canExport" @click="exportProjectZip">
          导出全量 ZIP（{{ exportableCount }}）
        </button>
        <button class="mc-button" data-action="project-save-json" @click="downloadProjectJson">下载项目 JSON</button>
        <button class="mc-button" data-action="project-save-local" @click="saveToBrowser">保存到浏览器</button>
        <input
          ref="fileInput"
          type="file"
          multiple
          accept=".yml,.yaml,.zip,.json"
          class="file-input"
          data-testid="project-file-input"
          @change="onFileInput"
        />
      </div>
    </header>

    <div class="project-stats">
      <div class="project-stat"><strong>{{ totalStats.orders }}</strong><span>订单</span></div>
      <div class="project-stat"><strong>{{ totalStats.focus }}</strong><span>可加载专精</span></div>
      <div class="project-stat"><strong>{{ totalStats.focusRefs }}</strong><span>参考专精</span></div>
      <div class="project-stat"><strong>{{ totalStats.menus }}/18</strong><span>菜单</span></div>
      <div class="project-stat error"><strong>{{ counts.error }}</strong><span>错误</span></div>
      <div class="project-stat warning"><strong>{{ counts.warning }}</strong><span>警告</span></div>
      <div class="project-stat"><strong>{{ counts.info }}</strong><span>提示</span></div>
    </div>

    <div v-if="exportBlockers.length" class="project-blocked" data-testid="export-blocked">
      <strong>导出被阻止：{{ exportBlockers.length }} 条错误/阻断项</strong>
      <ul>
        <li v-for="(issue, index) in exportBlockers.slice(0, 8)" :key="index">
          <code>{{ issue.file }}</code>
          <span v-if="issue.path"> · {{ issue.path }}</span>
          · {{ issue.message }}
        </li>
      </ul>
      <span v-if="exportBlockers.length > 8">还有 {{ exportBlockers.length - 8 }} 条，见下方全局校验。</span>
    </div>

    <div v-if="files.length === 0" class="project-empty">
      <div class="project-empty-icon" aria-hidden="true">🏗️</div>
      <h2>开始你的 MyCompany 项目</h2>
      <p>
        从服务器导入 <code>orders.yml</code>、<code>focus/*.yml</code>、<code>menu/*.yml</code>，
        或载入内置示例项目（23 个文件，不依赖 docs/ 路径）。
      </p>
      <div class="project-empty-actions">
        <button class="mc-button primary" data-action="load-sample" @click="loadSample">载入示例</button>
        <button class="mc-button" data-action="project-import" @click="triggerImport">导入文件</button>
        <button class="mc-button" data-action="project-import-json" @click="triggerImport">导入项目 JSON</button>
      </div>
    </div>

    <div v-else class="project-layout">
      <main class="project-main">
        <section class="project-card">
          <h2>订单 <span class="count">{{ totalStats.orders }}</span></h2>
          <div class="file-list">
            <button
              v-for="file in ordersFiles"
              :key="file.path"
              class="file-card"
              :class="{ active: selectedPath === file.path, error: fileBadge(file) === 'error' }"
              :data-file="file.path"
              @click="selectFile(file.path)"
            >
              <span class="file-name"><code>{{ file.path }}</code></span>
              <span class="file-kind">订单</span>
              <span class="file-issues">
                <span v-if="issueCountsFor(file.path).error" class="badge error">{{ issueCountsFor(file.path).error }} 错误</span>
                <span v-else-if="issueCountsFor(file.path).warning" class="badge warning">{{ issueCountsFor(file.path).warning }} 警告</span>
                <span v-else class="badge ok">正常</span>
              </span>
            </button>
            <p v-if="ordersFiles.length === 0" class="project-hint">尚未导入 orders.yml。</p>
          </div>
        </section>

        <section class="project-card">
          <h2>专精（可加载） <span class="count">{{ totalStats.focus }}/2</span></h2>
          <div class="file-list">
            <button
              v-for="path in ['focus/none.yml', 'focus/mob.yml']"
              :key="path"
              class="file-card"
              :class="{ active: selectedPath === path, disabled: !store.files[path] }"
              :data-file="store.files[path] ? path : undefined"
              @click="store.files[path] && selectFile(path)"
            >
              <span class="file-name"><code>{{ path }}</code></span>
              <span class="file-kind">固定加载</span>
              <span class="file-issues">
                <span v-if="!store.files[path]" class="badge missing">未导入</span>
                <span v-else-if="issueCountsFor(path).error" class="badge error">{{ issueCountsFor(path).error }} 错误</span>
                <span v-else-if="issueCountsFor(path).warning" class="badge warning">{{ issueCountsFor(path).warning }} 警告</span>
                <span v-else class="badge ok">正常</span>
              </span>
            </button>
          </div>
          <div v-if="referenceFocus.length" class="reference-files">
            <h3>参考 focus（不会被加载，也不导出）</h3>
            <button
              v-for="file in referenceFocus"
              :key="file.path"
              class="file-card reference"
              :class="{ active: selectedPath === file.path }"
              :data-file="file.path"
              @click="selectFile(file.path)"
            >
              <span class="file-name"><code>{{ file.path }}</code></span>
              <span class="badge reference">参考</span>
            </button>
          </div>
        </section>

        <section class="project-card">
          <h2>菜单 <span class="count">{{ totalStats.menus }}/18</span></h2>
          <div class="menu-grid">
            <button
              v-for="entry in menuCards"
              :key="entry.id"
              class="menu-card"
              :class="{ active: selectedPath === entry.file?.path, disabled: !entry.file }"
              :data-file="entry.file ? entry.file.path : undefined"
              @click="entry.file && selectFile(entry.file.path)"
            >
              <code>menu/{{ entry.id }}.yml</code>
              <span v-if="!entry.file" class="badge missing">未导入</span>
              <span v-else-if="issueCountsFor(entry.file.path).error" class="badge error">{{ issueCountsFor(entry.file.path).error }} 错误</span>
              <span v-else-if="issueCountsFor(entry.file.path).warning" class="badge warning">{{ issueCountsFor(entry.file.path).warning }} 警告</span>
              <span v-else class="badge ok">正常</span>
            </button>
          </div>
          <div v-if="nonFixedMenus.length" class="reference-files">
            <h3>非固定菜单（插件不会加载，不导出）</h3>
            <button
              v-for="file in nonFixedMenus"
              :key="file.path"
              class="file-card reference"
              :data-file="file.path"
              @click="selectFile(file.path)"
            >
              <code>{{ file.path }}</code><span class="badge warning">不会被加载</span>
            </button>
          </div>
        </section>

        <section v-if="legacyFiles.length || otherFiles.length" class="project-card">
          <h2>只读 / 其他</h2>
          <button
            v-for="file in [...legacyFiles, ...otherFiles]"
            :key="file.path"
            class="file-card reference"
            :data-file="file.path"
            @click="selectFile(file.path)"
          >
            <span class="file-name"><code>{{ file.path }}</code></span>
            <span class="badge reference">{{ file.kind === 'focus-tree' || file.kind === 'menus-config' ? '遗留配置 · 不导出' : '未识别' }}</span>
          </button>
          <p class="project-hint">
            <code>focus.yml</code> 的 focus-tree 解析代码已注释；<code>menus.yml</code> 的 global.no-perm 仅赋值未使用；
            两者只读展示，不进入导出 ZIP。
          </p>
        </section>

        <section v-if="selectedDetail" class="project-card file-detail" data-testid="file-detail">
          <h2>文件详情</h2>
          <div class="detail-head">
            <h3><code>{{ selectedDetail.file.path }}</code></h3>
            <button class="mc-button small" data-action="project-open-editor" @click="openInEditor(selectedDetail.file.path)">
              打开对应编辑器
            </button>
          </div>
          <p v-if="!selectedDetail.parsedOk" class="inline-error">
            {{ selectedDetail.parseError }}
            <span v-if="selectedDetail.parseLine">
              · 第 {{ selectedDetail.parseLine }} 行<template v-if="selectedDetail.parseColumn">，第 {{ selectedDetail.parseColumn }} 列</template>
            </span>
          </p>
          <p class="project-hint">
            顶层条目（{{ selectedDetail.topKeys.length }}） · 字符数 {{ selectedDetail.file.text.length }} ·
            错误 {{ selectedIssueCounts.error }} · 警告 {{ selectedIssueCounts.warning }} · 提示 {{ selectedIssueCounts.info }}
          </p>
          <ul v-if="selectedDetail.topKeys.length" class="top-key-list">
            <li v-for="key in selectedDetail.topKeys" :key="key"><code>{{ key }}</code></li>
          </ul>
          <ul v-if="selectedDetail.issues.length" class="detail-issues">
            <li v-for="(issue, index) in selectedDetail.issues.slice(0, 12)" :key="index" :class="issue.severity">
              <code>{{ issue.code }}</code> {{ issue.message }}
            </li>
          </ul>
        </section>

        <section class="project-card global-validation" data-testid="global-validation">
          <h2>全局校验</h2>
          <div class="validation-filters">
            <label class="field">
              <span class="field-label">严重级</span>
              <select v-model="selectedSeverity" class="mc-select" data-field="issue-severity">
                <option value="all">全部（{{ allIssues.length }}）</option>
                <option value="error">错误（{{ counts.error }}）</option>
                <option value="warning">警告（{{ counts.warning }}）</option>
                <option value="info">提示（{{ counts.info }}）</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">文件</span>
              <select v-model="selectedFileFilter" class="mc-select" data-field="issue-file">
                <option value="all">全部文件</option>
                <option v-for="path in issueFiles" :key="path" :value="path">{{ path }}</option>
              </select>
            </label>
            <span class="export-state" :class="{ blocked: exportBlockers.length > 0 }">
              {{ exportBlockers.length ? `导出被阻止（${exportBlockers.length}）` : '可导出' }}
            </span>
          </div>
          <p v-if="filteredIssues.length === 0" class="project-hint">没有匹配的问题。</p>
          <ul v-else class="global-issue-list">
            <li v-for="(issue, index) in filteredIssues" :key="index" :class="issue.severity">
              <div>
                <code>{{ issue.file || '项目' }}</code>
                <span v-if="issue.path"> · {{ issue.path }}</span>
                <span class="issue-code">{{ issue.code }}</span>
                <div>{{ issue.message }}</div>
              </div>
              <button v-if="issue.file && store.files[issue.file]" class="mc-button tiny" @click="locateIssue(issue)">
                定位
              </button>
            </li>
          </ul>
        </section>

        <details class="project-card help-panel" data-testid="project-help">
          <summary><h2>帮助 / 字段速查</h2></summary>
          <div class="help-grid">
            <section>
              <h3>订单 quest / reward</h3>
              <ul>
                <li v-for="quest in QUEST_TYPES" :key="quest.id">
                  <code>{{ quest.id }}</code> · {{ quest.label }} · 目标 {{ quest.target }}
                </li>
              </ul>
              <ul>
                <li v-for="reward in REWARD_TYPES" :key="reward.id">
                  <code>{{ reward.syntax }}</code>
                </li>
              </ul>
            </section>
            <section>
              <h3>专精限制</h3>
              <ul>
                <li v-for="line in FOCUS_LIMITS" :key="line">{{ line }}</li>
              </ul>
            </section>
            <section>
              <h3>菜单与语言文件</h3>
              <ul>
                <li v-for="line in MENU_LIMITS" :key="line">{{ line }}</li>
              </ul>
            </section>
            <section>
              <h3>生效方式</h3>
              <table class="activation-table">
                <thead><tr><th>文件</th><th>生效方式</th><th>说明</th></tr></thead>
                <tbody>
                  <tr v-for="row in ACTIVATION_ROWS" :key="row.file">
                    <td><code>{{ row.file }}</code></td><td>{{ row.mode }}</td><td>{{ row.detail }}</td>
                  </tr>
                </tbody>
              </table>
            </section>
            <section>
              <h3>部署摘要</h3>
              <ol>
                <li v-for="step in DEPLOYMENT_STEPS" :key="step">{{ step }}</li>
              </ol>
            </section>
          </div>
        </details>
      </main>

      <aside class="project-side">
        <section class="project-card">
          <h2>项目状态</h2>
          <dl class="status-list">
            <dt>本地自动保存</dt>
            <dd>{{ store.isLocallySaved ? '已保存' : '保存中…' }}</dd>
            <dt>未导出修改</dt>
            <dd>{{ store.isDirty ? '有' : '无' }}</dd>
            <dt>可导出文件</dt>
            <dd>{{ exportableCount }}</dd>
            <dt>导出阻断</dt>
            <dd>{{ exportBlockers.length }} 条</dd>
            <dt>参考 focus</dt>
            <dd>{{ referenceFocus.length }} 个（不导出）</dd>
          </dl>
          <p class="project-hint">
            项目 JSON 保存全部文件（含参考 focus）；ZIP 只导出插件会加载的文件。
          </p>
          <button class="mc-button" data-action="project-save-json" @click="downloadProjectJson">下载项目 JSON</button>
          <button class="mc-button" data-action="project-import-json" @click="triggerImport">导入项目 JSON</button>
        </section>
        <section class="project-card">
          <h2>导入说明</h2>
          <p class="project-hint">
            支持多选 YAML、拖拽、ZIP 与项目 JSON。ZIP 内路径按 <code>orders.yml</code>、
            <code>focus/*.yml</code>、<code>menu/*.yml</code> 识别；坏文件只记录校验问题，不阻断其它文件。
          </p>
          <p class="project-hint">冲突文件会先询问是否替换。</p>
        </section>
      </aside>
    </div>

    <div v-if="dragging" class="project-drop-overlay" @dragover.prevent>
      <div>松开以导入 YAML / ZIP / 项目 JSON</div>
    </div>
  </div>
</template>

<style>
.project-dashboard {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 100%;
}
.project-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
.project-header h1 {
  margin: 0 0 4px;
  font-size: 22px;
}
.project-subtitle {
  margin: 0;
  color: var(--muted);
  max-width: 760px;
  line-height: 1.6;
}
.project-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.project-stats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.project-stat {
  min-width: 90px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  background: var(--panel);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.project-stat strong {
  font-size: 20px;
}
.project-stat span {
  color: var(--muted);
  font-size: 11px;
}
.project-stat.error strong {
  color: #ff8f8f;
}
.project-stat.warning strong {
  color: #d8a657;
}
.project-blocked {
  padding: 10px 12px;
  border: 1px solid #b34a4a;
  border-left: 4px solid #b34a4a;
  background: rgba(179, 74, 74, 0.1);
  font-size: 12px;
  line-height: 1.6;
}
.project-blocked ul {
  margin: 4px 0;
  padding-left: 18px;
}
.project-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  padding: 48px 20px;
  border: 1px solid var(--border);
  background: var(--panel);
}
.project-empty-icon {
  font-size: 46px;
}
.project-empty-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.project-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 12px;
  align-items: start;
}
.project-main,
.project-side {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.project-card {
  border: 1px solid var(--border);
  background: var(--panel);
  padding: 10px;
}
.project-card h2 {
  margin: 0 0 8px;
  font-size: 15px;
}
.project-card h3 {
  font-size: 13px;
  margin: 8px 0 4px;
}
.count {
  color: var(--muted);
  font-size: 12px;
  font-weight: 400;
}
.file-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.file-card,
.menu-card {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: 1px solid var(--border);
  background: var(--panel-alt, #2b2b2b);
  color: var(--text);
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.file-card:hover,
.menu-card:hover {
  border-color: var(--accent);
}
.file-card.active,
.menu-card.active {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}
.file-card.error {
  border-color: #b34a4a;
}
.file-card.disabled,
.menu-card.disabled {
  opacity: 0.5;
  cursor: default;
}
.file-card.reference {
  border-style: dashed;
}
.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-kind {
  color: var(--muted);
  font-size: 11px;
}
.file-issues {
  margin-left: auto;
}
.reference-files {
  margin-top: 8px;
}
.menu-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 4px;
}
.menu-card {
  justify-content: space-between;
  font-size: 11px;
}
.menu-card code {
  overflow: hidden;
  text-overflow: ellipsis;
}
.badge {
  display: inline-block;
  padding: 1px 5px;
  border: 1px solid var(--border);
  font-size: 10px;
  line-height: 1.5;
  white-space: nowrap;
}
.badge.error {
  border-color: #b34a4a;
  color: #ff8f8f;
}
.badge.warning {
  border-color: #8a6d1f;
  color: #d8a657;
}
.badge.ok {
  border-color: #4f7f3a;
  color: #9ed37a;
}
.badge.reference {
  border-color: #8a6d1f;
  color: #d8a657;
}
.badge.missing {
  border-color: #b34a4a;
  color: #ff8f8f;
}
.project-hint {
  margin: 3px 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}
.file-detail .detail-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: flex-start;
}
.detail-head h3 {
  margin: 0;
  overflow-wrap: anywhere;
}
.top-key-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  list-style: none;
  padding: 0;
  margin: 6px 0;
}
.top-key-list li {
  padding: 2px 5px;
  border: 1px solid var(--border);
  font-size: 11px;
}
.inline-error {
  margin: 6px 0;
  padding: 6px 8px;
  border-left: 3px solid #b34a4a;
  background: rgba(179, 74, 74, 0.12);
  font-size: 12px;
}
.detail-issues,
.global-issue-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}
.detail-issues li,
.global-issue-list li {
  padding: 5px 7px;
  border-left: 3px solid var(--border);
  background: var(--panel-alt, #2b2b2b);
}
.global-issue-list li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: flex-start;
}
.global-issue-list li.error {
  border-color: #b34a4a;
}
.global-issue-list li.warning {
  border-color: #d8a657;
}
.global-issue-list li.info {
  border-color: #6a9ac8;
}
.issue-code {
  margin-left: 6px;
  color: var(--muted);
  font-family: var(--mono);
}
.validation-filters {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  flex-wrap: wrap;
}
.validation-filters .field {
  min-width: 160px;
}
.export-state {
  margin-left: auto;
  padding: 4px 8px;
  border: 1px solid #4f7f3a;
  color: #9ed37a;
  font-size: 12px;
}
.export-state.blocked {
  border-color: #b34a4a;
  color: #ff8f8f;
}
.status-list {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 5px 8px;
  margin: 0;
  font-size: 12px;
}
.status-list dt {
  color: var(--muted);
}
.status-list dd {
  margin: 0;
  text-align: right;
}
.help-panel summary {
  cursor: pointer;
}
.help-panel summary h2 {
  display: inline;
}
.help-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 8px;
  font-size: 12px;
}
.help-grid ul,
.help-grid ol {
  margin: 4px 0;
  padding-left: 18px;
  line-height: 1.6;
}
.activation-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.activation-table th,
.activation-table td {
  border: 1px solid var(--border);
  padding: 4px;
  text-align: left;
}
.file-input {
  display: none;
}
.project-drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 10, 0.65);
  border: 3px dashed var(--accent);
  color: #fff;
  font-size: 18px;
  pointer-events: none;
}
@media (max-width: 1100px) {
  .project-layout {
    grid-template-columns: 1fr;
  }
  .help-grid {
    grid-template-columns: 1fr;
  }
}
</style>
