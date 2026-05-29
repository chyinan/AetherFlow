import { defineStore } from 'pinia'

import { i18n } from '@/i18n'
import { backendInstanceIdFromRunId, runApi, runtimeWorkflowIdFromRun } from '@/services/api/runApi'
import { getStartedRunLink } from '@/services/api/workflowApi'
import { realtimeClient } from '@/services/realtime/realtimeClient'
import type { RunLogEntry, RunNodeState, WorkflowRun } from '@/types/run'
import type { WorkflowGraphNode } from '@/types/workflow'

import { useAuthStore } from './authStore'
import { useFileStore } from './fileStore'
import { useUiStore } from './uiStore'
import { useWorkflowStore } from './workflowStore'

let stopRealtime: (() => void) | null = null

function mergeLogs(currentLogs: RunLogEntry[], recoveredLogs: RunLogEntry[]) {
  const merged = new Map(currentLogs.map((log) => [log.id, log]))
  recoveredLogs.forEach((log) => merged.set(log.id, log))
  return [...merged.values()].slice(-100)
}

export const useRunStore = defineStore('run', {
  state: () => ({
    runs: [] as WorkflowRun[],
    currentRun: null as WorkflowRun | null,
    logs: [] as RunLogEntry[],
    logsByRunId: {} as Record<string, RunLogEntry[]>,
    loading: false,
    initialized: false,
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

      if (this.initialized) {
        if (selectDefault && !this.currentRun) {
          this.currentRun = this.runs[0] ?? null
          this.logs = this.currentRun ? await runApi.getLogs(this.currentRun.id) : []
          if (this.currentRun) {
            this.logsByRunId[this.currentRun.id] = this.logs
          }
        }
        return
      }
      this.loading = true
      try {
        this.runs = await runApi.listRuns()
        if (selectDefault) {
          this.currentRun = this.currentRun ?? this.runs[0] ?? null
          this.logs = this.currentRun ? await runApi.getLogs(this.currentRun.id) : []
          if (this.currentRun) {
            this.logsByRunId[this.currentRun.id] = this.logs
          }
        }
        this.initialized = true
      } finally {
        this.loading = false
      }
    },
    async selectRun(runId: string) {
      await this.loadRuns({ selectDefault: false })
      const localRun = this.runs.find((run) => run.id === runId)
      this.currentRun = localRun ?? (await runApi.getRun(runId))
      this.logs = this.logsByRunId[runId] ?? await runApi.getLogs(runId)
      this.logsByRunId[runId] = this.logs
      await this.recoverCurrentRunRuntime()
      this.subscribeCurrentRun()
    },
    appendLog(entry: RunLogEntry) {
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
      if (state) {
        Object.assign(state, patch.label === patch.nodeId ? { ...patch, label: state.label } : patch)
      } else {
        this.currentRun.nodeStates.push(patch)
      }
      const completed = this.currentRun.nodeStates.filter((node) => ['success', 'failed', 'skipped'].includes(node.status)).length
      this.currentRun.progress = Math.round((completed / Math.max(this.currentRun.nodeStates.length, 1)) * 100)
      if (this.currentRun.nodeStates.some((node) => node.status === 'failed')) {
        this.currentRun.status = 'failed'
      } else if (this.currentRun.progress >= 100) {
        this.currentRun.status = 'success'
        useFileStore().markRunArtifactsReady(this.currentRun.id)
      } else if (this.currentRun.nodeStates.some((node) => node.status === 'running')) {
        this.currentRun.status = 'running'
      }
      const runInList = this.runs.find((run) => run.id === this.currentRun?.id)
      if (runInList) {
        Object.assign(runInList, this.currentRun)
      }
      const workflowStore = useWorkflowStore()
      workflowStore.updateNodeStatus(patch.nodeId, patch.status, patch.durationMs)
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
        output: index === 0 ? i18n.global.t('runs.mockOutputs.accepted') : i18n.global.t('runs.mockOutputs.waiting'),
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
        startedAt: createdAt.toLocaleString('zh-CN', { hour12: false }),
        durationMs: 0,
        trigger: payload.trigger ?? 'manual',
        owner: 'aether.operator',
        traceId: `trace-${payload.runId}`,
        queueName: 'af.task.ai.media',
        progress: Math.max(8, Math.round(100 / Math.max(nodeStates.length, 1))),
        artifactCount: 4,
        artifactNames: ['audio.wav', 'transcript.txt', 'subtitle.srt', 'summary.md'],
        nodeStates,
      }
      this.runs = [run, ...this.runs.filter((item) => item.id !== run.id)]
      this.currentRun = run
      this.initialized = true
      this.logs = [
        {
          id: `${run.id}-created`,
          time: createdAt.toLocaleTimeString('zh-CN', { hour12: false }),
          level: 'info',
          message: i18n.global.t('runs.mockLogs.started', { workflow: run.workflowName, queue: run.queueName }),
        },
      ]
      this.logsByRunId[run.id] = this.logs
      useFileStore().addArtifactsFromRun(run)
      nodeStates.forEach((node) => useWorkflowStore().updateNodeStatus(node.nodeId, node.status, node.durationMs))
      this.subscribeCurrentRun()
      return run
    },
    async recoverCurrentRunRuntime() {
      if (!this.currentRun || !runtimeWorkflowIdFromRun(this.currentRun)) {
        return
      }

      const recovery = await runApi.recoverRuntime(this.currentRun)
      recovery.nodePatches.forEach((patch) => this.patchNodeState(patch))

      if (this.currentRun && recovery.runPatch) {
        Object.assign(this.currentRun, recovery.runPatch)
        const runInList = this.runs.find((run) => run.id === this.currentRun?.id)
        if (runInList) {
          Object.assign(runInList, this.currentRun)
        }
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
      const uiStore = useUiStore()
      const authStore = useAuthStore()
      const userId = authStore.user?.userId ?? authStore.user?.id
      if (userId) {
        uiStore.startNotificationStream(userId)
      }
      stopRealtime = realtimeClient.subscribeRun(this.currentRun.id, {
        onLog: (entry) => this.appendLog(entry),
        onNodePatch: (patch) => this.patchNodeState(patch),
        onConnectionChange: (state) => uiStore.setRealtimeState(state),
      })
    },
    stopRealtime() {
      stopRealtime?.()
      stopRealtime = null
      useUiStore().stopNotificationStream()
    },
  },
})
