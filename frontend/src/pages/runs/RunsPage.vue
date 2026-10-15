<script setup lang="ts">
import { Activity, AlertTriangle, ArrowRight, Boxes, CircleStop, Clock3, ListChecks, RadioTower, RefreshCw } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { toApiError } from '@/api/client/apiError'
import type { RuntimeExecutionSnapshot } from '@/api/modules/runtime'
import HumanApprovalDialog, { type HumanApprovalRequestView } from '@/components/run/HumanApprovalDialog.vue'
import LogStream from '@/components/run/LogStream.vue'
import RunTimeline from '@/components/run/RunTimeline.vue'
import SubworkflowChildRuns from '@/components/run/SubworkflowChildRuns.vue'
import FailedNodeRerunDialog from '@/components/run/FailedNodeRerunDialog.vue'
import type { RunNodeState } from '@/types/run'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useRunStore } from '@/stores/runStore'
import { runHistoryMessages } from './runHistoryMessages'
import { directRunId, matchesRunHistorySearch, readRunHistoryQuery, runHistoryPageSizes, runHistoryStatuses } from './runHistoryQuery'

const runStore = useRunStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { t: historyText } = useI18n({ useScope: 'local', messages: runHistoryMessages })
const filters = computed(() => readRunHistoryQuery(route.query))
const searchDraft = ref(filters.value.q)
const workflowDraft = ref(filters.value.workflowId)
const statusDraft = ref(filters.value.status)
const directIdDraft = ref('')
const directIdError = ref(false)
const historyKey = computed(() => JSON.stringify([filters.value.workflowId, filters.value.status, filters.value.page, filters.value.pageSize]))
const visibleRuns = computed(() => runStore.historyRuns.filter(run => matchesRunHistorySearch(run, filters.value.q)))
const pageCount = computed(() => Math.max(1, Math.ceil(runStore.historyTotal / filters.value.pageSize)))
const selectedRouteId = computed(() => Array.isArray(route.params.id) ? route.params.id[0] : route.params.id)
const selectedDetailReady = computed(() => !selectedRouteId.value || selectedRouteId.value === runStore.currentRun?.id)
const selectedOutsidePage = computed(() => selectedDetailReady.value && runStore.currentRun && !runStore.historyLoading && !runStore.historyError
  && !visibleRuns.value.some(run => run.id === runStore.currentRun?.id))
let historyRequest: Promise<void> | undefined
let routeGeneration = 0
let active = true

function requestHistoryPage() {
  historyRequest = runStore.loadHistoryPage({ workflowId: filters.value.workflowId || undefined, status: filters.value.status || undefined, page: filters.value.page, pageSize: filters.value.pageSize })
  return historyRequest
}

function updateFilters(patch: Record<string, string | number | undefined>) {
  const query = { ...route.query }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === '') delete query[key]
    else query[key] = String(value)
  }
  void router.push({ path: route.path, query })
}

function applyFilters() {
  updateFilters({ q: searchDraft.value.trim(), workflowId: workflowDraft.value.trim(), status: statusDraft.value, page: 1 })
}

function clearFilters() {
  updateFilters({ q: undefined, workflowId: undefined, status: undefined, page: 1 })
}

function openRunById() {
  const id = directRunId(directIdDraft.value)
  directIdError.value = !id
  if (id) selectRun(id)
}

watch(filters, value => {
  searchDraft.value = value.q
  workflowDraft.value = value.workflowId
  statusDraft.value = value.status
})
const dismissedApprovalKey = ref<string | null>(null)
const cancellingRunIds = ref(new Set<string>())
const cancellationErrors = ref<Record<string, string>>({})
const cancelling = computed(() => Boolean(runStore.currentRun && cancellingRunIds.value.has(runStore.currentRun.id)))
const cancellationError = computed(() => {
  const run = runStore.currentRun
  // 节点局部推断终态不能确认取消结果，只有后端权威终态才能隐藏提示。
  return run && !['SUCCESS', 'FAILED', 'CANCELLED'].includes(run.backendStatus ?? '')
    ? cancellationErrors.value[run.id] : undefined
})
const rerunNode = ref<RunNodeState | null>(null)
const canRerun = computed(() => selectedDetailReady.value && runStore.currentRun?.backendStatus === 'FAILED' && Boolean(runStore.currentRun?.backendInstanceId))

async function completeRerun(instanceId: number) {
  rerunNode.value = null
  await router.push({ name: 'run-detail', params: { id: `run-${instanceId}` }, query: route.query })
}


type HumanApprovalCompletion = {
  approved: boolean
  snapshot: RuntimeExecutionSnapshot
}

const canCancelCurrentRun = computed(() => selectedDetailReady.value && ['queued', 'running', 'paused'].includes(runStore.currentRun?.status ?? ''))

async function cancelCurrentRun() {
  const runId = runStore.currentRun?.id
  if (!runId || cancelling.value || !canCancelCurrentRun.value) {
    return
  }
  cancellingRunIds.value.add(runId)
  delete cancellationErrors.value[runId]
  try {
    await runStore.cancelCurrentRun()
  } catch (error) {
    // 取消响应失败不代表后端没有执行；错误与等待状态都只属于发起请求的运行。
    const apiError = toApiError(error, 'workflow')
    const status = apiError.status ? `HTTP ${apiError.status}: ` : ''
    cancellationErrors.value[runId] = `${status}${apiError.message}`
  } finally {
    cancellingRunIds.value.delete(runId)
  }
}

const approvalDialogRequest = computed<HumanApprovalRequestView | null>(() => {
  if (!selectedDetailReady.value) return null
  const run = runStore.currentRun
  const pendingNode = run?.nodeStates.find((node) => node.approval?.approvalStatus === 'pending')
  const instanceId = run?.backendInstanceId ?? (run?.runtimeWorkflowId ? Number(run.runtimeWorkflowId) : undefined)
  if (!run || !pendingNode?.approval || !instanceId || !Number.isInteger(instanceId) || instanceId <= 0) {
    return null
  }

  const key = `${run.id}:${pendingNode.nodeId}`
  if (dismissedApprovalKey.value === key) {
    return null
  }
  return {
    instanceId,
    nodeId: pendingNode.nodeId,
    nodeLabel: pendingNode.label,
    details: pendingNode.approval,
  }
})

const historyStatusCounts = computed(() => runStore.historyRuns.reduce((counts, run) => {
  counts[run.status] = (counts[run.status] ?? 0) + 1
  return counts
}, {} as Record<string, number>))
const summaryCards = computed(() => [
  { label: t('runs.running'), value: historyStatusCounts.value.running ?? 0, hint: t('runs.runningHint'), icon: RadioTower },
  { label: t('runs.queued'), value: historyStatusCounts.value.queued ?? 0, hint: t('runs.queuedHint'), icon: Clock3 },
  { label: t('runs.succeeded'), value: historyStatusCounts.value.success ?? 0, hint: t('runs.succeededHint'), icon: ListChecks },
  { label: t('runs.failed'), value: historyStatusCounts.value.failed ?? 0, hint: t('runs.failedHint'), icon: Activity },
])

async function syncRunFromRoute(runId: string | undefined, ready?: Promise<void>, refreshLogs = false) {
  const generation = ++routeGeneration
  dismissedApprovalKey.value = null
  rerunNode.value = null
  if (runId) {
    await runStore.selectRun(runId, { skipList: true, historyReady: ready, refreshLogs })
    return
  }
  await ready
  if (!active || generation !== routeGeneration || runStore.historyLoading || runStore.historyError) return
  const firstRun = visibleRuns.value[0]
  if (firstRun) {
    await router.replace({ name: 'run-detail', params: { id: firstRun.id }, query: route.query })
  } else {
    runStore.clearCurrentRun()
  }
}

watch(
  () => [selectedRouteId.value, historyKey.value] as const,
  ([runId, key], previous) => {
    const changedPage = !previous || previous[1] !== key
    if (changedPage) requestHistoryPage()
    // 切换筛选只更新列表，不重置独立的深链详情或运行订阅。
    if (!previous || previous[0] !== runId || !runId) {
      void syncRunFromRoute(runId, runStore.historyLoading ? historyRequest : undefined)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  active = false
  routeGeneration += 1
  runStore.historyRequestId += 1
  runStore.selectionRequestId += 1
  runStore.historyLoading = false
  runStore.loading = false
  runStore.logsLoading = false
})

function openRunWorkflow() {
  if (runStore.currentRun) {
    void router.push(`/workflows/${runStore.currentRun.workflowId}`)
  }
}

function selectRun(runId: string) {
  void router.push({ name: 'run-detail', params: { id: runId }, query: route.query })
}

function retryHistoryPage() {
  const ready = requestHistoryPage()
  if (!selectedRouteId.value) void syncRunFromRoute(undefined, ready)
}

function refreshRuns() {
  dismissedApprovalKey.value = null
  void syncRunFromRoute(selectedRouteId.value, requestHistoryPage(), true)
}

function dismissApproval() {
  const run = runStore.currentRun
  const pendingNode = run?.nodeStates.find((node) => node.approval?.approvalStatus === 'pending')
  if (run && pendingNode) {
    dismissedApprovalKey.value = `${run.id}:${pendingNode.nodeId}`
  }
}

async function completeApproval({ approved, snapshot }: HumanApprovalCompletion) {
  const pendingNode = runStore.currentRun?.nodeStates.find((node) => node.approval?.approvalStatus === 'pending')
  if (!pendingNode) {
    return
  }

  runStore.applyHumanApprovalSnapshot({
    nodeId: pendingNode.nodeId,
    approved,
    snapshot,
  })
  dismissedApprovalKey.value = null
  await runStore.recoverCurrentRunRuntime()
}

watch(
  () => runStore.currentRun?.id,
  () => {
    dismissedApprovalKey.value = null
  },
)
</script>

<template>
  <section class="grid h-full grid-rows-[56px_minmax(0,1fr)]">
    <FailedNodeRerunDialog
      v-if="rerunNode && canRerun && runStore.currentRun?.backendInstanceId"
      :instance-id="runStore.currentRun.backendInstanceId"
      :node-id="rerunNode.nodeId"
      :node-label="rerunNode.label"
      @close="rerunNode = null"
      @completed="completeRerun"
    />
    <HumanApprovalDialog
      v-if="approvalDialogRequest"
      :request="approvalDialogRequest"
      @close="dismissApproval"
      @completed="completeApproval"
    />
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
        :disabled="runStore.loading || runStore.historyLoading"
        @click="refreshRuns"
      >
        <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': runStore.loading || runStore.historyLoading }" />
        {{ runStore.loading || runStore.historyLoading ? t('runs.loading') : t('runs.refresh') }}
      </button>
    </header>

    <main class="min-h-0 overflow-hidden bg-app-bg px-4 py-5 sm:px-5 lg:px-6">
      <div class="grid h-full min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-4">
        <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-4" :aria-label="historyText('scope')">
          <article v-for="card in summaryCards" :key="card.label" class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
            <div class="flex items-center gap-2 text-text-muted">
              <component :is="card.icon" class="h-4 w-4" />
              <span class="text-xs font-medium">{{ card.label }}</span>
            </div>
            <p class="mt-3 text-2xl font-semibold text-text-primary">{{ runStore.historyLoading || runStore.historyError ? '—' : card.value }}</p>
            <p class="mt-1 text-xs text-text-muted">{{ historyText('scope') }}</p>
          </article>
        </section>

        <section v-if="runStore.error || runStore.historyError" class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex min-w-0 items-start gap-2">
              <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0" />
              <div class="min-w-0">
                <p class="font-semibold">{{ t('runs.loadErrorTitle') }}</p>
                <p class="mt-1 break-words text-xs">{{ runStore.error || runStore.historyError }}</p>
              </div>
            </div>
            <button
              class="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="runStore.loading || runStore.historyLoading"
              @click="refreshRuns"
            >
              <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': runStore.loading || runStore.historyLoading }" />
              {{ t('runs.retryLoad') }}
            </button>
          </div>
        </section>

        <section class="grid min-h-0 min-w-0 gap-4 overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside class="min-h-0 min-w-0 overflow-y-auto rounded-lg border border-app-border bg-white p-3 shadow-sm">
            <div class="mb-3 flex items-center justify-between px-1">
              <p class="text-sm font-semibold text-text-primary">{{ t('runs.runQueue') }}</p>
              <span class="rounded-md bg-app-muted px-2 py-1 text-xs text-text-secondary">{{ runStore.historyLoading || runStore.historyError ? '—' : visibleRuns.length }}</span>
            </div>
            <form class="mb-3 space-y-2 border-b border-app-border pb-3" data-testid="history-filters" @submit.prevent="applyFilters">
              <label class="block text-xs text-text-secondary">{{ historyText('search') }}
                <input v-model="searchDraft" data-testid="history-search" type="search" class="mt-1 w-full rounded border border-app-border px-2 py-1.5 text-sm" />
              </label>
              <p class="text-xs text-text-muted">{{ historyText('searchHint') }}</p>
              <label class="block text-xs text-text-secondary">{{ historyText('workflow') }}
                <input v-model="workflowDraft" data-testid="history-workflow" type="text" :placeholder="historyText('workflowHint')" class="mt-1 w-full rounded border border-app-border px-2 py-1.5 text-sm" />
              </label>
              <label class="block text-xs text-text-secondary">{{ historyText('status') }}
                <select v-model="statusDraft" data-testid="history-status" class="mt-1 w-full rounded border border-app-border px-2 py-1.5 text-sm">
                  <option value="">{{ historyText('all') }}</option>
                  <option v-for="status in runHistoryStatuses" :key="status" :value="status">{{ status }}</option>
                </select>
              </label>
              <div class="flex flex-wrap gap-2">
                <button type="submit" class="rounded bg-primary px-2 py-1.5 text-xs text-white">{{ historyText('apply') }}</button>
                <button type="button" data-testid="history-clear" class="rounded border border-app-border px-2 py-1.5 text-xs" @click="clearFilters">{{ historyText('clear') }}</button>
              </div>
            </form>
            <form class="mb-3 space-y-2 border-b border-app-border pb-3" data-testid="history-open-id" @submit.prevent="openRunById">
              <label class="block text-xs text-text-secondary">{{ historyText('openId') }}
                <input v-model="directIdDraft" data-testid="history-direct-id" type="text" :placeholder="historyText('idHint')" :aria-invalid="directIdError" class="mt-1 w-full rounded border border-app-border px-2 py-1.5 text-sm" @input="directIdError = false" />
              </label>
              <p v-if="directIdError" role="alert" class="text-xs text-status-error">{{ historyText('invalidId') }}</p>
              <button type="submit" class="rounded border border-app-border px-2 py-1.5 text-xs">{{ historyText('open') }}</button>
            </form>
            <button
              v-for="run in (!runStore.historyLoading && !runStore.historyError ? visibleRuns : [])"
              :key="run.id"
              data-testid="history-run"
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
            <p v-if="runStore.historyLoading" role="status" data-testid="history-loading" class="py-4 text-sm text-text-muted">{{ historyText('loading') }}</p>
            <div v-else-if="runStore.historyError" role="alert" data-testid="history-error" class="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p>{{ historyText('error') }}</p>
              <button type="button" class="mt-2 underline" @click="retryHistoryPage">{{ historyText('retry') }}</button>
            </div>
            <div v-else-if="visibleRuns.length === 0" data-testid="history-empty" class="rounded-md border border-dashed border-app-border p-4 text-sm text-text-muted">
              <p>{{ filters.page > pageCount ? historyText('stale') : filters.q ? historyText('noMatch') : historyText('empty') }}</p>
              <button v-if="filters.page > 1" type="button" class="mt-2 text-primary underline" @click="updateFilters({ page: 1 })">{{ historyText('first') }}</button>
            </div>
            <nav :aria-label="historyText('page', { page: filters.page, pages: pageCount, total: runStore.historyTotal })" class="mt-3 space-y-2 border-t border-app-border pt-3">
              <p v-if="!runStore.historyLoading && !runStore.historyError" data-testid="history-page" class="text-xs text-text-muted">{{ historyText('page', { page: filters.page, pages: pageCount, total: runStore.historyTotal }) }}</p>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <button type="button" data-testid="history-previous" class="rounded border border-app-border px-2 py-1 text-xs disabled:opacity-40" :disabled="runStore.historyLoading || filters.page <= 1" @click="updateFilters({ page: filters.page - 1 })">{{ historyText('previous') }}</button>
                <button type="button" data-testid="history-next" class="rounded border border-app-border px-2 py-1 text-xs disabled:opacity-40" :disabled="runStore.historyLoading || Boolean(runStore.historyError) || filters.page >= pageCount" @click="updateFilters({ page: filters.page + 1 })">{{ historyText('next') }}</button>
              </div>
              <label class="flex items-center justify-between text-xs text-text-muted">
                {{ historyText('size') }}
                <select data-testid="history-page-size" class="rounded border border-app-border p-1" :value="filters.pageSize" @change="updateFilters({ pageSize: Number(($event.target as HTMLSelectElement).value), page: 1 })">
                  <option v-for="size in runHistoryPageSizes" :key="size" :value="size">{{ size }}</option>
                </select>
              </label>
            </nav>
          </aside>

          <div class="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden">
            <p v-if="!selectedDetailReady" role="status" class="p-4 text-sm text-text-muted">{{ runStore.error ? t('runs.loadErrorTitle') : historyText('detailLoading') }}</p>
            <div v-if="runStore.currentRun && selectedDetailReady" class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
              <p v-if="selectedOutsidePage" data-testid="history-outside" class="mb-3 rounded border border-primary/20 bg-primary-soft/40 p-2 text-xs text-primary">{{ historyText('outside') }}</p>
              <div class="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="text-sm font-semibold text-text-primary">{{ runStore.currentRun.workflowName }}</p>
                    <StatusBadge :status="runStore.currentRun.status" />
                  </div>
                  <p class="mt-1 text-xs text-text-muted">{{ runStore.currentRun.id }} · {{ runStore.currentRun.durationMs }}ms · {{ runStore.currentRun.owner }}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button class="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-app-border px-3 py-2 text-sm text-primary" @click="openRunWorkflow">
                    {{ t('runs.openWorkflow') }}
                    <ArrowRight class="h-4 w-4" />
                  </button>
                  <button v-if="canCancelCurrentRun" type="button" class="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-status-error/30 px-3 py-2 text-sm text-status-error disabled:opacity-60" :disabled="cancelling" @click="cancelCurrentRun">
                    <CircleStop class="h-4 w-4" />
                    {{ cancelling ? t('runs.cancelling') : t('runs.cancel') }}
                  </button>
                </div>
              </div>

              <div v-if="cancellationError" role="alert" data-testid="cancel-error" class="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <p class="font-semibold">{{ t('runs.cancelErrorTitle') }}</p>
                <p class="mt-1">{{ t('runs.cancelErrorHint') }}</p>
                <p class="mt-1 break-words text-xs">{{ cancellationError }}</p>
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

              <SubworkflowChildRuns v-if="runStore.currentRun.backendInstanceId" :key="runStore.currentRun.id" :instance-id="runStore.currentRun.backendInstanceId" />

              <div class="mt-3 flex flex-wrap gap-2">
                <span v-for="artifact in runStore.currentRun.artifactNames" :key="artifact" class="inline-flex items-center gap-1 rounded-md border border-app-border bg-white px-2 py-1 text-xs text-text-secondary">
                  <Boxes class="h-3 w-3 text-primary" />
                  {{ artifact }}
                </span>
              </div>
            </div>
            <div class="grid min-h-0 min-w-0 gap-4 overflow-hidden lg:grid-cols-[minmax(260px,360px)_minmax(0,1fr)]">
              <RunTimeline class="min-h-0 min-w-0" :run-id="runStore.currentRun?.id" :nodes="selectedDetailReady ? runStore.currentRun?.nodeStates ?? [] : []" :can-rerun="canRerun" @rerun="rerunNode = $event" />
              <LogStream class="min-h-0 min-w-0" :run-id="runStore.currentRun?.id" :workflow-id="runStore.currentRun?.workflowId" :logs="selectedDetailReady ? runStore.logs : []" />
            </div>
          </div>
        </section>
      </div>
    </main>
  </section>
</template>
