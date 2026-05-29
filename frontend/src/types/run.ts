import type { WorkflowNodeStatus } from './workflow'

export type RunStatus = 'queued' | 'running' | 'success' | 'failed' | 'paused'

export interface RunNodeState {
  nodeId: string
  label: string
  status: WorkflowNodeStatus
  durationMs?: number
  output?: string
  retryCount?: number
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
  backendInstanceId?: number
  runtimeWorkflowId?: string
  definitionId?: number
  currentNodeId?: string
  backendStatus?: string
  status: RunStatus
  startedAt: string
  durationMs: number
  trigger: 'manual' | 'schedule' | 'api'
  owner: string
  traceId: string
  queueName: string
  progress: number
  nodeStates: RunNodeState[]
  artifactCount: number
  artifactNames: string[]
}
