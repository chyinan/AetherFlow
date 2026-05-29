import { apiClient } from '@/api/client/apiClient'
import { runtimeEnv } from '@/config/runtimeEnv'

export type RuntimeState =
  | 'PENDING'
  | 'RUNNING'
  | 'RETRYING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED'

export type RuntimeEventType =
  | 'WORKFLOW_STARTED'
  | 'NODE_STARTED'
  | 'NODE_COMPLETED'
  | 'NODE_RETRYING'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_FAILED'
  | 'WORKFLOW_CANCELLED'

export interface RuntimeMetrics {
  [key: string]: unknown
}

export interface RuntimeObservation {
  workflowId?: string
  traceId?: string
  taskId?: string
  runtimeState?: RuntimeState
  currentNodeId?: string
  completedNodeCount?: number
  totalNodeCount?: number
  progress?: number
}

export interface RuntimeEvent {
  eventId: string
  eventType: RuntimeEventType
  workflowId: string
  traceId: string
  taskId?: string
  nodeId?: string
  runtimeState: RuntimeState
  occurredAt?: string
  attributes?: Record<string, unknown>
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '')
}

function resolveUrl(base: string, path: string) {
  const normalizedPath = `/${trimSlashes(path)}`
  return `${base.replace(/\/+$/, '')}${normalizedPath}`
}

export function getRuntimeMetrics() {
  return apiClient.get<RuntimeMetrics>('/workflow/runtime/metrics', { source: 'runtime' })
}

export function getRuntimeObservation(workflowId: string) {
  return apiClient.get<RuntimeObservation | null>(
    `/workflow/runtime/observability/${encodeURIComponent(workflowId)}`,
    { source: 'runtime' },
  )
}

export function getRuntimeEvents(workflowId: string) {
  return apiClient.get<RuntimeEvent[]>(
    `/workflow/runtime/events/${encodeURIComponent(workflowId)}`,
    { source: 'runtime' },
  )
}

export function buildRuntimeSseUrl(workflowId: string) {
  return resolveUrl(
    runtimeEnv.sseBase,
    `/workflow/runtime/stream/${encodeURIComponent(workflowId)}`,
  )
}
