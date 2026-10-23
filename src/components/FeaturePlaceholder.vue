<script setup lang="ts">
defineProps<{
  featureId: string;
  title: string;
  icon: string;
}>();
</script>

<template>
  <section class="feature-placeholder">
    <div class="placeholder-icon" aria-hidden="true">{{ icon }}</div>
    <h2>{{ title }} · 功能占位</h2>
    <p class="placeholder-lead">
      该功能模块尚未接入。当前任务只交付工程骨架、YAML 导入/导出与校验框架。
    </p>
    <p class="placeholder-contract">
      后续任务新增
      <code>src/features/{{ featureId }}/index.ts</code>
      （默认导出 <code>{ id, title, icon, component }</code>，component 使用
      <code>() =&gt; import('./XxxEditor.vue')</code>）后，本页会自动显示对应编辑器。
    </p>
    <p class="muted">不需要修改 App.vue、registry.ts 或 core/store。</p>
  </section>
</template>
