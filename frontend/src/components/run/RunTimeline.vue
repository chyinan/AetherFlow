<script setup lang="ts">
import { Clock3 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

import StatusBadge from '@/components/ui/StatusBadge.vue'
import type { RunNodeState } from '@/types/run'

defineProps<{
  nodes: RunNodeState[]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-app-border bg-white p-4 shadow-sm">
    <div class="mb-4 flex items-center gap-2">
      <Clock3 class="h-4 w-4 text-primary" />
      <p class="text-sm font-semibold text-text-primary">{{ t('workflow.nodeExecution') }}</p>
    </div>
    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
      <div v-for="node in nodes" :key="node.nodeId" class="flex items-center gap-3">
        <span class="h-2.5 w-2.5 rounded-full bg-primary" />
        <div class="min-w-0 flex-1 rounded-md border border-app-border bg-app-bg2 px-3 py-2">
          <div class="flex items-center justify-between gap-2">
            <p class="truncate text-sm font-medium text-text-primary">{{ node.label }}</p>
            <StatusBadge :status="node.status" />
          </div>
          <p class="mt-1 text-xs text-text-muted">{{ node.durationMs ? `${node.durationMs}ms` : t('workflow.waiting') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
