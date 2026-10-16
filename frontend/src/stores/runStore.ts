import { defineStore } from 'pinia'

// pattern: Mixed (needs refactoring)

import { toApiError } from '@/api/client/apiError'
import { mapRuntimeStateToRunStatus } from '@/api/mappers/runtimeMapper'
import type { RuntimeExecutionSnapshot } from '@/api/modules/runtime'
import { i18n } from '@/i18n'
import { backendInstanceIdFromRunId, runApi, runtimeWorkflowIdFromRun, type RunPageQuery } from '@/services/api/runApi'
import { cancelWorkflowInstance, getStartedRunLink } from '@/services/api/workflowApi'
import { realtimeClient } from '@/services/realtime/realtimeClient'
import type { RunLogEntry, RunNodeState, WorkflowRun } from '@/types/run'
import type { WorkflowGraphNode } from '@/types/workflow'
import { formatDateTime, formatTime } from '@/utils/localeFormat'
import { workflowRunBelongsToWorkflow } from '@/utils/workflowRunState'

import { useAuthStore } from './authStore'
import { useFileStore } from './fileStore'
import { useUiStore } from './uiStore'
import { useWorkflowStore } from './workflowStore'

let stopRealtime: (() => void) | null = null
const refreshedArtifactRuns = new Set<string>()

function mergeLogs(currentLogs: RunLogEntry[], recoveredLogs: RunLogEntry[]) {
  const merged = new Map(currentLogs.map((log) => [log.id, log]))
  recoveredLogs.forEach((log) => merged.set(log.id, log))
  return [...merged.values()].slice(-100)
}

function errorMessage(error: unknown) {
  const apiError = toApiError(error, 'runtime')
  const status = apiError.status ? `HTTP ${apiError.status}: ` : ''
  return `${status}${apiError.message}`
}

function refreshArtifactsForRun(runId: string) {
  const fileStore = useFileStore()
  fileStore.markRunArtifactsReady(runId)
  if (refreshedArtifactRuns.has(runId)) {
    return
  }
  refreshedArtifactRuns.add(runId)
  void fileStore.refreshArtifactsFromBackend()
}

function runBelongsToWorkflow(run: WorkflowRun, workflowStore: ReturnType<typeof useWorkflowStore>) {
  return workflowRunBelongsToWorkflow(run, workflowStore.workflowId, workflowStore.backendDefinitionId)
}

function isTerminalNodeStatus(status: RunNodeState['status']) {
  return status === 'success' || status === 'failed' || status === 'skipped'
}

function isTerminalRunStatus(status: WorkflowRun['status']) {
  return status === 'success' || status === 'failed'
}

function isCancelledRun(run: WorkflowRun | Partial<WorkflowRun>) {
  return run.backendStatus === 'CANCELLED'
}

function isBackendTerminalRun(run: WorkflowRun) {
  return run.backendStatus === 'SUCCESS' || run.backendStatus === 'FAILED' || isCancelledRun(run)
}

function definedFields<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as Partial<T>
}

function isNodeOutputSummary(output?: string) {
  return Boolean(output && (/^(NODE|WORKFLOW)_[A-Z_]+$/.test(output)
    || /^(idle|queued|pending|running|retrying|waiting|paused|success|failed|cancelled|skipped)$/i.test(output)))
}

function mergeNodeOutput(existing: RunNodeState, incoming: RunNodeState) {
  if (incoming.output === undefined) return existing.output
  if (!existing.output) return incoming.output
  if (!isNodeOutputSummary(existing.output) && isNodeOutputSummary(incoming.output)) return existing.output
  // 同状态回放可能只带部分属性；补齐字段而不是用节点类型等元数据擦除错误原因。
  if (existing.status === incoming.status) {
    try {
      const currentAttributes: unknown = JSON.parse(existing.output)
      const incomingAttributes: unknown = JSON.parse(incoming.output)
      if (currentAttributes && incomingAttributes
        && typeof currentAttributes === 'object' && typeof incomingAttributes === 'object'
        && !Array.isArray(currentAttributes) && !Array.isArray(incomingAttributes)) {
        return JSON.stringify({ ...currentAttributes, ...incomingAttributes })
      }
    } catch {
      // 普通文本输出继续按原来的新值优先规则处理。
    }
  }
  return incoming.output
}

function mergeNodeRetryCounts(run: WorkflowRun, patches: RunNodeState[]) {
  for (const patch of patches) {
    if (patch.retryCount === undefined) continue
    const node = run.nodeStates.find(node => node.nodeId === patch.nodeId)
    if (node) node.retryCount = Math.max(node.retryCount ?? 0, patch.retryCount)
  }
}

function mergeRunSnapshot(current: WorkflowRun, incoming: WorkflowRun, preserveCurrent = false): WorkflowRun {
  if (current.id === incoming.id) mergeNodeRetryCounts(current, incoming.nodeStates)
  // 局部节点可能推导出 success/failed；只有后端确认的终态才能锁定 HTTP 协调。
  const currentTerminal = isBackendTerminalRun(current)
  const currentInferredTerminal = isTerminalRunStatus(current.status) && !currentTerminal
  const incomingTerminal = isTerminalRunStatus(incoming.status) || isCancelledRun(incoming)
  // WAITING 摘要使用 100% 占位；真正恢复运行时允许更新为实际进度。
  const resumesFromWaiting = current.status === 'paused' && incoming.status === 'running'
  // 列表请求发出后收到的运行更新，以及已经确认的终态，不能被旧 HTTP 快照覆盖。
  if (preserveCurrent || (currentTerminal && (
    current.status !== incoming.status || isCancelledRun(current) !== isCancelledRun(incoming)
  )) || (!incomingTerminal && !currentInferredTerminal && !resumesFromWaiting && incoming.progress < current.progress)) {
    return current
  }

  const nodes = new Map(current.nodeStates.map((node) => [node.nodeId, node]))
  for (const node of incoming.nodeStates) {
    const existing = nodes.get(node.nodeId)
    if (!existing) {
      nodes.set(node.nodeId, node)
      continue
    }
    if (isTerminalNodeStatus(existing.status) && existing.status !== node.status) {
      continue
    }
    const merged = { ...existing, ...definedFields(node) }
    // HTTP 与实时事件采用同样的信息保留规则。
    merged.output = mergeNodeOutput(existing, node)
    if (node.label === node.nodeId) merged.label = existing.label
    if (existing.durationMs !== undefined) merged.durationMs = Math.max(existing.durationMs, node.durationMs ?? 0)
    if (existing.retryCount !== undefined) merged.retryCount = Math.max(existing.retryCount, node.retryCount ?? 0)
    if (merged.status !== 'paused' && merged.approval?.approvalStatus === 'pending') merged.approval = undefined
    nodes.set(node.nodeId, merged)
  }
  // 列表只包含摘要，缺省字段和空数组不能抹掉实时恢复的详情。
  return {
    ...current,
    ...definedFields(incoming),
    runtimeWorkflowId: incoming.runtimeWorkflowId === String(incoming.backendInstanceId)
      ? current.runtimeWorkflowId ?? incoming.runtimeWorkflowId
      : incoming.runtimeWorkflowId ?? current.runtimeWorkflowId,
    traceId: incoming.traceId === `trace-${incoming.backendInstanceId}` ? current.traceId : incoming.traceId,
    progress: currentTerminal ? Math.max(current.progress, incoming.progress) : incoming.progress,
    durationMs: Math.max(current.durationMs, incoming.durationMs),
    nodeStates: [...nodes.values()],
    artifactCount: Math.max(current.artifactCount, incoming.artifactCount),
    artifactNames: [...new Set([...current.artifactNames, ...incoming.artifactNames])],
  }
}

type RunRecoveryOptions = {
  readonly expectedRunId?: string
  readonly selectionRequestId?: number
}

export const useRunStore = defineStore('run', {
  state: () => ({
    runs: [] as WorkflowRun[],
    historyRuns: [] as WorkflowRun[],
    historyRequestId: 0,
    workflowRuns: [] as WorkflowRun[],
    workflowRunsId: null as string | null,
    workflowRequestId: 0,
    currentRun: null as WorkflowRun | null,
    logs: [] as RunLogEntry[],
    logsByRunId: {} as Record<string, RunLogEntry[]>,
    loading: false,
    logsLoading: false,
    historyLoading: false,
    historyError: null as string | null,
    historyTotal: 0,
    historyPage: 1,
    historyPageSize: 20,
    error: null as string | null,
    initialized: false,
    selectionRequestId: 0,
    runsLoadRequestId: 0,
    runUpdateVersions: {} as Record<string, number>,
    runtimeRecoveryRequestId: 0,
    nodeUpdateVersions: {} as Record<string, Record<string, number>>,
    realtimeSubscriptionId: 0,
    realtimeRunId: null as string | null,
    runRealtimeState: 'offline' as 'online' | 'reconnecting' | 'offline',
  }),
  getters: {
    statusCounts: (state) =>
      state.runs.reduce(
        (acc, run) => {
          acc[run.status] += 1
          return acc
        },
        { queued: 0, running: 0, success: 0, failed: 0, paused: 0, cancelled: 0 } as Record<WorkflowRun['status'], number>,
      ),
    currentRunProgress: (state) => state.currentRun?.progress ?? 0,
  },
  actions: {
    mergeLoadedRuns(loadedRuns: WorkflowRun[], updateVersions: Record<string, number>, scope: 'global' | 'history' | 'workflow' = 'global') {
      const currentRuns = new Map([...this.runs, ...this.workflowRuns, ...this.historyRuns].map((run) => [run.id, run]))
      if (this.currentRun) {
        const listedRun = currentRuns.get(this.currentRun.id)
        currentRuns.set(this.currentRun.id, listedRun
          ? mergeRunSnapshot(listedRun, this.currentRun)
          : this.currentRun)
      }
      const mergedRuns = loadedRuns.map((run) => {
        const current = currentRuns.get(run.id)
        return current ? mergeRunSnapshot(current, run,
          (updateVersions[run.id] ?? 0) !== (this.runUpdateVersions[run.id] ?? 0)) : run
      })
      if (scope === 'history') this.historyRuns = mergedRuns
      else if (scope === 'workflow') this.workflowRuns = mergedRuns
      else this.runs = mergedRuns
      if (this.currentRun) {
        this.currentRun = mergedRuns.find((run) => run.id === this.currentRun?.id) ?? this.currentRun
        if (isCancelledRun(this.currentRun) && this.realtimeRunId === this.currentRun.id) {
          this.stopRunRealtime()
        }
      }
    },
    async loadHistoryPage(query: RunPageQuery) {
      const requestId = ++this.historyRequestId
      const isCurrentLoad = () => requestId === this.historyRequestId
      const updateVersions = { ...this.runUpdateVersions }
      this.historyLoading = true
      this.historyError = null
      // 分页结果、加载代际与既有概览缓存分离，不改变全局统计口径。
      try {
        const result = await runApi.listRunsPage(query)
        if (!isCurrentLoad()) return
        this.mergeLoadedRuns(result.items, updateVersions, 'history')
        this.historyTotal = result.total
        this.historyPage = result.page
        this.historyPageSize = result.pageSize
      } catch (error) {
        if (isCurrentLoad()) this.historyError = errorMessage(error)
      } finally {
        if (isCurrentLoad()) this.historyLoading = false
      }
    },
    async loadWorkflowRuns(workflowId: string) {
      const requestId = ++this.workflowRequestId
      const selectionRequestId = this.selectionRequestId
      const isCurrentLoad = () => requestId === this.workflowRequestId && selectionRequestId === this.selectionRequestId
      const updateVersions = { ...this.runUpdateVersions }
      this.workflowRunsId = null
      try {
        const result = await runApi.listRunsPage({ workflowId, page: 1, pageSize: 50 })
        if (!isCurrentLoad()) return
        this.mergeLoadedRuns(result.items, updateVersions, 'workflow')
        this.workflowRunsId = workflowId
      } catch (error) {
        if (isCurrentLoad()) this.error = errorMessage(error)
      }
    },
    async loadRuns(options: { selectDefault?: boolean; workflowId?: string } = {}) {
      if (options.workflowId) {
        await this.loadWorkflowRuns(options.workflowId)
        return
      }
      const selectDefault = options.selectDefault ?? true
      const runsLoadRequestId = ++this.runsLoadRequestId
      const isCurrentLoad = () => this.runsLoadRequestId === runsLoadRequestId

      if (this.initialized) {
        if (selectDefault && !this.currentRun) {
          try {
            const selectedRun = this.runs[0] ?? null
            this.currentRun = selectedRun
            this.logsLoading = Boolean(selectedRun)
            this.logs = []
            const selectedLogs = selectedRun ? await runApi.getLogs(selectedRun.id) : []
            if (!isCurrentLoad() || this.currentRun?.id !== selectedRun?.id) {
              return
            }
            this.logs = selectedLogs
            if (selectedRun) {
              this.logsByRunId[selectedRun.id] = selectedLogs
            }
          } catch (error) {
            if (isCurrentLoad()) {
              this.error = errorMessage(error)
            }
          } finally {
            if (isCurrentLoad()) {
              this.logsLoading = false
            }
          }
        }
        return
      }
      this.loading = true
      this.error = null
      const updateVersions = { ...this.runUpdateVersions }
      try {
        const loadedRuns = await runApi.listRuns()
        if (!isCurrentLoad()) {
          return
        }
        this.mergeLoadedRuns(loadedRuns, updateVersions)
        if (selectDefault) {
          const selectedRun = this.currentRun ?? this.runs[0] ?? null
          const selectionRequestId = this.selectionRequestId
          const retainedLogs = this.currentRun?.id === selectedRun?.id ? this.logs : []
          this.currentRun = selectedRun
          this.logsLoading = Boolean(selectedRun)
          this.logs = retainedLogs
          const selectedLogs = selectedRun ? await runApi.getLogs(selectedRun.id) : []
          if (!isCurrentLoad() || this.selectionRequestId !== selectionRequestId || this.currentRun?.id !== selectedRun?.id) {
            return
          }
          // 请求期间的实时日志优先，同 ID 日志去重后保留完整的历史与当前详情。
          this.logs = mergeLogs(selectedLogs, this.logs)
          if (selectedRun) {
            this.logsByRunId[selectedRun.id] = this.logs
          }
          this.logsLoading = false
        }
        this.initialized = true
      } catch (error) {
        if (isCurrentLoad()) {
          this.error = errorMessage(error)
          if (this.runs.length === 0) {
            this.currentRun = null
            this.logs = []
          }
        }
      } finally {
        if (isCurrentLoad()) {
          this.loading = false
          this.logsLoading = false
        }
      }
    },
    async refreshRuns(runId?: string) {
      this.initialized = false
      // 路由重试必须重新走完整选择流程，并在异步读取前取得新的选择代际。
      if (runId) {
        await this.selectRun(runId, { refreshLogs: true })
        return
      }
      await this.loadRuns()
    },
    async selectRun(runId: string, options: { refreshLogs?: boolean; historyReady?: Promise<void>; skipList?: boolean; prefetchedRun?: WorkflowRun } = {}) {
      const selectionRequestId = ++this.selectionRequestId
      const isCurrentSelection = () => this.selectionRequestId === selectionRequestId
      this.loading = true
      this.logsLoading = true
      this.error = null
      try {
        if (options.historyReady) await options.historyReady
        if (!isCurrentSelection()) return
        if (!options.skipList) await this.loadRuns({ selectDefault: false })
        if (!isCurrentSelection()) {
          return
        }
        this.loading = true
        this.logsLoading = true
        const localRun = options.prefetchedRun ?? (options.skipList ? this.historyRuns : this.runs).find((run) => run.id === runId)
        const updateVersion = this.runUpdateVersions[runId] ?? 0
        let selectedRun = localRun ?? (await runApi.getRun(runId))
        if (!isCurrentSelection()) {
          return
        }
        if (this.currentRun?.id === runId) {
          selectedRun = mergeRunSnapshot(this.currentRun, selectedRun, updateVersion !== (this.runUpdateVersions[runId] ?? 0))
        }
        this.currentRun = selectedRun
        const cachedLogs = this.logsByRunId[runId]
        this.logs = cachedLogs ?? []
        const selectedLogs = options.refreshLogs || !cachedLogs ? await runApi.getLogs(runId) : cachedLogs
        if (!isCurrentSelection() || this.currentRun?.id !== runId) {
          return
        }
        // 同一运行的刷新保留请求期间收到的实时日志。
        this.logs = mergeLogs(selectedLogs, this.logs)
        this.logsByRunId[runId] = this.logs
        await this.recoverCurrentRunRuntime({ expectedRunId: runId, selectionRequestId })
        if (!isCurrentSelection() || this.currentRun?.id !== runId) {
          return
        }
        this.subscribeCurrentRun()
      } catch (error) {
        if (isCurrentSelection()) {
          this.error = errorMessage(error)
        }
      } finally {
        if (isCurrentSelection()) {
          this.loading = false
          this.logsLoading = false
        }
      }
    },
    async selectRunForWorkflow(workflowId: string, definitionId?: number | null) {
      // 工作流最近运行可能不在全局第一页，必须按工作流定向读取。
      const selectionRequestId = ++this.selectionRequestId
      await this.loadRuns({ selectDefault: false, workflowId })
      if (selectionRequestId !== this.selectionRequestId || this.workflowRunsId !== workflowId) return null
      const run = this.workflowRuns.find((item) =>
        item.workflowId === workflowId
        || (typeof definitionId === 'number' && item.definitionId === definitionId),
      )
      if (!run) {
        this.clearCurrentRun()
        return null
      }
      if (this.currentRun?.id !== run.id) {
        await this.selectRun(run.id, { skipList: true, prefetchedRun: run })
      }
      return this.currentRun
    },
    clearCurrentRun() {
      this.selectionRequestId += 1
      this.runsLoadRequestId += 1
      this.stopRealtime()
      this.currentRun = null
      this.logs = []
      this.loading = false
      this.logsLoading = false
      this.historyLoading = false
      this.error = null
    },
    appendLog(entry: RunLogEntry) {
      if (!entry || this.logs.some((log) => log.id === entry.id)) {
        return
      }
      this.logs = [...this.logs.slice(-80), entry]
      if (this.currentRun) {
        this.logsByRunId[this.currentRun.id] = this.logs
      }
    },
    mergeCurrentNodeRetryCount(patch: RunNodeState) {
      const runId = this.currentRun?.id
      if (!runId || patch.retryCount === undefined) return
      // 单调的重试证据可以补齐；不接受旧状态、输出，也不改变选择或订阅代际。
      const targets = [this.currentRun, ...this.runs, ...this.historyRuns, ...this.workflowRuns]
      for (const run of targets) {
        if (run?.id !== runId) continue
        mergeNodeRetryCounts(run, [patch])
      }
    },
    patchNodeState(patch: RunNodeState, options: { inferRunStatus?: boolean } = {}) {
      if (!this.currentRun || isCancelledRun(this.currentRun)) {
        return
      }
      this.mergeCurrentNodeRetryCount(patch)
      const state = this.currentRun.nodeStates.find((node) => node.nodeId === patch.nodeId)
      if (state && isTerminalNodeStatus(state.status)
        && (!isTerminalNodeStatus(patch.status) || state.status !== patch.status)) {
        return
      }
      const normalizedPatch = patch.approval || patch.status === 'paused'
        ? patch
        : { ...patch, approval: undefined }
      this.runUpdateVersions[this.currentRun.id] = (this.runUpdateVersions[this.currentRun.id] ?? 0) + 1
      const nodeVersions = this.nodeUpdateVersions[this.currentRun.id] ??= {}
      nodeVersions[patch.nodeId] = (nodeVersions[patch.nodeId] ?? 0) + 1
      if (state) {
        const merged = { ...definedFields(normalizedPatch) }
        // 事件占位摘要与缺省字段不能抹掉 HTTP 或先前事件恢复的详情。
        merged.output = mergeNodeOutput(state, patch)
        if (normalizedPatch.label === patch.nodeId) merged.label = state.label
        if (state.durationMs !== undefined) merged.durationMs = Math.max(state.durationMs, patch.durationMs ?? 0)
        if (state.retryCount !== undefined) merged.retryCount = Math.max(state.retryCount, patch.retryCount ?? 0)
        Object.assign(state, merged)
        if (patch.status !== 'paused' && !patch.approval) state.approval = undefined
      } else {
        this.currentRun.nodeStates.push(normalizedPatch)
      }
      // 后端确认终态后，节点只能补齐详情；尚未恢复完整的节点局部推导结果仍需重新计算。
      if (options.inferRunStatus !== false
        && this.currentRun.backendStatus !== 'SUCCESS' && this.currentRun.backendStatus !== 'FAILED') {
        const completed = this.currentRun.nodeStates.filter((node) => ['success', 'failed', 'skipped'].includes(node.status)).length
        this.currentRun.progress = Math.round((completed / Math.max(this.currentRun.nodeStates.length, 1)) * 100)
        if (this.currentRun.nodeStates.some((node) => node.status === 'failed')) {
          this.currentRun.status = 'failed'
        } else if (this.currentRun.progress >= 100) {
          this.currentRun.status = 'success'
          refreshArtifactsForRun(this.currentRun.id)
        } else if (this.currentRun.nodeStates.some((node) => node.status === 'running')) {
          this.currentRun.status = 'running'
        }
      }
      for (const runs of [this.runs, this.historyRuns, this.workflowRuns]) {
        const runInList = runs.find((run) => run.id === this.currentRun?.id)
        if (runInList) Object.assign(runInList, this.currentRun)
      }
      const workflowStore = useWorkflowStore()
      if (runBelongsToWorkflow(this.currentRun, workflowStore)) {
        workflowStore.updateNodeStatus(patch.nodeId, patch.status, patch.durationMs)
      }
    },
    patchCurrentRun(patch: Partial<WorkflowRun>) {
      if (!this.currentRun) {
        return
      }

      const currentTerminal = isBackendTerminalRun(this.currentRun)
      const incomingTerminal = Boolean(patch.status && isTerminalRunStatus(patch.status)) || isCancelledRun(patch)
      if (currentTerminal && (!incomingTerminal
        || (patch.status && this.currentRun.status !== patch.status)
        || (patch.backendStatus && this.currentRun.backendStatus !== patch.backendStatus))) {
        return
      }
      this.runUpdateVersions[this.currentRun.id] = (this.runUpdateVersions[this.currentRun.id] ?? 0) + 1
      Object.assign(this.currentRun, patch)
      for (const runs of [this.runs, this.historyRuns, this.workflowRuns]) {
        const runInList = runs.find((run) => run.id === this.currentRun?.id)
        if (runInList) Object.assign(runInList, this.currentRun)
      }
      if (this.currentRun.status === 'success') {
        refreshArtifactsForRun(this.currentRun.id)
      }
    },
    applyHumanApprovalSnapshot(options: {
      nodeId: string
      approved: boolean
      snapshot: RuntimeExecutionSnapshot
    }) {
      if (!this.currentRun) {
        return
      }

      const approvalNode = this.currentRun.nodeStates.find((node) => node.nodeId === options.nodeId)
      if (approvalNode) {
        this.patchNodeState({
          ...approvalNode,
          status: !options.approved && options.snapshot.runtimeState === 'FAILED' ? 'failed' : 'success',
          approval: {
            ...(approvalNode.approval ?? { approved: false, approvalStatus: 'pending' }),
            approved: options.approved,
            approvalStatus: options.approved ? 'approved' : 'rejected',
          },
        })
      }

      const runtimeState = options.snapshot.runtimeState
      const currentNodeId = typeof options.snapshot.currentNodeId === 'string'
        ? options.snapshot.currentNodeId
        : options.snapshot.currentNodeIds?.[0]
      const runPatch: Partial<WorkflowRun> = {
        currentNodeId,
      }

      if (typeof options.snapshot.workflowId === 'string' && options.snapshot.workflowId.trim()) {
        runPatch.runtimeWorkflowId = options.snapshot.workflowId
      }
      if (runtimeState) {
        runPatch.backendStatus = runtimeState
        runPatch.status = mapRuntimeStateToRunStatus(runtimeState)
        if (['SUCCESS', 'FAILED', 'CANCELLED'].includes(runtimeState)) {
          runPatch.progress = 100
        }
      }

      this.patchCurrentRun(runPatch)
    },
    createRunFromWorkflow(payload: {
      runId: string
      workflowId: string
      workflowName: string
      nodes: WorkflowGraphNode[]
      trigger?: WorkflowRun['trigger']
      backendInstanceId?: number
      runtimeWorkflowId?: string
      definitionId?: number
      backendStatus?: string
    }) {
      this.selectionRequestId += 1
      this.runsLoadRequestId += 1
      const createdAt = new Date()
      const startedRunLink = getStartedRunLink(payload.runId)
      const backendInstanceId =
        payload.backendInstanceId ??
        startedRunLink?.backendInstanceId ??
        backendInstanceIdFromRunId(payload.runId)
      const runtimeWorkflowId =
        payload.runtimeWorkflowId ??
        startedRunLink?.runtimeWorkflowId ??
        (backendInstanceId ? String(backendInstanceId) : undefined)
      const nodeStates: RunNodeState[] = payload.nodes.map((node, index) => ({
        nodeId: node.id,
        label: node.data.label,
        status: index === 0 ? 'running' : 'queued',
        retryCount: 0,
      }))
      const run: WorkflowRun = {
        id: payload.runId,
        workflowId: payload.workflowId,
        workflowName: payload.workflowName,
        backendInstanceId,
        runtimeWorkflowId,
        definitionId: payload.definitionId ?? startedRunLink?.definitionId,
        backendStatus: payload.backendStatus ?? startedRunLink?.backendStatus,
        status: 'running',
        startedAt: formatDateTime(createdAt),
        durationMs: 0,
        trigger: payload.trigger ?? 'manual',
        owner: 'aether.operator',
        traceId: `trace-${payload.runId}`,
        queueName: 'workflow-runtime',
        progress: 0,
        artifactCount: 0,
        artifactNames: [],
        nodeStates,
      }
      this.runs = [run, ...this.runs.filter((item) => item.id !== run.id)]
      this.currentRun = run
      this.initialized = true
      this.loading = false
      this.logsLoading = false
      this.error = null
      this.logs = [
        {
          id: `${run.id}-created`,
          time: formatTime(createdAt),
          level: 'info',
          message: i18n.global.t('runs.started', { workflow: run.workflowName }),
        },
      ]
      this.logsByRunId[run.id] = this.logs
      useFileStore().addArtifactsFromRun(run)
      const workflowStore = useWorkflowStore()
      if (runBelongsToWorkflow(run, workflowStore)) {
        nodeStates.forEach((node) => workflowStore.updateNodeStatus(node.nodeId, node.status, node.durationMs))
      }
      this.subscribeCurrentRun()
      return run
    },
    async cancelCurrentRun() {
      const run = this.currentRun
      const instanceId = run?.backendInstanceId ?? (run?.runtimeWorkflowId ? Number(run.runtimeWorkflowId) : undefined)
      if (!run || !instanceId || !Number.isInteger(instanceId) || instanceId <= 0) {
        return false
      }
      const runId = run.id
      await cancelWorkflowInstance(instanceId)
      const cachedRuns = [this.runs, this.historyRuns, this.workflowRuns].flatMap(runs => runs.filter(item => item.id === runId))
      const currentRun = this.currentRun?.id === runId ? this.currentRun : null
      // 只保护后端确认的终态；节点局部推断的 success/failed 不能忽略取消确认。
      if (cachedRuns.some(run => isBackendTerminalRun(run) && !isCancelledRun(run))
        || (currentRun && isBackendTerminalRun(currentRun) && !isCancelledRun(currentRun))) {
        return true
      }
      const patch: Partial<WorkflowRun> = { status: 'cancelled', backendStatus: 'CANCELLED', progress: 100 }
      // 按目标分别修改取消字段，保留列表与详情各自较新的节点、耗时等数据。
      for (const target of [...cachedRuns, currentRun]) {
        if (target && !isCancelledRun(target)) {
          this.runUpdateVersions[runId] = (this.runUpdateVersions[runId] ?? 0) + 1
          Object.assign(target, patch)
        }
      }
      if (currentRun && isCancelledRun(currentRun) && this.realtimeRunId === runId) {
        this.stopRunRealtime()
      }
      return true
    },
    async recoverCurrentRunRuntime(options: RunRecoveryOptions = {}) {
      const targetRun = this.currentRun
      const expectedRunId = options.expectedRunId ?? targetRun?.id
      const selectionRequestId = options.selectionRequestId ?? this.selectionRequestId
      const recoveryRequestId = ++this.runtimeRecoveryRequestId
      const updateVersion = expectedRunId ? (this.runUpdateVersions[expectedRunId] ?? 0) : 0
      const nodeVersions = { ...(expectedRunId ? this.nodeUpdateVersions[expectedRunId] : undefined) }
      // 只丢弃跨越取消完成的旧恢复；之后主动读取已取消运行仍可补齐历史日志。
      const wasCancelled = Boolean(targetRun && isCancelledRun(targetRun))
      const isCurrentTarget = () => Boolean(
        targetRun
        && expectedRunId
        && this.currentRun?.id === expectedRunId
        && (wasCancelled || !isCancelledRun(this.currentRun))
        && this.selectionRequestId === selectionRequestId
        && this.runtimeRecoveryRequestId === recoveryRequestId,
      )
      if (!targetRun || !expectedRunId || !runtimeWorkflowIdFromRun(targetRun)) {
        return
      }

      let recovery
      try {
        recovery = await runApi.recoverRuntime(targetRun)
      } catch (error) {
        if (!isCurrentTarget()) {
          return
        }
        const message = errorMessage(error)
        this.error = message
        this.appendLog({
          id: `${expectedRunId}-runtime-recovery-error-${Date.now()}`,
          time: formatTime(new Date()),
          level: 'warn',
          message: `Runtime recovery unavailable; retained current snapshot. ${message}`,
        })
        return
      }

      if (!isCurrentTarget()) {
        return
      }

      // HTTP 没有服务端版本：请求期间被更新的节点及运行中摘要不能回退。
      // 终态仍以服务端为准，且不使用进度单调假设阻止 WAITING 恢复等合法回退。
      const updatedWhileRecovering = (this.runUpdateVersions[expectedRunId] ?? 0) !== updateVersion
      const currentNodeVersions = { ...this.nodeUpdateVersions[expectedRunId] }
      recovery.nodePatches.forEach((patch) => {
        this.mergeCurrentNodeRetryCount(patch)
        if ((currentNodeVersions[patch.nodeId] ?? 0) === (nodeVersions[patch.nodeId] ?? 0)) {
          // 补齐未并发变更的历史节点，但不能用局部节点推断覆盖较新的运行摘要。
          this.patchNodeState(patch, { inferRunStatus: !updatedWhileRecovering })
        }
      })
      const authoritativeTerminal = recovery.runPatch?.backendStatus
        && ['SUCCESS', 'FAILED', 'CANCELLED'].includes(recovery.runPatch.backendStatus)
      if (this.currentRun && recovery.runPatch && (!updatedWhileRecovering || authoritativeTerminal)) {
        this.patchCurrentRun(recovery.runPatch)
      }

      if (recovery.logs.length > 0) {
        this.logs = mergeLogs(this.logs, recovery.logs)
        if (this.currentRun) {
          this.logsByRunId[this.currentRun.id] = this.logs
        }
      }
    },
    subscribeCurrentRun() {
      if (!this.currentRun) {
        return
      }
      // 选择流程中的日志或恢复请求可能晚于取消完成，不能重新打开已取消运行的订阅。
      if (isCancelledRun(this.currentRun)) {
        this.stopRunRealtime()
        return
      }
      stopRealtime?.()
      const realtimeSubscriptionId = ++this.realtimeSubscriptionId
      const subscribedRunId = this.currentRun.id
      this.realtimeRunId = subscribedRunId
      const subscribedRuntimeWorkflowId = runtimeWorkflowIdFromRun(this.currentRun)
      const isCurrentSubscription = () =>
        this.realtimeSubscriptionId === realtimeSubscriptionId
        && this.currentRun?.id === subscribedRunId
        && runtimeWorkflowIdFromRun(this.currentRun) === subscribedRuntimeWorkflowId
      const uiStore = useUiStore()
      const authStore = useAuthStore()
      const userId = authStore.user?.userId ?? authStore.user?.id
      if (userId) {
        uiStore.startNotificationStream(userId)
      }
      stopRealtime = realtimeClient.subscribeRun({
        runId: this.currentRun.id,
        runtimeWorkflowId: subscribedRuntimeWorkflowId,
      }, {
        onLog: (entry) => {
          if (isCurrentSubscription()) this.appendLog(entry)
        },
        onNodePatch: (patch) => {
          if (isCurrentSubscription()) this.patchNodeState(patch)
        },
        onRunPatch: (patch) => {
          if (isCurrentSubscription()) this.patchCurrentRun(patch)
        },
        onConnectionChange: (state) => {
          if (isCurrentSubscription()) this.runRealtimeState = state
        },
      })
    },
    stopRunRealtime() {
      this.realtimeSubscriptionId += 1
      const stop = stopRealtime
      stopRealtime = null
      this.realtimeRunId = null
      this.runRealtimeState = 'offline'
      stop?.()
    },
    stopRealtime() {
      this.stopRunRealtime()
      useUiStore().stopNotificationStream()
    },
  },
})
