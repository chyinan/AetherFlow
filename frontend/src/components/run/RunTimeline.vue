<script setup lang="ts">
import { Clock3 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

import StatusBadge from '@/components/ui/StatusBadge.vue'
import type { RunNodeState } from '@/types/run'

defineProps<{
  nodes: RunNodeState[]
  canRerun?: boolean
}>()

const emit = defineEmits<{ rerun: [node: RunNodeState] }>()

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
          <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
            <span v-if="node.reused" class="text-primary">{{ t('runs.rerunReused') }}</span>
            <span v-else>{{ node.durationMs ? `${node.durationMs}ms` : t('workflow.waiting') }}</span>
            <span v-if="node.retryCount !== undefined">{{ t('runs.retry') }} {{ node.retryCount }}</span>
          </div>
          <button v-if="canRerun && node.status === 'failed' && !node.nodeId.includes('/')" type="button" class="mt-2 rounded border border-primary/30 px-2 py-1 text-xs text-primary" @click="emit('rerun', node)">
            {{ t('runs.rerunNode') }}
          </button>
          <p v-if="canRerun && node.status === 'failed' && node.nodeId.includes('/')" class="mt-2 text-xs text-text-muted">请从所属循环根节点重跑，提交前会显示失效范围</p>
          <p v-if="node.output" class="mt-2 truncate rounded bg-white px-2 py-1 text-xs text-text-secondary">
            {{ node.output }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
