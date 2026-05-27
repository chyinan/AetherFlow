<script setup lang="ts">
import { Activity, ArrowRight } from 'lucide-vue-next'
import { onMounted } from 'vue'

import LogStream from '@/components/run/LogStream.vue'
import RunTimeline from '@/components/run/RunTimeline.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useRunStore } from '@/stores/runStore'

const runStore = useRunStore()

onMounted(async () => {
  await runStore.loadRuns()
  runStore.subscribeCurrentRun()
})
</script>

<template>
  <section class="grid h-full grid-rows-[56px_minmax(0,1fr)]">
    <header class="flex items-center justify-between border-b border-app-border bg-white px-5">
      <div class="flex items-center gap-2">
        <Activity class="h-4 w-4 text-primary" />
        <div>
          <p class="text-sm font-semibold text-text-primary">Runs</p>
          <p class="text-xs text-text-muted">Realtime execution observability with mock stream.</p>
        </div>
      </div>
    </header>

    <div class="grid min-h-0 grid-cols-[300px_minmax(0,1fr)_420px] gap-4 overflow-hidden p-4">
      <aside class="min-h-0 overflow-y-auto rounded-lg border border-app-border bg-white p-3 shadow-sm">
        <button
          v-for="run in runStore.runs"
          :key="run.id"
          type="button"
          class="mb-2 w-full rounded-lg border p-3 text-left transition hover:border-primary/30 hover:bg-primary-soft/40"
          :class="runStore.currentRun?.id === run.id ? 'border-primary/40 bg-primary-soft/60' : 'border-app-border bg-white'"
          @click="runStore.selectRun(run.id)"
        >
          <div class="flex items-center justify-between gap-2">
            <p class="truncate text-sm font-semibold text-text-primary">{{ run.id }}</p>
            <StatusBadge :status="run.status" />
          </div>
          <p class="mt-2 text-xs text-text-secondary">{{ run.workflowName }}</p>
          <p class="mt-1 text-xs text-text-muted">{{ run.startedAt }} · {{ run.artifactCount }} artifacts</p>
        </button>
      </aside>

      <main class="min-h-0 overflow-y-auto">
        <div v-if="runStore.currentRun" class="mb-4 rounded-lg border border-app-border bg-white p-4 shadow-sm">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-semibold text-text-primary">{{ runStore.currentRun.workflowName }}</p>
              <p class="mt-1 text-xs text-text-muted">{{ runStore.currentRun.id }} · {{ runStore.currentRun.durationMs }}ms</p>
            </div>
            <button class="inline-flex items-center gap-2 rounded-md border border-app-border px-3 py-2 text-sm text-primary">
              Open workflow
              <ArrowRight class="h-4 w-4" />
            </button>
          </div>
        </div>
        <RunTimeline :nodes="runStore.currentRun?.nodeStates ?? []" />
      </main>

      <LogStream :logs="runStore.logs" />
    </div>
  </section>
</template>
