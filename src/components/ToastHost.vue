<script setup lang="ts">
import { useToasts, dismissToast } from '../core/toast';
import { useI18n } from '../i18n';

const toasts = useToasts();
const { t } = useI18n();
</script>

<template>
  <div class="toast-host" aria-live="polite">
    <div
      v-for="toast in toasts.items"
      :key="toast.id"
      class="toast"
      :class="`toast-${toast.tone}`"
      role="status"
    >
      <span class="toast-message">{{ toast.message }}</span>
      <button class="toast-close" :aria-label="t('shell.toast.close')" @click="dismissToast(toast.id)">×</button>
    </div>
  </div>
</template>
