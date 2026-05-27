<script setup lang="ts">
import { ChevronDown, ChevronUp, Play } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useRunStore } from '@/stores/runStore'

const runStore = useRunStore()
const collapsed = ref(false)
const visibleLogs = computed(() => runStore.logs.slice(-8))
</script>

<template>
  <section class="border-t border-app-border bg-sidebar text-text-inverse">
    <div class="flex h-10 items-center justify-between px-4">
      <div class="flex items-center gap-3">
        <Play class="h-4 w-4 text-primary" />
        <span class="text-sm font-semibold">Run Console</span>
        <StatusBadge v-if="runStore.currentRun" :status="runStore.currentRun.status" />
      </div>
      <button type="button" class="grid h-7 w-7 place-items-center rounded text-slate-300 hover:bg-sidebar-soft" @click="collapsed = !collapsed">
        <ChevronDown v-if="collapsed" class="h-4 w-4" />
        <ChevronUp v-else class="h-4 w-4" />
      </button>
    </div>
    <div v-if="!collapsed" class="grid max-h-44 grid-cols-[220px_minmax(0,1fr)] border-t border-white/10">
      <div class="border-r border-white/10 p-3">
        <p class="text-xs text-slate-400">Current run</p>
        <p class="mt-1 truncate text-sm font-medium">{{ runStore.currentRun?.id ?? 'No run selected' }}</p>
        <p class="mt-2 text-xs text-slate-400">{{ runStore.currentRun?.workflowName ?? 'Load a run to stream logs' }}</p>
      </div>
      <div class="min-h-0 overflow-y-auto p-3 font-mono text-xs leading-6">
        <p v-for="log in visibleLogs" :key="log.id" class="text-slate-300">
          <span class="text-slate-500">{{ log.time }}</span>
          <span class="mx-2 text-primary">{{ log.level }}</span>
          <span>{{ log.message }}</span>
        </p>
      </div>
    </div>
  </section>
</template>
