import {
  Document,
  isAlias,
  isMap,
  isScalar,
  isSeq,
  Pair,
  type Node,
  type YAMLMap,
  type YAMLSeq,
} from 'yaml';
import {
  parseYamlText,
  type DuplicateKeyInfo,
  type ParsedYaml,
  type YamlIssue,
} from '../../core/yaml';
import { KNOWN_ORDER_KEYS, KNOWN_QUEST_KEYS } from './ordersConstants';

export type ValueKind =
  | 'missing'
  | 'null'
  | 'string'
  | 'number'
  | 'boolean'
  | 'map'
  | 'seq'
  | 'alias'
  | 'other';

export interface RewardEntry {
  index: number;
  line?: number;
  /** 原文展示（非字符串项用 JSON/标量预览）。 */
  raw: string;
  kind: ValueKind;
  isString: boolean;
  /** 按 Java String#split(";") 语义切分的段（丢弃尾部空段）。 */
  segments: string[];
  type: string;
  args: string[];
}

export interface ExtraField {
  key: string;
  preview: string;
}

export interface QuestEntry {
  id: string;
  line?: number;
  type: string;
  typeKind: ValueKind;
  item: string;
  itemKind: ValueKind;
  mob: string;
  mobKind: ValueKind;
  amount: string;
  amountKind: ValueKind;
  extraKeys: string[];
  extras: ExtraField[];
  validMap: boolean;
  valueKind: ValueKind;
  preview: string;
}

export interface OrderEntry {
  id: string;
  line?: number;
  label: string;
  labelKind: ValueKind;
  description: string[];
  descriptionKind: ValueKind;
  descriptionHasInvalidEntry: boolean;
  quests: QuestEntry[];
  questKind: ValueKind;
  rewards: RewardEntry[];
  rewardKind: ValueKind;
  extraKeys: string[];
  extras: ExtraField[];
  validMap: boolean;
  valueKind: ValueKind;
  preview: string;
}

export interface OrdersModel {
  orders: OrderEntry[];
  topLevelKind: ValueKind;
  syntaxError?: YamlIssue;
  duplicates: DuplicateKeyInfo[];
  text: string;
}

export interface ParsedOrdersFile {
  parsed: ParsedYaml;
  doc: Document | null;
  model: OrdersModel;
}

export function valueKind(node: Node | null | undefined): ValueKind {
  if (!node) return 'missing';
  if (isAlias(node)) return 'alias';
  if (isMap(node)) return 'map';
  if (isSeq(node)) return 'seq';
  if (isScalar(node)) {
    const value = node.value;
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'other';
  }
  return 'other';
}

export function scalarString(node: Node | null | undefined): string {
  if (node && isScalar(node)) {
    const value = node.value;
    return value === null || value === undefined ? '' : String(value);
  }
  return '';
}

function preview(node: Node | null | undefined): string {
  if (!node) return '';
  try {
    if (isScalar(node)) return scalarString(node);
    const json = JSON.stringify(node.toJSON());
    return json && json.length > 160 ? `${json.slice(0, 160)}…` : (json ?? '');
  } catch {
    return '[无法预览]';
  }
}

function lineOf(node: Node | null | undefined, text: string): number | undefined {
  const offset = node?.range?.[0];
  if (offset === undefined) return undefined;
  let line = 1;
  const end = Math.min(offset, text.length);
  for (let index = 0; index < end; index += 1) {
    if (text.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

/** 按 Java String#split(";")（丢弃尾部空段）切分 reward。 */
export function splitReward(raw: string): string[] {
  const parts = raw.split(';');
  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

function keyString(key: Node | null | undefined): string {
  if (!key) return '';
  if (isScalar(key)) return scalarString(key);
  if (isAlias(key)) return `*${key.source}`;
  return preview(key);
}

function keyLine(key: Node | null | undefined, text: string): number | undefined {
  return lineOf(key, text);
}

function mapSet(map: YAMLMap, key: string, value: unknown, doc: Document): void {
  const pair = findPairById(map, key);
  const valueNode = doc.createNode(value);
  if (pair) {
    pair.value = valueNode;
    return;
  }
  map.items.push(new Pair(doc.createNode(key), valueNode));
}

function mapEntries(map: YAMLMap): NodePair[] {
  return map.items as NodePair[];
}

type NodePair = { key: Node | null; value: Node | null };

function extraFieldsOf(map: YAMLMap, known: readonly string[]): ExtraField[] {
  return mapEntries(map)
    .filter((pair) => !known.includes(keyString(pair.key)))
    .map((pair) => ({ key: keyString(pair.key), preview: preview(pair.value as Node | null) }));
}

function buildRewards(node: Node | null | undefined, text: string): RewardEntry[] {
  if (!isSeq(node)) return [];
  return node.items.map((item, index) => {
    const kind = valueKind(item as Node);
    const isString = kind === 'string';
    const raw = isString ? scalarString(item as Node) : preview(item as Node);
    const segments = isString ? splitReward(raw) : [];
    return {
      index,
      line: lineOf(item as Node, text),
      raw,
      kind,
      isString,
      segments,
      type: (segments[0] ?? '').toLowerCase(),
      args: segments.slice(1),
    };
  });
}

function buildQuest(
  pair: NodePair,
  text: string,
): QuestEntry {
  const id = keyString(pair.key);
  const line = keyLine(pair.key, text);
  const node = pair.value as Node | null;
  const kind = valueKind(node);
  if (!isMap(node)) {
    return {
      id,
      line,
      type: '',
      typeKind: 'missing',
      item: '',
      itemKind: 'missing',
      mob: '',
      mobKind: 'missing',
      amount: '',
      amountKind: 'missing',
      extraKeys: [],
      extras: [],
      validMap: false,
      valueKind: kind,
      preview: preview(node),
    };
  }
  const typeNode = node.get('type', true) as Node | undefined;
  const itemNode = node.get('item', true) as Node | undefined;
  const mobNode = node.get('mob', true) as Node | undefined;
  const amountNode = node.get('amount', true) as Node | undefined;
  const extras = extraFieldsOf(node, KNOWN_QUEST_KEYS);
  return {
    id,
    line,
    type: scalarString(typeNode),
    typeKind: valueKind(typeNode),
    item: scalarString(itemNode),
    itemKind: valueKind(itemNode),
    mob: scalarString(mobNode),
    mobKind: valueKind(mobNode),
    amount: scalarString(amountNode),
    amountKind: valueKind(amountNode),
    extraKeys: extras.map((extra) => extra.key),
    extras,
    validMap: true,
    valueKind: kind,
    preview: '',
  };
}

function buildOrder(pair: NodePair, text: string): OrderEntry {
  const id = keyString(pair.key);
  const line = keyLine(pair.key, text);
  const node = pair.value as Node | null;
  const kind = valueKind(node);
  if (!isMap(node)) {
    return {
      id,
      line,
      label: '',
      labelKind: 'missing',
      description: [],
      descriptionKind: 'missing',
      descriptionHasInvalidEntry: false,
      quests: [],
      questKind: 'missing',
      rewards: [],
      rewardKind: 'missing',
      extraKeys: [],
      extras: [],
      validMap: false,
      valueKind: kind,
      preview: preview(node),
    };
  }

  const labelNode = node.get('label', true) as Node | undefined;
  const descriptionNode = node.get('description', true) as Node | undefined;
  const questNode = node.get('quest', true) as Node | undefined;
  const rewardNode = node.get('reward', true) as Node | undefined;
  const extras = extraFieldsOf(node, KNOWN_ORDER_KEYS);

  const descriptionKind = valueKind(descriptionNode);
  let description: string[] = [];
  let descriptionHasInvalidEntry = false;
  if (isSeq(descriptionNode)) {
    description = descriptionNode.items.map((item) => {
      const itemKind = valueKind(item as Node);
      if (itemKind === 'string') return scalarString(item as Node);
      descriptionHasInvalidEntry = true;
      return preview(item as Node);
    });
  } else if (descriptionKind === 'string') {
    description = [scalarString(descriptionNode)];
    descriptionHasInvalidEntry = true;
  }

  const questKind = valueKind(questNode);
  const quests = isMap(questNode)
    ? mapEntries(questNode).map((questPair) => buildQuest(questPair, text))
    : [];

  return {
    id,
    line,
    label: scalarString(labelNode),
    labelKind: valueKind(labelNode),
    description,
    descriptionKind,
    descriptionHasInvalidEntry,
    quests,
    questKind,
    rewards: buildRewards(rewardNode, text),
    rewardKind: valueKind(rewardNode),
    extraKeys: extras.map((extra) => extra.key),
    extras,
    validMap: true,
    valueKind: kind,
    preview: '',
  };
}

export function buildOrdersModel(
  doc: Document | null,
  text: string,
  parsed?: ParsedYaml,
): OrdersModel {
  const duplicates = parsed?.duplicates ?? [];
  const syntaxError = parsed?.syntaxError;
  const contents = doc?.contents;
  const topLevelKind = valueKind(contents);
  if (!doc || !isMap(contents)) {
    return {
      orders: [],
      topLevelKind,
      syntaxError,
      duplicates,
      text,
    };
  }
  return {
    orders: mapEntries(contents).map((pair) => buildOrder(pair, text)),
    topLevelKind,
    syntaxError,
    duplicates,
    text,
  };
}

/** 解析 orders.yml；语法错误时返回 doc=null（禁止继续编辑，避免损坏原文）。 */
export function parseOrdersFile(text: string): ParsedOrdersFile {
  const parsed = parseYamlText(text);
  const doc = parsed.ok ? (parsed.doc ?? null) : null;
  return {
    parsed,
    doc,
    model: buildOrdersModel(doc, parsed.normalizedText, parsed),
  };
}

/** orders 导出：字符串默认单引号（constraints.md §9.1），LF + 末尾换行。 */
export function serializeOrders(doc: Document): string {
  const raw = doc.toString({
    lineWidth: 0,
    indent: 2,
    minContentWidth: 0,
    singleQuote: true,
  });
  const text = raw.replace(/\r\n?/g, '\n');
  return text.endsWith('\n') ? text : `${text}\n`;
}

export function findPairById(map: YAMLMap, id: string): NodePair | undefined {
  return mapEntries(map).find((pair) => keyString(pair.key) === id);
}

export function orderMapOf(doc: Document, orderId: string): YAMLMap | null {
  if (!isMap(doc.contents)) return null;
  const pair = findPairById(doc.contents, orderId);
  return pair?.value && isMap(pair.value) ? pair.value : null;
}

export function questMapOf(doc: Document, orderId: string): YAMLMap | null {
  const order = orderMapOf(doc, orderId);
  if (!order) return null;
  const node = order.get('quest', true) as Node | undefined;
  return node && isMap(node) ? node : null;
}

export function rewardSeqOf(doc: Document, orderId: string): YAMLSeq | null {
  const order = orderMapOf(doc, orderId);
  if (!order) return null;
  const node = order.get('reward', true) as Node | undefined;
  return node && isSeq(node) ? node : null;
}

export function ensureOrdersMap(doc: Document): YAMLMap {
  if (isMap(doc.contents)) return doc.contents;
  const map = doc.createNode({});
  doc.contents = map;
  return map;
}

export function createEmptyOrdersDocument(): Document {
  const doc = new Document();
  doc.contents = doc.createNode({});
  return doc;
}

export function defaultOrderPlain(label = '新订单'): Record<string, unknown> {
  return {
    label,
    description: [],
    quest: {
      quest_1: {
        type: 'break_block',
        item: 'stone',
        amount: 1,
      },
    },
    reward: [],
  };
}

export function addOrder(
  doc: Document,
  orderId: string,
  plain: Record<string, unknown> = defaultOrderPlain(),
): void {
  mapSet(ensureOrdersMap(doc), orderId, plain, doc);
}

export function duplicateOrder(doc: Document, sourceId: string, newOrderId: string): boolean {
  if (!isMap(doc.contents)) return false;
  const source = findPairById(doc.contents, sourceId);
  if (!source?.value) return false;
  let plain: unknown;
  try {
    plain = structuredClone(source.value.toJSON());
  } catch {
    return false;
  }
  mapSet(doc.contents, newOrderId, plain, doc);
  return true;
}

export function deleteOrder(doc: Document, orderId: string): boolean {
  if (!isMap(doc.contents)) return false;
  const index = mapEntries(doc.contents).findIndex((pair) => keyString(pair.key) === orderId);
  if (index < 0) return false;
  doc.contents.items.splice(index, 1);
  return true;
}

export function renameOrder(doc: Document, oldId: string, newId: string): boolean {
  if (!isMap(doc.contents) || oldId === newId) return false;
  if (findPairById(doc.contents, newId)) return false;
  const pair = findPairById(doc.contents, oldId);
  if (!pair || !isScalar(pair.key)) return false;
  pair.key.value = newId;
  return true;
}

export function setOrderField(
  doc: Document,
  orderId: string,
  field: string,
  value: unknown,
): boolean {
  const order = orderMapOf(doc, orderId);
  if (!order) return false;
  mapSet(order, field, value, doc);
  return true;
}

export function setOrderDescription(doc: Document, orderId: string, lines: string[]): boolean {
  return setOrderField(doc, orderId, 'description', lines);
}

export function setQuestField(
  doc: Document,
  orderId: string,
  questId: string,
  field: string,
  value: unknown,
): boolean {
  const quests = questMapOf(doc, orderId);
  if (!quests) return false;
  const pair = findPairById(quests, questId);
  if (!pair?.value || !isMap(pair.value)) return false;
  mapSet(pair.value, field, value, doc);
  return true;
}

export function deleteQuestField(
  doc: Document,
  orderId: string,
  questId: string,
  field: string,
): boolean {
  const quests = questMapOf(doc, orderId);
  if (!quests) return false;
  const pair = findPairById(quests, questId);
  if (!pair?.value || !isMap(pair.value)) return false;
  pair.value.delete(field);
  return true;
}

export function addQuest(
  doc: Document,
  orderId: string,
  questId: string,
  plain: Record<string, unknown> = { type: 'break_block', item: 'stone', amount: 1 },
): boolean {
  const order = orderMapOf(doc, orderId);
  if (!order) return false;
  const existing = order.get('quest', true) as Node | undefined;
  if (!existing) {
    mapSet(order, 'quest', { [questId]: plain }, doc);
    return true;
  }
  if (!isMap(existing)) return false;
  if (findPairById(existing, questId)) return false;
  mapSet(existing, questId, plain, doc);
  return true;
}

export function deleteQuest(doc: Document, orderId: string, questId: string): boolean {
  const quests = questMapOf(doc, orderId);
  if (!quests) return false;
  const index = mapEntries(quests).findIndex((pair) => keyString(pair.key) === questId);
  if (index < 0) return false;
  quests.items.splice(index, 1);
  return true;
}

export function renameQuest(
  doc: Document,
  orderId: string,
  oldId: string,
  newId: string,
): boolean {
  const quests = questMapOf(doc, orderId);
  if (!quests || oldId === newId) return false;
  if (findPairById(quests, newId)) return false;
  const pair = findPairById(quests, oldId);
  if (!pair || !isScalar(pair.key)) return false;
  pair.key.value = newId;
  return true;
}

export function moveQuest(doc: Document, orderId: string, from: number, to: number): boolean {
  const quests = questMapOf(doc, orderId);
  if (!quests || from < 0 || to < 0 || from >= quests.items.length || to >= quests.items.length) {
    return false;
  }
  if (from === to) return false;
  const [item] = quests.items.splice(from, 1);
  if (!item) return false;
  quests.items.splice(to, 0, item);
  return true;
}

export function setRewardLine(
  doc: Document,
  orderId: string,
  index: number,
  value: string,
): boolean {
  const seq = rewardSeqOf(doc, orderId);
  if (!seq || index < 0 || index >= seq.items.length) return false;
  seq.items[index] = doc.createNode(value);
  return true;
}

export function addReward(doc: Document, orderId: string, value = 'item;stone;1'): boolean {
  const order = orderMapOf(doc, orderId);
  if (!order) return false;
  const existing = order.get('reward', true) as Node | undefined;
  if (!existing) {
    mapSet(order, 'reward', [value], doc);
    return true;
  }
  if (!isSeq(existing)) return false;
  existing.items.push(doc.createNode(value));
  return true;
}

export function deleteReward(doc: Document, orderId: string, index: number): boolean {
  const seq = rewardSeqOf(doc, orderId);
  if (!seq || index < 0 || index >= seq.items.length) return false;
  seq.items.splice(index, 1);
  return true;
}

export function moveReward(doc: Document, orderId: string, from: number, to: number): boolean {
  const seq = rewardSeqOf(doc, orderId);
  if (!seq || from < 0 || to < 0 || from >= seq.items.length || to >= seq.items.length) {
    return false;
  }
  if (from === to) return false;
  const [item] = seq.items.splice(from, 1);
  if (!item) return false;
  seq.items.splice(to, 0, item);
  return true;
}

/** 原文模式：整体替换 reward 列表（要求原值是列表或缺失）。 */
export function setRewards(doc: Document, orderId: string, lines: string[]): boolean {
  const order = orderMapOf(doc, orderId);
  if (!order) return false;
  const existing = order.get('reward', true) as Node | undefined;
  if (existing && !isSeq(existing)) return false;
  mapSet(order, 'reward', lines, doc);
  return true;
}

export interface MergeResult {
  merged: number;
  skipped: number;
}

/** 合并另一个 orders 文档：同名订单覆盖，其余保留。 */
export function mergeOrders(doc: Document, imported: Document): MergeResult {
  const result: MergeResult = { merged: 0, skipped: 0 };
  if (!isMap(imported.contents)) return result;
  const target = ensureOrdersMap(doc);
  for (const pair of mapEntries(imported.contents)) {
    const id = keyString(pair.key);
    if (!id) {
      result.skipped += 1;
      continue;
    }
    let plain: unknown;
    try {
      plain = pair.value ? structuredClone(pair.value.toJSON()) : null;
    } catch {
      result.skipped += 1;
      continue;
    }
    mapSet(target, id, plain, doc);
    result.merged += 1;
  }
  return result;
}
