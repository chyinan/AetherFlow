<script setup lang="ts">
const props = defineProps<{
  tone: 'online' | 'degraded' | 'offline' | 'running' | 'success' | 'warning' | 'error' | 'paused'
  label?: string
}>()

const toneClass: Record<typeof props.tone, string> = {
  online: 'bg-status-success',
  degraded: 'bg-status-warning',
  offline: 'bg-status-paused',
  running: 'bg-status-running',
  success: 'bg-status-success',
  warning: 'bg-status-warning',
  error: 'bg-status-error',
  paused: 'bg-status-paused',
}
</script>

<template>
  <span class="inline-flex items-center gap-2 text-xs text-text-secondary">
    <span class="h-2 w-2 rounded-full" :class="toneClass[tone]" />
    <span v-if="label">{{ label }}</span>
  </span>
</template>
