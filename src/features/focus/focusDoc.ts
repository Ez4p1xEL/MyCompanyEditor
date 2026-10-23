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
import {
  ACTION_KEYS,
  CONDITION_KEYS,
  EFFECT_KEYS,
  FIXED_FOCUS_IDS,
  KNOWN_FOCUS_KEYS,
  KNOWN_NODE_KEYS,
  actionTypeMeta,
  conditionTypeMeta,
  effectTypeMeta,
  focusIdFromPath,
  isFixedFocusPath,
  isReferenceFocusPath,
} from './focusConstants';

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

export interface ScalarValue {
  raw: string;
  kind: ValueKind;
}

export interface StringListValue {
  items: string[];
  kind: ValueKind;
}

export interface ConditionModel {
  kind: ValueKind;
  companyMoney?: ScalarValue;
  expertise?: ScalarValue;
  expertises?: StringListValue;
  companyLog?: StringListValue;
  unknown: ExtraField[];
}

export interface ActionModel {
  kind: ValueKind;
  consoleCommands: StringListValue;
  enableExpertise: StringListValue;
  disableExpertise: StringListValue;
  setPriceGroup?: ScalarValue;
  hasNone: boolean;
  unknown: ExtraField[];
}

export interface EffectRowModel {
  raw: string;
  kind: ValueKind;
  isString: boolean;
}

export interface EffectGroupModel {
  entity: string;
  entityKind: ValueKind;
  valueKind: ValueKind;
  rows: EffectRowModel[];
}

export interface EffectModel {
  kind: ValueKind;
  drops: EffectGroupModel[];
  damage: EffectGroupModel[];
  unknown: ExtraField[];
}

export interface ExpertiseModel {
  id: string;
  line?: number;
  kind: ValueKind;
  validMap: boolean;
  preview: string;
  label: string;
  labelKind: ValueKind;
  description: string[];
  descriptionKind: ValueKind;
  valueType: string;
  valueTypeKind: ValueKind;
  valueTypeKey: 'value_type' | 'value-type' | 'missing';
  legacyValueType?: string;
  defaultValue: string;
  defaultKind: ValueKind;
  condition: ConditionModel;
  action: ActionModel;
  effect: EffectModel;
  extras: ExtraField[];
}

export interface FocusFileModel {
  path: string;
  focusId: string;
  fixed: boolean;
  reference: boolean;
  loadable: boolean;
  kind: ValueKind;
  label: string;
  labelKind: ValueKind;
  description: string[];
  descriptionKind: ValueKind;
  idField: string;
  idKind: ValueKind;
  condition: ConditionModel;
  expertiseKind: ValueKind;
  expertises: ExpertiseModel[];
  extras: ExtraField[];
  legacyNodeIds: string[];
  duplicates: DuplicateKeyInfo[];
  syntaxError?: YamlIssue;
  text: string;
}

export interface ParsedFocusFile {
  parsed: ParsedYaml;
  doc: Document | null;
  model: FocusFileModel;
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

function extraFields(map: YAMLMap, known: readonly string[]): ExtraField[] {
  return mapEntries(map)
    .filter((pair) => !known.includes(keyString(pair.key)))
    .map((pair) => ({ key: keyString(pair.key), preview: preview(pair.value as Node | null) }));
}

function stringListModel(node: Node | null | undefined): StringListValue {
  const kind = valueKind(node);
  if (isSeq(node)) {
    return {
      items: node.items.map((item) => {
        const itemKind = valueKind(item as Node);
        return itemKind === 'string' ? scalarString(item as Node) : preview(item as Node);
      }),
      kind,
    };
  }
  if (kind === 'string' || kind === 'number' || kind === 'boolean') {
    return { items: [scalarString(node)], kind };
  }
  return { items: [], kind };
}

function buildCondition(node: Node | null | undefined): ConditionModel {
  const kind = valueKind(node);
  const model: ConditionModel = { kind, unknown: [] };
  if (!isMap(node)) return model;
  for (const pair of mapEntries(node)) {
    const key = keyString(pair.key);
    switch (key) {
      case 'company_money':
        model.companyMoney = { raw: scalarString(pair.value as Node), kind: valueKind(pair.value as Node) };
        break;
      case 'expertise':
        model.expertise = { raw: scalarString(pair.value as Node), kind: valueKind(pair.value as Node) };
        break;
      case 'expertises':
        model.expertises = stringListModel(pair.value as Node);
        break;
      case 'company_log':
        model.companyLog = stringListModel(pair.value as Node);
        break;
      default:
        model.unknown.push({
          key,
          preview: preview(pair.value as Node | null),
        });
        break;
    }
  }
  return model;
}

function buildAction(node: Node | null | undefined): ActionModel {
  const kind = valueKind(node);
  const model: ActionModel = {
    kind,
    consoleCommands: { items: [], kind: 'missing' },
    enableExpertise: { items: [], kind: 'missing' },
    disableExpertise: { items: [], kind: 'missing' },
    hasNone: false,
    unknown: [],
  };
  if (!isMap(node)) return model;
  for (const pair of mapEntries(node)) {
    const key = keyString(pair.key);
    const lower = key.toLowerCase();
    const meta = actionTypeMeta(lower);
    if (lower === 'none') {
      model.hasNone = true;
      continue;
    }
    if (!meta) {
      model.unknown.push({ key, preview: preview(pair.value as Node | null) });
      continue;
    }
    if (meta.kind === 'stringList') {
      if (lower === 'console_command') model.consoleCommands = stringListModel(pair.value as Node);
      else if (lower === 'enable_expertise') model.enableExpertise = stringListModel(pair.value as Node);
      else model.disableExpertise = stringListModel(pair.value as Node);
    } else if (lower === 'set_price_group') {
      model.setPriceGroup = {
        raw: scalarString(pair.value as Node),
        kind: valueKind(pair.value as Node),
      };
    }
  }
  return model;
}

function buildEffectGroups(node: Node | null | undefined): EffectGroupModel[] {
  if (!isMap(node)) return [];
  return mapEntries(node).map((pair) => {
    const entity = keyString(pair.key);
    const value = pair.value as Node | null;
    const rows: EffectRowModel[] = isSeq(value)
      ? value.items.map((item) => {
          const kind = valueKind(item as Node);
          return {
            raw: kind === 'string' ? scalarString(item as Node) : preview(item as Node),
            kind,
            isString: kind === 'string',
          };
        })
      : [];
    return {
      entity,
      entityKind: valueKind(pair.key as Node),
      valueKind: valueKind(value),
      rows,
    };
  });
}

function buildEffect(node: Node | null | undefined): EffectModel {
  const kind = valueKind(node);
  const model: EffectModel = { kind, drops: [], damage: [], unknown: [] };
  if (!isMap(node)) return model;
  for (const pair of mapEntries(node)) {
    const key = keyString(pair.key);
    const meta = effectTypeMeta(key);
    if (!meta) {
      model.unknown.push({ key, preview: preview(pair.value as Node | null) });
      continue;
    }
    if (meta.kind === 'drops') model.drops = buildEffectGroups(pair.value as Node);
    else model.damage = buildEffectGroups(pair.value as Node);
  }
  return model;
}

function buildExpertise(pair: NodePair, text: string): ExpertiseModel {
  const id = keyString(pair.key);
  const line = lineOf(pair.key, text);
  const node = pair.value as Node | null;
  const kind = valueKind(node);
  if (!isMap(node)) {
    return {
      id,
      line,
      kind,
      validMap: false,
      preview: preview(node),
      label: '',
      labelKind: 'missing',
      description: [],
      descriptionKind: 'missing',
      valueType: 'boolean',
      valueTypeKind: 'missing',
      valueTypeKey: 'missing',
      defaultValue: 'false',
      defaultKind: 'missing',
      condition: buildCondition(null),
      action: buildAction(null),
      effect: buildEffect(null),
      extras: [],
    };
  }
  const valueTypeNode = node.get('value_type', true) as Node | undefined;
  const legacyNode = node.get('value-type', true) as Node | undefined;
  const valueType = scalarString(valueTypeNode) || (legacyNode ? 'boolean' : 'boolean');
  const defaultNode = node.get('default', true) as Node | undefined;
  const defaultMap = isMap(defaultNode) ? defaultNode : null;
  const defaultKind = valueKind(defaultNode);
  const descriptionNode = node.get('description', true) as Node | undefined;
  const descriptionKind = valueKind(descriptionNode);
  const description = isSeq(descriptionNode)
    ? descriptionNode.items.map((item) =>
        valueKind(item as Node) === 'string' ? scalarString(item as Node) : preview(item as Node),
      )
    : descriptionKind === 'string'
      ? [scalarString(descriptionNode)]
      : [];
  return {
    id,
    line,
    kind,
    validMap: true,
    preview: '',
    label: scalarString(node.get('label', true) as Node | undefined),
    labelKind: valueKind(node.get('label', true) as Node | undefined),
    description,
    descriptionKind,
    valueType,
    valueTypeKind: valueKind(valueTypeNode),
    valueTypeKey: valueTypeNode ? 'value_type' : legacyNode ? 'value-type' : 'missing',
    legacyValueType: legacyNode ? scalarString(legacyNode) : undefined,
    defaultValue: defaultMap ? scalarString(defaultMap.get('value', true) as Node | undefined) : 'false',
    defaultKind,
    condition: buildCondition(node.get('condition', true) as Node | undefined),
    action: buildAction(node.get('action', true) as Node | undefined),
    effect: buildEffect(node.get('effect', true) as Node | undefined),
    extras: extraFields(node, KNOWN_NODE_KEYS),
  };
}

function buildFocusCondition(node: Node | null | undefined): ConditionModel {
  return buildCondition(node);
}

export function buildFocusModel(
  doc: Document | null,
  text: string,
  path: string,
  parsed?: ParsedYaml,
): FocusFileModel {
  const focusId = focusIdFromPath(path);
  const fixed = isFixedFocusPath(path);
  const reference = isReferenceFocusPath(path);
  const base: FocusFileModel = {
    path,
    focusId,
    fixed,
    reference,
    loadable: fixed,
    kind: 'missing',
    label: '',
    labelKind: 'missing',
    description: [],
    descriptionKind: 'missing',
    idField: '',
    idKind: 'missing',
    condition: buildFocusCondition(null),
    expertiseKind: 'missing',
    expertises: [],
    extras: [],
    legacyNodeIds: [],
    duplicates: parsed?.duplicates ?? [],
    syntaxError: parsed?.syntaxError,
    text,
  };
  if (!doc) return base;
  const contents = doc.contents;
  base.kind = valueKind(contents);
  if (!isMap(contents)) return base;

  const expertiseNode = contents.get('expertise', true) as Node | undefined;
  const expertises = isMap(expertiseNode)
    ? mapEntries(expertiseNode).map((pair) => buildExpertise(pair, text))
    : [];
  const descriptionNode = contents.get('description', true) as Node | undefined;
  const descriptionKind = valueKind(descriptionNode);
  const description = isSeq(descriptionNode)
    ? descriptionNode.items.map((item) =>
        valueKind(item as Node) === 'string' ? scalarString(item as Node) : preview(item as Node),
      )
    : descriptionKind === 'string'
      ? [scalarString(descriptionNode)]
      : [];
  return {
    ...base,
    label: scalarString(contents.get('label', true) as Node | undefined),
    labelKind: valueKind(contents.get('label', true) as Node | undefined),
    description,
    descriptionKind,
    idField: scalarString(contents.get('id', true) as Node | undefined),
    idKind: valueKind(contents.get('id', true) as Node | undefined),
    condition: buildFocusCondition(contents.get('condition', true) as Node | undefined),
    expertiseKind: valueKind(expertiseNode),
    expertises,
    extras: extraFields(contents, KNOWN_FOCUS_KEYS),
    legacyNodeIds: expertises.filter((node) => node.valueTypeKey === 'value-type').map((node) => node.id),
  };
}

export function parseFocusFile(path: string, text: string): ParsedFocusFile {
  const parsed = parseYamlText(text);
  const doc = parsed.ok ? (parsed.doc ?? null) : null;
  return {
    parsed,
    doc,
    model: buildFocusModel(doc, parsed.normalizedText, path, parsed),
  };
}

export function serializeFocus(doc: Document): string {
  return stringifyYamlDocument(doc);
}

export function focusMap(doc: Document): YAMLMap | null {
  return isMap(doc.contents) ? doc.contents : null;
}

export function expertiseMap(doc: Document): YAMLMap | null {
  const top = focusMap(doc);
  if (!top) return null;
  const node = top.get('expertise', true) as Node | undefined;
  return node && isMap(node) ? node : null;
}

export function expertiseNode(doc: Document, id: string): YAMLMap | null {
  const map = expertiseMap(doc);
  if (!map) return null;
  const pair = findPair(map, id);
  return pair?.value && isMap(pair.value) ? pair.value : null;
}

function ensureTopMap(doc: Document): YAMLMap {
  if (isMap(doc.contents)) return doc.contents;
  const map = doc.createNode({});
  doc.contents = map;
  return map;
}

function ensureExpertiseMap(doc: Document): YAMLMap {
  const top = ensureTopMap(doc);
  const existing = top.get('expertise', true) as Node | undefined;
  if (isMap(existing)) return existing;
  const map = doc.createNode({});
  mapSet(top, 'expertise', map, doc);
  return map;
}

function ensureChildMap(doc: Document, owner: YAMLMap, key: string): YAMLMap | null {
  const existing = owner.get(key, true) as Node | undefined;
  if (isMap(existing)) return existing;
  if (existing) return null;
  const map = doc.createNode({});
  mapSet(owner, key, map, doc);
  return map;
}

function ownerConditionMap(doc: Document, ownerId: string | null): YAMLMap | null {
  if (ownerId === null) {
    const top = ensureTopMap(doc);
    return ensureChildMap(doc, top, 'condition');
  }
  const node = expertiseNode(doc, ownerId);
  if (!node) return null;
  return ensureChildMap(doc, node, 'condition');
}

export function setConditionEntry(
  doc: Document,
  ownerId: string | null,
  key: string,
  value: unknown,
): boolean {
  const map = ownerConditionMap(doc, ownerId);
  if (!map) return false;
  mapSet(map, key, value, doc);
  return true;
}

export function deleteConditionEntry(
  doc: Document,
  ownerId: string | null,
  key: string,
): boolean {
  const map = ownerConditionMap(doc, ownerId);
  if (!map) return false;
  const index = map.items.findIndex((pair) => keyString((pair as NodePair).key) === key);
  if (index < 0) return false;
  map.items.splice(index, 1);
  return true;
}

export function setFocusField(doc: Document, field: string, value: unknown): void {
  const top = ensureTopMap(doc);
  mapSet(top, field, value, doc);
}

export function setFocusDescription(doc: Document, lines: string[]): void {
  setFocusField(doc, 'description', lines);
}

export function setFocusId(doc: Document, id: string): void {
  setFocusField(doc, 'id', id);
}

function actionMap(doc: Document, nodeId: string): YAMLMap | null {
  const node = expertiseNode(doc, nodeId);
  if (!node) return null;
  return ensureChildMap(doc, node, 'action');
}

export function setActionEntry(
  doc: Document,
  nodeId: string,
  key: string,
  value: unknown,
): boolean {
  const map = actionMap(doc, nodeId);
  if (!map) return false;
  mapSet(map, key, value, doc);
  return true;
}

export function deleteActionEntry(doc: Document, nodeId: string, key: string): boolean {
  const node = expertiseNode(doc, nodeId);
  if (!node) return false;
  const existing = node.get('action', true) as Node | undefined;
  if (!existing || !isMap(existing)) return false;
  const index = existing.items.findIndex((pair) => keyString((pair as NodePair).key) === key);
  if (index < 0) return false;
  existing.items.splice(index, 1);
  return true;
}

function effectMapNode(doc: Document, nodeId: string): YAMLMap | null {
  const node = expertiseNode(doc, nodeId);
  if (!node) return null;
  return ensureChildMap(doc, node, 'effect');
}

function effectKindMap(doc: Document, nodeId: string, effectKey: string): YAMLMap | null {
  const effect = effectMapNode(doc, nodeId);
  if (!effect) return null;
  return ensureChildMap(doc, effect, effectKey);
}

export function setEffectGroupRows(
  doc: Document,
  nodeId: string,
  effectKey: string,
  entity: string,
  rows: string[],
): boolean {
  const map = effectKindMap(doc, nodeId, effectKey);
  if (!map) return false;
  const pair = findPair(map, entity);
  if (pair) {
    if (pair.value && !isSeq(pair.value)) return false;
    pair.value = doc.createNode(rows);
    return true;
  }
  mapSet(map, entity, rows, doc);
  return true;
}

export function addEffectGroup(
  doc: Document,
  nodeId: string,
  effectKey: string,
  entity: string,
): boolean {
  const map = effectKindMap(doc, nodeId, effectKey);
  if (!map || findPair(map, entity)) return false;
  mapSet(map, entity, [], doc);
  return true;
}

export function deleteEffectGroup(
  doc: Document,
  nodeId: string,
  effectKey: string,
  entity: string,
): boolean {
  const effect = effectMapNode(doc, nodeId);
  if (!effect) return false;
  const kindMap = effect.get(effectKey, true) as Node | undefined;
  if (!kindMap || !isMap(kindMap)) return false;
  const index = kindMap.items.findIndex((pair) => keyString((pair as NodePair).key) === entity);
  if (index < 0) return false;
  kindMap.items.splice(index, 1);
  return true;
}

export function renameEffectGroup(
  doc: Document,
  nodeId: string,
  effectKey: string,
  oldEntity: string,
  newEntity: string,
): boolean {
  if (oldEntity === newEntity) return false;
  const effect = effectMapNode(doc, nodeId);
  if (!effect) return false;
  const kindMap = effect.get(effectKey, true) as Node | undefined;
  if (!kindMap || !isMap(kindMap) || findPair(kindMap, newEntity)) return false;
  const pair = findPair(kindMap, oldEntity);
  if (!pair || !isScalar(pair.key)) return false;
  pair.key.value = newEntity;
  return true;
}

export function setNodeField(doc: Document, nodeId: string, field: string, value: unknown): boolean {
  const node = expertiseNode(doc, nodeId);
  if (!node) return false;
  mapSet(node, field, value, doc);
  return true;
}

export function setNodeDescription(doc: Document, nodeId: string, lines: string[]): boolean {
  return setNodeField(doc, nodeId, 'description', lines);
}

export function setNodeValueType(doc: Document, nodeId: string, type: string): boolean {
  const node = expertiseNode(doc, nodeId);
  if (!node) return false;
  mapSet(node, 'value_type', type, doc);
  node.delete('value-type');
  return true;
}

export function setNodeDefaultValue(doc: Document, nodeId: string, value: string): boolean {
  const node = expertiseNode(doc, nodeId);
  if (!node) return false;
  const map = ensureChildMap(doc, node, 'default');
  if (!map) return false;
  mapSet(map, 'value', value, doc);
  return true;
}

export function addExpertise(
  doc: Document,
  id: string,
  plain: Record<string, unknown>,
): boolean {
  const map = ensureExpertiseMap(doc);
  if (findPair(map, id)) return false;
  mapSet(map, id, plain, doc);
  return true;
}

export function deleteExpertise(doc: Document, id: string): boolean {
  const map = expertiseMap(doc);
  if (!map) return false;
  const index = map.items.findIndex((pair) => keyString((pair as NodePair).key) === id);
  if (index < 0) return false;
  map.items.splice(index, 1);
  return true;
}

export function renameExpertise(doc: Document, oldId: string, newId: string): boolean {
  const map = expertiseMap(doc);
  if (!map || oldId === newId || findPair(map, newId)) return false;
  const pair = findPair(map, oldId);
  if (!pair || !isScalar(pair.key)) return false;
  pair.key.value = newId;
  return true;
}

export function duplicateExpertise(doc: Document, sourceId: string, newId: string): boolean {
  const source = expertiseNode(doc, sourceId);
  const map = expertiseMap(doc);
  if (!source || !map || findPair(map, newId)) return false;
  const plain = structuredClone(source.toJSON());
  mapSet(map, newId, plain, doc);
  return true;
}

export function moveExpertise(doc: Document, from: number, to: number): boolean {
  const map = expertiseMap(doc);
  if (!map || from < 0 || to < 0 || from >= map.items.length || to >= map.items.length) return false;
  if (from === to) return false;
  const [item] = map.items.splice(from, 1);
  if (!item) return false;
  map.items.splice(to, 0, item);
  return true;
}

export function migrateLegacyValueType(doc: Document): number {
  const map = expertiseMap(doc);
  if (!map) return 0;
  let migrated = 0;
  for (const pair of mapEntries(map)) {
    const node = pair.value as Node | null;
    if (!node || !isMap(node)) continue;
    const legacy = node.get('value-type', true) as Node | undefined;
    if (!legacy) continue;
    if (!node.has('value_type')) mapSet(node, 'value_type', scalarString(legacy), doc);
    node.delete('value-type');
    migrated += 1;
  }
  return migrated;
}

export function defaultNodePlain(id: string): Record<string, unknown> {
  return {
    label: `New Expertise ${id}`,
    description: [],
    value_type: 'boolean',
    default: { value: 'false' },
    action: {},
    condition: {},
    effect: {},
  };
}

const FIXED_TEMPLATES: Record<string, string> = {
  none: `id: none
label: None
description:
  - 'No specific focus'
expertise:
  empty:
    label: 'Empty Expertise'
    description:
      - 'This expertise is empty and has no effect.'
    value_type: boolean
    default:
      value: 'false'
    action: {}
    condition: {}
    effect: {}
`,
  mob: `id: mob
label: Mob
description:
  - 'Focus on killing mobs'
condition:
  company_money: 0
expertise:
  new_expertise:
    label: 'New Expertise'
    description: []
    value_type: boolean
    default:
      value: 'false'
    action: {}
    condition: {}
    effect: {}
`,
};

export function createFixedFocusTemplate(id: string): Document | null {
  const template = FIXED_TEMPLATES[id];
  if (!template) return null;
  const parsed = parseYamlText(template);
  return parsed.ok ? (parsed.doc ?? null) : null;
}

export function isKnownConditionKey(key: string): boolean {
  return CONDITION_KEYS.includes(key);
}

export function isKnownActionKey(key: string): boolean {
  return ACTION_KEYS.includes(key.toLowerCase());
}

export function isKnownEffectKey(key: string): boolean {
  return EFFECT_KEYS.includes(key);
}

export function conditionMeta(key: string) {
  return conditionTypeMeta(key);
}

export function effectMeta(key: string) {
  return effectTypeMeta(key);
}

export function isFixedFocusId(id: string): boolean {
  return (FIXED_FOCUS_IDS as readonly string[]).includes(id);
}

export function titleForFocusId(id: string): string {
  return id === 'none' ? 'None' : id === 'mob' ? 'Mob' : id;
}
