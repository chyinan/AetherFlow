import type { WorkflowNodeStatus } from './workflow'

export type RunStatus = 'queued' | 'running' | 'success' | 'failed' | 'paused'

export interface RunNodeState {
  nodeId: string
  label: string
  status: WorkflowNodeStatus
  durationMs?: number
}

export interface RunLogEntry {
  id: string
  time: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  nodeId?: string
}

export interface WorkflowRun {
  id: string
  workflowId: string
  workflowName: string
  status: RunStatus
  startedAt: string
  durationMs: number
  nodeStates: RunNodeState[]
  artifactCount: number
}
