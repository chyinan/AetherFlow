<script setup lang="ts">
import { Activity, AlertTriangle, ArrowRight, Boxes, Clock3, ListChecks, RadioTower, RefreshCw } from 'lucide-vue-next'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import LogStream from '@/components/run/LogStream.vue'
import RunTimeline from '@/components/run/RunTimeline.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useRunStore } from '@/stores/runStore'

const runStore = useRunStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const summaryCards = computed(() => [
  { label: t('runs.running'), value: runStore.statusCounts.running, hint: t('runs.runningHint'), icon: RadioTower },
  { label: t('runs.queued'), value: runStore.statusCounts.queued, hint: t('runs.queuedHint'), icon: Clock3 },
  { label: t('runs.succeeded'), value: runStore.statusCounts.success, hint: t('runs.succeededHint'), icon: ListChecks },
  { label: t('runs.failed'), value: runStore.statusCounts.failed, hint: t('runs.failedHint'), icon: Activity },
])

async function syncRunFromRoute(runId?: string | string[]) {
  const id = Array.isArray(runId) ? runId[0] : runId
  if (id) {
    await runStore.selectRun(id)
    return
  }
  await runStore.loadRuns()
  if (runStore.currentRun) {
    await router.replace({ name: 'run-detail', params: { id: runStore.currentRun.id } })
  }
}

onMounted(async () => {
  await syncRunFromRoute(route.params.id)
})

watch(
  () => route.params.id,
  async (runId) => {
    await syncRunFromRoute(runId)
  },
)

function openRunWorkflow() {
  if (runStore.currentRun) {
    void router.push(`/workflows/${runStore.currentRun.workflowId}`)
  }
}

function selectRun(runId: string) {
  void router.push(`/runs/${runId}`)
}

function refreshRuns() {
  void runStore.refreshRuns()
}
</script>

<template>
  <section class="grid h-full grid-rows-[56px_minmax(0,1fr)]">
    <header class="flex items-center justify-between border-b border-app-border bg-white px-5">
      <div class="flex items-center gap-2">
        <Activity class="h-4 w-4 text-primary" />
        <div>
          <p class="text-sm font-semibold text-text-primary">{{ t('runs.title') }}</p>
          <p class="text-xs text-text-muted">{{ t('runs.subtitle') }}</p>
        </div>
      </div>
      <button
        class="inline-flex items-center gap-2 rounded-md border border-app-border bg-white px-3 py-2 text-sm text-text-secondary transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="runStore.loading"
        @click="refreshRuns"
      >
        <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': runStore.loading }" />
        {{ runStore.loading ? t('runs.loading') : t('runs.refresh') }}
      </button>
    </header>

    <main class="min-h-0 overflow-hidden bg-app-bg px-4 py-5 sm:px-5 lg:px-6">
      <div class="grid h-full min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-4">
        <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article v-for="card in summaryCards" :key="card.label" class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
            <div class="flex items-center gap-2 text-text-muted">
              <component :is="card.icon" class="h-4 w-4" />
              <span class="text-xs font-medium">{{ card.label }}</span>
            </div>
            <p class="mt-3 text-2xl font-semibold text-text-primary">{{ card.value }}</p>
            <p class="mt-1 text-xs text-text-muted">{{ card.hint }}</p>
          </article>
        </section>

        <section v-if="runStore.error" class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex min-w-0 items-start gap-2">
              <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0" />
              <div class="min-w-0">
                <p class="font-semibold">{{ t('runs.loadErrorTitle') }}</p>
                <p class="mt-1 break-words text-xs">{{ runStore.error }}</p>
              </div>
            </div>
            <button
              class="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="runStore.loading"
              @click="refreshRuns"
            >
              <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': runStore.loading }" />
              {{ t('runs.retryLoad') }}
            </button>
          </div>
        </section>

        <section class="grid min-h-0 min-w-0 gap-4 overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside class="min-h-0 min-w-0 overflow-y-auto rounded-lg border border-app-border bg-white p-3 shadow-sm">
            <div class="mb-3 flex items-center justify-between px-1">
              <p class="text-sm font-semibold text-text-primary">{{ t('runs.runQueue') }}</p>
              <span class="rounded-md bg-app-muted px-2 py-1 text-xs text-text-secondary">{{ runStore.runs.length }}</span>
            </div>
            <button
              v-for="run in runStore.runs"
              :key="run.id"
              type="button"
              class="mb-2 w-full rounded-lg border p-3 text-left transition hover:border-primary/30 hover:bg-primary-soft/40"
              :class="runStore.currentRun?.id === run.id ? 'border-primary/50 bg-primary-soft/40 ring-1 ring-primary/20' : 'border-app-border bg-white'"
              @click="selectRun(run.id)"
            >
              <div class="flex items-center justify-between gap-2">
                <p class="truncate text-sm font-semibold text-text-primary">{{ run.id }}</p>
                <StatusBadge :status="run.status" />
              </div>
              <p class="mt-2 truncate text-xs text-text-secondary">{{ run.workflowName }}</p>
              <div class="mt-2 h-1.5 rounded-full bg-app-muted">
                <div class="h-1.5 rounded-full bg-primary" :style="{ width: `${run.progress}%` }" />
              </div>
              <p class="mt-2 text-xs text-text-muted">{{ run.startedAt }} · {{ run.artifactCount }} {{ t('runs.artifacts') }}</p>
            </button>
            <p v-if="runStore.runs.length === 0 && !runStore.loading" class="rounded-md border border-dashed border-app-border p-4 text-sm text-text-muted">
              {{ t('runs.noRuns') }}
            </p>
          </aside>

          <div class="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden">
            <div v-if="runStore.currentRun" class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
              <div class="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="text-sm font-semibold text-text-primary">{{ runStore.currentRun.workflowName }}</p>
                    <StatusBadge :status="runStore.currentRun.status" />
                  </div>
                  <p class="mt-1 text-xs text-text-muted">{{ runStore.currentRun.id }} · {{ runStore.currentRun.durationMs }}ms · {{ runStore.currentRun.owner }}</p>
                </div>
                <button class="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-app-border px-3 py-2 text-sm text-primary" @click="openRunWorkflow">
                  {{ t('runs.openWorkflow') }}
                  <ArrowRight class="h-4 w-4" />
                </button>
              </div>

              <div class="mt-4 grid gap-3 md:grid-cols-4">
                <div class="rounded-md bg-app-bg2 p-3">
                  <p class="text-xs text-text-muted">{{ t('runs.progress') }}</p>
                  <p class="mt-1 text-sm font-semibold text-text-primary">{{ runStore.currentRunProgress }}%</p>
                </div>
                <div class="rounded-md bg-app-bg2 p-3">
                  <p class="text-xs text-text-muted">{{ t('runs.trigger') }}</p>
                  <p class="mt-1 text-sm font-semibold text-text-primary">{{ t(`runs.triggers.${runStore.currentRun.trigger}`) }}</p>
                </div>
                <div class="rounded-md bg-app-bg2 p-3">
                  <p class="text-xs text-text-muted">{{ t('runs.queueName') }}</p>
                  <p class="mt-1 truncate text-sm font-semibold text-text-primary">{{ runStore.currentRun.queueName }}</p>
                </div>
                <div class="rounded-md bg-app-bg2 p-3">
                  <p class="text-xs text-text-muted">{{ t('runs.traceId') }}</p>
                  <p class="mt-1 truncate text-sm font-semibold text-text-primary">{{ runStore.currentRun.traceId }}</p>
                </div>
              </div>

              <div class="mt-3 flex flex-wrap gap-2">
                <span v-for="artifact in runStore.currentRun.artifactNames" :key="artifact" class="inline-flex items-center gap-1 rounded-md border border-app-border bg-white px-2 py-1 text-xs text-text-secondary">
                  <Boxes class="h-3 w-3 text-primary" />
                  {{ artifact }}
                </span>
              </div>
            </div>
            <div class="grid min-h-0 min-w-0 gap-4 overflow-hidden lg:grid-cols-[minmax(260px,360px)_minmax(0,1fr)]">
              <RunTimeline class="min-h-0 min-w-0" :nodes="runStore.currentRun?.nodeStates ?? []" />
              <LogStream class="min-h-0 min-w-0" :logs="runStore.logs" />
            </div>
          </div>
        </section>
      </div>
    </main>
  </section>
</template>
