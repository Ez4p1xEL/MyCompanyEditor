<script setup lang="ts">
import { ordersText as tx } from './ordersConstants';
import { computed } from 'vue';
import { renderColorSegments } from './ordersConstants';

const props = defineProps<{ text: string }>();

const segments = computed(() => renderColorSegments(props.text || tx('（空）')));
</script>

<template>
  <span class="color-preview" data-testid="color-preview">
    <span
      v-for="(segment, index) in segments"
      :key="index"
      :class="{ obfuscated: segment.obfuscated }"
      :style="{
        color: segment.color ?? undefined,
        fontWeight: segment.bold ? 700 : undefined,
        fontStyle: segment.italic ? 'italic' : undefined,
        textDecoration:
          [segment.underline ? 'underline' : '', segment.strike ? 'line-through' : '']
            .filter(Boolean)
            .join(' ') || undefined,
      }"
      >{{ segment.text }}</span
    >
  </span>
</template>

<style scoped>
.color-preview {
  display: inline-block;
  padding: 4px 9px;
  background: #0b100a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-family: var(--mc-mono);
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.obfuscated {
  opacity: 0.85;
  filter: blur(0.4px);
}
</style>
