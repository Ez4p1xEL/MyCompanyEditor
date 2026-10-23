<script setup lang="ts">
import { focusText as tx } from './focusConstants';
import type { ActionModel } from './focusDoc';
import { ACTION_TYPES } from './focusConstants';

const props = defineProps<{
  model: ActionModel;
  expertiseIds: string[];
}>();

const emit = defineEmits<{
  (event: 'set', key: string, value: unknown): void;
  (event: 'remove', key: string): void;
}>();

function listItems(key: string): string[] {
  if (key === 'console_command') return props.model.consoleCommands.items;
  if (key === 'enable_expertise') return props.model.enableExpertise.items;
  return props.model.disableExpertise.items;
}

function listKind(key: string): string {
  if (key === 'console_command') return props.model.consoleCommands.kind;
  if (key === 'enable_expertise') return props.model.enableExpertise.kind;
  return props.model.disableExpertise.kind;
}

function has(key: string): boolean {
  if (key === 'set_price_group') return Boolean(props.model.setPriceGroup);
  return listKind(key) !== 'missing';
}

function toggle(key: string, event: Event): void {
  if (!(event.target as HTMLInputElement).checked) {
    emit('remove', key);
    return;
  }
  if (key === 'set_price_group') emit('set', key, 'normal');
  else emit('set', key, []);
}

function setRow(key: string, index: number, event: Event): void {
  const items = [...listItems(key)];
  items[index] = (event.target as HTMLInputElement).value;
  emit('set', key, items);
}

function addRow(key: string): void {
  const defaults: Record<string, string> = {
    console_command: '',
    enable_expertise: props.expertiseIds[0] ?? '',
    disable_expertise: props.expertiseIds[0] ?? '',
  };
  emit('set', key, [...listItems(key), defaults[key] ?? '']);
}

function removeRow(key: string, index: number): void {
  const items = [...listItems(key)];
  items.splice(index, 1);
  emit('set', key, items);
}

function setPriceGroup(event: Event): void {
  emit('set', 'set_price_group', (event.target as HTMLInputElement).value);
}
</script>

<template>
  <div class="action-editor" data-editor="action">
    <p v-if="model.kind !== 'map' && model.kind !== 'missing'" class="inline-warning"> {{ tx("action 当前是") }} {{ model.kind }}{{ tx("，不是映射；编辑会重建为映射（原值会丢失）。") }} </p>
    <p v-if="model.hasNone" class="muted"> {{ tx("含") }} <code>none</code>{{ tx("：ActionType 枚举存在但没有执行分支，等于无效果（保留原样）。") }} </p>

    <div v-for="meta in ACTION_TYPES" :key="meta.value" class="action-row">
      <label class="condition-head">
        <input
          type="checkbox"
          :checked="has(meta.value)"
          :data-action-toggle="meta.value"
          @change="toggle(meta.value, $event)"
        />
        <span class="condition-name">{{ meta.label }}</span>
        <code class="condition-key">{{ meta.value }}</code>
      </label>
      <p class="hint">{{ meta.hint }}</p>

      <template v-if="has(meta.value)">
        <div v-if="meta.kind === 'stringList'" class="list-editor">
          <div v-for="(item, index) in listItems(meta.value)" :key="index" class="list-row">
            <input
              class="mc-input"
              :value="item"
              :data-action-input="`${meta.value}-${index}`"
              :placeholder="meta.value === 'console_command' ? tx('eco give %player% 500（不要前导 /）') : tx('专精 ID')"
              @input="setRow(meta.value, index, $event)"
            />
            <button class="mc-button tiny" type="button" @click="removeRow(meta.value, index)">{{ tx("删除") }}</button>
          </div>
          <button
            class="mc-button tiny"
            type="button"
            :data-action="`action-add-${meta.value}`"
            @click="addRow(meta.value)"
          > {{ tx("+ 添加一行") }} </button>
        </div>
        <input
          v-else
          class="mc-input"
          :value="model.setPriceGroup?.raw ?? ''"
          :data-action-input="meta.value"
          :placeholder="tx('例如 mob-company（非空字符串）')"
          @input="setPriceGroup"
        />
      </template>
    </div>

    <details v-if="model.unknown.length" class="extras">
      <summary>{{ tx("未识别 action 键") }} {{ model.unknown.length }} {{ tx("个（原样保留，插件跳过）") }}</summary>
      <ul>
        <li v-for="extra in model.unknown" :key="extra.key">
          <code>{{ extra.key }}</code>: {{ extra.preview }}
        </li>
      </ul>
    </details>
  </div>
</template>
