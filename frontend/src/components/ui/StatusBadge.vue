<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { WorkflowNodeStatus } from '@/types/workflow'

const props = defineProps<{
  status: WorkflowNodeStatus | 'queued' | 'running' | 'success' | 'failed' | 'paused' | 'warning'
}>()

const { t } = useI18n()

const classes: Record<typeof props.status, string> = {
  idle: 'border-app-border bg-app-muted text-text-secondary',
  queued: 'border-status-paused/20 bg-slate-100 text-status-paused',
  running: 'border-status-running/20 bg-sky-50 text-status-running',
  success: 'border-status-success/20 bg-green-50 text-status-success',
  failed: 'border-status-error/20 bg-red-50 text-status-error',
  warning: 'border-status-warning/20 bg-amber-50 text-status-warning',
  skipped: 'border-app-border bg-app-muted text-text-muted',
  paused: 'border-status-paused/20 bg-slate-100 text-status-paused',
}

const statusLabels: Record<string, string> = {
  idle: 'status.idle',
  queued: 'status.queued',
  running: 'status.running',
  success: 'status.success',
  failed: 'status.failed',
  warning: 'status.warning',
  skipped: 'status.skipped',
  paused: 'status.paused',
}

const label = computed(() => {
  const key = statusLabels[props.status]
  return key ? t(key) : props.status
})
</script>

<template>
  <span class="inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium" :class="classes[status]">
    {{ label }}
  </span>
</template>
