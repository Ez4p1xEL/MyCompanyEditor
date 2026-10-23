<script setup lang="ts">
import { computed } from 'vue';
import type { EffectGroupModel, EffectModel } from './focusDoc';
import {
  EFFECT_TYPES,
  composeDamageRow,
  composeDropRow,
  parseDamageRow,
  parseDropRow,
} from './focusConstants';
import { ENTITY_TYPE_NAMES, MATERIAL_NAMES } from './data/minecraftEnums';

const props = defineProps<{ model: EffectModel }>();
const emit = defineEmits<{
  (event: 'setRows', effectKey: string, entity: string, rows: string[]): void;
  (event: 'addGroup', effectKey: string, entity: string): void;
  (event: 'deleteGroup', effectKey: string, entity: string): void;
  (event: 'renameGroup', effectKey: string, oldEntity: string, newEntity: string): void;
}>();

const MATERIAL_OPTIONS = [...MATERIAL_NAMES].sort();
const ENTITY_OPTIONS = [...ENTITY_TYPE_NAMES].sort();
const ENTITY_CHOICES = ['ALL', ...ENTITY_OPTIONS];

const dropEntityListId = 'focus-drop-entity-options';
const materialListId = 'focus-material-options';
const damageEntityListId = 'focus-damage-entity-options';

function groups(effectKey: string): EffectGroupModel[] {
  return effectKey === 'mob_drops_add' ? props.model.drops : props.model.damage;
}

function rowsOf(group: EffectGroupModel): string[] {
  return group.rows.map((row) => row.raw);
}

function setRows(effectKey: string, group: EffectGroupModel, rows: string[]): void {
  emit('setRows', effectKey, group.entity, rows);
}

function addGroup(effectKey: string): void {
  emit('addGroup', effectKey, 'ALL');
}

function deleteGroup(effectKey: string, group: EffectGroupModel): void {
  emit('deleteGroup', effectKey, group.entity);
}

function renameGroup(effectKey: string, group: EffectGroupModel, event: Event): void {
  const value = (event.target as HTMLInputElement).value.trim().toUpperCase();
  if (!value || value === group.entity) return;
  emit('renameGroup', effectKey, group.entity, value);
}

function addRow(effectKey: string, group: EffectGroupModel): void {
  const row = effectKey === 'mob_drops_add' ? 'STONE,+1,100' : '1.0,100';
  setRows(effectKey, group, [...rowsOf(group), row]);
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
  const item = patch.item ?? current.item;
  const sign = patch.sign ?? current.sign;
  const amount = patch.amount ?? current.amount;
  const chance = patch.chance ?? current.chance;
  const rows = [...rowsOf(group)];
  rows[index] = composeDropRow(item, sign, amount, chance);
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

const totalGroups = computed(() => props.model.drops.length + props.model.damage.length);
</script>

<template>
  <div class="effect-editor" data-editor="effect">
    <p v-if="model.kind !== 'map' && model.kind !== 'missing'" class="inline-warning">
      effect 当前是 {{ model.kind }}，不是映射；编辑会重建为映射（原值会丢失）。
    </p>

    <section v-for="meta in EFFECT_TYPES" :key="meta.value" class="effect-type">
      <div class="effect-type-head">
        <code>{{ meta.value }}</code>
        <span class="hint">{{ meta.hint }}</span>
        <button
          class="mc-button tiny"
          type="button"
          :data-action="`effect-add-group-${meta.value}`"
          @click="addGroup(meta.value)"
        >
          + 添加实体组
        </button>
      </div>

      <div
        v-for="group in groups(meta.value)"
        :key="group.entity"
        class="effect-group"
        :data-effect-group="`${meta.value}:${group.entity}`"
      >
        <div class="effect-group-head">
          <label class="field compact">
            <span class="field-label">实体（ALL 或 EntityType）</span>
            <input
              class="mc-input"
              :list="meta.kind === 'drops' ? dropEntityListId : damageEntityListId"
              :value="group.entity"
              :data-effect-entity="meta.value"
              @change="renameGroup(meta.value, group, $event)"
            />
          </label>
          <button class="mc-button tiny danger" type="button" @click="deleteGroup(meta.value, group)">
            删除此组
          </button>
        </div>
        <p v-if="group.valueKind !== 'seq'" class="inline-warning">
          该实体值不是列表（{{ group.valueKind }}），原样保留；修正为列表后才能编辑。
        </p>
        <p v-else-if="group.rows.some((row) => !row.isString)" class="inline-warning">
          组内含非字符串行，已原样保留；编辑前请先在 YAML 中修正。
        </p>

        <template v-if="group.valueKind === 'seq'">
          <div class="effect-rows">
            <div v-for="(row, index) in group.rows" :key="index" class="effect-row">
              <template v-if="meta.kind === 'drops'">
                <input
                  class="mc-input item-input"
                  :list="materialListId"
                  :value="parseDropRow(row.raw).item"
                  :data-effect-field="`${meta.value}-item-${index}`"
                  placeholder="ITEM 或 ALL"
                  @change="updateDrop(meta.value, group, index, { item: ($event.target as HTMLInputElement).value.trim().toUpperCase() })"
                />
                <select
                  class="mc-select sign-select"
                  :value="parseDropRow(row.raw).sign"
                  :data-effect-field="`${meta.value}-sign-${index}`"
                  @change="updateDrop(meta.value, group, index, { sign: ($event.target as HTMLSelectElement).value as '+' | '*' })"
                >
                  <option value="+">+ 加</option>
                  <option value="*">* 乘</option>
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
              <template v-else>
                <input
                  class="mc-input number-input"
                  inputmode="decimal"
                  :value="parseDamageRow(row.raw).multiplier"
                  :data-effect-field="`${meta.value}-multiplier-${index}`"
                  placeholder="倍率 >0"
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
              <code class="row-raw">{{ row.raw }}</code>
              <button class="mc-button tiny" type="button" @click="removeRow(meta.value, group, index)">
                删除
              </button>
            </div>
          </div>
          <button class="mc-button tiny" type="button" :data-action="`effect-add-row-${meta.value}`" @click="addRow(meta.value, group)">
            + 添加参数行
          </button>
        </template>
      </div>
      <p v-if="groups(meta.value).length === 0" class="muted">尚未配置此效果。</p>
    </section>

    <p v-if="totalGroups === 0" class="muted">无效果；可添加实体组（ALL 或具体 EntityType）。</p>

    <details v-if="model.unknown.length" class="extras">
      <summary>未识别/大小写错误 effect 键 {{ model.unknown.length }} 个（原样保留，插件跳过）</summary>
      <ul>
        <li v-for="extra in model.unknown" :key="extra.key">
          <code>{{ extra.key }}</code>：{{ extra.preview }}
        </li>
      </ul>
    </details>

    <datalist :id="dropEntityListId">
      <option v-for="entity in ENTITY_CHOICES" :key="entity" :value="entity" />
    </datalist>
    <datalist :id="damageEntityListId">
      <option v-for="entity in ENTITY_CHOICES" :key="entity" :value="entity" />
    </datalist>
    <datalist :id="materialListId">
      <option v-for="material in MATERIAL_OPTIONS" :key="material" :value="material" />
    </datalist>
  </div>
</template>
