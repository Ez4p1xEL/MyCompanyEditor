<script setup lang="ts">
import { computed } from 'vue';
import type { ValidationIssue } from '../core/types';
import { useI18n } from '../i18n';

const props = defineProps<{
  issues: ValidationIssue[];
  emptyText?: string;
}>();

const { t } = useI18n();
const displayEmpty = computed(() => props.emptyText ?? t('shell.issue.empty'));

function severityText(severity: ValidationIssue['severity']): string {
  if (severity === 'error') return t('shell.issue.severityError');
  if (severity === 'warning') return t('shell.issue.severityWarning');
  return t('shell.issue.severityInfo');
}
</script>

<template>
  <div class="issue-list">
    <p v-if="issues.length === 0" class="issue-empty">{{ displayEmpty }}</p>
    <ul v-else>
      <li
        v-for="(issue, index) in issues"
        :key="`${issue.code ?? 'issue'}-${issue.file}-${issue.line ?? 0}-${index}`"
        class="issue-item"
        :class="`issue-${issue.severity}`"
      >
        <span class="issue-severity">{{ severityText(issue.severity) }}</span>
        <div class="issue-body">
          <p class="issue-message">{{ issue.message }}</p>
          <p class="issue-meta">
            <code v-if="issue.code">{{ issue.code }}</code>
            <span>{{ issue.file || t('shell.issue.project') }}</span>
            <span v-if="issue.path">· {{ issue.path }}</span>
            <span v-if="issue.line">
              · <template v-if="issue.column">{{ t('shell.issue.lineColumn', { line: issue.line, column: issue.column }) }}</template><template v-else>{{ t('shell.issue.line', { line: issue.line }) }}</template>
            </span>
          </p>
          <p v-if="issue.fixHint" class="issue-fix">{{ t('shell.issue.fix', { hint: issue.fixHint }) }}</p>
        </div>
      </li>
    </ul>
  </div>
</template>
