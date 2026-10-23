<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '../i18n';

const props = defineProps<{
  featureId: string;
  title: string;
  icon: string;
}>();

const { t } = useI18n();
const displayTitle = computed(() => {
  const key = `shell.nav.${props.featureId}`;
  const translated = t(key);
  return translated === key ? props.title : translated;
});
</script>

<template>
  <section class="feature-placeholder">
    <div class="placeholder-icon" aria-hidden="true">{{ icon }}</div>
    <h2>{{ displayTitle }} · {{ t('shell.placeholder.titleSuffix') }}</h2>
    <p class="placeholder-lead">{{ t('shell.placeholder.lead') }}</p>
    <p class="placeholder-contract">
      {{ t('shell.placeholder.contractPrefix') }}
      <code>src/features/{{ featureId }}/index.ts</code>
      {{ t('shell.placeholder.contractMiddle') }}
    </p>
    <p class="muted">{{ t('shell.placeholder.noChanges') }}</p>
  </section>
</template>
