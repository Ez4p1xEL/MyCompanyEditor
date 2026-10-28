<script setup lang="ts">
import { focusText as tx } from './focusConstants';
import { getLocale } from '../../i18n';
import type { ConditionModel } from './focusDoc';
import {
  CONDITION_TYPES,
  LOG_IDS,
  composeCompanyLogRow,
  parseCompanyLogRow,
} from './focusConstants';
import { BLOCK_MATERIAL_NAMES } from './data/minecraftEnums';

const BLOCK_OPTIONS = [...BLOCK_MATERIAL_NAMES].sort();

const props = defineProps<{
  model: ConditionModel;
  expertiseIds: string[];
  ownerLabel: string;
}>();

const emit = defineEmits<{
  (event: 'set', key: string, value: unknown): void;
  (event: 'remove', key: string): void;
}>();

function has(key: string): boolean {
  switch (key) {
    case 'company_money':
      return Boolean(props.model.companyMoney);
    case 'expertise':
      return Boolean(props.model.expertise);
    case 'expertises':
      return Boolean(props.model.expertises);
    case 'company_log':
      return Boolean(props.model.companyLog);
    default:
      return false;
  }
}

function toggle(key: string, event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  if (checked) {
    if (key === 'company_money') emit('set', key, 0);
    else if (key === 'expertises') emit('set', key, []);
    else if (key === 'company_log') emit('set', key, ['mob_kill_count,ZOMBIE,0']);
    else emit('set', key, '');
  } else {
    emit('remove', key);
  }
}

function setCompanyMoney(event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  const numeric = /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(raw.trim());
  emit('set', 'company_money', numeric ? Number(raw) : raw);
}

function setExpertise(event: Event): void {
  emit('set', 'expertise', (event.target as HTMLSelectElement).value);
}

function setOrGroup(index: number, event: Event): void {
  const items = [...(props.model.expertises?.items ?? [])];
  items[index] = (event.target as HTMLInputElement).value;
  emit('set', 'expertises', items);
}

function addOrGroup(): void {
  emit('set', 'expertises', [...(props.model.expertises?.items ?? []), props.expertiseIds[0] ?? '']);
}

function removeOrGroup(index: number): void {
  const items = [...(props.model.expertises?.items ?? [])];
  items.splice(index, 1);
  emit('set', 'expertises', items);
}

function logRow(index: number) {
  const raw = props.model.companyLog?.items[index] ?? '';
  return parseCompanyLogRow(raw);
}

function isBlockLog(index: number): boolean {
  return logRow(index).logId === 'block_break_count';
}

function logListId(index: number): string {
  return isBlockLog(index) ? 'focus-block-options' : 'focus-entity-options';
}

function logPlaceholder(index: number): string {
  return isBlockLog(index) ? tx('COAL_ORE（大写方块 Material）') : tx('ZOMBIE（大写枚举）');
}

function setLog(index: number, patch: { logId?: string; entity?: string; threshold?: string }): void {
  const current = logRow(index);
  const raw = composeCompanyLogRow(
    patch.logId ?? current.logId,
    patch.entity ?? current.entity,
    patch.threshold ?? current.threshold,
  );
  const items = [...(props.model.companyLog?.items ?? [])];
  items[index] = raw;
  emit('set', 'company_log', items);
}

function addLog(): void {
  emit('set', 'company_log', [...(props.model.companyLog?.items ?? []), 'mob_kill_count,ZOMBIE,0']);
}

function changeLogId(index: number, logId: string): void {
  const entity = logId === 'block_break_count' ? 'STONE' : 'ZOMBIE';
  setLog(index, { logId, entity });
}

function removeLog(index: number): void {
  const items = [...(props.model.companyLog?.items ?? [])];
  items.splice(index, 1);
  emit('set', 'company_log', items);
}
</script>

<template>
  <div class="condition-editor" data-editor="condition">
    <p v-if="model.kind !== 'map' && model.kind !== 'missing'" class="inline-warning"> {{ tx("condition 当前是") }} {{ model.kind }}{{ tx("，不是映射；编辑任意条件会重建为映射（原值会丢失，请先备份）。") }} </p>
    <p v-else-if="model.kind === 'missing'" class="muted"> {{ tx("condition 段缺失；勾选任意条件会自动创建。节点必须有 condition（可为") }} <code>{}</code>{{ getLocale() === 'en' ? ').' : '）。' }}
    </p>

    <div v-for="meta in CONDITION_TYPES" :key="meta.value" class="condition-row">
      <label class="condition-head">
        <input
          type="checkbox"
          :checked="has(meta.value)"
          :data-condition-toggle="meta.value"
          @change="toggle(meta.value, $event)"
        />
        <span class="condition-name">{{ meta.label }}</span>
        <code class="condition-key">{{ meta.value }}</code>
      </label>
      <p class="hint">{{ meta.hint }}</p>

      <template v-if="has(meta.value)">
        <input
          v-if="meta.kind === 'number'"
          class="mc-input"
          type="text"
          inputmode="decimal"
          :value="model.companyMoney?.raw ?? ''"
          :data-condition-input="meta.value"
          :aria-label="`${ownerLabel} company_money`"
          @input="setCompanyMoney"
        />
        <select
          v-else-if="meta.kind === 'expertise'"
          class="mc-select"
          :value="model.expertise?.raw ?? ''"
          :data-condition-input="meta.value"
          @change="setExpertise"
        >
          <option value="">{{ tx("（空，永远不满足）") }}</option>
          <option v-for="id in expertiseIds" :key="id" :value="id">{{ id }}</option>
        </select>
        <div v-else-if="meta.kind === 'expertises'" class="list-editor">
          <div v-for="(group, index) in model.expertises?.items ?? []" :key="index" class="list-row">
            <input
              class="mc-input"
              :value="group"
              :data-condition-input="`expertises-${index}`"
              :placeholder="tx('a,b 表示 a 或 b；多行之间是 AND')"
              @input="setOrGroup(index, $event)"
            />
            <button class="mc-button tiny" type="button" @click="removeOrGroup(index)">{{ tx("删除") }}</button>
          </div>
          <button class="mc-button tiny" type="button" data-action="condition-add-or" @click="addOrGroup"> {{ tx("+ 添加一组") }} </button>
        </div>
        <div v-else-if="meta.kind === 'logs'" class="list-editor">
          <div v-for="(_, index) in model.companyLog?.items ?? []" :key="index" class="log-row">
            <select
              class="mc-select"
              :value="logRow(index).logId"
              :data-condition-input="`company-log-id-${index}`"
              @change="changeLogId(index, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="logId in LOG_IDS" :key="logId" :value="logId">{{ logId }}</option>
            </select>
            <input
              class="mc-input entity-input"
              :list="logListId(index)"
              :value="logRow(index).entity"
              :data-condition-input="`company-log-entity-${index}`"
              :placeholder="logPlaceholder(index)"
              @input="setLog(index, { entity: ($event.target as HTMLInputElement).value })"
            />
            <input
              class="mc-input number-input"
              inputmode="numeric"
              :value="logRow(index).threshold"
              :data-condition-input="`company-log-threshold-${index}`"
              @input="setLog(index, { threshold: ($event.target as HTMLInputElement).value })"
            />
            <button class="mc-button tiny" type="button" @click="removeLog(index)">{{ tx("删除") }}</button>
          </div>
          <button class="mc-button tiny" type="button" data-action="condition-add-log" @click="addLog"> {{ tx("+ 添加计数条件") }} </button>
        </div>
      </template>
    </div>

    <details v-if="model.unknown.length" class="extras">
      <summary>{{ tx("未识别条件键") }} {{ model.unknown.length }} {{ tx("个（原样保留，插件忽略）") }}</summary>
      <ul>
        <li v-for="extra in model.unknown" :key="extra.key">
          <code>{{ extra.key }}</code>: {{ extra.preview }}
        </li>
      </ul>
    </details>

    <datalist id="focus-block-options">
      <option v-for="block in BLOCK_OPTIONS" :key="block" :value="block" />
    </datalist>
  </div>
</template>
