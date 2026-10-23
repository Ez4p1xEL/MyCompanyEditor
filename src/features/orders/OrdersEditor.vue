<script setup lang="ts">
import { ordersText as tx } from './ordersConstants';
import { computed, nextTick, reactive, ref, shallowRef, watch } from 'vue';
import type { Document } from 'yaml';
import { useProjectStore } from '../../store/project';
import { useLocale } from '../../i18n';
import { pushToast } from '../../core/toast';
import { downloadTextFile } from '../../core/download';
import { hashFileText } from '../../core/projectFile';
import { documentsSemanticallyEqual, parseYamlText } from '../../core/yaml';
import ColorPreview from './ColorPreview.vue';
import {
  MATERIAL_NAMES,
  ITEM_MATERIAL_NAMES,
  ENTITY_TYPE_NAMES,
} from './data/minecraftEnums';
import {
  FEEDABLE_ANIMALS,
  QUEST_TYPES,
  REWARD_TYPES,
  questTypeMeta,
  rewardTypeMeta,
} from './ordersConstants';
import {
  addOrder,
  addQuest,
  addReward,
  buildOrdersModel,
  createEmptyOrdersDocument,
  defaultOrderPlain,
  deleteOrder,
  deleteQuest,
  deleteQuestField,
  deleteReward,
  duplicateOrder,
  mergeOrders,
  moveQuest,
  moveReward,
  parseOrdersFile,
  renameOrder,
  renameQuest,
  serializeOrders,
  setOrderDescription,
  setOrderField,
  setQuestField,
  setRewardLine,
  setRewards,
  splitReward,
  type OrdersModel,
  type OrderEntry,
  type QuestEntry,
  type RewardEntry,
} from './ordersDoc';
import {
  ensureOrdersValidatorRegistered,
  ensureQuestTypeBaseline,
  forgetNewOrder,
  markNewOrder,
  markNewQuest,
  renameNewOrder,
  renameNewQuest,
  resetQuestTypeBaseline,
  validateOrderIdInput,
  validateQuestIdInput,
  type OrdersIssue,
} from './ordersValidation';

ensureOrdersValidatorRegistered();

const FILE_PATH = 'orders.yml';
const MATERIAL_OPTIONS = [...MATERIAL_NAMES].sort();
const ITEM_OPTIONS = [...ITEM_MATERIAL_NAMES].sort();
const ENTITY_OPTIONS = [...ENTITY_TYPE_NAMES].sort();
const FEEDABLE_OPTIONS = [...FEEDABLE_ANIMALS].sort();

const store = useProjectStore();
const { locale } = useLocale();

function countLabel(count: number, kind: 'quest' | 'reward'): string {
  if (locale.value === 'zh-CN') return `${count} ${kind === 'quest' ? '任务' : '奖励'}`;
  return `${count} ${kind}${count === 1 ? '' : 's'}`;
}
const file = computed(() => store.files[FILE_PATH] ?? null);
const doc = shallowRef<Document | null>(null);
const model = ref<OrdersModel>(buildOrdersModel(null, ''));
const lastText = ref('');
const hasLoadedOnce = ref(false);
const selectedId = ref<string | null>(null);
const search = ref('');
const dirtyOrders = reactive(new Set<string>());
const renameDraft = ref('');
const renameError = ref('');
const showIssues = ref(false);
const rawMode = ref(false);
const rawDraft = ref('');
const rawError = ref('');
const importDialogOpen = ref(false);
const importError = ref('');
const pendingImport = ref<string | null>(null);
const importInput = ref<HTMLInputElement | null>(null);
const rootRef = ref<HTMLElement | null>(null);
const highlight = reactive<{ orderId?: string; questId?: string; rewardIndex?: number }>({});
let highlightTimer: number | undefined;

const issues = computed<OrdersIssue[]>(() => (file.value?.issues ?? []) as OrdersIssue[]);
const blockingIssues = computed(() =>
  issues.value.filter((issue) => issue.severity === 'error' || issue.blocking),
);
const warningIssues = computed(() => issues.value.filter((issue) => issue.severity === 'warning'));
const syntaxIssue = computed(() => issues.value.find((issue) => issue.code === 'YAML_PARSE'));

const selectedOrder = computed<OrderEntry | null>(
  () => model.value.orders.find((order) => order.id === selectedId.value) ?? null,
);

const filteredOrders = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) return model.value.orders;
  return model.value.orders.filter(
    (order) =>
      order.id.toLowerCase().includes(query) || order.label.toLowerCase().includes(query),
  );
});

const orderIssueMap = computed(() => {
  const map = new Map<string, OrdersIssue[]>();
  for (const issue of issues.value) {
    const orderId = issue.orderId ?? issue.path?.split('.')[0] ?? '';
    if (!orderId) continue;
    const list = map.get(orderId) ?? [];
    list.push(issue);
    map.set(orderId, list);
  }
  return map;
});

const fileDirty = computed(() => {
  const current = file.value;
  if (!current) return false;
  return store.exportedHashes[current.path] !== hashFileText(current.text);
});
const selectedDirty = computed(() => (selectedId.value ? dirtyOrders.has(selectedId.value) : false));
const structureBroken = computed(
  () => Boolean(syntaxIssue.value) || !['map', 'missing'].includes(model.value.topLevelKind),
);

const globalIssues = computed(() =>
  issues.value.filter((issue) => {
    const orderId = issue.orderId ?? issue.path?.split('.')[0] ?? '';
    return !orderId || orderId === '$' || !model.value.orders.some((order) => order.id === orderId);
  }),
);

const rawModeDisabled = computed(
  () => selectedOrder.value?.rewards.some((reward) => !reward.isString) ?? false,
);

watch(
  () => file.value?.text ?? '',
  (text) => {
    if (!text) {
      doc.value = null;
      model.value = buildOrdersModel(null, '');
      lastText.value = '';
      selectedId.value = null;
      dirtyOrders.clear();
      return;
    }
    if (text === lastText.value) return;
    loadFromText(text, hasLoadedOnce.value);
  },
  { immediate: true },
);

watch(
  selectedId,
  (id) => {
    renameDraft.value = id ?? '';
    renameError.value = '';
    rawMode.value = false;
    rawError.value = '';
  },
  { immediate: true },
);

function loadFromText(text: string, resetBaseline: boolean): void {
  const parsed = parseOrdersFile(text);
  doc.value = parsed.doc;
  model.value = parsed.model;
  lastText.value = text;
  selectedId.value = parsed.model.orders[0]?.id ?? null;
  dirtyOrders.clear();
  rawMode.value = false;
  if (parsed.doc) {
    if (resetBaseline) resetQuestTypeBaseline(parsed.model);
    else ensureQuestTypeBaseline(parsed.model);
  }
  hasLoadedOnce.value = true;
}

interface PersistOptions {
  rebuild?: boolean;
  selected?: string | null;
  dirtyOrder?: string;
}

function persist(options: PersistOptions = {}): void {
  const current = doc.value;
  if (!current) return;
  const text = serializeOrders(current);
  lastText.value = text;
  store.upsertFile(FILE_PATH, text, 'orders');
  if (options.dirtyOrder) dirtyOrders.add(options.dirtyOrder);
  if (options.rebuild !== false) {
    model.value = buildOrdersModel(current, text);
    ensureQuestTypeBaseline(model.value);
  }
  const ids = model.value.orders.map((order) => order.id);
  if (options.selected !== undefined) selectedId.value = options.selected;
  else if (!selectedId.value || !ids.includes(selectedId.value)) selectedId.value = ids[0] ?? null;
}

function nextOrderId(prefix: string): string {
  const existing = new Set(model.value.orders.map((order) => order.id));
  let index = 1;
  while (existing.has(`${prefix}_${index}`)) index += 1;
  return `${prefix}_${index}`;
}

function uniqueOrderId(base: string): string {
  const existing = new Set(model.value.orders.map((order) => order.id));
  if (!existing.has(base)) return base;
  let index = 2;
  while (existing.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function nextQuestId(order: OrderEntry): string {
  const existing = new Set(order.quests.map((quest) => quest.id));
  let index = 1;
  while (existing.has(`quest_${index}`)) index += 1;
  return `quest_${index}`;
}

function selectOrder(id: string): void {
  selectedId.value = id;
}

function createOrder(): void {
  if (structureBroken.value) {
    pushToast(tx('orders.yml 顶层不是订单映射，已阻止新建（避免覆盖原内容）'), 'error');
    return;
  }
  if (!doc.value) doc.value = createEmptyOrdersDocument();
  const id = nextOrderId('order');
  addOrder(doc.value, id, defaultOrderPlain(tx('新订单')));
  markNewOrder(id);
  persist({ rebuild: true, selected: id, dirtyOrder: id });
  pushToast(tx('已新建订单 {id}', { id }), 'success');
  void nextTick(() => focusField('order-id-input'));
}

function copySelectedOrder(): void {
  const order = selectedOrder.value;
  if (!order || !doc.value) return;
  const newId = uniqueOrderId(`${order.id}_copy`);
  if (!duplicateOrder(doc.value, order.id, newId)) {
    pushToast(tx('复制失败：源订单结构异常'), 'error');
    return;
  }
  markNewOrder(newId);
  persist({ rebuild: true, selected: newId, dirtyOrder: newId });
  pushToast(tx('已复制为 {id}', { id: newId }), 'success');
}

function removeSelectedOrder(): void {
  const order = selectedOrder.value;
  if (!order || !doc.value) return;
  if (!window.confirm(tx('确定删除订单 “{id}”？已有玩家的进度会变成孤儿记录。', { id: order.id }))) return;
  deleteOrder(doc.value, order.id);
  forgetNewOrder(order.id);
  dirtyOrders.delete(order.id);
  persist({ rebuild: true });
  pushToast(tx('已删除订单 {id}', { id: order.id }), 'info');
}

function applyOrderRename(): void {
  const order = selectedOrder.value;
  if (!order || !doc.value) return;
  const trimmed = renameDraft.value.trim();
  if (trimmed === order.id) {
    renameError.value = '';
    return;
  }
  const result = validateOrderIdInput(
    trimmed,
    model.value.orders.map((entry) => entry.id),
    order.id,
  );
  if (result.error) {
    renameError.value = result.error;
    return;
  }
  renameError.value = result.warning ?? '';
  if (!renameOrder(doc.value, order.id, trimmed)) {
    renameError.value = tx('重命名失败：ID 已存在或该键不是标量');
    return;
  }
  renameNewOrder(order.id, trimmed);
  if (dirtyOrders.has(order.id)) {
    dirtyOrders.delete(order.id);
    dirtyOrders.add(trimmed);
  }
  persist({ rebuild: true, selected: trimmed, dirtyOrder: trimmed });
  pushToast(tx('订单已重命名为 {id}', { id: trimmed }), 'success');
}

function focusField(name: string): void {
  const root = rootRef.value;
  if (!root) return;
  const element = root.querySelector<HTMLElement>(`[data-field="${name}"]`);
  element?.focus();
}

function onLabelInput(event: Event): void {
  const order = selectedOrder.value;
  if (!order || !doc.value) return;
  const value = (event.target as HTMLInputElement).value;
  order.label = value;
  order.labelKind = 'string';
  setOrderField(doc.value, order.id, 'label', value);
  persist({ rebuild: false, dirtyOrder: order.id });
}

function onDescriptionInput(index: number, event: Event): void {
  const order = selectedOrder.value;
  if (!order || !doc.value) return;
  const value = (event.target as HTMLInputElement).value;
  order.description[index] = value;
  setOrderDescription(doc.value, order.id, [...order.description]);
  persist({ rebuild: false, dirtyOrder: order.id });
}

function addDescriptionLine(): void {
  const order = selectedOrder.value;
  if (!order || !doc.value) return;
  order.description.push('');
  setOrderDescription(doc.value, order.id, [...order.description]);
  persist({ rebuild: false, dirtyOrder: order.id });
}

function removeDescriptionLine(index: number): void {
  const order = selectedOrder.value;
  if (!order || !doc.value) return;
  order.description.splice(index, 1);
  setOrderDescription(doc.value, order.id, [...order.description]);
  persist({ rebuild: false, dirtyOrder: order.id });
}

function createQuest(): void {
  const order = selectedOrder.value;
  if (!order || !doc.value) return;
  if (order.questKind !== 'map' && order.questKind !== 'missing') {
    pushToast(tx('当前 quest 段不是映射，请先修复或重新导入'), 'warning');
    return;
  }
  const id = nextQuestId(order);
  addQuest(doc.value, order.id, id, { type: 'break_block', item: 'stone', amount: 1 });
  markNewQuest(order.id, id);
  persist({ rebuild: true, dirtyOrder: order.id });
  pushToast(tx('已添加任务 {id}', { id }), 'success');
}

function removeQuest(quest: QuestEntry): void {
  const order = selectedOrder.value;
  if (!order || !doc.value) return;
  deleteQuest(doc.value, order.id, quest.id);
  persist({ rebuild: true, dirtyOrder: order.id });
}

function moveQuestItem(quest: QuestEntry, direction: -1 | 1): void {
  const order = selectedOrder.value;
  if (!order || !doc.value) return;
  const index = order.quests.findIndex((entry) => entry.id === quest.id);
  if (index < 0 || index + direction < 0 || index + direction >= order.quests.length) return;
  moveQuest(doc.value, order.id, index, index + direction);
  persist({ rebuild: true, dirtyOrder: order.id });
}

function onQuestIdChange(quest: QuestEntry, event: Event): void {
  const order = selectedOrder.value;
  if (!order || !doc.value) return;
  const input = event.target as HTMLInputElement;
  const value = input.value.trim();
  if (value === quest.id) return;
  const result = validateQuestIdInput(
    value,
    order.quests.map((entry) => entry.id),
    quest.id,
  );
  if (result.error) {
    pushToast(result.error, 'error');
    input.value = quest.id;
    return;
  }
  if (!renameQuest(doc.value, order.id, quest.id, value)) {
    pushToast(tx('重命名失败：quest ID 已存在或结构异常'), 'error');
    input.value = quest.id;
    return;
  }
  renameNewQuest(order.id, quest.id, value);
  persist({ rebuild: true, dirtyOrder: order.id });
  if (result.warning) pushToast(result.warning, 'warning');
}

function onQuestTypeChange(quest: QuestEntry, event: Event): void {
  const order = selectedOrder.value;
  if (!order || !doc.value) return;
  const type = (event.target as HTMLSelectElement).value;
  setQuestField(doc.value, order.id, quest.id, 'type', type);
  quest.type = type;
  quest.typeKind = 'string';
  const meta = questTypeMeta(type);
  if (meta?.target === 'item') {
    // 切换到 item 类 type：删除另一类目标键，避免同时存在 item + mob。
    if (quest.mobKind !== 'missing') {
      deleteQuestField(doc.value, order.id, quest.id, 'mob');
      quest.mob = '';
      quest.mobKind = 'missing';
    }
    if (!quest.item) {
      quest.item = 'stone';
      quest.itemKind = 'string';
      setQuestField(doc.value, order.id, quest.id, 'item', 'stone');
    }
  }
  if (meta?.target === 'mob') {
    // 切换到 mob 类 type：删除 item，避免同时存在 mob + item。
    if (quest.itemKind !== 'missing') {
      deleteQuestField(doc.value, order.id, quest.id, 'item');
      quest.item = '';
      quest.itemKind = 'missing';
    }
    if (!quest.mob) {
      const mob = type === 'feed' ? 'cow' : 'zombie';
      quest.mob = mob;
      quest.mobKind = 'string';
      setQuestField(doc.value, order.id, quest.id, 'mob', mob);
    }
  }
  if (quest.amountKind === 'missing') {
    quest.amount = '1';
    quest.amountKind = 'number';
    setQuestField(doc.value, order.id, quest.id, 'amount', 1);
  }
  persist({ rebuild: false, dirtyOrder: order.id });
}

function onQuestTargetInput(quest: QuestEntry, field: 'item' | 'mob', event: Event): void {
  const order = selectedOrder.value;
  if (!order || !doc.value) return;
  const raw = (event.target as HTMLInputElement).value;
  // feed 下拉统一使用小写选项；仅归一存储值，不改写已有导入值（除非用户主动修改）。
  const value = field === 'mob' && quest.type === 'feed' ? raw.toLowerCase() : raw;
  if (field === 'item') {
    quest.item = value;
    quest.itemKind = 'string';
  } else {
    quest.mob = value;
    quest.mobKind = 'string';
  }
  setQuestField(doc.value, order.id, quest.id, field, value);
  persist({ rebuild: false, dirtyOrder: order.id });
}

function onQuestAmountInput(quest: QuestEntry, event: Event): void {
  const order = selectedOrder.value;
  if (!order || !doc.value) return;
  const raw = (event.target as HTMLInputElement).value;
  if (raw.trim() === '') {
    deleteQuestField(doc.value, order.id, quest.id, 'amount');
    quest.amount = '';
    quest.amountKind = 'missing';
  } else {
    const numeric = /^[+-]?\d+$/.test(raw.trim());
    const value: string | number = numeric ? Number(raw.trim()) : raw;
    setQuestField(doc.value, order.id, quest.id, 'amount', value);
    quest.amount = raw;
    quest.amountKind = numeric ? 'number' : 'string';
  }
  persist({ rebuild: false, dirtyOrder: order.id });
}

function composeReward(type: string, args: string[]): string {
  switch (type) {
    case 'item':
      return `item;${args[0] ?? ''};${args[1] ?? ''}`;
    case 'company_income':
      return `company_income;${args[0] ?? ''}`;
    case 'money':
      return `money;${args[0] ?? ''}`;
    case 'experience':
      return `experience;${args[0] ?? ''}`;
    case 'console_command':
      return `console_command;${args[0] ?? ''}`;
    default:
      return `${type};${args.join(';')}`;
  }
}

function defaultRewardArgs(type: string): string[] {
  switch (type) {
    case 'item':
      return ['stone', '1'];
    case 'company_income':
      return ['500.0'];
    case 'money':
      return ['100.0'];
    case 'experience':
      return ['5'];
    case 'console_command':
      return ['say %player% completed the order'];
    default:
      return [];
  }
}

function onRewardTypeChange(reward: RewardEntry, event: Event): void {
  const order = selectedOrder.value;
  if (!order || !doc.value) return;
  const type = (event.target as HTMLSelectElement).value;
  const args = defaultRewardArgs(type);
  const raw = composeReward(type, args);
  if (!setRewardLine(doc.value, order.id, reward.index, raw)) {
    pushToast(tx('修改奖励类型失败：列表结构异常'), 'error');
    return;
  }
  persist({ rebuild: true, dirtyOrder: order.id });
}

function onRewardArgInput(reward: RewardEntry, argIndex: number, event: Event): void {
  const order = selectedOrder.value;
  if (!order || !doc.value || !rewardTypeMeta(reward.type)) return;
  const value = (event.target as HTMLInputElement).value;
  const args = [...reward.args];
  args[argIndex] = value;
  const raw = composeReward(reward.type, args);
  if (!setRewardLine(doc.value, order.id, reward.index, raw)) return;
  reward.args = args;
  reward.raw = raw;
  reward.segments = splitReward(raw);
  persist({ rebuild: false, dirtyOrder: order.id });
}

function onRawRewardChange(reward: RewardEntry, event: Event): void {
  const order = selectedOrder.value;
  if (!order || !doc.value) return;
  const raw = (event.target as HTMLInputElement).value;
  if (!setRewardLine(doc.value, order.id, reward.index, raw)) return;
  persist({ rebuild: true, dirtyOrder: order.id });
}

function addRewardLine(): void {
  const order = selectedOrder.value;
  if (!order || !doc.value) return;
  const existing = order.rewardKind;
  if (existing && existing !== 'seq' && existing !== 'missing') {
    pushToast(tx('当前 reward 段不是列表，请先修复或使用原文模式'), 'warning');
    return;
  }
  if (!addReward(doc.value, order.id, 'item;stone;1')) {
    pushToast(tx('添加奖励失败'), 'error');
    return;
  }
  persist({ rebuild: true, dirtyOrder: order.id });
}

function removeReward(reward: RewardEntry): void {
  const order = selectedOrder.value;
  if (!order || !doc.value) return;
  deleteReward(doc.value, order.id, reward.index);
  persist({ rebuild: true, dirtyOrder: order.id });
}

function moveRewardItem(reward: RewardEntry, direction: -1 | 1): void {
  const order = selectedOrder.value;
  if (!order || !doc.value) return;
  const index = reward.index;
  if (index + direction < 0 || index + direction >= order.rewards.length) return;
  moveReward(doc.value, order.id, index, index + direction);
  persist({ rebuild: true, dirtyOrder: order.id });
}

function toggleRawMode(): void {
  const order = selectedOrder.value;
  if (!order) return;
  if (!rawMode.value) {
    if (rawDisabled(order)) return;
    rawDraft.value = order.rewards.map((reward) => reward.raw).join('\n');
    rawError.value = '';
    rawMode.value = true;
    return;
  }
  applyRawRewards();
}

function rawDisabled(order: OrderEntry): boolean {
  return order.rewards.some((reward) => !reward.isString);
}

function applyRawRewards(): void {
  const order = selectedOrder.value;
  if (!order || !doc.value) return;
  if (rawDisabled(order)) {
    rawError.value = tx('存在非字符串奖励行，原文模式不可用（避免丢失数据）');
    return;
  }
  const lines = rawDraft.value.split('\n').filter((line) => line.trim() !== '');
  if (!setRewards(doc.value, order.id, lines)) {
    rawError.value = tx('当前 reward 段不是列表，无法应用原文');
    return;
  }
  rawMode.value = false;
  persist({ rebuild: true, dirtyOrder: order.id });
}

function cancelRawMode(): void {
  rawMode.value = false;
  rawError.value = '';
}

function orderStats(order: OrderEntry): { errors: number; warnings: number } {
  const list = orderIssueMap.value.get(order.id) ?? [];
  return {
    errors: list.filter((issue) => issue.severity === 'error' || issue.blocking).length,
    warnings: list.filter((issue) => issue.severity === 'warning').length,
  };
}

function orderLevelIssues(): OrdersIssue[] {
  const order = selectedOrder.value;
  if (!order) return [];
  return (orderIssueMap.value.get(order.id) ?? []).filter(
    (issue) => !issue.questId && issue.rewardIndex === undefined,
  );
}

function questIssues(quest: QuestEntry): OrdersIssue[] {
  const order = selectedOrder.value;
  if (!order) return [];
  return (orderIssueMap.value.get(order.id) ?? []).filter((issue) => issue.questId === quest.id);
}

function rewardIssues(reward: RewardEntry): OrdersIssue[] {
  const order = selectedOrder.value;
  if (!order) return [];
  return (orderIssueMap.value.get(order.id) ?? []).filter(
    (issue) => issue.rewardIndex === reward.index,
  );
}

function isFirstQuest(quest: QuestEntry): boolean {
  return selectedOrder.value?.quests[0]?.id === quest.id;
}

function isLastQuest(quest: QuestEntry): boolean {
  const quests = selectedOrder.value?.quests ?? [];
  return quests[quests.length - 1]?.id === quest.id;
}

function isFirstReward(reward: RewardEntry): boolean {
  return reward.index === 0;
}

function isLastReward(reward: RewardEntry): boolean {
  const rewards = selectedOrder.value?.rewards ?? [];
  return reward.index === rewards.length - 1;
}

function severityLabel(severity: OrdersIssue['severity']): string {
  return severity === 'error' ? tx('错误') : severity === 'warning' ? tx('警告') : tx('提示');
}

function locateIssue(issue: OrdersIssue): void {
  const orderId = issue.orderId ?? issue.path?.split('.')[0] ?? '';
  const order = model.value.orders.find((entry) => entry.id === orderId);
  if (!order) return;
  selectedId.value = order.id;
  highlight.orderId = order.id;
  highlight.questId = issue.questId;
  highlight.rewardIndex = issue.rewardIndex;
  if (highlightTimer !== undefined) window.clearTimeout(highlightTimer);
  highlightTimer = window.setTimeout(() => {
    highlight.orderId = undefined;
    highlight.questId = undefined;
    highlight.rewardIndex = undefined;
  }, 2600);
  void nextTick(() => {
    const root = rootRef.value;
    if (!root) return;
    let target: HTMLElement | null = null;
    if (issue.questId) {
      target =
        [...root.querySelectorAll<HTMLElement>('[data-quest-id]')].find(
          (element) => element.dataset.questId === issue.questId,
        ) ?? null;
    } else if (issue.rewardIndex !== undefined) {
      target =
        [...root.querySelectorAll<HTMLElement>('[data-reward-index]')].find(
          (element) => Number(element.dataset.rewardIndex) === issue.rewardIndex,
        ) ?? null;
    }
    if (typeof target?.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
}

function errorLine(issue: OrdersIssue): string {
  return issue.line ? tx('第 {line} 行', { line: issue.line }) : '';
}

function triggerImport(): void {
  importInput.value?.click();
}

async function onImportFilePicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const picked = input.files?.[0];
  input.value = '';
  if (!picked) return;
  const text = await picked.text();
  const parsed = parseYamlText(text);
  if (!parsed.ok || !parsed.doc) {
    importError.value = parsed.error
      ? tx('第 {line} 行第 {column} 列：{message}', { line: parsed.error.line, column: parsed.error.column, message: parsed.error.message })
      : tx('YAML 解析失败');
    pendingImport.value = null;
    importDialogOpen.value = true;
    return;
  }
  if (file.value) {
    pendingImport.value = text;
    importError.value = '';
    importDialogOpen.value = true;
  } else {
    applyImportReplace(text);
  }
}

function applyImportReplace(text: string): void {
  store.upsertFile(FILE_PATH, text, 'orders');
  loadFromText(text, true);
  importDialogOpen.value = false;
  pendingImport.value = null;
  pushToast(tx('已替换 orders.yml'), 'success');
}

function replaceImport(): void {
  if (!pendingImport.value) return;
  applyImportReplace(pendingImport.value);
}

function mergeImport(): void {
  if (!pendingImport.value) return;
  const imported = parseOrdersFile(pendingImport.value);
  if (!imported.doc) {
    importError.value = imported.parsed.error
      ? tx('第 {line} 行第 {column} 列：{message}', { line: imported.parsed.error.line, column: imported.parsed.error.column, message: imported.parsed.error.message })
      : tx('导入文件无法解析');
    return;
  }
  if (!doc.value) {
    applyImportReplace(pendingImport.value);
    return;
  }
  const merged = mergeOrders(doc.value, imported.doc);
  importDialogOpen.value = false;
  pendingImport.value = null;
  persist({ rebuild: true, dirtyOrder: selectedId.value ?? undefined });
  pushToast(tx('已合并 {count} 个订单（同名以导入文件为准）', { count: merged.merged }), 'success');
}

function closeImportDialog(): void {
  importDialogOpen.value = false;
  importError.value = '';
  pendingImport.value = null;
}

function createEmptyProject(): void {
  const empty = createEmptyOrdersDocument();
  doc.value = empty;
  const text = serializeOrders(empty);
  lastText.value = text;
  store.upsertFile(FILE_PATH, text, 'orders');
  model.value = buildOrdersModel(empty, text);
  selectedId.value = null;
  hasLoadedOnce.value = true;
  pushToast(tx('已创建空白 orders.yml，请新建订单'), 'info');
}

function exportOrders(): void {
  const currentFile = file.value;
  if (!currentFile) return;
  if (!doc.value) {
    pushToast(tx('YAML 语法错误，已阻止导出'), 'error');
    return;
  }
  const blocking = blockingIssues.value;
  if (blocking.length > 0) {
    pushToast(tx('存在 {count} 条错误/阻断项，已阻止导出', { count: blocking.length }), 'error');
    showIssues.value = true;
    locateIssue(blocking[0]);
    return;
  }
  const text = serializeOrders(doc.value);
  const original = parseYamlText(currentFile.text);
  const reparsed = parseYamlText(text);
  if (
    !original.ok ||
    !original.doc ||
    !reparsed.ok ||
    !reparsed.doc ||
    !documentsSemanticallyEqual(original.doc, reparsed.doc)
  ) {
    pushToast(tx('导出内容回读校验失败，已阻止导出'), 'error');
    return;
  }
  downloadTextFile('orders.yml', text);
  store.markExported(FILE_PATH);
  dirtyOrders.clear();
  pushToast(tx('已导出 orders.yml（修改后需重启服务器生效）'), 'success');
}

function issueSummary(): string {
  const parts = [tx('错误 {count}', { count: blockingIssues.value.length })];
  if (warningIssues.value.length) parts.push(tx('警告 {count}', { count: warningIssues.value.length }));
  return parts.join(' · ');
}

function customRewardType(reward: RewardEntry): boolean {
  return Boolean(reward.type) && !rewardTypeMeta(reward.type);
}
</script>

<template>
  <div ref="rootRef" class="orders-editor" data-testid="orders-editor">
    <header class="orders-header">
      <div class="orders-title">
        <h1>{{ tx("订单编辑器") }}</h1>
        <p class="orders-subtitle">
          <code>orders.yml</code> · {{ model.orders.length }} {{ tx("个订单 · 修改后需重启服务器生效") }} </p>
      </div>
      <div class="orders-header-actions">
        <span v-if="fileDirty" class="dirty-pill">{{ tx("● 未导出修改") }}</span>
        <span v-if="selectedDirty" class="dirty-pill order-dirty">{{ tx("● 当前订单未保存导出") }}</span>
        <button class="mc-button" data-action="orders-import" @click="triggerImport"> {{ tx("导入 orders.yml") }} </button>
        <button
          class="mc-button primary"
          data-action="orders-export"
          :disabled="!doc || blockingIssues.length > 0"
          :title="
            blockingIssues.length > 0
              ? tx('存在 {count} 条错误，导出被阻止', { count: blockingIssues.length })
              : tx('导出 orders.yml')
          "
          @click="exportOrders"
        > {{ tx("导出 orders.yml") }} </button>
      </div>
    </header>

    <div v-if="!file" class="orders-empty">
      <div class="orders-empty-icon" aria-hidden="true">📋</div>
      <h2>{{ tx("还没有 orders.yml") }}</h2>
      <p> {{ tx("导入服务器") }} <code>plugins/MyCompany/orders.yml</code>{{ tx("，或从空白文件开始。 所有解析与校验都在浏览器本地完成。") }} </p>
      <div class="orders-empty-actions">
        <button class="mc-button primary" data-action="orders-empty-import" @click="triggerImport"> {{ tx("导入 orders.yml") }} </button>
        <button class="mc-button" data-action="orders-empty-create" @click="createEmptyProject"> {{ tx("新建空白 orders.yml") }} </button>
      </div>
      <p class="muted"> {{ tx("也可在「项目总览」点击“载入示例”，再回到订单页查看插件默认订单。") }} </p>
    </div>

    <template v-else>
      <div v-if="syntaxIssue" class="orders-syntax" role="alert">
        <strong>{{ tx("YAML 语法错误，编辑器已锁定（禁止导出）") }}</strong>
        <p>
          {{ errorLine(syntaxIssue) }}{{ tx("第") }} {{ syntaxIssue.line ?? 1 }} {{ tx("行第") }} {{ syntaxIssue.column ?? 1 }} {{ tx("列：") }}{{ syntaxIssue.message }}
        </p>
        <p class="muted">{{ tx("请重新导入修复后的文件，或在文本编辑器中修正语法。") }}</p>
      </div>

      <div v-else class="orders-layout">
        <aside class="orders-list-panel">
          <div class="orders-search">
            <input
              v-model="search"
              class="mc-input"
              type="search"
              :placeholder="tx('搜索订单 ID / label')"
              :aria-label="tx('搜索订单')"
              data-field="orders-search"
            />
          </div>
          <div class="orders-list-actions">
            <button
              class="mc-button small primary"
              data-action="orders-new"
              :disabled="structureBroken"
              :title="structureBroken ? tx('顶层结构非法，请先导入修复后的 orders.yml') : tx('新建订单')"
              @click="createOrder"
            > {{ tx("新建订单") }} </button>
            <span class="muted">{{ filteredOrders.length }} / {{ model.orders.length }}</span>
          </div>
          <div class="orders-list" role="listbox" :aria-label="tx('订单列表')">
            <button
              v-for="order in filteredOrders"
              :key="order.id"
              class="order-row"
              :class="{
                active: order.id === selectedId,
                invalid: !order.validMap || orderStats(order).errors > 0,
                highlighted: highlight.orderId === order.id,
              }"
              role="option"
              :aria-selected="order.id === selectedId"
              :data-order-id="order.id"
              :data-testid="`order-row-${order.id}`"
              :aria-label="tx('{id} {label}', { id: order.id, label: order.label || tx('缺少 label') })"
              @click="selectOrder(order.id)"
            >
              <span class="order-row-main">
                <span class="order-row-id">{{ order.id }}</span>
                <span class="order-row-label">{{ order.label || tx('（缺少 label）') }}</span>
              </span>
              <span class="order-row-meta">
                <span class="order-row-counts">{{ countLabel(order.quests.length, 'quest') }} · {{ countLabel(order.rewards.length, 'reward') }}</span>
                <span v-if="orderStats(order).errors" class="badge error">
                  {{ orderStats(order).errors }}
                </span>
                <span v-if="orderStats(order).warnings" class="badge warning">
                  {{ orderStats(order).warnings }}
                </span>
                <span v-if="dirtyOrders.has(order.id)" class="badge dirty" :title="tx('未导出')">●</span>
              </span>
            </button>
            <p v-if="filteredOrders.length === 0" class="orders-list-empty">
              {{ model.orders.length === 0 ? tx('还没有订单，点击“新建订单”。') : tx('没有匹配的订单。') }}
            </p>
          </div>
          <div class="orders-list-footer">
            <button class="issue-toggle" data-action="orders-toggle-issues" @click="showIssues = !showIssues"> {{ tx("校验问题：") }}{{ issueSummary() }}
              <span class="muted">{{ tx("（点击定位）") }}</span>
            </button>
          </div>
        </aside>

        <section class="order-form-panel">
          <div v-if="showIssues" class="orders-issues-panel">
            <div class="issues-panel-head">
              <strong>{{ tx("校验问题") }}</strong>
              <button class="link-button" @click="showIssues = false">{{ tx("收起") }}</button>
            </div>
            <p v-if="issues.length === 0" class="muted">{{ tx("没有发现问题。") }}</p>
            <button
              v-for="(issue, index) in issues"
              :key="`${issue.code}-${index}`"
              class="issue-row"
              :class="`issue-${issue.severity}`"
              @click="locateIssue(issue)"
            >
              <span class="issue-sev">{{ severityLabel(issue.severity) }}</span>
              <span class="issue-code">{{ issue.code }}</span>
              <span class="issue-msg">{{ issue.message }}</span>
              <span v-if="issue.fixHint" class="issue-fix">{{ issue.fixHint }}</span>
              <span class="issue-loc">{{ errorLine(issue) }}</span>
            </button>
          </div>

          <div v-if="!selectedOrder" class="order-select-hint">
            <p>{{ tx("从左侧选择订单，或点击“新建订单”。") }}</p>
          </div>

          <div v-else class="order-form">
            <div class="order-form-head">
              <label class="field id-field">
                <span class="field-label">{{ tx("订单 ID") }}</span>
                <input
                  v-model="renameDraft"
                  class="mc-input"
                  data-field="order-id-input"
                  spellcheck="false"
                  :aria-label="tx('订单 ID')"
                  @change="applyOrderRename"
                  @keydown.enter.prevent="applyOrderRename"
                />
              </label>
              <span v-if="renameError" class="field-error">{{ renameError }}</span>
              <div class="order-head-actions">
                <button class="mc-button small" data-action="orders-copy" @click="copySelectedOrder"> {{ tx("复制") }} </button>
                <button class="mc-button small danger" data-action="orders-delete" @click="removeSelectedOrder"> {{ tx("删除") }} </button>
              </div>
            </div>

            <section class="form-section">
              <h2>{{ tx("基本信息") }}</h2>
              <label class="field">
                <span class="field-label">{{ tx("label（支持 & 颜色码）") }}</span>
                <input
                  class="mc-input"
                  :value="selectedOrder.label"
                  spellcheck="false"
                  :aria-label="tx('订单 label')"
                  data-field="order-label"
                  @input="onLabelInput"
                />
              </label>
              <div class="color-preview-row">
                <span class="field-label">{{ tx("预览") }}</span>
                <ColorPreview :text="selectedOrder.label" />
              </div>

              <div class="field">
                <span class="field-label">{{ tx("description（多行，每行一条）") }}</span>
                <div class="description-list">
                  <div v-for="(line, index) in selectedOrder.description" :key="index" class="description-row">
                    <input
                      class="mc-input"
                      :value="line"
                      spellcheck="false"
                      :aria-label="tx('description 第 {line} 行', { line: index + 1 })"
                      @input="onDescriptionInput(index, $event)"
                    />
                    <button
                      class="icon-button"
                      type="button"
                      :aria-label="tx('删除该描述行')"
                      @click="removeDescriptionLine(index)"
                    >
                      ×
                    </button>
                  </div>
                  <button class="mc-button small" type="button" data-action="orders-add-description" @click="addDescriptionLine"> {{ tx("添加描述行") }} </button>
                </div>
              </div>

              <div v-if="orderLevelIssues().length" class="inline-issues">
                <button
                  v-for="(issue, index) in orderLevelIssues()"
                  :key="`${issue.code}-${index}`"
                  class="inline-issue"
                  :class="`issue-${issue.severity}`"
                  @click="locateIssue(issue)"
                >
                  <strong>{{ issue.code }}</strong>
                  {{ issue.message }}
                  <span v-if="issue.fixHint" class="issue-fix">{{ issue.fixHint }}</span>
                </button>
              </div>
            </section>

            <section class="form-section">
              <div class="section-head">
                <h2>{{ tx("任务（quest）") }}</h2>
                <button class="mc-button small primary" data-action="orders-add-quest" @click="createQuest"> {{ tx("添加任务") }} </button>
              </div>
              <p v-if="selectedOrder.quests.length === 0" class="muted"> {{ tx("至少需要 1 个任务，否则订单无法打开。") }} </p>
              <article
                v-for="quest in selectedOrder.quests"
                :key="quest.id"
                class="quest-card"
                :class="{ highlighted: highlight.questId === quest.id, invalid: questIssues(quest).length > 0 }"
                :data-quest-id="quest.id"
                :data-testid="`quest-${quest.id}`"
              >
                <header class="quest-head">
                  <label class="field quest-id-field">
                    <span class="field-label">{{ tx("任务 ID") }}</span>
                    <input
                      class="mc-input"
                      :value="quest.id"
                      spellcheck="false"
                      :aria-label="tx('任务 ID {id}', { id: quest.id })"
                      @change="onQuestIdChange(quest, $event)"
                      @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
                    />
                  </label>
                  <label class="field quest-type-field">
                    <span class="field-label">type</span>
                    <select
                      class="mc-select"
                      :value="quest.type"
                      :aria-label="tx('任务 {id} 的类型', { id: quest.id })"
                      data-field="quest-type"
                      @change="onQuestTypeChange(quest, $event)"
                    >
                      <option v-if="quest.type && !questTypeMeta(quest.type)" :value="quest.type">
                        {{ quest.type }}{{ tx("（非法）") }} </option>
                      <option v-for="meta in QUEST_TYPES" :key="meta.value" :value="meta.value">
                        {{ meta.label }} ({{ meta.value }})
                      </option>
                    </select>
                  </label>
                  <div class="quest-actions">
                    <button
                      class="icon-button"
                      type="button"
                      :disabled="isFirstQuest(quest)"
                      :aria-label="tx('上移任务')"
                      @click="moveQuestItem(quest, -1)"
                    >
                      ↑
                    </button>
                    <button
                      class="icon-button"
                      type="button"
                      :disabled="isLastQuest(quest)"
                      :aria-label="tx('下移任务')"
                      @click="moveQuestItem(quest, 1)"
                    >
                      ↓
                    </button>
                    <button
                      class="icon-button danger"
                      type="button"
                      :aria-label="tx('删除任务')"
                      @click="removeQuest(quest)"
                    >
                      ×
                    </button>
                  </div>
                </header>

                <div class="quest-body">
                  <label v-if="questTypeMeta(quest.type)?.target !== 'mob'" class="field">
                    <span class="field-label">{{ tx("item（Bukkit Material 枚举名）") }}</span>
                    <input
                      class="mc-input"
                      list="orders-material-options"
                      :value="quest.item"
                      spellcheck="false"
                      :aria-label="tx('任务 {id} 的 item', { id: quest.id })"
                      data-field="quest-item"
                      @input="onQuestTargetInput(quest, 'item', $event)"
                    />
                  </label>
                  <label v-else class="field">
                    <span class="field-label">{{ tx("mob（Bukkit EntityType 枚举名）") }}</span>
                    <select
                      v-if="quest.type === 'feed'"
                      class="mc-select"
                      :value="quest.mob.toLowerCase()"
                      :aria-label="tx('任务 {id} 的可喂食动物', { id: quest.id })"
                      data-field="quest-mob"
                      @change="onQuestTargetInput(quest, 'mob', $event)"
                    >
                      <option value="">{{ tx("请选择") }}</option>
                      <option v-for="mob in FEEDABLE_OPTIONS" :key="mob" :value="mob.toLowerCase()">
                        {{ mob }}
                      </option>
                    </select>
                    <input
                      v-else
                      class="mc-input"
                      list="orders-entity-options"
                      :value="quest.mob"
                      spellcheck="false"
                      :aria-label="tx('任务 {id} 的 mob', { id: quest.id })"
                      data-field="quest-mob"
                      @input="onQuestTargetInput(quest, 'mob', $event)"
                    />
                  </label>
                  <label class="field amount-field">
                    <span class="field-label">{{ tx("amount（正整数）") }}</span>
                    <input
                      class="mc-input"
                      inputmode="numeric"
                      :value="quest.amount"
                      :aria-label="tx('任务 {id} 的 amount', { id: quest.id })"
                      data-field="quest-amount"
                      @input="onQuestAmountInput(quest, $event)"
                    />
                  </label>
                </div>

                <p v-if="questTypeMeta(quest.type)" class="quest-hint">
                  {{ questTypeMeta(quest.type)?.hint }}
                </p>

                <div v-if="questIssues(quest).length" class="inline-issues">
                  <button
                    v-for="(issue, index) in questIssues(quest)"
                    :key="`${issue.code}-${index}`"
                    class="inline-issue"
                    :class="`issue-${issue.severity}`"
                    @click="locateIssue(issue)"
                  >
                    <strong>{{ issue.code }}</strong>
                    {{ issue.message }}
                    <span v-if="issue.fixHint" class="issue-fix">{{ issue.fixHint }}</span>
                  </button>
                </div>

                <details v-if="quest.extras.length" class="unknown-box">
                  <summary>{{ tx("未识别字段（") }}{{ quest.extras.length }}{{ tx("）· 原样保留") }}</summary>
                  <ul>
                    <li v-for="extra in quest.extras" :key="extra.key">
                      <code>{{ extra.key }}</code>
                      <pre>{{ extra.preview }}</pre>
                    </li>
                  </ul>
                </details>
              </article>
            </section>

            <section class="form-section">
              <div class="section-head">
                <h2>{{ tx("奖励（reward）") }}</h2>
                <div class="section-actions">
                  <button
                    class="mc-button small"
                    type="button"
                    data-action="orders-toggle-raw"
                    :disabled="rawModeDisabled && !rawMode"
                    :title="rawModeDisabled ? tx('存在非字符串奖励行，原文模式不可用') : tx('按行编辑 reward 原文')"
                    @click="toggleRawMode"
                  >
                    {{ rawMode ? tx('应用原文') : tx('原文模式') }}
                  </button>
                  <button
                    v-if="!rawMode"
                    class="mc-button small primary"
                    type="button"
                    data-action="orders-add-reward"
                    @click="addRewardLine"
                  > {{ tx("添加奖励") }} </button>
                  <button v-if="rawMode" class="mc-button small" type="button" @click="cancelRawMode"> {{ tx("取消") }} </button>
                </div>
              </div>

              <div v-if="rawMode" class="raw-mode">
                <p class="muted">{{ tx("每行一条奖励；空行会被忽略。修改后点“应用原文”。") }}</p>
                <textarea
                  v-model="rawDraft"
                  class="mc-input raw-textarea"
                  rows="8"
                  :aria-label="tx('reward 原文列表')"
                  data-field="orders-raw-rewards"
                ></textarea>
                <p v-if="rawError" class="field-error">{{ rawError }}</p>
              </div>

              <template v-else>
                <p v-if="selectedOrder.rewards.length === 0" class="muted"> {{ tx("没有奖励；完成后玩家不会获得任何奖励。") }} </p>
                <article
                  v-for="reward in selectedOrder.rewards"
                  :key="reward.index"
                  class="reward-row"
                  :class="{
                    highlighted:
                      highlight.rewardIndex === reward.index && highlight.orderId === selectedId,
                    invalid: rewardIssues(reward).length > 0,
                  }"
                  :data-reward-index="reward.index"
                >
                  <span class="reward-index">#{{ reward.index + 1 }}</span>
                  <label class="field reward-type-field">
                    <span class="field-label">{{ tx("类型") }}</span>
                    <select
                      class="mc-select"
                      :value="reward.type"
                      :aria-label="tx('奖励 {index} 的类型', { index: reward.index + 1 })"
                      data-field="reward-type"
                      @change="onRewardTypeChange(reward, $event)"
                    >
                      <option v-if="customRewardType(reward)" :value="reward.type">
                        {{ reward.type }}{{ tx("（未知，原样保留）") }} </option>
                      <option v-for="meta in REWARD_TYPES" :key="meta.value" :value="meta.value">
                        {{ meta.label }} ({{ meta.value }})
                      </option>
                    </select>
                  </label>

                  <template v-if="reward.type === 'item'">
                    <label class="field reward-material-field">
                      <span class="field-label">{{ tx("材料") }}</span>
                      <input
                        class="mc-input"
                        list="orders-item-options"
                        :value="reward.args[0] ?? ''"
                        spellcheck="false"
                        :aria-label="tx('奖励 {index} 的材料', { index: reward.index + 1 })"
                        data-field="reward-arg-0"
                        @input="onRewardArgInput(reward, 0, $event)"
                      />
                    </label>
                    <label class="field reward-value-field">
                      <span class="field-label">{{ tx("数量") }}</span>
                      <input
                        class="mc-input"
                        inputmode="numeric"
                        :value="reward.args[1] ?? ''"
                        :aria-label="tx('奖励 {index} 的数量', { index: reward.index + 1 })"
                        data-field="reward-arg-1"
                        @input="onRewardArgInput(reward, 1, $event)"
                      />
                    </label>
                  </template>

                  <label
                    v-else-if="
                      reward.type === 'company_income' ||
                      reward.type === 'money' ||
                      reward.type === 'experience'
                    "
                    class="field reward-value-field"
                  >
                    <span class="field-label">{{ reward.type === 'experience' ? tx('经验值') : tx('金额') }}</span>
                    <input
                      class="mc-input"
                      inputmode="decimal"
                      :value="reward.args[0] ?? ''"
                      :aria-label="tx('奖励 {index} 的数值', { index: reward.index + 1 })"
                      data-field="reward-arg-0"
                      @input="onRewardArgInput(reward, 0, $event)"
                    />
                  </label>

                  <label v-else-if="reward.type === 'console_command'" class="field reward-command-field">
                    <span class="field-label">{{ tx("命令（不能含 ;，%player% 会被替换）") }}</span>
                    <input
                      class="mc-input"
                      :value="reward.args[0] ?? ''"
                      spellcheck="false"
                      :aria-label="tx('奖励 {index} 的命令', { index: reward.index + 1 })"
                      data-field="reward-arg-0"
                      @input="onRewardArgInput(reward, 0, $event)"
                    />
                  </label>

                  <label v-else class="field reward-command-field">
                    <span class="field-label">{{ tx("未知类型原文（保留，不会生效）") }}</span>
                    <input
                      class="mc-input"
                      :value="reward.raw"
                      spellcheck="false"
                      :aria-label="tx('奖励 {index} 的未知类型原文', { index: reward.index + 1 })"
                      data-field="reward-raw"
                      @change="onRawRewardChange(reward, $event)"
                    />
                  </label>

                  <div class="reward-actions">
                    <button
                      class="icon-button"
                      type="button"
                      :disabled="isFirstReward(reward)"
                      :aria-label="tx('上移奖励')"
                      @click="moveRewardItem(reward, -1)"
                    >
                      ↑
                    </button>
                    <button
                      class="icon-button"
                      type="button"
                      :disabled="isLastReward(reward)"
                      :aria-label="tx('下移奖励')"
                      @click="moveRewardItem(reward, 1)"
                    >
                      ↓
                    </button>
                    <button
                      class="icon-button danger"
                      type="button"
                      :aria-label="tx('删除奖励')"
                      @click="removeReward(reward)"
                    >
                      ×
                    </button>
                  </div>

                  <p
                    v-if="rewardTypeMeta(reward.type)"
                    class="reward-hint muted"
                  >
                    {{ rewardTypeMeta(reward.type)?.hint }}
                  </p>
                  <div v-if="rewardIssues(reward).length" class="inline-issues">
                    <button
                      v-for="(issue, index) in rewardIssues(reward)"
                      :key="`${issue.code}-${index}`"
                      class="inline-issue"
                      :class="`issue-${issue.severity}`"
                      @click="locateIssue(issue)"
                    >
                      <strong>{{ issue.code }}</strong>
                      {{ issue.message }}
                      <span v-if="issue.fixHint" class="issue-fix">{{ issue.fixHint }}</span>
                    </button>
                  </div>
                </article>
              </template>
            </section>

            <details v-if="selectedOrder.extras.length" class="unknown-box order-extras">
              <summary>{{ tx("订单未识别字段（") }}{{ selectedOrder.extras.length }}{{ tx("）· 原样保留") }}</summary>
              <ul>
                <li v-for="extra in selectedOrder.extras" :key="extra.key">
                  <code>{{ extra.key }}</code>
                  <pre>{{ extra.preview }}</pre>
                </li>
              </ul>
            </details>

            <div v-if="globalIssues.length" class="global-issues">
              <h3>{{ tx("文件级问题") }}</h3>
              <button
                v-for="(issue, index) in globalIssues"
                :key="`${issue.code}-${index}`"
                class="inline-issue"
                :class="`issue-${issue.severity}`"
                @click="showIssues = true"
              >
                <strong>{{ issue.code }}</strong>
                {{ issue.message }}
                <span v-if="issue.fixHint" class="issue-fix">{{ issue.fixHint }}</span>
                <span v-if="issue.line">{{ tx("（第") }} {{ issue.line }} {{ tx("行）") }}</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </template>

    <datalist id="orders-material-options">
      <option v-for="name in MATERIAL_OPTIONS" :key="name" :value="name"></option>
    </datalist>
    <datalist id="orders-item-options">
      <option v-for="name in ITEM_OPTIONS" :key="name" :value="name"></option>
    </datalist>
    <datalist id="orders-entity-options">
      <option v-for="name in ENTITY_OPTIONS" :key="name" :value="name"></option>
    </datalist>

    <input
      ref="importInput"
      class="visually-hidden"
      type="file"
      accept=".yml,.yaml,text/yaml,application/x-yaml"
      @change="onImportFilePicked"
    />

    <div v-if="importDialogOpen" class="orders-modal-overlay" @click.self="closeImportDialog">
      <section class="orders-modal" role="dialog" aria-modal="true" :aria-label="tx('导入 orders.yml')">
        <h2>{{ tx("导入 orders.yml") }}</h2>
        <div v-if="importError" class="import-error">
          <strong>{{ tx("文件无法解析") }}</strong>
          <p>{{ importError }}</p>
          <button class="mc-button" @click="closeImportDialog">{{ tx("关闭") }}</button>
        </div>
        <template v-else>
          <p>{{ tx("项目中已有 orders.yml，请选择导入方式：") }}</p>
          <ul class="import-options">
            <li><strong>{{ tx("替换") }}</strong>{{ tx("：丢弃当前全部订单（未导出的修改也会丢失）。") }}</li>
            <li><strong>{{ tx("合并") }}</strong>{{ tx("：保留现有订单；同名订单以导入文件为准。") }}</li>
          </ul>
          <div class="orders-modal-actions">
            <button class="mc-button" data-action="orders-import-replace" @click="replaceImport">{{ tx("替换") }}</button>
            <button class="mc-button primary" data-action="orders-import-merge" @click="mergeImport">{{ tx("合并") }}</button>
            <button class="mc-button" @click="closeImportDialog">{{ tx("取消") }}</button>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.orders-editor {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 66px);
  min-height: 0;
}

.orders-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 22px 12px;
  border-bottom: 2px solid var(--mc-border-dark);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent);
}

.orders-title h1 {
  font-size: 22px;
  text-shadow: 2px 2px 0 #000;
}

.orders-subtitle {
  margin-top: 4px;
  color: var(--mc-text-dim);
  font-size: 12.5px;
}

.orders-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.dirty-pill {
  padding: 2px 8px;
  color: var(--mc-gold);
  border: 1px solid rgba(244, 201, 93, 0.45);
  font-size: 11.5px;
  white-space: nowrap;
}

.order-dirty {
  color: var(--mc-orange);
  border-color: rgba(230, 160, 60, 0.45);
}

.orders-empty {
  margin: 40px auto;
  max-width: 760px;
  padding: 40px 34px;
  text-align: center;
  background: var(--mc-panel);
  border: 3px solid var(--mc-border-dark);
  box-shadow: var(--mc-inset-light), var(--mc-shadow);
}

.orders-empty-icon {
  font-size: 42px;
}

.orders-empty h2 {
  margin-top: 10px;
  font-size: 21px;
  text-shadow: 2px 2px 0 #000;
}

.orders-empty p {
  margin-top: 10px;
  color: var(--mc-text-dim);
}

.orders-empty-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin: 22px 0 12px;
}

.orders-syntax {
  margin: 18px 22px;
  padding: 14px 16px;
  color: #ffc4bc;
  background: rgba(224, 100, 90, 0.12);
  border: 2px solid var(--mc-red-dark);
}

.orders-syntax strong {
  display: block;
  margin-bottom: 6px;
}

.orders-layout {
  display: grid;
  grid-template-columns: 310px minmax(0, 1fr);
  gap: 12px;
  flex: 1;
  min-height: 0;
  padding: 12px 16px 16px;
}

.orders-list-panel,
.order-form-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--mc-panel);
  border: 2px solid var(--mc-border-dark);
  box-shadow: var(--mc-inset-light), 0 10px 24px rgba(0, 0, 0, 0.25);
}

.orders-list-panel {
  padding: 12px;
}

.orders-search {
  margin-bottom: 8px;
}

.orders-list-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.orders-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 2px;
}

.order-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  padding: 8px 9px;
  text-align: left;
  background: linear-gradient(180deg, #233020, #1b2518);
  border: 1px solid transparent;
  color: var(--mc-text);
}

.order-row:hover {
  border-color: var(--mc-border);
  background: var(--mc-panel-2);
}

.order-row.active {
  border-color: var(--mc-grass);
  background: linear-gradient(180deg, #33492a, #26361f);
}

.order-row.invalid .order-row-id {
  color: #ff9d92;
}

.order-row.highlighted {
  outline: 2px solid var(--mc-gold);
  outline-offset: -2px;
}

.order-row-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.order-row-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--mc-mono);
  font-size: 12.5px;
  color: var(--mc-diamond);
}

.order-row-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--mc-text-dim);
  font-size: 11.5px;
}

.order-row-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--mc-muted);
  font-size: 10.5px;
}

.order-row-counts {
  margin-right: auto;
  font-family: var(--mc-mono);
}

.badge {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  display: inline-grid;
  place-items: center;
  font-size: 10px;
  font-weight: 700;
  border: 1px solid rgba(0, 0, 0, 0.45);
}

.badge.error {
  color: #ffb3aa;
  background: rgba(224, 100, 90, 0.22);
}

.badge.warning {
  color: #ffd98a;
  background: rgba(244, 201, 93, 0.16);
}

.badge.dirty {
  color: var(--mc-gold);
  border-color: rgba(244, 201, 93, 0.4);
}

.orders-list-empty {
  padding: 10px 4px;
  color: var(--mc-muted);
  font-size: 12px;
}

.orders-list-footer {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--mc-border-dark);
}

.issue-toggle {
  width: 100%;
  padding: 6px 8px;
  text-align: left;
  color: var(--mc-text-dim);
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--mc-border);
  font-size: 11.5px;
}

.issue-toggle:hover {
  border-color: var(--mc-gold);
  color: var(--mc-text);
}

.order-form-panel {
  overflow: auto;
  padding: 16px 18px 26px;
}

.orders-issues-panel {
  margin-bottom: 14px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--mc-border);
}

.issues-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.link-button {
  padding: 0;
  color: var(--mc-diamond);
  background: transparent;
  border: 0;
  text-decoration: underline;
  font-size: 11.5px;
}

.issue-row {
  display: grid;
  grid-template-columns: 42px 78px minmax(0, 1fr) auto;
  gap: 6px;
  width: 100%;
  padding: 5px 6px;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-left: 3px solid var(--mc-border);
  color: var(--mc-text);
  font-size: 11.5px;
}

.issue-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.issue-row.issue-error {
  border-left-color: var(--mc-red);
}

.issue-row.issue-warning {
  border-left-color: var(--mc-gold);
}

.issue-row.issue-info {
  border-left-color: var(--mc-blue);
}

.issue-sev {
  font-weight: 700;
}

.issue-error .issue-sev {
  color: #ffb3aa;
}

.issue-warning .issue-sev {
  color: #ffd98a;
}

.issue-info .issue-sev {
  color: #b9d9f5;
}

.issue-code {
  color: var(--mc-diamond);
  font-family: var(--mc-mono);
  font-size: 10.5px;
}

.issue-msg {
  min-width: 0;
}

.issue-loc {
  color: var(--mc-muted);
  font-family: var(--mc-mono);
  font-size: 10.5px;
  white-space: nowrap;
}

.order-select-hint {
  display: grid;
  place-items: center;
  min-height: 340px;
  color: var(--mc-muted);
}

.order-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.order-form-head {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--mc-border-dark);
  flex-wrap: wrap;
}

.id-field {
  min-width: 240px;
  flex: 1;
}

.id-field .mc-input {
  color: var(--mc-diamond);
  font-size: 14px;
}

.order-head-actions {
  display: flex;
  gap: 6px;
  margin-left: auto;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.field-label {
  color: var(--mc-text-dim);
  font-size: 11.5px;
  letter-spacing: 0.03em;
}

.field-error {
  color: #ffb3aa;
  font-size: 11.5px;
}

.form-section {
  padding: 14px;
  background: rgba(0, 0, 0, 0.1);
  border: 1px solid var(--mc-border-dark);
}

.form-section h2 {
  margin-bottom: 10px;
  font-size: 14px;
  color: var(--mc-text);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.section-head h2 {
  margin: 0;
}

.section-actions {
  display: flex;
  gap: 6px;
}

.color-preview-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0 12px;
}

.description-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.description-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.description-row .mc-input {
  flex: 1;
}

.icon-button {
  width: 28px;
  height: 28px;
  padding: 0;
  display: inline-grid;
  place-items: center;
  color: var(--mc-text-dim);
  background: var(--mc-panel-2);
  border: 2px solid var(--mc-border-dark);
  box-shadow: var(--mc-inset-light), inset -2px -2px 0 rgba(0, 0, 0, 0.3);
  font-size: 14px;
  line-height: 1;
}

.icon-button:hover:not(:disabled) {
  color: var(--mc-text);
  border-color: var(--mc-border-light);
}

.icon-button.danger:hover:not(:disabled) {
  color: #ff9d92;
  border-color: var(--mc-red);
}

.quest-card {
  margin-bottom: 10px;
  padding: 10px 12px 12px;
  background: var(--mc-panel-2);
  border: 2px solid var(--mc-border-dark);
}

.quest-card.invalid {
  border-color: rgba(224, 100, 90, 0.5);
}

.quest-card.highlighted,
.reward-row.highlighted {
  outline: 2px solid var(--mc-gold);
  outline-offset: -2px;
}

.quest-head {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.quest-id-field {
  width: 170px;
}

.quest-type-field {
  width: 260px;
}

.quest-actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.quest-body {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.quest-body .field {
  flex: 1;
  min-width: 180px;
}

.quest-body .amount-field {
  flex: 0 0 120px;
  min-width: 100px;
}

.quest-hint {
  margin-top: 8px;
  color: var(--mc-muted);
  font-size: 11px;
}

.reward-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 10px 10px 4px;
  margin-bottom: 8px;
  background: var(--mc-panel-2);
  border: 2px solid var(--mc-border-dark);
}

.reward-row.invalid {
  border-color: rgba(224, 100, 90, 0.45);
}

.reward-index {
  align-self: center;
  width: 34px;
  color: var(--mc-muted);
  font-family: var(--mc-mono);
  font-size: 11px;
  text-align: right;
}

.reward-type-field {
  width: 210px;
}

.reward-material-field {
  width: 190px;
}

.reward-value-field {
  width: 120px;
  flex: 0 0 120px;
}

.reward-command-field {
  flex: 1;
  min-width: 240px;
}

.reward-actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.reward-hint {
  flex-basis: 100%;
  margin: 2px 0 0 42px;
  font-size: 11px;
}

.raw-mode {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.raw-textarea {
  min-height: 160px;
  resize: vertical;
  line-height: 1.6;
}

.inline-issues {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.inline-issue {
  display: block;
  width: 100%;
  padding: 5px 8px;
  text-align: left;
  color: var(--mc-text);
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid transparent;
  border-left: 3px solid var(--mc-border);
  font-size: 11.5px;
  line-height: 1.45;
}

.inline-issue strong {
  margin-right: 6px;
  color: var(--mc-diamond);
  font-family: var(--mc-mono);
  font-size: 10.5px;
}

.inline-issue.issue-error {
  border-left-color: var(--mc-red);
  background: rgba(224, 100, 90, 0.1);
}

.inline-issue.issue-warning {
  border-left-color: var(--mc-gold);
}

.inline-issue.issue-info {
  border-left-color: var(--mc-blue);
}

.unknown-box {
  margin-top: 8px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px dashed var(--mc-border);
  font-size: 11.5px;
}

.unknown-box summary {
  color: var(--mc-text-dim);
  cursor: pointer;
}

.unknown-box ul {
  margin: 6px 0 0;
  padding-left: 18px;
}

.unknown-box pre {
  margin: 4px 0;
  padding: 6px 8px;
  overflow: auto;
  color: #cfe6c2;
  background: #0b100a;
  border: 1px solid var(--mc-border-dark);
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-word;
}

.global-issues h3 {
  margin-bottom: 6px;
  color: var(--mc-text-dim);
  font-size: 12px;
}

.orders-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 85;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(4, 7, 3, 0.72);
}

.orders-modal {
  width: min(560px, 100%);
  padding: 18px 20px;
  background: var(--mc-panel);
  border: 3px solid var(--mc-border-dark);
  box-shadow: var(--mc-inset-light), 0 24px 60px rgba(0, 0, 0, 0.6);
}

.orders-modal h2 {
  margin-bottom: 10px;
  font-size: 17px;
  text-shadow: 2px 2px 0 #000;
}

.orders-modal p {
  color: var(--mc-text-dim);
}

.import-options {
  margin: 10px 0 16px;
  padding-left: 20px;
  color: var(--mc-text-dim);
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12.5px;
}

.import-error {
  color: #ffc4bc;
  background: rgba(224, 100, 90, 0.12);
  border: 2px solid var(--mc-red-dark);
  padding: 10px 12px;
}

.import-error strong {
  display: block;
  margin-bottom: 4px;
}

.orders-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

@media (max-width: 1180px) {
  .orders-layout {
    grid-template-columns: 270px minmax(0, 1fr);
  }

  .reward-type-field,
  .quest-type-field {
    width: 180px;
  }
}
</style>
