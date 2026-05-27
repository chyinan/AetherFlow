import { defineStore } from 'pinia'

import { runApi } from '@/services/api/runApi'
import { realtimeClient } from '@/services/realtime/realtimeClient'
import type { RunLogEntry, RunNodeState, WorkflowRun } from '@/types/run'

import { useUiStore } from './uiStore'
import { useWorkflowStore } from './workflowStore'

let stopRealtime: (() => void) | null = null

export const useRunStore = defineStore('run', {
  state: () => ({
    runs: [] as WorkflowRun[],
    currentRun: null as WorkflowRun | null,
    logs: [] as RunLogEntry[],
    loading: false,
  }),
  actions: {
    async loadRuns() {
      this.loading = true
      try {
        this.runs = await runApi.listRuns()
        this.currentRun = this.currentRun ?? this.runs[0] ?? null
        this.logs = this.currentRun ? await runApi.getLogs(this.currentRun.id) : []
      } finally {
        this.loading = false
      }
    },
    async selectRun(runId: string) {
      this.currentRun = await runApi.getRun(runId)
      this.logs = await runApi.getLogs(runId)
      this.subscribeCurrentRun()
    },
    appendLog(entry: RunLogEntry) {
      this.logs = [...this.logs.slice(-80), entry]
    },
    patchNodeState(patch: RunNodeState) {
      if (!this.currentRun) {
        return
      }
      const state = this.currentRun.nodeStates.find((node) => node.nodeId === patch.nodeId)
      if (state) {
        Object.assign(state, patch)
      }
      const workflowStore = useWorkflowStore()
      workflowStore.updateNodeStatus(patch.nodeId, patch.status, patch.durationMs)
    },
    subscribeCurrentRun() {
      if (!this.currentRun) {
        return
      }
      stopRealtime?.()
      const uiStore = useUiStore()
      stopRealtime = realtimeClient.subscribeRun(this.currentRun.id, {
        onLog: (entry) => this.appendLog(entry),
        onNodePatch: (patch) => this.patchNodeState(patch),
        onConnectionChange: (state) => uiStore.setRealtimeState(state),
      })
    },
    stopRealtime() {
      stopRealtime?.()
      stopRealtime = null
    },
  },
})
