<script setup lang="ts">
import { focusText as tx } from './focusConstants';
import { computed, nextTick, ref, shallowRef, watch } from 'vue';
import type { Document } from 'yaml';
import { downloadTextFile } from '../../core/download';
import { prepareExport } from '../../core/export';
import { pushToast } from '../../core/toast';
import { isBlockingIssue } from '../../core/validation';
import { useProjectStore } from '../../store/project';
import ActionEditor from './ActionEditor.vue';
import ConditionEditor from './ConditionEditor.vue';
import EffectEditor from './EffectEditor.vue';
import {
  FIXED_FOCUS_IDS,
  FIXED_FOCUS_PATHS,
  coerceDefault,
  exportFilenameFor,
  isFocusValueType,
  isReferenceFocusPath,
  referencePathFor,
  splitOrGroup,
} from './focusConstants';
import {
  addEffectGroup,
  addExpertise,
  buildFocusModel,
  createFixedFocusTemplate,
  deleteActionEntry,
  deleteConditionEntry,
  deleteEffectGroup,
  deleteExpertise,
  duplicateExpertise,
  expertiseNode,
  migrateLegacyValueType,
  moveExpertise,
  parseFocusFile,
  renameEffectGroup,
  renameExpertise,
  serializeFocus,
  setActionEntry,
  setConditionEntry,
  setEffectGroupRows,
  setFocusDescription,
  setFocusField,
  setNodeDefaultValue,
  setNodeDescription,
  setNodeField,
  setNodeValueType,
  defaultNodePlain,
  type ExpertiseModel,
  type FocusFileModel,
} from './focusDoc';
import {
  ensureFocusValidatorRegistered,
  focusDefaultValueError,
  isBooleanDefaultLiteral,
  type FocusIssue,
} from './focusValidation';
import { ENTITY_TYPE_NAMES } from './data/minecraftEnums';

ensureFocusValidatorRegistered();

const store = useProjectStore();
const doc = shallowRef<Document | null>(null);
const model = ref<FocusFileModel>(
  buildFocusModel(null, '', FIXED_FOCUS_PATHS[0]),
);
const selectedPath = ref<string | null>(null);
const selectedNodeId = ref<string | null>(null);
const search = ref('');
const showIssues = ref(false);
const lastText = ref('');
const importInput = ref<HTMLInputElement | null>(null);

const focusFiles = computed(() =>
  store.fileList
    .filter((file) => file.kind === 'focus' || isReferenceFocusPath(file.path))
    .slice()
    .sort((left, right) => {
      const leftFixed = FIXED_FOCUS_PATHS.indexOf(left.path as (typeof FIXED_FOCUS_PATHS)[number]);
      const rightFixed = FIXED_FOCUS_PATHS.indexOf(right.path as (typeof FIXED_FOCUS_PATHS)[number]);
      if (leftFixed >= 0 || rightFixed >= 0) {
        if (leftFixed < 0) return 1;
        if (rightFixed < 0) return -1;
        return leftFixed - rightFixed;
      }
      return left.path.localeCompare(right.path);
    }),
);
const fixedFiles = computed(() =>
  focusFiles.value.filter((file) => (FIXED_FOCUS_PATHS as readonly string[]).includes(file.path)),
);
const nonFixedFiles = computed(() =>
  focusFiles.value.filter((file) => !(FIXED_FOCUS_PATHS as readonly string[]).includes(file.path)),
);
const fixedTargets = computed(() => fixedFiles.value.map((entry) => entry.path));
const ENTITY_OPTIONS = [...ENTITY_TYPE_NAMES].sort();
const file = computed(() => (selectedPath.value ? (store.files[selectedPath.value] ?? null) : null));
const issues = computed<FocusIssue[]>(() => (file.value?.issues ?? []) as FocusIssue[]);
const blockingIssues = computed(() => issues.value.filter(isBlockingIssue));
const fixedBlockingIssues = computed(() =>
  fixedFiles.value.flatMap((entry) => entry.issues.filter(isBlockingIssue)),
);
const selectedNode = computed<ExpertiseModel | null>(
  () => model.value.expertises.find((node) => node.id === selectedNodeId.value) ?? null,
);
const filteredNodes = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) return model.value.expertises;
  return model.value.expertises.filter(
    (node) =>
      node.id.toLowerCase().includes(query) ||
      node.label.toLowerCase().includes(query),
  );
});
const referenceMode = computed(() => Boolean(selectedPath.value && !model.value.fixed));
const exportable = computed(() => Boolean(selectedPath.value && file.value && doc.value));

function nodeIssues(nodeId: string) {
  return issues.value.filter((issue) => issue.nodeId === nodeId);
}

function nodeHasBlocking(nodeId: string): boolean {
  return nodeIssues(nodeId).some(isBlockingIssue);
}

function focusIssuesByNode(): Array<{ node: ExpertiseModel; issues: ReturnType<typeof nodeIssues> }> {
  return model.value.expertises
    .map((node) => ({ node, issues: nodeIssues(node.id) }))
    .filter((entry) => entry.issues.length > 0);
}

function loadSelected(): void {
  const current = file.value;
  if (!current) {
    doc.value = null;
    model.value = buildFocusModel(null, '', selectedPath.value ?? FIXED_FOCUS_PATHS[0]);
    lastText.value = '';
    selectedNodeId.value = null;
    return;
  }
  const parsed = parseFocusFile(current.path, current.text);
  doc.value = parsed.doc;
  model.value = parsed.model;
  lastText.value = current.text;
  const ids = model.value.expertises.map((node) => node.id);
  if (!selectedNodeId.value || !ids.includes(selectedNodeId.value)) {
    selectedNodeId.value = ids[0] ?? null;
  }
}

function ensureSelection(): void {
  const paths = focusFiles.value.map((entry) => entry.path);
  if (selectedPath.value && paths.includes(selectedPath.value)) return;
  const preferred = FIXED_FOCUS_PATHS.find((path) => paths.includes(path));
  selectedPath.value = preferred ?? paths[0] ?? null;
}

function persist(): void {
  if (!doc.value || !selectedPath.value) return;
  const text = serializeFocus(doc.value);
  lastText.value = text;
  const kind = isReferenceFocusPath(selectedPath.value) ? 'unknown' : 'focus';
  store.upsertFile(selectedPath.value, text, kind);
  model.value = buildFocusModel(doc.value, text, selectedPath.value);
  if (selectedNodeId.value && !model.value.expertises.some((node) => node.id === selectedNodeId.value)) {
    selectedNodeId.value = model.value.expertises[0]?.id ?? null;
  }
}

function createFixed(id: string): void {
  const path = `focus/${id}.yml`;
  if (store.files[path]) {
    selectedPath.value = path;
    return;
  }
  const template = createFixedFocusTemplate(id);
  if (!template) return;
  store.upsertFile(path, serializeFocus(template), 'focus');
  selectedPath.value = path;
  selectedNodeId.value = null;
  pushToast(tx('已创建固定文件 {path}', { path }), 'success');
}

function triggerImport(): void {
  importInput.value?.click();
}

async function onImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const uploaded = input.files?.[0];
  if (!uploaded) return;
  const text = await uploaded.text();
  input.value = '';
  const base = uploaded.name.split(/[\\/]/).pop() ?? uploaded.name;
  const id = base.replace(/\.ya?ml$/i, '');
  const fixed = (FIXED_FOCUS_IDS as readonly string[]).includes(id);
  const path = fixed ? `focus/${id}.yml` : referencePathFor(id);
  if (store.files[path] && !window.confirm(tx('项目中已有 {path}，确定替换？', { path }))) return;
  const parsed = parseFocusFile(path, text);
  if (!parsed.parsed.ok || !parsed.doc) {
    pushToast(tx('导入失败：{error}', { error: parsed.parsed.error?.message ?? tx('YAML 无法解析') }), 'error');
    return;
  }
  const legacy = parsed.model.legacyNodeIds;
  let migrated = 0;
  let migrationNote = '';
  if (legacy.length > 0) {
    migrated = migrateLegacyValueType(parsed.doc);
    const nonBoolean = parsed.model.expertises.filter(
      (node) => node.valueTypeKey === 'value-type' && node.legacyValueType !== 'boolean',
    );
    migrationNote =
      tx('；已迁移 {count} 处旧键 value-type → value_type（保留原值）', { count: migrated }) +
      (nonBoolean.length
        ? tx('，其中 {count} 个非 boolean：运行时语义会从 boolean 改变，请确认', { count: nonBoolean.length })
        : '');
  }
  const output = serializeFocus(parsed.doc);
  store.upsertFile(path, output, fixed ? 'focus' : 'unknown');
  selectedPath.value = path;
  selectedNodeId.value = null;
  pushToast(
    (fixed
      ? tx('已替换固定文件 {path}', { path })
      : tx('已导入参考文件 {path}；它不会被插件加载，只能查看/迁移或另存为参考文件', { path })) + migrationNote,
    migrated > 0 ? 'warning' : fixed ? 'success' : 'warning',
  );
}

function removeReference(path: string): void {
  if (fixedFiles.value.some((entry) => entry.path === path)) return;
  if (!window.confirm(tx('从项目中移除参考文件 {path}？不会影响服务器文件。', { path }))) return;
  store.removeFile(path);
  if (selectedPath.value === path) selectedPath.value = null;
  ensureSelection();
  pushToast(tx('已移除参考文件 {path}', { path }), 'info');
}

function migrateCurrent(): void {
  if (!doc.value) return;
  const count = migrateLegacyValueType(doc.value);
  if (count === 0) {
    pushToast(tx('没有发现 value-type 旧键'), 'info');
    return;
  }
  persist();
  pushToast(tx('已归一化 {count} 处 value-type → value_type（保留原值，导出只会写 value_type）', { count }), 'warning');
}

function setHeaderField(field: string, event: Event): void {
  if (!doc.value) return;
  setFocusField(doc.value, field, (event.target as HTMLInputElement).value);
  persist();
}

function setHeaderDescription(index: number, event: Event): void {
  if (!doc.value) return;
  const lines = [...model.value.description];
  lines[index] = (event.target as HTMLInputElement).value;
  setFocusDescription(doc.value, lines);
  persist();
}

function addHeaderDescription(): void {
  if (!doc.value) return;
  setFocusDescription(doc.value, [...model.value.description, '']);
  persist();
}

function removeHeaderDescription(index: number): void {
  if (!doc.value) return;
  const lines = [...model.value.description];
  lines.splice(index, 1);
  setFocusDescription(doc.value, lines);
  persist();
}

function setNodeLabel(event: Event): void {
  const node = selectedNode.value;
  if (!node || !doc.value) return;
  const value = (event.target as HTMLInputElement).value;
  node.label = value;
  setNodeField(doc.value, node.id, 'label', value);
  persist();
}

function updateNodeDescription(index: number, event: Event): void {
  const node = selectedNode.value;
  if (!node || !doc.value) return;
  const lines = [...node.description];
  lines[index] = (event.target as HTMLInputElement).value;
  node.description = lines;
  setNodeDescription(doc.value, node.id, lines);
  persist();
}

function addNodeDescription(): void {
  const node = selectedNode.value;
  if (!node || !doc.value) return;
  const lines = [...node.description, ''];
  node.description = lines;
  setNodeDescription(doc.value, node.id, lines);
  persist();
}

function removeNodeDescription(index: number): void {
  const node = selectedNode.value;
  if (!node || !doc.value) return;
  const lines = [...node.description];
  lines.splice(index, 1);
  node.description = lines;
  setNodeDescription(doc.value, node.id, lines);
  persist();
}

function changeValueType(event: Event): void {
  const node = selectedNode.value;
  if (!node || !doc.value) return;
  const type = (event.target as HTMLSelectElement).value;
  setNodeValueType(doc.value, node.id, type);
  if (isFocusValueType(type)) {
    const coerced = coerceDefault(type, node.defaultValue);
    setNodeDefaultValue(doc.value, node.id, coerced);
  }
  persist();
}

/** 下拉 option 只写小写 true/false；显示层做大小写归一，文档值保持原样。 */
function booleanSelectValue(value: string): string {
  const normalized = value.toLowerCase();
  return normalized === 'true' || normalized === 'false' ? normalized : value;
}

function setDefaultValue(event: Event): void {
  const node = selectedNode.value;
  if (!node || !doc.value) return;
  const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
  node.defaultValue = value;
  setNodeDefaultValue(doc.value, node.id, value);
  persist();
}

function renameNode(event: Event): void {
  const node = selectedNode.value;
  if (!node || !doc.value) return;
  const input = event.target as HTMLInputElement;
  const next = input.value.trim();
  if (next === node.id) return;
  const error = !next
    ? tx('ID 不能为空')
    : next.includes(':') || next.includes(';')
      ? tx('ID 不能包含 “:” 或 “;”')
      : model.value.expertises.some((entry) => entry.id === next)
        ? tx('ID “{id}” 已存在', { id: next })
        : null;
  if (error) {
    pushToast(error, 'error');
    input.value = node.id;
    return;
  }
  if (!renameExpertise(doc.value, node.id, next)) {
    input.value = node.id;
    return;
  }
  selectedNodeId.value = next;
  persist();
}

function nextNodeId(base = 'expertise'): string {
  const existing = new Set(model.value.expertises.map((node) => node.id));
  let index = 1;
  while (existing.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function addNode(): void {
  if (!doc.value) return;
  const id = nextNodeId();
  if (!addExpertise(doc.value, id, defaultNodePlain(id))) return;
  persist();
  selectedNodeId.value = id;
  void nextTick(() => document.querySelector<HTMLElement>('[data-field="focus-node-id"]')?.focus());
  pushToast(tx('已新增专精 {id}', { id }), 'success');
}

function copyNode(): void {
  const node = selectedNode.value;
  if (!node || !doc.value) return;
  const id = nextNodeId(`${node.id}_copy`);
  if (!duplicateExpertise(doc.value, node.id, id)) {
    pushToast(tx('复制失败：ID 冲突或节点不存在'), 'error');
    return;
  }
  persist();
  selectedNodeId.value = id;
  pushToast(tx('已复制为 {id}', { id }), 'success');
}

function removeNode(): void {
  const node = selectedNode.value;
  if (!node || !doc.value) return;
  if (!window.confirm(tx('确定删除专精 “{id}”？玩家已解锁的该节点会变成孤儿数据。', { id: node.id }))) return;
  const index = model.value.expertises.findIndex((entry) => entry.id === node.id);
  if (!deleteExpertise(doc.value, node.id)) return;
  selectedNodeId.value = null;
  persist();
  const next = model.value.expertises[Math.min(index, model.value.expertises.length - 1)];
  selectedNodeId.value = next?.id ?? null;
  pushToast(tx('已删除专精 {id}', { id: node.id }), 'info');
}

function moveNode(direction: -1 | 1): void {
  const node = selectedNode.value;
  if (!node || !doc.value) return;
  const from = model.value.expertises.findIndex((entry) => entry.id === node.id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= model.value.expertises.length) return;
  if (!moveExpertise(doc.value, from, to)) return;
  persist();
}

function copyNodeTo(targetPath: string): void {
  const node = selectedNode.value;
  if (!node || !doc.value) return;
  const target = store.files[targetPath];
  if (!target) {
    pushToast(tx('目标文件 {path} 不存在', { path: targetPath }), 'error');
    return;
  }
  const parsed = parseFocusFile(targetPath, target.text);
  if (!parsed.doc) {
    pushToast(tx('目标文件无法解析，已取消'), 'error');
    return;
  }
  const targetIds = new Set(parsed.model.expertises.map((entry) => entry.id));
  let id = node.id;
  let index = 2;
  while (targetIds.has(id)) {
    id = `${node.id}_${index}`;
    index += 1;
  }
  const source = expertiseNode(doc.value, node.id);
  const plain = source ? structuredClone(source.toJSON()) : defaultNodePlain(id);
  if (!addExpertise(parsed.doc, id, plain)) {
    pushToast(tx('复制失败：目标文件结构异常'), 'error');
    return;
  }
  store.upsertFile(targetPath, serializeFocus(parsed.doc), 'focus');
  selectedPath.value = targetPath;
  selectedNodeId.value = id;
  pushToast(tx('已把 {node} 复制到 {path}（新 ID：{id}）', { node: node.id, path: targetPath, id }), 'success');
}

function focusConditionSet(key: string, value: unknown): void {
  if (!doc.value) return;
  if (!setConditionEntry(doc.value, null, key, value)) {
    pushToast(tx('focus condition 不是映射，无法编辑'), 'error');
    return;
  }
  persist();
}

function focusConditionRemove(key: string): void {
  if (!doc.value) return;
  deleteConditionEntry(doc.value, null, key);
  persist();
}

function nodeConditionSet(key: string, value: unknown): void {
  const node = selectedNode.value;
  if (!node || !doc.value) return;
  if (!setConditionEntry(doc.value, node.id, key, value)) {
    pushToast(tx('condition 不是映射，无法编辑'), 'error');
    return;
  }
  persist();
}

function nodeConditionRemove(key: string): void {
  const node = selectedNode.value;
  if (!node || !doc.value) return;
  deleteConditionEntry(doc.value, node.id, key);
  persist();
}

function nodeActionSet(key: string, value: unknown): void {
  const node = selectedNode.value;
  if (!node || !doc.value) return;
  if (!setActionEntry(doc.value, node.id, key, value)) {
    pushToast(tx('action 不是映射，无法编辑'), 'error');
    return;
  }
  persist();
}

function nodeActionRemove(key: string): void {
  const node = selectedNode.value;
  if (!node || !doc.value) return;
  deleteActionEntry(doc.value, node.id, key);
  persist();
}

function nodeEffectSetRows(effectKey: string, entity: string, rows: string[]): void {
  const node = selectedNode.value;
  if (!node || !doc.value) return;
  if (!setEffectGroupRows(doc.value, node.id, effectKey, entity, rows)) {
    pushToast(tx('effect 结构异常，无法编辑该组'), 'error');
    return;
  }
  persist();
}

function nodeEffectAddGroup(effectKey: string, entity: string): void {
  const node = selectedNode.value;
  if (!node || !doc.value) return;
  const finalEntity = entity || 'ALL';
  if (!addEffectGroup(doc.value, node.id, effectKey, finalEntity)) {
    pushToast(tx('实体组已存在或 effect 结构异常'), 'warning');
    return;
  }
  persist();
}

function nodeEffectDeleteGroup(effectKey: string, entity: string): void {
  const node = selectedNode.value;
  if (!node || !doc.value) return;
  deleteEffectGroup(doc.value, node.id, effectKey, entity);
  persist();
}

function nodeEffectRenameGroup(effectKey: string, oldEntity: string, newEntity: string): void {
  const node = selectedNode.value;
  if (!node || !doc.value) return;
  if (!renameEffectGroup(doc.value, node.id, effectKey, oldEntity, newEntity)) {
    pushToast(tx('实体 “{entity}” 已存在或无效', { entity: newEntity }), 'error');
    return;
  }
  persist();
}

function locateNode(nodeId: string | undefined): void {
  if (!nodeId) return;
  selectedNodeId.value = nodeId;
  showIssues.value = true;
}

function issueLabel(issue: { code?: string; message: string }): string {
  return `[${issue.code ?? 'GEN'}] ${issue.message}`;
}

function migrateExportDoc(): void {
  if (!doc.value) return;
  const count = migrateLegacyValueType(doc.value);
  if (count > 0) {
    persist();
    pushToast(tx('导出前已归一化 {count} 处 value-type → value_type', { count }), 'warning');
  }
}

function exportSelected(): void {
  const currentFile = file.value;
  if (!currentFile || !doc.value) return;
  if (!referenceMode.value && fixedBlockingIssues.value.length > 0) {
    pushToast(tx('固定 focus 文件存在 {count} 条错误，已阻止导出', { count: fixedBlockingIssues.value.length }), 'error');
    showIssues.value = true;
    return;
  }
  migrateExportDoc();
  const updated = store.files[currentFile.path];
  if (!updated) return;
  if (!referenceMode.value && updated.issues.some(isBlockingIssue)) {
    pushToast(tx('归一化后仍存在错误/阻断项，已阻止导出'), 'error');
    showIssues.value = true;
    return;
  }
  const prepared = prepareExport(updated);
  if (!prepared.ok) {
    pushToast(tx('导出被阻止：{issue}', { issue: issueLabel(prepared.issues[0]) }), 'error');
    showIssues.value = true;
    return;
  }
  const filename = exportFilenameFor(currentFile.path, model.value.focusId);
  downloadTextFile(filename, prepared.payload.text);
  store.markExported(currentFile.path);
  pushToast(
    referenceMode.value
      ? tx('已导出参考文件 {file}；它不会进入 focus/，也不会被插件加载', { file: filename })
      : tx('已导出 {file}；放回 plugins/MyCompany/focus/ 后建议重启', { file: filename }),
    referenceMode.value ? 'warning' : 'success',
  );
}

function exportAllFixed(): void {
  if (fixedFiles.value.length === 0) {
    pushToast(tx('没有可导出的固定 focus 文件'), 'error');
    return;
  }
  if (fixedBlockingIssues.value.length > 0) {
    pushToast(tx('固定 focus 文件存在 {count} 条错误，已阻止导出', { count: fixedBlockingIssues.value.length }), 'error');
    showIssues.value = true;
    return;
  }
  const preparedPayloads: Array<{ path: string; filename: string; text: string }> = [];
  for (const entry of fixedFiles.value) {
    if (entry.path === selectedPath.value) {
      migrateExportDoc();
    } else {
      const parsed = parseFocusFile(entry.path, entry.text);
      if (parsed.doc && parsed.model.legacyNodeIds.length > 0) {
        migrateLegacyValueType(parsed.doc);
        store.upsertFile(entry.path, serializeFocus(parsed.doc), 'focus');
      }
    }
    const updated = store.files[entry.path];
    if (!updated) continue;
    if (updated.issues.some(isBlockingIssue)) {
      pushToast(tx('导出 {path} 被阻止：归一化后仍存在错误', { path: entry.path }), 'error');
      showIssues.value = true;
      return;
    }
    const prepared = prepareExport(updated);
    if (!prepared.ok) {
      pushToast(tx('导出 {path} 被阻止：{issue}', { path: entry.path, issue: issueLabel(prepared.issues[0]) }), 'error');
      return;
    }
    preparedPayloads.push({
      path: entry.path,
      filename: `${parsedFocusId(entry.path)}.yml`,
      text: prepared.payload.text,
    });
  }
  for (const payload of preparedPayloads) {
    downloadTextFile(payload.filename, payload.text);
    store.markExported(payload.path);
  }
  pushToast(tx('已导出 {count} 个固定 focus 文件；修改后建议重启服务器', { count: preparedPayloads.length }), 'success');
}

function parsedFocusId(path: string): string {
  return path.split('/').pop()?.replace(/\.ya?ml$/i, '') ?? path;
}

function setNodeDefaultForType(): void {
  const node = selectedNode.value;
  if (!node || !doc.value) return;
  if (!isFocusValueType(node.valueType)) return;
  setNodeDefaultValue(doc.value, node.id, coerceDefault(node.valueType, node.defaultValue));
  persist();
}

const dependencyRows = computed(() => {
  const nodes = model.value.expertises;
  const ids = new Set(nodes.map((node) => node.id));
  const graph = new Map<string, string[]>();
  for (const node of nodes) {
    const deps: string[] = [];
    if (node.condition.expertise?.raw) deps.push(node.condition.expertise.raw.trim());
    for (const group of node.condition.expertises?.items ?? []) {
      deps.push(...splitOrGroup(group));
    }
    graph.set(node.id, [...new Set(deps.filter(Boolean))]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cyclic = new Set<string>();
  const walk = (id: string, stack: string[]): void => {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      for (let index = Math.max(start, 0); index < stack.length; index += 1) cyclic.add(stack[index]!);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    stack.push(id);
    for (const dep of graph.get(id) ?? []) {
      if (ids.has(dep)) walk(dep, stack);
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) walk(id, []);
  return nodes.map((node) => {
    const deps = graph.get(node.id) ?? [];
    return {
      node,
      deps,
      missing: deps.filter((id) => !ids.has(id)),
      cycles: cyclic.has(node.id),
      self: deps.includes(node.id),
    };
  });
});

watch(
  () => focusFiles.value.map((entry) => entry.path).join('|'),
  () => {
    if (!selectedPath.value || !store.files[selectedPath.value]) ensureSelection();
  },
);

watch(
  selectedPath,
  (path, previous) => {
    if (path === previous) return;
    selectedNodeId.value = null;
    loadSelected();
  },
  { immediate: true },
);

watch(
  () => file.value?.text,
  (text) => {
    if (text !== undefined && text !== lastText.value) {
      const node = selectedNodeId.value;
      loadSelected();
      if (node && model.value.expertises.some((entry) => entry.id === node)) {
        selectedNodeId.value = node;
      }
    }
  },
);

ensureSelection();
</script>

<template>
  <div class="focus-editor" data-testid="focus-editor">
    <header class="focus-header">
      <div>
        <h1>{{ tx("专精编辑器") }}</h1>
        <p class="focus-subtitle"> {{ tx("插件只加载") }} <code>focus/none.yml</code> {{ tx("与") }} <code>focus/mob.yml</code>{{ tx("（FixedFocusList 硬编码）。 修改后建议重启服务器；") }}<code>/mycompany reload</code> {{ tx("会重复 focus 列表。") }} </p>
      </div>
      <div class="focus-header-actions">
        <button class="mc-button small" data-action="focus-import" @click="triggerImport">{{ tx("导入 focus 文件") }}</button>
        <button
          class="mc-button small"
          data-action="focus-export"
          :disabled="!exportable || (!referenceMode && fixedBlockingIssues.length > 0)"
          :title="
            fixedBlockingIssues.length > 0 && !referenceMode
              ? tx('固定 focus 文件存在 {count} 条错误，导出被阻止', { count: fixedBlockingIssues.length })
              : referenceMode
                ? tx('另存为参考文件（不会被插件加载）')
                : tx('导出当前固定 focus 文件')
          "
          @click="exportSelected"
        >
          {{ referenceMode ? tx('另存为参考文件') : tx('导出当前文件') }}
        </button>
        <button
          class="mc-button small primary"
          data-action="focus-export-all"
          :disabled="fixedFiles.length === 0 || fixedBlockingIssues.length > 0"
          :title="fixedBlockingIssues.length > 0 ? tx('固定文件存在 {count} 条错误', { count: fixedBlockingIssues.length }) : tx('导出 none.yml 与 mob.yml')"
          @click="exportAllFixed"
        > {{ tx("导出全部固定文件（") }}{{ fixedFiles.length }})
        </button>
        <input ref="importInput" type="file" accept=".yml,.yaml" class="file-input" @change="onImportFile" />
      </div>
    </header>

    <div class="focus-fixed-banner">
      <strong>{{ tx("固定加载列表：none / mob") }}</strong>
      <span> {{ tx("不能新增、删除或重命名这两个文件（删除后插件会在 reload 时重新生成默认文件，改动会丢失）。 其他导入的 focus 文件仅作为“参考文件”保存/查看，不会被加载，也不能导出到") }} <code>focus/</code>.
      </span>
    </div>

    <div class="focus-layout">
      <aside class="focus-files">
        <h2>{{ tx("focus 文件") }}</h2>
        <div v-for="id in FIXED_FOCUS_IDS" :key="id" class="file-slot">
          <button
            v-if="store.files[`focus/${id}.yml`]"
            class="file-button"
            :class="{ active: selectedPath === `focus/${id}.yml` }"
            :data-focus-file="`focus/${id}.yml`"
            @click="selectedPath = `focus/${id}.yml`"
          >
            <span>focus/{{ id }}.yml</span>
            <span class="badge fixed">{{ tx("固定") }}</span>
          </button>
          <button
            v-else
            class="file-button missing"
            :data-action="`focus-create-${id}`"
            @click="createFixed(id)"
          >
            <span>focus/{{ id }}.yml</span>
            <span class="badge missing">{{ tx("缺失 · 创建") }}</span>
          </button>
        </div>

        <div v-if="nonFixedFiles.length" class="reference-heading">
          <h2>{{ tx("参考文件") }}</h2>
          <p class="hint">{{ tx("不会被插件加载；可查看/迁移，导出为 *.reference.yml。") }}</p>
        </div>
        <div
          v-for="entry in nonFixedFiles"
          :key="entry.path"
          class="file-slot reference"
        >
          <button
            class="file-button"
            :class="{ active: selectedPath === entry.path }"
            :data-focus-file="entry.path"
            @click="selectedPath = entry.path"
          >
            <span>{{ entry.path }}</span>
            <span class="badge reference">{{ tx("参考") }}</span>
          </button>
          <button class="mc-button tiny" type="button" @click="removeReference(entry.path)">{{ tx("移除") }}</button>
        </div>

        <p v-if="focusFiles.length === 0" class="muted"> {{ tx("还没有 focus 文件。可导入服务器文件，或先创建固定 none/mob 模板。") }} </p>
      </aside>

      <aside class="expertise-list">
        <h2>{{ tx("专精节点（") }}{{ model.expertises.length }})</h2>
        <input
          v-model="search"
          class="mc-input"
          data-field="focus-search"
          :placeholder="tx('搜索 ID / label')"
          :aria-label="tx('搜索专精节点')"
        />
        <div class="expertise-actions">
          <button class="mc-button tiny primary" data-action="focus-add-node" :disabled="!doc" @click="addNode"> {{ tx("+ 新增") }} </button>
          <button class="mc-button tiny" data-action="focus-copy-node" :disabled="!selectedNode" @click="copyNode"> {{ tx("复制") }} </button>
          <button class="mc-button tiny danger" data-action="focus-delete-node" :disabled="!selectedNode" @click="removeNode"> {{ tx("删除") }} </button>
        </div>
        <div class="expertise-scroll">
          <button
            v-for="node in filteredNodes"
            :key="node.id"
            class="expertise-item"
            :class="{ active: node.id === selectedNodeId }"
            :data-focus-node="node.id"
            @click="selectedNodeId = node.id"
          >
            <span class="expertise-id">{{ node.id }}</span>
            <span class="expertise-label">{{ node.label || 'No Label' }}</span>
            <span v-if="node.valueTypeKey === 'value-type'" class="badge legacy">{{ tx("旧键") }}</span>
            <span v-if="nodeHasBlocking(node.id)" class="badge error">{{ tx("错误") }}</span>
            <span v-else-if="nodeIssues(node.id).length" class="badge warning">{{ tx("警告") }}</span>
          </button>
          <p v-if="filteredNodes.length === 0" class="muted">{{ tx("没有匹配的节点。") }}</p>
        </div>

        <details class="dependency-panel">
          <summary>{{ tx("专精依赖检查（缺失 / 循环）") }}</summary>
          <ul>
            <li v-for="row in dependencyRows" :key="row.node.id">
              <code>{{ row.node.id }}</code>
              <span v-if="row.deps.length === 0" class="muted"> {{ tx("· 无前置") }}</span>
              <span v-else> ← {{ row.deps.join(', ') }}</span>
              <span v-if="row.missing.length" class="badge error">{{ tx("缺失") }} {{ row.missing.join(', ') }}</span>
              <span v-if="row.cycles || row.self" class="badge error">{{ tx("循环") }}</span>
            </li>
          </ul>
        </details>
      </aside>

      <main class="focus-detail">
        <div v-if="!selectedPath || !file" class="focus-empty">
          <div class="focus-empty-icon" aria-hidden="true">🧭</div>
          <h2>{{ tx("选择或创建 focus 文件") }}</h2>
          <p> {{ tx("固定可加载的只有") }} <code>focus/none.yml</code> {{ tx("与") }} <code>focus/mob.yml</code>{{ tx("。 导入其他 focus 文件会作为参考文件，不会被插件加载。") }} </p>
          <div class="focus-empty-actions">
            <button class="mc-button primary" data-action="focus-empty-import" @click="triggerImport">{{ tx("导入 focus 文件") }}</button>
            <button class="mc-button" data-action="focus-empty-create-none" @click="createFixed('none')">{{ tx("创建 none.yml") }}</button>
            <button class="mc-button" data-action="focus-empty-create-mob" @click="createFixed('mob')">{{ tx("创建 mob.yml") }}</button>
          </div>
        </div>

        <template v-else>
          <div class="detail-title">
            <div>
              <h2>{{ selectedPath }}</h2>
              <div class="badges">
                <span class="badge" :class="referenceMode ? 'reference' : 'fixed'">
                  {{ referenceMode ? tx('参考文件 · 不会被加载') : tx('固定加载文件') }}
                </span>
                <span v-if="model.legacyNodeIds.length" class="badge legacy"> {{ tx("含 value-type 旧键") }} {{ model.legacyNodeIds.length }} {{ tx("处") }} </span>
                <span v-if="blockingIssues.length" class="badge error">{{ blockingIssues.length }} {{ tx("条错误") }}</span>
                <span v-else-if="issues.length" class="badge warning">{{ issues.length }} {{ tx("条提示") }}</span>
              </div>
            </div>
            <div class="detail-actions">
              <button
                v-if="model.legacyNodeIds.length"
                class="mc-button tiny primary"
                data-action="focus-migrate-legacy"
                @click="migrateCurrent"
              > {{ tx("归一化 value-type") }} </button>
              <button
                v-for="target in referenceMode && selectedNode ? fixedTargets : []"
                :key="target"
                class="mc-button tiny"
                data-action="focus-copy-to-fixed"
                @click="copyNodeTo(target)"
              > {{ tx("复制节点到") }} {{ target.split('/').pop() }}
              </button>
              <button class="mc-button tiny" type="button" @click="showIssues = !showIssues">
                {{ showIssues ? tx('收起问题') : tx('显示问题') }}
              </button>
            </div>
          </div>

          <div v-if="referenceMode" class="reference-warning"> {{ tx("这是参考文件：可查看/编辑并另存为") }} <code>{{ model.focusId }}.reference.yml</code>{{ tx("， 但不会进入") }} <code>focus/</code>{{ tx("，也不会被插件加载。迁移节点请用“复制节点到固定文件”。") }} </div>

          <section class="focus-card">
            <h3>{{ tx("focus 头部") }}</h3>
            <p class="hint"> {{ tx("文件里的") }} <code>id</code> {{ tx("字段不会被读取，focus ID 以文件名") }} {{ model.focusId }} {{ tx("为准； 修改 label/description 后建议重启，首次启动语言文件可能覆盖文本。") }} </p>
            <div class="field-grid">
              <label class="field">
                <span class="field-label">{{ tx("id（未使用，可保留）") }}</span>
                <input class="mc-input" :value="model.idField" data-field="focus-id" @input="setHeaderField('id', $event)" />
              </label>
              <label class="field">
                <span class="field-label">label</span>
                <input class="mc-input" :value="model.label" data-field="focus-label" @input="setHeaderField('label', $event)" />
              </label>
            </div>
            <div class="field">
              <span class="field-label">{{ tx("description（字符串列表）") }}</span>
              <div v-for="(line, index) in model.description" :key="index" class="list-row">
                <input class="mc-input" :value="line" :data-field="`focus-desc-${index}`" @input="setHeaderDescription(index, $event)" />
                <button class="mc-button tiny" type="button" @click="removeHeaderDescription(index)">{{ tx("删除") }}</button>
              </div>
              <button class="mc-button tiny" type="button" @click="addHeaderDescription">{{ tx("+ 添加描述行") }}</button>
            </div>
            <div class="field">
              <span class="field-label">{{ tx("focus 级 condition（设置 focus 时校验，不消耗）") }}</span>
              <ConditionEditor
                :model="model.condition"
                :expertise-ids="model.expertises.map((node) => node.id)"
                :owner-label="tx('focus 级条件')"
                @set="focusConditionSet"
                @remove="focusConditionRemove"
              />
            </div>
          </section>

          <section v-if="!selectedNode" class="focus-card muted"> {{ tx("从左侧选择一个专精节点，或点击“新增”。") }} </section>

          <template v-else>
            <section class="focus-card">
              <h3>{{ tx("专精节点") }} <code>{{ selectedNode.id }}</code></h3>
              <div class="field-grid">
                <label class="field">
                  <span class="field-label">{{ tx("ID（重命名）") }}</span>
                  <input
                    class="mc-input"
                    :value="selectedNode.id"
                    data-field="focus-node-id"
                    @change="renameNode"
                  />
                </label>
                <label class="field">
                  <span class="field-label">label</span>
                  <input class="mc-input" :value="selectedNode.label" data-field="focus-node-label" @input="setNodeLabel" />
                </label>
                <label class="field">
                  <span class="field-label">value_type</span>
                  <select class="mc-select" :value="selectedNode.valueType" data-field="focus-value-type" @change="changeValueType">
                    <option v-for="type in ['boolean', 'integer', 'double', 'string']" :key="type" :value="type">
                      {{ type }}
                    </option>
                    <option v-if="!isFocusValueType(selectedNode.valueType)" :value="selectedNode.valueType"> {{ tx("非法：") }}{{ selectedNode.valueType }}
                    </option>
                  </select>
                </label>
                <label class="field">
                  <span class="field-label">{{ tx("default.value（按 value_type 类型化）") }}</span>
                  <select
                    v-if="selectedNode.valueType === 'boolean'"
                    class="mc-select"
                    :value="booleanSelectValue(selectedNode.defaultValue)"
                    data-field="focus-default"
                    @change="setDefaultValue"
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                    <option v-if="!isBooleanDefaultLiteral(selectedNode.defaultValue)" :value="selectedNode.defaultValue"> {{ tx("非法：") }}{{ selectedNode.defaultValue }}
                    </option>
                  </select>
                  <small
                    v-if="selectedNode.defaultValue !== booleanSelectValue(selectedNode.defaultValue)"
                    class="hint"
                  > {{ tx("原值") }} {{ selectedNode.defaultValue }}{{ tx("（导出保留原大小写）") }} </small>
                  <input
                    v-else
                    class="mc-input"
                    :inputmode="selectedNode.valueType === 'string' ? 'text' : 'decimal'"
                    :value="selectedNode.defaultValue"
                    data-field="focus-default"
                    @input="setDefaultValue"
                  />
                </label>
              </div>
              <p v-if="focusDefaultValueError(selectedNode.valueType, selectedNode.defaultValue)" class="inline-error">
                {{ focusDefaultValueError(selectedNode.valueType, selectedNode.defaultValue) }}
                <button
                  class="mc-button tiny"
                  type="button"
                  data-action="focus-default-safe"
                  @click="setNodeDefaultForType"
                > {{ tx("用安全默认值") }} </button>
              </p>
              <p v-if="selectedNode.valueTypeKey === 'value-type'" class="inline-warning"> {{ tx("当前使用旧键") }} <code>value-type</code>{{ tx("；加载器会忽略并按 boolean 运行。点击上方“归一化 value-type”会保留原值。") }} </p>

              <div class="field">
                <span class="field-label">{{ tx("description（字符串列表）") }}</span>
                <div v-for="(line, index) in selectedNode.description" :key="index" class="list-row">
                  <input class="mc-input" :value="line" :data-field="`focus-node-desc-${index}`" @input="updateNodeDescription(index, $event)" />
                  <button class="mc-button tiny" type="button" @click="removeNodeDescription(index)">{{ tx("删除") }}</button>
                </div>
                <button class="mc-button tiny" type="button" @click="addNodeDescription">{{ tx("+ 添加描述行") }}</button>
              </div>

              <div class="move-actions">
                <button class="mc-button tiny" type="button" @click="moveNode(-1)">{{ tx("↑ 上移") }}</button>
                <button class="mc-button tiny" type="button" @click="moveNode(1)">{{ tx("↓ 下移") }}</button>
              </div>

              <details v-if="selectedNode.extras.length" class="extras">
                <summary>{{ tx("未识别字段") }} {{ selectedNode.extras.length }} {{ tx("个（原样保留）") }}</summary>
                <ul>
                  <li v-for="extra in selectedNode.extras" :key="extra.key">
                    <code>{{ extra.key }}</code>: {{ extra.preview }}
                  </li>
                </ul>
              </details>
            </section>

            <section class="focus-card">
              <h3>{{ tx("condition（必填，可为空）") }}</h3>
              <ConditionEditor
                :model="selectedNode.condition"
                :expertise-ids="model.expertises.map((node) => node.id)"
                :owner-label="tx('节点 {id} ', { id: selectedNode.id })"
                @set="nodeConditionSet"
                @remove="nodeConditionRemove"
              />
            </section>

            <section class="focus-card">
              <h3>{{ tx("action（解锁时执行一次）") }}</h3>
              <ActionEditor
                :model="selectedNode.action"
                :expertise-ids="model.expertises.map((node) => node.id)"
                @set="nodeActionSet"
                @remove="nodeActionRemove"
              />
            </section>

            <section class="focus-card">
              <h3>{{ tx("effect（仅启用节点生效）") }}</h3>
              <EffectEditor
                :model="selectedNode.effect"
                @set-rows="nodeEffectSetRows"
                @add-group="nodeEffectAddGroup"
                @delete-group="nodeEffectDeleteGroup"
                @rename-group="nodeEffectRenameGroup"
              />
            </section>

            <section class="focus-card">
              <h3>{{ tx("校验问题") }}</h3>
              <p v-if="nodeIssues(selectedNode.id).length === 0" class="muted">{{ tx("该节点没有发现问题。") }}</p>
              <ul v-else class="issue-list">
                <li v-for="(issue, index) in nodeIssues(selectedNode.id)" :key="index" :class="issue.severity">
                  <code>{{ issue.code }}</code> {{ issue.message }}
                  <p v-if="issue.fixHint" class="issue-fix">{{ issue.fixHint }}</p>
                </li>
              </ul>
            </section>
          </template>

          <section v-if="showIssues" class="focus-card">
            <h3>{{ tx("全部问题（") }}{{ issues.length }}）</h3>
            <p v-if="issues.length === 0" class="muted">{{ tx("没有发现问题。") }}</p>
            <ul v-else class="issue-list">
              <li v-for="(issue, index) in issues" :key="index" :class="issue.severity">
                <code>{{ issue.code }}</code> {{ issue.message }}
                <p v-if="issue.fixHint" class="issue-fix">{{ issue.fixHint }}</p>
                <button v-if="issue.nodeId" class="mc-button tiny" type="button" @click="locateNode(issue.nodeId)"> {{ tx("定位") }} </button>
              </li>
            </ul>
          </section>

          <section v-if="model.extras.length" class="focus-card">
            <h3>{{ tx("未识别顶层字段") }}</h3>
            <ul>
              <li v-for="extra in model.extras" :key="extra.key">
                <code>{{ extra.key }}</code>: {{ extra.preview }}
              </li>
            </ul>
          </section>

          <section v-if="focusIssuesByNode().length" class="focus-card">
            <h3>{{ tx("按节点汇总") }}</h3>
            <ul class="issue-list">
              <li v-for="entry in focusIssuesByNode()" :key="entry.node.id">
                <button class="mc-button tiny" type="button" @click="selectedNodeId = entry.node.id">
                  {{ entry.node.id }}
                </button>
                {{ entry.issues.length }} {{ tx("条问题") }} </li>
            </ul>
          </section>
        </template>
      </main>
    </div>

    <datalist id="focus-entity-options">
      <option v-for="entity in ENTITY_OPTIONS" :key="entity" :value="entity" />
    </datalist>
  </div>
</template>

<style>
.focus-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 100%;
}
.focus-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
.focus-header h1 {
  margin: 0 0 4px;
  font-size: 22px;
}
.focus-subtitle {
  margin: 0;
  color: var(--muted);
  max-width: 760px;
  line-height: 1.6;
}
.focus-header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.focus-fixed-banner {
  display: flex;
  gap: 10px;
  align-items: baseline;
  padding: 10px 12px;
  border: 1px solid var(--warning-border, #8a6d1f);
  border-left: 4px solid var(--warning, #d8a657);
  background: rgba(216, 166, 87, 0.08);
  color: var(--text);
  font-size: 13px;
  line-height: 1.6;
}
.focus-layout {
  display: grid;
  grid-template-columns: 230px 260px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}
.focus-files,
.expertise-list,
.focus-card,
.focus-empty {
  border: 1px solid var(--border);
  background: var(--panel);
  padding: 12px;
}
.focus-files h2,
.expertise-list h2 {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--muted);
}
.file-slot {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}
.file-button {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--border);
  background: var(--panel-alt, #2b2b2b);
  color: var(--text);
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.file-button.active {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}
.file-button.missing {
  border-style: dashed;
  color: var(--muted);
}
.reference-heading {
  margin-top: 12px;
}
.badge {
  display: inline-block;
  padding: 1px 5px;
  border: 1px solid var(--border);
  font-size: 11px;
  line-height: 1.5;
}
.badge.fixed {
  border-color: var(--accent);
  color: var(--accent);
}
.badge.reference {
  border-color: #8a6d1f;
  color: #d8a657;
}
.badge.legacy,
.badge.warning {
  border-color: #8a6d1f;
  color: #d8a657;
}
.badge.error {
  border-color: #b34a4a;
  color: #ff8f8f;
}
.badge.missing {
  border-color: #b34a4a;
  color: #ff8f8f;
}
.expertise-actions {
  display: flex;
  gap: 6px;
  margin: 8px 0;
}
.expertise-scroll {
  max-height: 420px;
  overflow: auto;
  border-top: 1px solid var(--border);
}
.expertise-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 6px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.expertise-item:hover {
  background: var(--panel-alt, #2b2b2b);
}
.expertise-item.active {
  background: rgba(126, 200, 80, 0.12);
  box-shadow: inset 2px 0 var(--accent);
}
.expertise-id {
  font-family: var(--mono);
  font-size: 12px;
}
.expertise-label {
  grid-column: 1 / 2;
  font-size: 12px;
  color: var(--muted);
}
.dependency-panel {
  margin-top: 10px;
  font-size: 12px;
}
.dependency-panel ul {
  padding-left: 18px;
}
.focus-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.detail-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.detail-title h2 {
  margin: 0 0 4px;
  font-size: 18px;
}
.badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.detail-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.focus-card h3 {
  margin: 0 0 8px;
  font-size: 15px;
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 10px;
}
.field.compact {
  margin-top: 0;
}
.field-label {
  font-size: 12px;
  color: var(--muted);
}
.list-row {
  display: flex;
  gap: 6px;
  margin-bottom: 4px;
  align-items: center;
}
.list-editor {
  margin-top: 4px;
}
.inline-warning {
  margin: 6px 0;
  padding: 6px 8px;
  border-left: 3px solid #d8a657;
  background: rgba(216, 166, 87, 0.08);
  font-size: 12px;
  line-height: 1.6;
}
.inline-error {
  margin: 6px 0;
  padding: 6px 8px;
  border-left: 3px solid #b34a4a;
  background: rgba(179, 74, 74, 0.12);
  font-size: 12px;
  line-height: 1.6;
}
.reference-warning {
  padding: 8px 10px;
  border-left: 3px solid #d8a657;
  background: rgba(216, 166, 87, 0.08);
  font-size: 12px;
  line-height: 1.6;
}
.condition-row,
.action-row,
.effect-type {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
}
.condition-head {
  display: flex;
  gap: 8px;
  align-items: center;
  cursor: pointer;
}
.condition-name {
  font-size: 13px;
}
.condition-key {
  color: var(--muted);
  font-size: 12px;
}
.hint {
  margin: 2px 0 6px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.6;
}
.list-row .mc-input {
  flex: 1;
}
.log-row {
  display: grid;
  grid-template-columns: 150px 1fr 100px auto;
  gap: 6px;
  margin-bottom: 4px;
}
.entity-input {
  min-width: 0;
}
.number-input {
  max-width: 120px;
}
.effect-type-head {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.effect-group {
  margin: 8px 0 0 10px;
  padding: 8px;
  border: 1px solid var(--border);
  background: var(--panel-alt, #2b2b2b);
}
.effect-group-head {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.effect-group-head .field {
  flex: 1;
}
.effect-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 4px;
}
.item-input {
  flex: 2;
}

.focus-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 40px 20px;
  gap: 8px;
}
.focus-empty-icon {
  font-size: 42px;
}
.focus-empty-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.issue-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
}
.issue-list li {
  padding: 5px 7px;
  border-left: 3px solid var(--border);
  background: var(--panel-alt, #2b2b2b);
}
.issue-list li.error {
  border-color: #b34a4a;
}
.issue-list li.warning {
  border-color: #d8a657;
}
.issue-list li.info {
  border-color: #6a9ac8;
}
.extras {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
}
.muted {
  color: var(--muted);
  font-size: 12px;
}
.file-input {
  display: none;
}
@media (max-width: 1100px) {
  .focus-layout {
    grid-template-columns: 200px minmax(0, 1fr);
  }
  .expertise-list {
    grid-column: 1 / -1;
  }
}
</style>
