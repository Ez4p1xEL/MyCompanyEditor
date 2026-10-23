import { validationText } from '../../core/validation';
import {
  Document,
  isAlias,
  isMap,
  isNode,
  isScalar,
  isSeq,
  Pair,
  type Node,
  type YAMLMap,
} from 'yaml';
import {
  parseYamlText,
  stringifyYamlDocument,
  type DuplicateKeyInfo,
  type ParsedYaml,
  type YamlIssue,
} from '../../core/yaml';
import { isKnownMenuId, menuIdFromPath } from './menuConstants';

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

export interface ExtraField {
  key: string;
  preview: string;
}

export interface SlotValue {
  raw: string;
  kind: ValueKind;
  /** 只有裸整数才参与 Bukkit getInt；数字字符串不参与。 */
  number?: number;
  integerString?: number;
}

export interface SlotsValue {
  kind: ValueKind;
  items: SlotValue[];
}

export interface MenuItemModel {
  id: string;
  line?: number;
  kind: ValueKind;
  validMap: boolean;
  preview: string;
  material: string;
  materialKind: ValueKind;
  slot?: SlotValue;
  slots?: SlotsValue;
  extras: ExtraField[];
}

export interface MenuOptionModel {
  key: string;
  raw: string;
  kind: ValueKind;
  inferred: 'integer' | 'boolean' | 'string' | 'other';
  preview: string;
}

export interface MenuFileModel {
  path: string;
  menuId: string;
  known: boolean;
  size: string;
  sizeKind: ValueKind;
  sizeNumber?: number;
  optionsKind: ValueKind;
  options: MenuOptionModel[];
  itemsKind: ValueKind;
  items: MenuItemModel[];
  extras: ExtraField[];
  duplicates: DuplicateKeyInfo[];
  syntaxError?: YamlIssue;
  text: string;
}

export interface ParsedMenuFile {
  parsed: ParsedYaml;
  doc: Document | null;
  model: MenuFileModel;
}

type NodePair = { key: Node | null; value: Node | null };

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
    return validationText("[无法预览]");
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

function keyString(key: Node | null | undefined): string {
  if (!key) return '';
  if (isScalar(key)) return scalarString(key);
  if (isAlias(key)) return `*${key.source}`;
  return preview(key);
}

function mapEntries(map: YAMLMap): NodePair[] {
  return map.items as NodePair[];
}

function findPair(map: YAMLMap, id: string): NodePair | undefined {
  return mapEntries(map).find((pair) => keyString(pair.key) === id);
}

function mapSet(map: YAMLMap, key: string, value: unknown, doc: Document): void {
  const pair = findPair(map, key);
  const valueNode = isNode(value) ? (value as Node) : doc.createNode(value);
  if (pair) {
    pair.value = valueNode;
    return;
  }
  map.items.push(new Pair(doc.createNode(key), valueNode));
}

function deleteField(map: YAMLMap, key: string): boolean {
  const index = map.items.findIndex((pair) => keyString((pair as NodePair).key) === key);
  if (index < 0) return false;
  map.items.splice(index, 1);
  return true;
}

function extraFields(map: YAMLMap, known: readonly string[]): ExtraField[] {
  return mapEntries(map)
    .filter((pair) => !known.includes(keyString(pair.key)))
    .map((pair) => ({ key: keyString(pair.key), preview: preview(pair.value as Node | null) }));
}

function slotValue(node: Node | null | undefined): SlotValue {
  const kind = valueKind(node);
  const raw = scalarString(node);
  const number = kind === 'number' ? Number(raw) : undefined;
  const integerString =
    kind === 'string' && /^[+-]?\d+$/.test(raw.trim()) ? Number.parseInt(raw.trim(), 10) : undefined;
  return { raw, kind, number, integerString };
}

function buildItem(pair: NodePair, text: string): MenuItemModel {
  const id = keyString(pair.key);
  const node = pair.value as Node | null;
  const kind = valueKind(node);
  const line = lineOf(pair.key, text);
  if (!node || !isMap(node)) {
    return {
      id,
      line,
      kind,
      validMap: false,
      preview: preview(node),
      material: '',
      materialKind: 'missing',
      extras: [],
    };
  }
  const slotsNode = node.get('slots', true) as Node | undefined;
  const slots: SlotsValue | undefined = isSeq(slotsNode)
    ? { kind: 'seq', items: slotsNode.items.map((item) => slotValue(item as Node)) }
    : slotsNode
      ? { kind: valueKind(slotsNode), items: [] }
      : undefined;
  const slotNode = node.get('slot', true) as Node | undefined;
  return {
    id,
    line,
    kind,
    validMap: true,
    preview: '',
    material: scalarString(node.get('material', true) as Node | undefined),
    materialKind: valueKind(node.get('material', true) as Node | undefined),
    slot: slotNode ? slotValue(slotNode) : undefined,
    slots,
    extras: extraFields(node, ['material', 'slot', 'slots']),
  };
}

function optionInferred(kind: ValueKind, raw: string): MenuOptionModel['inferred'] {
  if (kind === 'number') return Number.isInteger(Number(raw)) ? 'integer' : 'other';
  if (kind === 'boolean') return 'boolean';
  if (kind === 'string') {
    if (/^[+-]?\d+$/.test(raw.trim())) return 'integer';
    if (/^(true|false)$/i.test(raw.trim())) return 'boolean';
    return 'string';
  }
  return 'other';
}

export function buildMenuModel(
  doc: Document | null,
  text: string,
  path: string,
  parsed?: ParsedYaml,
): MenuFileModel {
  const menuId = menuIdFromPath(path);
  const base: MenuFileModel = {
    path,
    menuId,
    known: isKnownMenuId(menuId),
    size: '',
    sizeKind: 'missing',
    optionsKind: 'missing',
    options: [],
    itemsKind: 'missing',
    items: [],
    extras: [],
    duplicates: parsed?.duplicates ?? [],
    syntaxError: parsed?.syntaxError,
    text,
  };
  if (!doc) return base;
  const contents = doc.contents;
  if (!isMap(contents)) return { ...base, sizeKind: valueKind(contents) };
  const sizeNode = contents.get('size', true) as Node | undefined;
  const sizeKind = valueKind(sizeNode);
  const sizeNumber = sizeKind === 'number' ? Number(scalarString(sizeNode)) : undefined;
  const optionsNode = contents.get('options', true) as Node | undefined;
  const itemsNode = contents.get('items', true) as Node | undefined;
  const options: MenuOptionModel[] = [];
  if (isMap(optionsNode)) {
    for (const pair of mapEntries(optionsNode)) {
      const key = keyString(pair.key);
      const kind = valueKind(pair.value as Node);
      const raw = scalarString(pair.value as Node);
      options.push({
        key,
        raw,
        kind,
        inferred: optionInferred(kind, raw),
        preview: preview(pair.value as Node | null),
      });
    }
  }
  return {
    ...base,
    size: scalarString(sizeNode),
    sizeKind,
    sizeNumber: Number.isInteger(sizeNumber) ? sizeNumber : undefined,
    optionsKind: valueKind(optionsNode),
    options,
    itemsKind: valueKind(itemsNode),
    items: isMap(itemsNode)
      ? mapEntries(itemsNode).map((pair) => buildItem(pair, text))
      : [],
    extras: extraFields(contents, ['size', 'options', 'items']),
  };
}

export function parseMenuFile(path: string, text: string): ParsedMenuFile {
  const parsed = parseYamlText(text);
  const doc = parsed.ok ? (parsed.doc ?? null) : null;
  return { parsed, doc, model: buildMenuModel(doc, parsed.normalizedText, path, parsed) };
}

export function serializeMenu(doc: Document): string {
  return stringifyYamlDocument(doc);
}

export function menuMap(doc: Document): YAMLMap | null {
  return isMap(doc.contents) ? doc.contents : null;
}

export function itemsMap(doc: Document): YAMLMap | null {
  const top = menuMap(doc);
  if (!top) return null;
  const node = top.get('items', true) as Node | undefined;
  return node && isMap(node) ? node : null;
}

export function itemNode(doc: Document, id: string): YAMLMap | null {
  const map = itemsMap(doc);
  if (!map) return null;
  const pair = findPair(map, id);
  return pair?.value && isMap(pair.value) ? pair.value : null;
}

export function setSize(doc: Document, size: number): void {
  const top = menuMap(doc);
  if (!top) return;
  mapSet(top, 'size', size, doc);
}

function ensureOptionsMap(doc: Document): YAMLMap | null {
  const top = menuMap(doc);
  if (!top) return null;
  const existing = top.get('options', true) as Node | undefined;
  if (isMap(existing)) return existing;
  if (existing) return null;
  const map = doc.createNode({});
  mapSet(top, 'options', map, doc);
  return map;
}

export function setOption(doc: Document, key: string, value: unknown): boolean {
  const map = ensureOptionsMap(doc);
  if (!map) return false;
  mapSet(map, key, value, doc);
  return true;
}

export function deleteOption(doc: Document, key: string): boolean {
  const top = menuMap(doc);
  if (!top) return false;
  const options = top.get('options', true) as Node | undefined;
  if (!options || !isMap(options)) return false;
  return deleteField(options, key);
}

export function renameOption(doc: Document, oldKey: string, newKey: string): boolean {
  const top = menuMap(doc);
  if (!top) return false;
  const options = top.get('options', true) as Node | undefined;
  if (!options || !isMap(options) || findPair(options, newKey)) return false;
  const pair = findPair(options, oldKey);
  if (!pair || !isScalar(pair.key)) return false;
  pair.key.value = newKey;
  return true;
}

export function setItemMaterial(doc: Document, id: string, material: string): boolean {
  const node = itemNode(doc, id);
  if (!node) return false;
  mapSet(node, 'material', material, doc);
  return true;
}

export function setItemSlot(doc: Document, id: string, slot: number): boolean {
  const node = itemNode(doc, id);
  if (!node) return false;
  mapSet(node, 'slot', slot, doc);
  node.delete('slots');
  return true;
}

export function setItemSlots(doc: Document, id: string, slots: number[]): boolean {
  const node = itemNode(doc, id);
  if (!node) return false;
  mapSet(node, 'slots', slots, doc);
  node.delete('slot');
  return true;
}

export function clearItemSlots(doc: Document, id: string): boolean {
  const node = itemNode(doc, id);
  if (!node) return false;
  node.delete('slot');
  node.delete('slots');
  return true;
}

export function addItem(doc: Document, id: string, plain: Record<string, unknown>): boolean {
  const top = menuMap(doc);
  if (!top) return false;
  let map = itemsMap(doc);
  if (!map) {
    map = doc.createNode({});
    mapSet(top, 'items', map, doc);
  }
  if (findPair(map, id)) return false;
  mapSet(map, id, plain, doc);
  return true;
}

export function deleteItem(doc: Document, id: string): boolean {
  const map = itemsMap(doc);
  if (!map) return false;
  return deleteField(map, id);
}

export function renameItem(doc: Document, oldId: string, newId: string): boolean {
  const map = itemsMap(doc);
  if (!map || oldId === newId || findPair(map, newId)) return false;
  const pair = findPair(map, oldId);
  if (!pair || !isScalar(pair.key)) return false;
  pair.key.value = newId;
  return true;
}

export function duplicateItem(doc: Document, sourceId: string, newId: string): boolean {
  const source = itemNode(doc, sourceId);
  const top = menuMap(doc);
  if (!source || !top) return false;
  let map = itemsMap(doc);
  if (!map) {
    map = doc.createNode({});
    mapSet(top, 'items', map, doc);
  }
  if (findPair(map, newId)) return false;
  mapSet(map, newId, structuredClone(source.toJSON()), doc);
  return true;
}

export function moveItem(doc: Document, from: number, to: number): boolean {
  const map = itemsMap(doc);
  if (!map || from < 0 || to < 0 || from >= map.items.length || to >= map.items.length || from === to) {
    return false;
  }
  const [item] = map.items.splice(from, 1);
  if (!item) return false;
  map.items.splice(to, 0, item);
  return true;
}

/** 解析后的实际占用槽位（与 MenuUtil 的 slot/slots 读取顺序一致）。 */
export function itemSlots(item: MenuItemModel): number[] {
  if (item.slot && item.slot.kind === 'number') {
    const number = item.slot.number;
    if (number !== undefined && Number.isInteger(number) && number >= 0) return [number];
  }
  if (item.slots?.kind === 'seq') {
    return item.slots.items
      .map((entry) => entry.number ?? entry.integerString)
      .filter((value): value is number => value !== undefined && Number.isInteger(value) && value >= 0);
  }
  return [];
}

/** 单槽/多槽模式的 UI 状态。 */
export function itemSlotMode(item: MenuItemModel): 'slot' | 'slots' | 'none' {
  if (item.slot && item.slot.kind === 'number' && (item.slot.number ?? -1) >= 0) return 'slot';
  if (item.slots?.kind === 'seq') return 'slots';
  return 'none';
}

export function optionValueFromInput(raw: string): number | boolean | string {
  const trimmed = raw.trim();
  if (/^[+-]?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';
  return raw;
}

export function isLanguageField(key: string): boolean {
  return key === 'display_name' || key === 'lore';
}

export const MENU_KNOWN_KEYS = ['size', 'options', 'items'];
export const ITEM_KNOWN_KEYS = ['material', 'slot', 'slots'];
