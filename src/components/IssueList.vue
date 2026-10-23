<script setup lang="ts">
import type { ValidationIssue } from '../core/types';
import { severityLabel } from '../core/format';

withDefaults(
  defineProps<{
    issues: ValidationIssue[];
    emptyText?: string;
  }>(),
  { emptyText: '没有发现问题' },
);
</script>

<template>
  <div class="issue-list">
    <p v-if="issues.length === 0" class="issue-empty">{{ emptyText }}</p>
    <ul v-else>
      <li
        v-for="(issue, index) in issues"
        :key="`${issue.code ?? 'issue'}-${issue.file}-${issue.line ?? 0}-${index}`"
        class="issue-item"
        :class="`issue-${issue.severity}`"
      >
        <span class="issue-severity">{{ severityLabel(issue.severity) }}</span>
        <div class="issue-body">
          <p class="issue-message">{{ issue.message }}</p>
          <p class="issue-meta">
            <code v-if="issue.code">{{ issue.code }}</code>
            <span>{{ issue.file || '（项目）' }}</span>
            <span v-if="issue.path">· {{ issue.path }}</span>
            <span v-if="issue.line">· 第 {{ issue.line }} 行<template v-if="issue.column">，第 {{ issue.column }} 列</template></span>
          </p>
          <p v-if="issue.fixHint" class="issue-fix">修复建议：{{ issue.fixHint }}</p>
        </div>
      </li>
    </ul>
  </div>
</template>
