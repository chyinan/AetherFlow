<script setup lang="ts">
import { Activity, AlertTriangle, ArrowRight, Boxes, CircleStop, RefreshCw } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isNavigationFailure, NavigationFailureType, useRoute, useRouter } from 'vue-router'

import { toApiError } from '@/api/client/apiError'
import type { RuntimeExecutionSnapshot } from '@/api/modules/runtime'
import HumanApprovalDialog, { type HumanApprovalRequestView, type HumanApprovalTarget } from '@/components/run/HumanApprovalDialog.vue'
import LogStream from '@/components/run/LogStream.vue'
import RunTimeline from '@/components/run/RunTimeline.vue'
import SubworkflowChildRuns from '@/components/run/SubworkflowChildRuns.vue'
import FailedNodeRerunDialog from '@/components/run/FailedNodeRerunDialog.vue'
import type { RunNodeState } from '@/types/run'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useRunStore } from '@/stores/runStore'
import { runArtifactsLocation } from '@/utils/runNavigation'
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
const runDetailRegion = ref<HTMLElement | null>(null)
const historyKey = computed(() => JSON.stringify([filters.value.workflowId, filters.value.status, filters.value.page, filters.value.pageSize]))
const visibleRuns = computed(() => runStore.historyRuns.filter(run => matchesRunHistorySearch(run, filters.value.q)))
const pageCount = computed(() => Math.max(1, Math.ceil(runStore.historyTotal / filters.value.pageSize)))
const selectedRouteId = computed(() => Array.isArray(route.params.id) ? route.params.id[0] : route.params.id)
const selectedDetailReady = computed(() => !selectedRouteId.value || selectedRouteId.value === runStore.currentRun?.id)
const selectedOutsidePage = computed(() => selectedDetailReady.value && runStore.currentRun && !runStore.historyLoading && !runStore.historyError
  && !visibleRuns.value.some(run => run.id === runStore.currentRun?.id))
let historyRequest: Promise<void> | undefined
let routeGeneration = 0
let detailNavigationGeneration = 0
const detailFocusCleanups = new Set<() => void>()
let active = true

function requestHistoryPage() {
  const workflowFilter = filters.value.workflowId || undefined
  // 数字工作流 ID 是定义 ID，精确匹配；其他取值沿用旧参数保持兼容。
  const definitionId = workflowFilter && /^\d+$/.test(workflowFilter) ? Number(workflowFilter) : undefined
  historyRequest = runStore.loadHistoryPage({
    ...(definitionId !== undefined ? { definitionId } : workflowFilter ? { workflowId: workflowFilter } : {}),
    status: filters.value.status || undefined,
    page: filters.value.page,
    pageSize: filters.value.pageSize,
  })
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
  // 关键词只搜索已加载的这一页，不影响取数：只有服务器筛选变化才回到第一页。
  const serverFiltersChanged = workflowDraft.value.trim() !== filters.value.workflowId
    || statusDraft.value !== filters.value.status
  updateFilters({
    q: searchDraft.value.trim(),
    workflowId: workflowDraft.value.trim(),
    status: statusDraft.value,
    page: serverFiltersChanged ? 1 : filters.value.page,
  })
}

function clearFilters() {
  searchDraft.value = ''
  workflowDraft.value = ''
  statusDraft.value = ''
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

const canCancelCurrentRun = computed(() => {
  const run = runStore.currentRun
  if (!selectedDetailReady.value || !run) return false
  // 已知节点的局部完成不代表运行结束，取消入口以服务端状态为准。
  return run.backendStatus
    ? ['PENDING', 'RUNNING', 'RETRYING', 'WAITING'].includes(run.backendStatus)
    : ['queued', 'running', 'paused'].includes(run.status)
})

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
  // 运行已结束时，历史节点上的 pending 不能重新变成可执行审批。
  if (!run || ['SUCCESS', 'FAILED', 'CANCELLED'].includes(run.backendStatus ?? '')) return null
  const pendingNode = run.nodeStates.find((node) => node.status === 'paused' && node.approval?.approvalStatus === 'pending')
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
const pageStatusSummary = computed(() => [
  { label: t('runs.running'), value: historyStatusCounts.value.running ?? 0 },
  { label: t('runs.queued'), value: historyStatusCounts.value.queued ?? 0 },
  { label: t('runs.succeeded'), value: historyStatusCounts.value.success ?? 0 },
  { label: t('runs.failed'), value: historyStatusCounts.value.failed ?? 0 },
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
  detailFocusCleanups.forEach(cleanup => cleanup())
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

async function selectRun(runId: string) {
  const generation = ++detailNavigationGeneration
  const location = { name: 'run-detail', params: { id: runId }, query: route.query }
  const expectedPath = router.resolve(location).fullPath
  let focusIntentChanged = false
  const recordFocusIntent = () => { focusIntentChanged = true }
  // 等待导航时重新聚焦、继续输入或再次点击都属于更新的用户意图。
  const intentEvents = ['focusin', 'input', 'pointerdown'] as const
  const cleanupIntentListeners = () => {
    intentEvents.forEach(event => document.removeEventListener(event, recordFocusIntent))
    detailFocusCleanups.delete(cleanupIntentListeners)
  }
  detailFocusCleanups.add(cleanupIntentListeners)
  intentEvents.forEach(event => document.addEventListener(event, recordFocusIntent))
  try {
    const failure = await router.push(location)
    if (isNavigationFailure(failure) && !isNavigationFailure(failure, NavigationFailureType.duplicated)) return
    await nextTick()
    // 只有本次主动打开仍是当前意图时才交接焦点；后退和外部导航不会走这里。
    if (!active || focusIntentChanged || generation !== detailNavigationGeneration || selectedRouteId.value !== runId || route.fullPath !== expectedPath) return
    const region = runDetailRegion.value
    region?.focus({ preventScroll: true })
    if (!window.matchMedia?.('(min-width: 1280px)').matches) {
      region?.scrollIntoView?.({ block: 'start' })
    }
  } finally {
    cleanupIntentListeners()
  }
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

async function completeApproval({ approved, snapshot }: HumanApprovalCompletion, target: HumanApprovalTarget) {
  const request = approvalDialogRequest.value
  // 完成回执只能更新本次提交的节点，不能改写后来打开的运行或下一审批。
  if (!request || String(request.instanceId) !== String(target.instanceId) || request.nodeId !== target.nodeId) {
    return
  }

  runStore.applyHumanApprovalSnapshot({
    nodeId: target.nodeId,
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
          <h1 class="text-sm font-semibold text-text-primary">{{ t('runs.title') }}</h1>
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

    <main class="min-h-0 overflow-y-auto bg-app-bg px-4 py-5 sm:px-5 lg:px-6 xl:overflow-hidden">
      <div class="flex min-w-0 flex-col gap-4 xl:h-full">
        <section v-if="runStore.error || runStore.historyError" class="shrink-0 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
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

        <section data-testid="run-history-layout" class="grid min-h-0 min-w-0 gap-4 xl:flex-1 xl:overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside aria-labelledby="run-history-heading" class="max-h-[36rem] min-h-0 min-w-0 overflow-y-auto rounded-lg border border-app-border bg-white p-3 shadow-sm xl:max-h-none">
            <h2 id="run-history-heading" class="mb-3 px-1 text-sm font-semibold text-text-primary">{{ historyText('historyTitle') }}</h2>
            <p id="run-history-scope" class="mb-2 px-1 text-xs leading-5 text-text-muted">{{ historyText('scope') }}</p>
            <dl data-testid="history-summary" aria-describedby="run-history-scope" class="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 border-b border-app-border px-1 pb-3 text-xs">
              <div v-for="item in pageStatusSummary" :key="item.label" class="flex items-center justify-between gap-2">
                <dt class="text-text-secondary">{{ item.label }}</dt>
                <dd class="font-semibold tabular-nums text-text-primary">{{ runStore.historyLoading || runStore.historyError ? '—' : item.value }}</dd>
              </div>
            </dl>
            <form class="mb-3 space-y-2 border-b border-app-border pb-3" :aria-label="historyText('filtersTitle')" data-testid="history-filters" @submit.prevent="applyFilters">
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
            <details data-testid="history-id-disclosure" class="mb-3 rounded-md border border-app-border px-3 py-2">
              <summary class="cursor-pointer rounded text-xs font-medium text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{{ historyText('openId') }}</summary>
              <form class="mt-3 space-y-2" data-testid="history-open-id" @submit.prevent="openRunById">
                <label class="block text-xs text-text-secondary">{{ historyText('openId') }}
                  <input v-model="directIdDraft" data-testid="history-direct-id" type="text" :placeholder="historyText('idHint')" :aria-invalid="directIdError" class="mt-1 w-full rounded border border-app-border px-2 py-1.5 text-sm" @input="directIdError = false" />
                </label>
                <p v-if="directIdError" role="alert" class="text-xs text-status-error">{{ historyText('invalidId') }}</p>
                <button type="submit" class="rounded border border-app-border px-2 py-1.5 text-xs">{{ historyText('open') }}</button>
              </form>
            </details>
            <div class="mb-2 flex items-center justify-between gap-2 px-1">
              <h3 class="text-xs font-semibold text-text-secondary">{{ historyText('resultsTitle') }}</h3>
              <span class="rounded bg-app-muted px-2 py-1 text-xs tabular-nums text-text-secondary">{{ runStore.historyLoading || runStore.historyError ? '—' : visibleRuns.length }}</span>
            </div>
            <button
              v-for="run in (!runStore.historyLoading && !runStore.historyError ? visibleRuns : [])"
              :key="run.id"
              data-testid="history-run"
              type="button"
              class="mb-2 w-full rounded-lg border p-3 text-left transition hover:border-primary/30 hover:bg-primary-soft/40"
              :aria-current="selectedRouteId === run.id ? 'true' : undefined"
              :class="selectedRouteId === run.id ? 'border-primary/50 bg-primary-soft/40 ring-1 ring-primary/20' : 'border-app-border bg-white'"
              @click="selectRun(run.id)"
            >
              <div class="flex items-center justify-between gap-2">
                <span data-testid="history-run-name" :title="run.workflowName" class="min-w-0 break-words text-sm font-semibold text-text-primary [overflow-wrap:anywhere]">{{ run.workflowName }}</span>
                <StatusBadge :status="run.status" />
              </div>
              <p data-testid="history-run-id" class="mt-1 break-all text-xs text-text-muted">{{ run.id }}</p>
              <span v-if="selectedRouteId === run.id" class="mt-1 block text-xs font-medium text-primary">{{ historyText('selected') }}</span>
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
            <div v-else-if="visibleRuns.length === 0" data-testid="history-empty" role="status" class="rounded-md border border-dashed border-app-border p-4 text-sm text-text-muted">
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

          <section ref="runDetailRegion" data-testid="run-detail-region" tabindex="-1" :aria-label="`${historyText('detailTitle')} ${selectedRouteId ?? ''}`" :aria-busy="!selectedDetailReady && runStore.loading" class="flex min-h-0 min-w-0 scroll-mt-4 flex-col gap-4 overflow-y-auto rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <p v-if="!selectedDetailReady" role="status" class="p-4 text-sm text-text-muted">{{ runStore.error ? t('runs.loadErrorTitle') : historyText('detailLoading') }}</p>
            <div v-if="runStore.currentRun && selectedDetailReady" class="shrink-0 rounded-lg border border-app-border bg-white p-4 shadow-sm">
              <p v-if="selectedOutsidePage" data-testid="history-outside" class="mb-3 rounded border border-primary/20 bg-primary-soft/40 p-2 text-xs text-primary">{{ historyText('outside') }}</p>
              <div class="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="break-words text-base font-semibold text-text-primary [overflow-wrap:anywhere]">{{ runStore.currentRun.workflowName }}</h2>
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

              <div class="mt-3 flex flex-wrap items-center gap-2">
                <RouterLink
                  data-testid="view-run-artifacts"
                  :to="runArtifactsLocation(runStore.currentRun.id, route.fullPath)"
                  class="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary-soft px-2 py-1 text-xs font-medium text-primary transition hover:border-primary"
                >
                  {{ historyText('viewArtifacts') }}
                  <ArrowRight class="h-3 w-3" />
                </RouterLink>
                <span v-for="artifact in runStore.currentRun.artifactNames" :key="artifact" class="inline-flex items-center gap-1 rounded-md border border-app-border bg-white px-2 py-1 text-xs text-text-secondary">
                  <Boxes class="h-3 w-3 text-primary" />
                  {{ artifact }}
                </span>
              </div>
            </div>
            <div class="grid min-h-[24rem] min-w-0 gap-4 lg:grid-cols-[minmax(260px,360px)_minmax(0,1fr)] xl:flex-1">
              <RunTimeline class="max-h-[32rem] min-h-0 min-w-0 xl:max-h-none" :run-id="runStore.currentRun?.id" :workflow-id="runStore.currentRun?.workflowId" :return-location="route.fullPath" :nodes="selectedDetailReady ? runStore.currentRun?.nodeStates ?? [] : []" :can-rerun="canRerun" @rerun="rerunNode = $event" />
              <LogStream class="h-[24rem] min-h-0 min-w-0 lg:h-[32rem] xl:h-full" :run-id="runStore.currentRun?.id" :workflow-id="runStore.currentRun?.workflowId" :logs="selectedDetailReady ? runStore.logs : []" />
            </div>
          </section>
        </section>
      </div>
    </main>
  </section>
</template>
