<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { PreflightIssue } from '@/utils/workflowPreflight'
import { preflightMessages } from './preflightMessages'
defineProps<{ issues: PreflightIssue[] }>()
defineEmits<{ locate: [issue: PreflightIssue]; close: [] }>()
const { t } = useI18n({ useScope: 'local', messages: preflightMessages })
</script>
<template>
  <section data-testid="workflow-preflight" class="max-h-80 overflow-auto border-b border-app-border bg-white p-4" :aria-label="t('title')">
    <div class="flex items-center justify-between gap-3"><h2 class="font-semibold">{{ t('title') }}</h2><button type="button" class="text-sm text-primary" @click="$emit('close')">{{ t('close') }}</button></div>
    <p class="mt-1 text-xs text-text-muted">{{ t('hint') }}</p>
    <p v-if="!issues.some((issue) => issue.level === 'blocking')" class="mt-2 text-sm">{{ t('none') }}</p>
    <div v-for="level in (['blocking', 'warning', 'unknown'] as const)" :key="level" class="mt-3">
      <h3 class="text-sm font-semibold">{{ t(level) }} ({{ issues.filter((issue) => issue.level === level).length }})</h3>
      <ul class="mt-1 space-y-1"><li v-for="issue in issues.filter((item) => item.level === level)" :key="issue.id" class="rounded border border-app-border p-2 text-xs" :data-level="issue.level">
        <button v-if="issue.nodeId" type="button" class="mr-2 text-primary underline" :aria-label="`${t('locate')}: ${issue.nodeLabel} ${issue.field ?? ''}`" @click="$emit('locate', issue)">{{ issue.nodeLabel }} · {{ issue.field }}</button>
        {{ t(issue.code) }}<span v-if="issue.detail" class="break-words">: {{ issue.detail }}</span>
      </li></ul>
    </div>
  </section>
</template>
