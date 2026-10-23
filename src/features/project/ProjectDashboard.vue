<script setup lang="ts">
import { computed, ref } from 'vue';
import { useProjectStore } from '../../store/project';
import { pushToast } from '../../core/toast';
import type { ProjectFile } from '../../core/types';
import { downloadTextFile } from '../../core/download';
import { useI18n } from '../../i18n';
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
  HELP_LABELS,
  FOCUS_LIMITS,
  MENU_LIMITS,
  QUEST_TYPES,
  REWARD_TYPES,
} from './help';

const store = useProjectStore();
const { t } = useI18n();
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
    pushToast(t('shell.dashboard.readOnlyNoEditor'), 'info');
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
  if (store.fileList.length > 0 && !window.confirm(t('shell.dashboard.sampleConfirm'))) return;
  const result = store.importFiles(samples);
  selectedPath.value = 'orders.yml';
  pushToast(
    t('shell.dashboard.sampleLoaded', {
      imported: result.imported.length,
      replaced: result.replaced.length,
      total: samples.length,
    }),
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
        pushToast(t('shell.dashboard.skippedFile', { file: file.name }), 'warning');
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
      pushToast(t('shell.dashboard.zipNoYaml'), 'warning');
      return;
    }
    importYamlFiles(yamlEntries.map((entry) => ({ path: entry.name, text: entry.text })));
    const ignored = entries.length - yamlEntries.length;
    if (ignored > 0) pushToast(t('shell.dashboard.zipIgnored', { count: ignored }), 'info');
  } catch (error) {
    pushToast(
      t('shell.dashboard.zipFailed', {
        error: error instanceof Error ? error.message : String(error),
      }),
      'error',
    );
  }
}

function importYamlFiles(inputs: Array<{ path: string; text: string }>): void {
  const plan = planYamlImports(inputs);
  if (plan.planned.length === 0) {
    pushToast(
      plan.skipped.length
        ? t('shell.dashboard.noImported', {
            skipped: plan.skipped.map((entry) => `${entry.path} (${entry.reason})`).join('; '),
          })
        : t('shell.dashboard.noYaml'),
      'warning',
    );
    return;
  }
  const conflicts = plan.planned.filter((entry) => store.files[entry.path]);
  if (conflicts.length > 0 && !window.confirm(t('shell.dashboard.replaceConfirm', { count: conflicts.length }))) return;
  for (const entry of plan.planned) {
    store.upsertFile(entry.path, entry.text, entry.kind);
    if (entry.warning) pushToast(entry.warning, 'warning');
  }
  selectedPath.value = plan.planned[0]?.path ?? null;
  const warnings = plan.planned.map((entry) => entry.warning).filter(Boolean);
  pushToast(
    t('shell.dashboard.imported', { count: plan.planned.length }) +
      (plan.skipped.length ? t('shell.dashboard.importSkipped', { count: plan.skipped.length }) : '') +
      (warnings.length ? t('shell.dashboard.importWarnings', { count: warnings.length }) : ''),
    plan.skipped.length || warnings.length ? 'warning' : 'success',
  );
}

async function importProjectJsonFile(file: File): Promise<void> {
  await importProjectJsonText(await file.text());
}

async function importProjectJsonText(text: string): Promise<void> {
  const parsed = parseProjectJson(text);
  if (!parsed.ok) {
    pushToast(t('shell.dashboard.jsonImportFailed', { error: parsed.error }), 'error');
    return;
  }
  if (store.fileList.length > 0 && !window.confirm(t('shell.dashboard.jsonReplaceConfirm'))) return;
  applyProjectJson(parsed.data);
  pushToast(
    t('shell.dashboard.jsonRestored', { count: parsed.data.files.length, version: parsed.data.version }),
    'success',
  );
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
  pushToast(t('shell.dashboard.jsonDownloaded', { count: data.files.length, version: data.version }), 'success');
}

function saveToBrowser(): void {
  const ok = store.saveToLocalStorage();
  pushToast(ok ? t('shell.dashboard.savedLocal') : t('shell.dashboard.savedFailed'), ok ? 'success' : 'error');
}

function exportProjectZip(): void {
  if (exportBlockers.value.length > 0) {
    const first = exportBlockers.value[0]!;
    pushToast(
      t('shell.dashboard.exportBlockedToast', {
        count: exportBlockers.value.length,
        location: `${first.file}${first.path ? ` · ${first.path}` : ''}`,
      }),
      'error',
    );
    return;
  }
  const prepared = prepareProjectZip(files.value);
  if (!prepared.ok) {
    pushToast(
      t('shell.dashboard.exportBlockedGeneric', {
        message: prepared.issues[0]?.message ?? 'global validation failed',
      }),
      'error',
    );
    return;
  }
  if (prepared.entries.length === 0) {
    pushToast(t('shell.dashboard.noExport'), 'warning');
    return;
  }
  downloadZip('mycompany-project.zip', prepared.entries);
  for (const entry of prepared.entries) store.markExported(entry.name);
  pushToast(
    t('shell.dashboard.exportedZip', { count: prepared.entries.length }),
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
        <h1>{{ t('shell.dashboard.title') }}</h1>
        <p class="project-subtitle">
          {{ t('shell.dashboard.subtitle') }}
        </p>
      </div>
      <div class="project-actions">
        <button class="mc-button" data-action="project-import" @click="triggerImport">{{ t('shell.dashboard.import') }}</button>
        <button class="mc-button primary" data-action="load-sample" @click="loadSample">{{ t('shell.dashboard.loadSample') }}</button>
        <button class="mc-button" data-action="project-export-zip" :disabled="!canExport" @click="exportProjectZip">
          {{ t('shell.dashboard.exportAll', { count: exportableCount }) }}
        </button>
        <button class="mc-button" data-action="project-save-json" @click="downloadProjectJson">{{ t('shell.dashboard.saveJson') }}</button>
        <button class="mc-button" data-action="project-save-local" @click="saveToBrowser">{{ t('shell.dashboard.saveLocal') }}</button>
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
      <div class="project-stat"><strong>{{ totalStats.orders }}</strong><span>{{ t('shell.dashboard.statsOrders') }}</span></div>
      <div class="project-stat"><strong>{{ totalStats.focus }}</strong><span>{{ t('shell.dashboard.statsFocus') }}</span></div>
      <div class="project-stat"><strong>{{ totalStats.focusRefs }}</strong><span>{{ t('shell.dashboard.statsFocusRefs') }}</span></div>
      <div class="project-stat"><strong>{{ totalStats.menus }}/18</strong><span>{{ t('shell.dashboard.statsMenus') }}</span></div>
      <div class="project-stat error"><strong>{{ counts.error }}</strong><span>{{ t('shell.dashboard.statsErrors') }}</span></div>
      <div class="project-stat warning"><strong>{{ counts.warning }}</strong><span>{{ t('shell.dashboard.statsWarnings') }}</span></div>
      <div class="project-stat"><strong>{{ counts.info }}</strong><span>{{ t('shell.dashboard.statsInfos') }}</span></div>
    </div>

    <div v-if="exportBlockers.length" class="project-blocked" data-testid="export-blocked">
      <strong>{{ t('shell.dashboard.blockedTitle', { count: exportBlockers.length }) }}</strong>
      <ul>
        <li v-for="(issue, index) in exportBlockers.slice(0, 8)" :key="index">
          <code>{{ issue.file }}</code>
          <span v-if="issue.path"> · {{ issue.path }}</span>
          · {{ issue.message }}
          <div v-if="issue.fixHint" class="issue-fix">{{ issue.fixHint }}</div>
        </li>
      </ul>
      <span v-if="exportBlockers.length > 8">{{ t('shell.dashboard.blockedMore', { count: exportBlockers.length - 8 }) }}</span>
    </div>

    <div v-if="files.length === 0" class="project-empty">
      <div class="project-empty-icon" aria-hidden="true">🏗️</div>
      <h2>{{ t('shell.dashboard.emptyTitle') }}</h2>
      <p>
        {{ t('shell.dashboard.emptyText') }}
      </p>
      <div class="project-empty-actions">
        <button class="mc-button primary" data-action="load-sample" @click="loadSample">{{ t('shell.dashboard.loadSample') }}</button>
        <button class="mc-button" data-action="project-import" @click="triggerImport">{{ t('shell.dashboard.emptyImport') }}</button>
        <button class="mc-button" data-action="project-import-json" @click="triggerImport">{{ t('shell.dashboard.emptyImportJson') }}</button>
      </div>
    </div>

    <div v-else class="project-layout">
      <main class="project-main">
        <section class="project-card">
          <h2>{{ t('shell.dashboard.ordersTitle') }} <span class="count">{{ totalStats.orders }}</span></h2>
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
              <span class="file-kind">{{ t('shell.dashboard.kindOrders') }}</span>
              <span class="file-issues">
                <span v-if="issueCountsFor(file.path).error" class="badge error">{{ t('shell.dashboard.errorBadge', { count: issueCountsFor(file.path).error }) }}</span>
                <span v-else-if="issueCountsFor(file.path).warning" class="badge warning">{{ t('shell.dashboard.warningBadge', { count: issueCountsFor(file.path).warning }) }}</span>
                <span v-else class="badge ok">{{ t('shell.dashboard.statusNormal') }}</span>
              </span>
            </button>
            <p v-if="ordersFiles.length === 0" class="project-hint">{{ t('shell.dashboard.noOrders') }}</p>
          </div>
        </section>

        <section class="project-card">
          <h2>{{ t('shell.dashboard.focusTitle') }} <span class="count">{{ totalStats.focus }}/2</span></h2>
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
              <span class="file-kind">{{ t('shell.dashboard.fixedLoad') }}</span>
              <span class="file-issues">
                <span v-if="!store.files[path]" class="badge missing">{{ t('shell.dashboard.notImported') }}</span>
                <span v-else-if="issueCountsFor(path).error" class="badge error">{{ t('shell.dashboard.errorBadge', { count: issueCountsFor(path).error }) }}</span>
                <span v-else-if="issueCountsFor(path).warning" class="badge warning">{{ t('shell.dashboard.warningBadge', { count: issueCountsFor(path).warning }) }}</span>
                <span v-else class="badge ok">{{ t('shell.dashboard.statusNormal') }}</span>
              </span>
            </button>
          </div>
          <div v-if="referenceFocus.length" class="reference-files">
            <h3>{{ t('shell.dashboard.referenceTitle') }}</h3>
            <button
              v-for="file in referenceFocus"
              :key="file.path"
              class="file-card reference"
              :class="{ active: selectedPath === file.path }"
              :data-file="file.path"
              @click="selectFile(file.path)"
            >
              <span class="file-name"><code>{{ file.path }}</code></span>
              <span class="badge reference">{{ t('shell.dashboard.referenceBadge') }}</span>
            </button>
          </div>
        </section>

        <section class="project-card">
          <h2>{{ t('shell.dashboard.menusTitle') }} <span class="count">{{ totalStats.menus }}/18</span></h2>
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
              <span v-if="!entry.file" class="badge missing">{{ t('shell.dashboard.notImported') }}</span>
              <span v-else-if="issueCountsFor(entry.file.path).error" class="badge error">{{ t('shell.dashboard.errorBadge', { count: issueCountsFor(entry.file.path).error }) }}</span>
              <span v-else-if="issueCountsFor(entry.file.path).warning" class="badge warning">{{ t('shell.dashboard.warningBadge', { count: issueCountsFor(entry.file.path).warning }) }}</span>
              <span v-else class="badge ok">{{ t('shell.dashboard.statusNormal') }}</span>
            </button>
          </div>
          <div v-if="nonFixedMenus.length" class="reference-files">
            <h3>{{ t('shell.dashboard.nonFixedMenus') }}</h3>
            <button
              v-for="file in nonFixedMenus"
              :key="file.path"
              class="file-card reference"
              :data-file="file.path"
              @click="selectFile(file.path)"
            >
              <code>{{ file.path }}</code><span class="badge warning">{{ t('shell.dashboard.notLoadedBadge') }}</span>
            </button>
          </div>
        </section>

        <section v-if="legacyFiles.length || otherFiles.length" class="project-card">
          <h2>{{ t('shell.dashboard.legacyTitle') }}</h2>
          <button
            v-for="file in [...legacyFiles, ...otherFiles]"
            :key="file.path"
            class="file-card reference"
            :data-file="file.path"
            @click="selectFile(file.path)"
          >
            <span class="file-name"><code>{{ file.path }}</code></span>
            <span class="badge reference">{{ file.kind === 'focus-tree' || file.kind === 'menus-config' ? t('shell.dashboard.legacyBadge') : t('shell.dashboard.unknownBadge') }}</span>
          </button>
          <p class="project-hint">{{ t('shell.dashboard.legacyNote') }}</p>
        </section>

        <section v-if="selectedDetail" class="project-card file-detail" data-testid="file-detail">
          <h2>{{ t('shell.dashboard.detailTitle') }}</h2>
          <div class="detail-head">
            <h3><code>{{ selectedDetail.file.path }}</code></h3>
            <button class="mc-button small" data-action="project-open-editor" @click="openInEditor(selectedDetail.file.path)">
              {{ t('shell.dashboard.openEditor') }}
            </button>
          </div>
          <p v-if="!selectedDetail.parsedOk" class="inline-error">
            {{ selectedDetail.parseError }}
            <span v-if="selectedDetail.parseLine">
              <template v-if="selectedDetail.parseColumn">{{ t('shell.dashboard.parseLineColumn', { line: selectedDetail.parseLine, column: selectedDetail.parseColumn }) }}</template><template v-else>{{ t('shell.dashboard.parseLine', { line: selectedDetail.parseLine }) }}</template>
            </span>
          </p>
          <p class="project-hint">
            {{ t('shell.dashboard.detailMeta', { keys: selectedDetail.topKeys.length, chars: selectedDetail.file.text.length, errors: selectedIssueCounts.error, warnings: selectedIssueCounts.warning, infos: selectedIssueCounts.info }) }}
          </p>
          <ul v-if="selectedDetail.topKeys.length" class="top-key-list">
            <li v-for="key in selectedDetail.topKeys" :key="key"><code>{{ key }}</code></li>
          </ul>
          <ul v-if="selectedDetail.issues.length" class="detail-issues">
            <li v-for="(issue, index) in selectedDetail.issues.slice(0, 12)" :key="index" :class="issue.severity">
              <code>{{ issue.code }}</code> {{ issue.message }}
              <p v-if="issue.fixHint" class="issue-fix">{{ issue.fixHint }}</p>
            </li>
          </ul>
        </section>

        <section class="project-card global-validation" data-testid="global-validation">
          <h2>{{ t('shell.dashboard.validationTitle') }}</h2>
          <div class="validation-filters">
            <label class="field">
              <span class="field-label">{{ t('shell.dashboard.severity') }}</span>
              <select v-model="selectedSeverity" class="mc-select" data-field="issue-severity">
                <option value="all">{{ t('shell.dashboard.all', { count: allIssues.length }) }}</option>
                <option value="error">{{ t('shell.dashboard.errors', { count: counts.error }) }}</option>
                <option value="warning">{{ t('shell.dashboard.warnings', { count: counts.warning }) }}</option>
                <option value="info">{{ t('shell.dashboard.infos', { count: counts.info }) }}</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">{{ t('shell.dashboard.file') }}</span>
              <select v-model="selectedFileFilter" class="mc-select" data-field="issue-file">
                <option value="all">{{ t('shell.dashboard.allFiles') }}</option>
                <option v-for="path in issueFiles" :key="path" :value="path">{{ path }}</option>
              </select>
            </label>
            <span class="export-state" :class="{ blocked: exportBlockers.length > 0 }">
              {{ exportBlockers.length ? t('shell.dashboard.exportBlocked', { count: exportBlockers.length }) : t('shell.dashboard.exportable') }}
            </span>
          </div>
          <p v-if="filteredIssues.length === 0" class="project-hint">{{ t('shell.dashboard.noMatchingIssues') }}</p>
          <ul v-else class="global-issue-list">
            <li v-for="(issue, index) in filteredIssues" :key="index" :class="issue.severity">
              <div>
                <code>{{ issue.file || t('shell.dashboard.project') }}</code>
                <span v-if="issue.path"> · {{ issue.path }}</span>
                <span class="issue-code">{{ issue.code }}</span>
                <div>{{ issue.message }}</div>
                <div v-if="issue.fixHint" class="issue-fix">{{ issue.fixHint }}</div>
              </div>
              <button v-if="issue.file && store.files[issue.file]" class="mc-button tiny" @click="locateIssue(issue)">
                {{ t('shell.dashboard.locate') }}
              </button>
            </li>
          </ul>
        </section>

        <details class="project-card help-panel" data-testid="project-help">
          <summary><h2>{{ t('shell.dashboard.helpTitle') }}</h2></summary>
          <div class="help-grid">
            <section>
              <h3>{{ HELP_LABELS.questReward }}</h3>
              <ul>
                <li v-for="quest in QUEST_TYPES" :key="quest.id">
                  <code>{{ quest.id }}</code> · {{ quest.label }} · {{ HELP_LABELS.target }} {{ quest.target }}
                </li>
              </ul>
              <ul>
                <li v-for="reward in REWARD_TYPES" :key="reward.id">
                  <code>{{ reward.syntax }}</code>
                </li>
              </ul>
            </section>
            <section>
              <h3>{{ HELP_LABELS.focusLimits }}</h3>
              <ul>
                <li v-for="(line, index) in FOCUS_LIMITS" :key="index">{{ line.text }}</li>
              </ul>
            </section>
            <section>
              <h3>{{ HELP_LABELS.menuLanguage }}</h3>
              <ul>
                <li v-for="(line, index) in MENU_LIMITS" :key="index">{{ line.text }}</li>
              </ul>
            </section>
            <section>
              <h3>{{ HELP_LABELS.activation }}</h3>
              <table class="activation-table">
                <thead><tr><th>{{ HELP_LABELS.file }}</th><th>{{ HELP_LABELS.mode }}</th><th>{{ HELP_LABELS.detail }}</th></tr></thead>
                <tbody>
                  <tr v-for="row in ACTIVATION_ROWS" :key="row.file">
                    <td><code>{{ row.file }}</code></td><td>{{ row.mode }}</td><td>{{ row.detail }}</td>
                  </tr>
                </tbody>
              </table>
            </section>
            <section>
              <h3>{{ HELP_LABELS.deployment }}</h3>
              <ol>
                <li v-for="(step, index) in DEPLOYMENT_STEPS" :key="index">{{ step.text }}</li>
              </ol>
            </section>
          </div>
        </details>
      </main>

      <aside class="project-side">
        <section class="project-card">
          <h2>{{ t('shell.dashboard.statusTitle') }}</h2>
          <dl class="status-list">
            <dt>{{ t('shell.dashboard.autoSavedLabel') }}</dt>
            <dd>{{ store.isLocallySaved ? t('shell.dashboard.statusSaved') : t('shell.dashboard.statusSaving') }}</dd>
            <dt>{{ t('shell.dashboard.unexportedLabel') }}</dt>
            <dd>{{ store.isDirty ? t('shell.dashboard.unexportedYes') : t('shell.dashboard.unexportedNo') }}</dd>
            <dt>{{ t('shell.dashboard.exportableLabel') }}</dt>
            <dd>{{ exportableCount }}</dd>
            <dt>{{ t('shell.dashboard.blockedLabel') }}</dt>
            <dd>{{ t('shell.dashboard.blockedCount', { count: exportBlockers.length }) }}</dd>
            <dt>{{ t('shell.dashboard.refFocusLabel') }}</dt>
            <dd>{{ t('shell.dashboard.refFocusCount', { count: referenceFocus.length }) }}</dd>
          </dl>
          <p class="project-hint">
            {{ t('shell.dashboard.jsonNote') }}
          </p>
          <button class="mc-button" data-action="project-save-json" @click="downloadProjectJson">{{ t('shell.dashboard.saveJson') }}</button>
          <button class="mc-button" data-action="project-import-json" @click="triggerImport">{{ t('shell.dashboard.importJson') }}</button>
        </section>
        <section class="project-card">
          <h2>{{ t('shell.dashboard.importHelpTitle') }}</h2>
          <p class="project-hint">
            {{ t('shell.dashboard.importHelpText') }}
          </p>
          <p class="project-hint">{{ t('shell.dashboard.conflictNote') }}</p>
        </section>
      </aside>
    </div>

    <div v-if="dragging" class="project-drop-overlay" @dragover.prevent>
      <div>{{ t('shell.dashboard.dropText') }}</div>
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
