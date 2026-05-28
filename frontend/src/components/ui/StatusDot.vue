<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  tone: 'online' | 'degraded' | 'offline' | 'running' | 'success' | 'warning' | 'error' | 'paused'
  label?: string
}>()

const { t } = useI18n()

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

const labelKeys: Record<string, string> = {
  active: 'status.active',
  configured: 'status.configured',
  connected: 'status.connected',
  degraded: 'status.degraded',
  failed: 'status.failed',
  idle: 'status.idle',
  invited: 'status.invited',
  missing: 'status.missing',
  offline: 'status.offline',
  online: 'status.online',
  paused: 'status.paused',
  queued: 'status.queued',
  rotating: 'status.rotating',
  running: 'status.running',
  skipped: 'status.skipped',
  success: 'status.success',
  warning: 'status.warning',
  error: 'status.error',
  disabled: 'status.disabled',
}

const displayLabel = computed(() => {
  if (!props.label) {
    return ''
  }
  const key = labelKeys[props.label]
  return key ? t(key) : props.label
})
</script>

<template>
  <span class="inline-flex items-center gap-2 text-xs text-text-secondary">
    <span class="h-2 w-2 rounded-full" :class="toneClass[tone]" />
    <span v-if="displayLabel">{{ displayLabel }}</span>
  </span>
</template>
