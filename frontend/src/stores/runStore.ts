import { defineStore } from 'pinia'

// pattern: Mixed (needs refactoring)

import { toApiError } from '@/api/client/apiError'
import { mapRuntimeStateToRunStatus } from '@/api/mappers/runtimeMapper'
import type { RuntimeExecutionSnapshot } from '@/api/modules/runtime'
import { i18n } from '@/i18n'
import { backendInstanceIdFromRunId, runApi, runtimeWorkflowIdFromRun } from '@/services/api/runApi'
import { getStartedRunLink } from '@/services/api/workflowApi'
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

type RunRecoveryOptions = {
  readonly expectedRunId?: string
  readonly selectionRequestId?: number
}

export const useRunStore = defineStore('run', {
  state: () => ({
    runs: [] as WorkflowRun[],
    currentRun: null as WorkflowRun | null,
    logs: [] as RunLogEntry[],
    logsByRunId: {} as Record<string, RunLogEntry[]>,
    loading: false,
    logsLoading: false,
    error: null as string | null,
    initialized: false,
    selectionRequestId: 0,
    runsLoadRequestId: 0,
    realtimeSubscriptionId: 0,
    runRealtimeState: 'offline' as 'online' | 'reconnecting' | 'offline',
  }),
  getters: {
    statusCounts: (state) =>
      state.runs.reduce(
        (acc, run) => {
          acc[run.status] += 1
          return acc
        },
        { queued: 0, running: 0, success: 0, failed: 0, paused: 0 } as Record<WorkflowRun['status'], number>,
      ),
    currentRunProgress: (state) => state.currentRun?.progress ?? 0,
  },
  actions: {
    async loadRuns(options: { selectDefault?: boolean } = {}) {
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
      try {
        const loadedRuns = await runApi.listRuns()
        if (!isCurrentLoad()) {
          return
        }
        this.runs = loadedRuns
        if (selectDefault) {
          const selectedRun = this.currentRun ?? this.runs[0] ?? null
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
    async refreshRuns() {
      this.initialized = false
      await this.loadRuns()
    },
    async selectRun(runId: string) {
      const selectionRequestId = ++this.selectionRequestId
      const isCurrentSelection = () => this.selectionRequestId === selectionRequestId
      this.loading = true
      this.logsLoading = true
      this.error = null
      try {
        await this.loadRuns({ selectDefault: false })
        if (!isCurrentSelection()) {
          return
        }
        this.loading = true
        this.logsLoading = true
        const localRun = this.runs.find((run) => run.id === runId)
        const selectedRun = localRun ?? (await runApi.getRun(runId))
        if (!isCurrentSelection()) {
          return
        }
        this.currentRun = selectedRun
        const cachedLogs = this.logsByRunId[runId]
        this.logs = cachedLogs ?? []
        const selectedLogs = cachedLogs ?? await runApi.getLogs(runId)
        if (!isCurrentSelection() || this.currentRun?.id !== runId) {
          return
        }
        this.logs = selectedLogs
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
      await this.loadRuns({ selectDefault: false })
      const run = this.runs.find((item) =>
        item.workflowId === workflowId
        || (typeof definitionId === 'number' && item.definitionId === definitionId),
      )
      if (!run) {
        this.clearCurrentRun()
        return null
      }
      if (this.currentRun?.id !== run.id) {
        await this.selectRun(run.id)
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
    patchNodeState(patch: RunNodeState) {
      if (!this.currentRun) {
        return
      }
      const state = this.currentRun.nodeStates.find((node) => node.nodeId === patch.nodeId)
      if (state && isTerminalNodeStatus(state.status)
        && (!isTerminalNodeStatus(patch.status) || state.status !== patch.status)) {
        return
      }
      const normalizedPatch = patch.approval || patch.status === 'paused'
        ? patch
        : { ...patch, approval: undefined }
      if (state) {
        Object.assign(state, normalizedPatch.label === patch.nodeId
          ? { ...normalizedPatch, label: state.label }
          : normalizedPatch)
      } else {
        this.currentRun.nodeStates.push(normalizedPatch)
      }
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
      const runInList = this.runs.find((run) => run.id === this.currentRun?.id)
      if (runInList) {
        Object.assign(runInList, this.currentRun)
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

      const currentTerminal = isTerminalRunStatus(this.currentRun.status) || isCancelledRun(this.currentRun)
      const incomingTerminal = Boolean(patch.status && isTerminalRunStatus(patch.status)) || isCancelledRun(patch)
      if (currentTerminal && (!incomingTerminal
        || (patch.status && this.currentRun.status !== patch.status)
        || (patch.backendStatus && this.currentRun.backendStatus !== patch.backendStatus))) {
        return
      }
      Object.assign(this.currentRun, patch)
      const runInList = this.runs.find((run) => run.id === this.currentRun?.id)
      if (runInList) {
        Object.assign(runInList, this.currentRun)
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
    async recoverCurrentRunRuntime(options: RunRecoveryOptions = {}) {
      const targetRun = this.currentRun
      const expectedRunId = options.expectedRunId ?? targetRun?.id
      const isCurrentTarget = () => Boolean(
        targetRun
        && expectedRunId
        && this.currentRun?.id === expectedRunId
        && (options.selectionRequestId === undefined || this.selectionRequestId === options.selectionRequestId),
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

      recovery.nodePatches.forEach((patch) => this.patchNodeState(patch))

      if (this.currentRun && recovery.runPatch) {
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
      stopRealtime?.()
      const realtimeSubscriptionId = ++this.realtimeSubscriptionId
      const subscribedRunId = this.currentRun.id
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
    stopRealtime() {
      this.realtimeSubscriptionId += 1
      stopRealtime?.()
      stopRealtime = null
      this.runRealtimeState = 'offline'
      useUiStore().stopNotificationStream()
    },
  },
})
