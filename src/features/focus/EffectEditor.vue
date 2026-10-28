<script setup lang="ts">
import { focusText as tx } from './focusConstants';
import { computed, reactive } from 'vue';
import type { EffectGroupModel, EffectModel } from './focusDoc';
import type { EffectTypeMeta } from './catalog';
import {
  EFFECT_TYPES,
  composeChanceRow,
  composeDamageRow,
  composeDropRow,
  composeDurabilityRow,
  composeHasteRow,
  parseChanceRow,
  parseDamageRow,
  parseDropRow,
  parseDurabilityRow,
  parseHasteRow,
} from './focusConstants';
import type { EffectRowKind } from './catalog';
import {
  BLOCK_MATERIAL_NAMES,
  ENTITY_TYPE_NAMES,
  ITEM_MATERIAL_NAMES,
  MATERIAL_NAMES,
} from './data/minecraftEnums';

const props = defineProps<{ model: EffectModel }>();
const emit = defineEmits<{
  (event: 'setRows', effectKey: string, entity: string, rows: string[]): void;
  (event: 'addGroup', effectKey: string, entity: string): void;
  (event: 'deleteGroup', effectKey: string, entity: string): void;
  (event: 'renameGroup', effectKey: string, oldEntity: string, newEntity: string): void;
}>();

const ENTITY_CHOICES = ['ALL', ...[...ENTITY_TYPE_NAMES].sort()];
const BLOCK_CHOICES = ['ALL', ...[...BLOCK_MATERIAL_NAMES].sort()];
const ITEM_CHOICES = ['ALL', ...[...ITEM_MATERIAL_NAMES].sort()];
const ITEM_TYPE_CHOICES = ['ALL', 'pickaxe'];
const ITEM_TARGET_CHOICES = ['ALL', 'pickaxe', ...[...ITEM_MATERIAL_NAMES].sort()];

const LISTS = {
  entity: 'focus-effect-entity-options',
  block: 'focus-effect-block-options',
  item: 'focus-effect-item-options',
  itemType: 'focus-effect-item-type-options',
  itemTarget: 'focus-effect-item-target-options',
};

function groups(effectKey: string): EffectGroupModel[] {
  return props.model.byType?.[effectKey] ?? [];
}

function rowsOf(group: EffectGroupModel): string[] {
  return group.rows.map((row) => row.raw);
}

function setRows(effectKey: string, group: EffectGroupModel, rows: string[]): void {
  emit('setRows', effectKey, group.entity, rows);
}

const groupDrafts = reactive<Record<string, string>>({});
const groupErrors = reactive<Record<string, string>>({});

function normalizeGroup(kind: string, raw: string): string {
  const value = raw.trim();
  if (value.toLowerCase() === 'all') return 'ALL';
  const upper = value.toUpperCase();
  if (kind === 'item') return MATERIAL_NAMES.has(upper) ? upper : value.toLowerCase();
  return upper;
}

function choicesFor(kind: string): string[] {
  if (kind === 'block') return BLOCK_CHOICES;
  if (kind === 'item') return ITEM_TARGET_CHOICES;
  return ENTITY_CHOICES;
}

/** 空输入时给一个尚未占用的候选 key；已有 ALL 时不会再撞 key。 */
function addGroupCandidate(meta: EffectTypeMeta): string {
  const used = new Set(groups(meta.value).map((group) => group.entity));
  if (used.size === 0) return meta.defaultGroup;
  return choicesFor(meta.groupKind).find((choice) => !used.has(normalizeGroup(meta.groupKind, choice))) ?? meta.defaultGroup;
}

function addGroup(meta: EffectTypeMeta): void {
  const draft = (groupDrafts[meta.value] ?? '').trim();
  const entity = normalizeGroup(meta.groupKind, draft || addGroupCandidate(meta));
  if (groups(meta.value).some((group) => group.entity === entity)) {
    groupErrors[meta.value] = tx('该组 key 已存在，请换一个。');
    return;
  }
  groupErrors[meta.value] = '';
  groupDrafts[meta.value] = '';
  emit('addGroup', meta.value, entity);
}

function deleteGroup(effectKey: string, group: EffectGroupModel): void {
  emit('deleteGroup', effectKey, group.entity);
}

function renameGroup(metaGroupKind: string, effectKey: string, group: EffectGroupModel, event: Event): void {
  const raw = (event.target as HTMLInputElement).value.trim();
  if (!raw) return;
  const next = normalizeGroup(metaGroupKind, raw);
  if (next === group.entity) return;
  emit('renameGroup', effectKey, group.entity, next);
}

function addRow(effectKey: string, group: EffectGroupModel, defaultRow: string): void {
  setRows(effectKey, group, [...rowsOf(group), defaultRow]);
}

function removeRow(effectKey: string, group: EffectGroupModel, index: number): void {
  const rows = [...rowsOf(group)];
  rows.splice(index, 1);
  setRows(effectKey, group, rows);
}

function updateDrop(
  effectKey: string,
  group: EffectGroupModel,
  index: number,
  patch: { item?: string; sign?: '+' | '*'; amount?: string; chance?: string },
): void {
  const current = parseDropRow(rowsOf(group)[index] ?? '');
  const rows = [...rowsOf(group)];
  rows[index] = composeDropRow(
    patch.item ?? current.item,
    patch.sign ?? current.sign,
    patch.amount ?? current.amount,
    patch.chance ?? current.chance,
  );
  setRows(effectKey, group, rows);
}

function updateDamage(
  effectKey: string,
  group: EffectGroupModel,
  index: number,
  patch: { multiplier?: string; chance?: string },
): void {
  const current = parseDamageRow(rowsOf(group)[index] ?? '');
  const rows = [...rowsOf(group)];
  rows[index] = composeDamageRow(patch.multiplier ?? current.multiplier, patch.chance ?? current.chance);
  setRows(effectKey, group, rows);
}

function updateChance(effectKey: string, group: EffectGroupModel, index: number, chance: string): void {
  const rows = [...rowsOf(group)];
  rows[index] = composeChanceRow(chance);
  setRows(effectKey, group, rows);
}

function updateHaste(
  effectKey: string,
  group: EffectGroupModel,
  index: number,
  patch: { amplifier?: string; duration?: string; chance?: string },
): void {
  const current = parseHasteRow(rowsOf(group)[index] ?? '');
  const rows = [...rowsOf(group)];
  rows[index] = composeHasteRow(
    patch.amplifier ?? current.amplifier,
    patch.duration ?? current.duration,
    patch.chance ?? current.chance,
  );
  setRows(effectKey, group, rows);
}

function updateDurability(
  effectKey: string,
  group: EffectGroupModel,
  index: number,
  patch: { percentage?: string; chance?: string },
): void {
  const current = parseDurabilityRow(rowsOf(group)[index] ?? '');
  const rows = [...rowsOf(group)];
  rows[index] = composeDurabilityRow(
    patch.percentage ?? current.percentage,
    patch.chance ?? current.chance,
  );
  setRows(effectKey, group, rows);
}

const totalGroups = computed(() =>
  Object.values(props.model.byType ?? {}).reduce((total, list) => total + list.length, 0),
);

function groupLabel(kind: string): string {
  if (kind === 'block') return tx('方块（ALL 或方块 Material）');
  if (kind === 'item') return tx('目标（ALL、物品 Material 或 item-type）');
  return tx('实体（ALL 或 EntityType）');
}

function addGroupLabel(kind: string): string {
  if (kind === 'block') return tx('+ 添加方块组');
  if (kind === 'item') return tx('+ 添加目标组');
  return tx('+ 添加实体组');
}

function listIdFor(kind: string): string {
  if (kind === 'block') return LISTS.block;
  if (kind === 'item') return LISTS.itemTarget;
  return LISTS.entity;
}

function itemListIdFor(rowKind: EffectRowKind): string {
  return rowKind === 'drop' ? LISTS.item : LISTS.itemType;
}
</script>

<template>
  <div class="effect-editor" data-editor="effect">
    <p v-if="model.kind !== 'map' && model.kind !== 'missing'" class="inline-warning"> {{ tx("effect 当前是") }} {{ model.kind }}{{ tx("，不是映射；编辑会重建为映射（原值会丢失）。") }} </p>

    <section v-for="meta in EFFECT_TYPES" :key="meta.value" class="effect-type">
      <div class="effect-type-head">
        <code>{{ meta.value }}</code>
        <span class="hint">{{ meta.hint }}</span>
        <input
          class="mc-input effect-new-key"
          :value="groupDrafts[meta.value] ?? ''"
          :placeholder="addGroupCandidate(meta)"
          :data-effect-new-group="meta.value"
          @input="groupDrafts[meta.value] = ($event.target as HTMLInputElement).value; groupErrors[meta.value] = ''"
          @keydown.enter.prevent="addGroup(meta)"
        />
        <button
          class="mc-button tiny"
          type="button"
          :data-action="`effect-add-group-${meta.value}`"
          @click="addGroup(meta)"
        > {{ addGroupLabel(meta.groupKind) }} </button>
      </div>
      <p v-if="groupErrors[meta.value]" class="inline-warning">{{ groupErrors[meta.value] }}</p>

      <div
        v-for="group in groups(meta.value)"
        :key="group.entity"
        class="effect-group"
        :data-effect-group="`${meta.value}:${group.entity}`"
      >
        <div class="effect-group-head">
          <label class="field compact">
            <span class="field-label">{{ groupLabel(meta.groupKind) }}</span>
            <input
              class="mc-input"
              :list="listIdFor(meta.groupKind)"
              :value="group.entity"
              :data-effect-entity="meta.value"
              @change="renameGroup(meta.groupKind, meta.value, group, $event)"
            />
          </label>
          <button class="mc-button tiny danger" type="button" :data-action="`effect-delete-group-${meta.value}`" @click="deleteGroup(meta.value, group)"> {{ tx("删除此组") }} </button>
        </div>
        <p v-if="group.valueKind !== 'seq'" class="inline-warning"> {{ tx("该组值不是列表（") }}{{ group.valueKind }}{{ tx("），原样保留；修正为列表后才能编辑。") }} </p>
        <p v-else-if="group.rows.some((row) => !row.isString)" class="inline-warning"> {{ tx("组内含非字符串行，已原样保留；编辑前请先在 YAML 中修正。") }} </p>

        <template v-if="group.valueKind === 'seq'">
          <div class="effect-rows">
            <div v-for="(row, index) in group.rows" :key="index" class="effect-row">
              <template v-if="meta.rowKind === 'drop'">
                <input
                  class="mc-input item-input"
                  :list="itemListIdFor(meta.rowKind)"
                  :value="parseDropRow(row.raw).item"
                  :data-effect-field="`${meta.value}-item-${index}`"
                  :placeholder="tx('ITEM 或 ALL')"
                  @change="updateDrop(meta.value, group, index, { item: ($event.target as HTMLInputElement).value.trim().toUpperCase() })"
                />
                <select
                  class="mc-select sign-select"
                  :value="parseDropRow(row.raw).sign"
                  :data-effect-field="`${meta.value}-sign-${index}`"
                  @change="updateDrop(meta.value, group, index, { sign: ($event.target as HTMLSelectElement).value as '+' | '*' })"
                >
                  <option value="+">{{ tx("+ 加") }}</option>
                  <option value="*">{{ tx("* 乘") }}</option>
                </select>
                <input
                  class="mc-input number-input"
                  inputmode="numeric"
                  :value="parseDropRow(row.raw).amount"
                  :data-effect-field="`${meta.value}-amount-${index}`"
                  placeholder="N"
                  @input="updateDrop(meta.value, group, index, { amount: ($event.target as HTMLInputElement).value })"
                />
                <input
                  class="mc-input number-input"
                  inputmode="decimal"
                  :value="parseDropRow(row.raw).chance"
                  :data-effect-field="`${meta.value}-chance-${index}`"
                  placeholder="0-100"
                  @input="updateDrop(meta.value, group, index, { chance: ($event.target as HTMLInputElement).value })"
                />
              </template>
              <template v-else-if="meta.rowKind === 'damage'">
                <input
                  class="mc-input number-input"
                  inputmode="decimal"
                  :value="parseDamageRow(row.raw).multiplier"
                  :data-effect-field="`${meta.value}-multiplier-${index}`"
                  :placeholder="tx('倍率 >0')"
                  @input="updateDamage(meta.value, group, index, { multiplier: ($event.target as HTMLInputElement).value })"
                />
                <input
                  class="mc-input number-input"
                  inputmode="decimal"
                  :value="parseDamageRow(row.raw).chance"
                  :data-effect-field="`${meta.value}-chance-${index}`"
                  placeholder="0-100"
                  @input="updateDamage(meta.value, group, index, { chance: ($event.target as HTMLInputElement).value })"
                />
              </template>
              <template v-else-if="meta.rowKind === 'chance'">
                <input
                  class="mc-input number-input"
                  inputmode="decimal"
                  :value="parseChanceRow(row.raw).chance"
                  :data-effect-field="`${meta.value}-chance-${index}`"
                  placeholder="0-100"
                  @input="updateChance(meta.value, group, index, ($event.target as HTMLInputElement).value)"
                />
              </template>
              <template v-else-if="meta.rowKind === 'haste'">
                <input
                  class="mc-input number-input"
                  inputmode="numeric"
                  :value="parseHasteRow(row.raw).amplifier"
                  :data-effect-field="`${meta.value}-amplifier-${index}`"
                  placeholder="AMP 0+"
                  @input="updateHaste(meta.value, group, index, { amplifier: ($event.target as HTMLInputElement).value })"
                />
                <input
                  class="mc-input number-input"
                  inputmode="numeric"
                  :value="parseHasteRow(row.raw).duration"
                  :data-effect-field="`${meta.value}-duration-${index}`"
                  placeholder="ticks >0"
                  @input="updateHaste(meta.value, group, index, { duration: ($event.target as HTMLInputElement).value })"
                />
                <input
                  class="mc-input number-input"
                  inputmode="decimal"
                  :value="parseHasteRow(row.raw).chance"
                  :data-effect-field="`${meta.value}-chance-${index}`"
                  placeholder="0-100"
                  @input="updateHaste(meta.value, group, index, { chance: ($event.target as HTMLInputElement).value })"
                />
              </template>
              <template v-else-if="meta.rowKind === 'durability'">
                <input
                  class="mc-input number-input"
                  inputmode="decimal"
                  :value="parseDurabilityRow(row.raw).percentage"
                  :data-effect-field="`${meta.value}-percentage-${index}`"
                  :placeholder="tx('比例 0..1')"
                  @input="updateDurability(meta.value, group, index, { percentage: ($event.target as HTMLInputElement).value })"
                />
                <input
                  class="mc-input number-input"
                  inputmode="decimal"
                  :value="parseDurabilityRow(row.raw).chance"
                  :data-effect-field="`${meta.value}-chance-${index}`"
                  placeholder="0-100"
                  @input="updateDurability(meta.value, group, index, { chance: ($event.target as HTMLInputElement).value })"
                />
              </template>
              <code class="row-raw">{{ row.raw }}</code>
              <button class="mc-button tiny" type="button" @click="removeRow(meta.value, group, index)"> {{ tx("删除") }} </button>
            </div>
          </div>
          <button class="mc-button tiny" type="button" :data-action="`effect-add-row-${meta.value}`" @click="addRow(meta.value, group, meta.defaultRow)"> {{ tx("+ 添加参数行") }} </button>
        </template>
      </div>
      <p v-if="groups(meta.value).length === 0" class="muted">{{ tx("尚未配置此效果。") }}</p>
    </section>

    <p v-if="totalGroups === 0" class="muted">{{ tx("无效果；请按上方各效果的组 key 规则添加。") }}</p>

    <details v-if="model.unknown.length" class="extras">
      <summary>{{ tx("未识别/大小写错误 effect 键") }} {{ model.unknown.length }} {{ tx("个（原样保留，插件跳过）") }}</summary>
      <ul>
        <li v-for="extra in model.unknown" :key="extra.key">
          <code>{{ extra.key }}</code>: {{ extra.preview }}
        </li>
      </ul>
    </details>

    <datalist :id="LISTS.entity">
      <option v-for="entity in ENTITY_CHOICES" :key="entity" :value="entity" />
    </datalist>
    <datalist :id="LISTS.block">
      <option v-for="block in BLOCK_CHOICES" :key="block" :value="block" />
    </datalist>
    <datalist :id="LISTS.item">
      <option v-for="item in ITEM_CHOICES" :key="item" :value="item" />
    </datalist>
    <datalist :id="LISTS.itemType">
      <option v-for="itemType in ITEM_TYPE_CHOICES" :key="itemType" :value="itemType" />
    </datalist>
    <datalist :id="LISTS.itemTarget">
      <option v-for="item in ITEM_TARGET_CHOICES" :key="item" :value="item" />
    </datalist>
  </div>
</template>

<style scoped>
.effect-new-key {
  max-width: 170px;
}
</style>
