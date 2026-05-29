<script setup lang="ts">
import { PanelRightClose, Play } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useRunStore } from '@/stores/runStore'

const runStore = useRunStore()
const visibleLogs = computed(() => runStore.logs.slice(-24))
const { t } = useI18n()
const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-sidebar text-text-inverse">
    <div class="flex h-12 items-center justify-between border-b border-white/10 px-4">
      <div class="flex items-center gap-3">
        <Play class="h-4 w-4 text-primary" />
        <span class="text-sm font-semibold">{{ t('workflow.runConsole') }}</span>
        <StatusBadge v-if="runStore.currentRun" :status="runStore.currentRun.status" />
      </div>
      <button type="button" class="grid h-8 w-8 place-items-center rounded text-slate-300 hover:bg-sidebar-soft" :title="t('common.close')" @click="emit('close')">
        <PanelRightClose class="h-4 w-4" />
      </button>
    </div>

    <div class="border-b border-white/10 p-4">
      <p class="text-xs text-slate-400">{{ t('workflow.currentRun') }}</p>
      <p class="mt-1 truncate text-sm font-semibold">{{ runStore.currentRun?.id ?? t('workflow.noRunSelected') }}</p>
      <p class="mt-2 text-xs text-slate-400">{{ runStore.currentRun?.workflowName ?? t('workflow.loadRunHint') }}</p>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-xs leading-6">
      <p v-if="runStore.logsLoading" class="rounded bg-white/5 px-2 py-1 text-slate-400">
        {{ t('runs.loading') }}
      </p>
      <p v-else-if="visibleLogs.length === 0" class="rounded bg-white/5 px-2 py-1 text-slate-400">
        {{ t('runs.noLogs') }}
      </p>
      <div
        v-for="log in visibleLogs"
        :key="log.id"
        class="grid grid-cols-[64px_44px_minmax(0,1fr)] gap-2 rounded px-2 py-1.5 text-slate-300 hover:bg-white/5"
      >
        <span class="text-slate-500">{{ log.time }}</span>
        <span class="text-primary">{{ log.level }}</span>
        <span class="break-words">{{ log.message }}</span>
      </div>
    </div>
  </section>
</template>
