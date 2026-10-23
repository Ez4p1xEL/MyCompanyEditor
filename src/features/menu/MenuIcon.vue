<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { checkMaterial, materialIconUrl, materialPlaceholderColor } from './menuConstants';

const props = withDefaults(
  defineProps<{
    material: string;
    size?: number;
    showText?: boolean;
  }>(),
  { size: 36, showText: false },
);

const failed = ref(false);
const check = computed(() => checkMaterial(props.material));
const url = computed(() => materialIconUrl(props.material));
const color = computed(() => materialPlaceholderColor(props.material));
const label = computed(() => {
  const raw = props.material.trim();
  if (!raw) return '?';
  if (raw.startsWith('PLAYER_HEAD')) return 'HEAD';
  const base = raw.replace(/^minecraft:/i, '').split(';')[0] ?? raw;
  const parts = base.split('_').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 3);
  return parts
    .slice(0, 2)
    .map((part) => part.slice(0, 1))
    .join('');
});

watch(
  () => props.material,
  () => {
    failed.value = false;
  },
);
</script>

<template>
  <span
    class="menu-icon"
    :style="{ width: `${size}px`, height: `${size}px`, background: color }"
    :title="material"
  >
    <img
      v-if="url && !failed"
      class="menu-icon-img"
      :src="url"
      :alt="material"
      loading="lazy"
      referrerpolicy="no-referrer"
      @error="failed = true"
    />
    <span v-else-if="check.kind === 'air'" class="menu-icon-air" aria-hidden="true" />
    <span v-else class="menu-icon-fallback" :style="{ fontSize: `${Math.max(9, Math.round(size / 3))}px` }">
      {{ label }}
    </span>
    <span v-if="showText" class="menu-icon-text">{{ material }}</span>
  </span>
</template>

<style>
.menu-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 2px;
  overflow: hidden;
  flex: 0 0 auto;
  image-rendering: pixelated;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35);
}
.menu-icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}
.menu-icon-fallback {
  color: #fff;
  font-family: var(--mono);
  font-weight: 700;
  text-shadow: 0 1px 0 #000;
  line-height: 1;
}
.menu-icon-air {
  width: 60%;
  height: 60%;
  border: 1px dashed rgba(255, 255, 255, 0.35);
}
</style>
