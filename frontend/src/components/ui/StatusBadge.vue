<script setup lang="ts">
import type { WorkflowNodeStatus } from '@/types/workflow'

const props = defineProps<{
  status: WorkflowNodeStatus | 'queued' | 'running' | 'success' | 'failed' | 'paused'
}>()

const classes: Record<typeof props.status, string> = {
  idle: 'border-app-border bg-app-muted text-text-secondary',
  queued: 'border-status-paused/20 bg-slate-100 text-status-paused',
  running: 'border-status-running/20 bg-sky-50 text-status-running',
  success: 'border-status-success/20 bg-green-50 text-status-success',
  failed: 'border-status-error/20 bg-red-50 text-status-error',
  skipped: 'border-app-border bg-app-muted text-text-muted',
  paused: 'border-status-paused/20 bg-slate-100 text-status-paused',
}
</script>

<template>
  <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium" :class="classes[status]">
    {{ status }}
  </span>
</template>
