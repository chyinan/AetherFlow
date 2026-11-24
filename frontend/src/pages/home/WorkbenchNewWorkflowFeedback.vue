<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { homeMessages } from './homeMessages'
import type { WorkflowEntrySource } from './useWorkbenchWorkflowOpen'

defineProps<{
  source: WorkflowEntrySource
  phase: 'opening' | 'failed'
  showRetry: boolean
}>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n({ useScope: 'local', messages: homeMessages })
</script>

<template>
  <div data-new-workflow-feedback class="flex min-w-0 flex-wrap items-center gap-2 text-xs">
    <p v-if="phase === 'opening'" :id="`new-workflow-${source}-notice`" role="status" class="text-text-muted">{{ t('workflowOpening') }}</p>
    <p v-else :id="`new-workflow-${source}-notice`" role="alert" class="text-status-warning">{{ t('workflowOpenFailed') }}</p>
    <button v-if="showRetry" type="button" data-action="retry-new-workflow"
      :aria-disabled="phase === 'opening'" :aria-label="t('retryOpenWorkflow')"
      class="rounded border border-app-border bg-white px-2 py-1 font-medium text-primary aria-disabled:opacity-50"
      @click="phase === 'failed' && emit('retry')">{{ t('retry') }}</button>
  </div>
</template>
