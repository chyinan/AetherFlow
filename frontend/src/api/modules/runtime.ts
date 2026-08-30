// pattern: Imperative Shell
import { apiClient } from '@/api/client/apiClient'
import { runtimeEnv } from '@/config/runtimeEnv'

export type RuntimeState =
  | 'PENDING'
  | 'RUNNING'
  | 'RETRYING'
  | 'WAITING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED'

export type RuntimeEventType =
  | 'WORKFLOW_STARTED'
  | 'NODE_STARTED'
  | 'NODE_COMPLETED'
  | 'NODE_RETRYING'
  | 'NODE_WAITING'
  | 'WORKFLOW_WAITING'
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

export interface HumanApprovalRequest {
  approved: boolean
  comment?: string
  reviewer?: string
  method?: string
}

export interface RuntimeExecutionSnapshot {
  workflowId?: string
  runtimeState?: RuntimeState
  currentNodeId?: string
  currentNodeIds?: string[]
  variables?: Record<string, unknown>
}

export type WorkflowRuntimeStreamTokenResponse = {
  token: string
  tokenType?: string
  userId?: number | string
  workflowId: string
  expiresAt?: string
  expiresInSeconds?: number
  transports?: Array<string>
  queryParam?: string
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '')
}

function resolveUrl(base: string, path: string) {
  const normalizedPath = `/${trimSlashes(path)}`
  return `${base.replace(/\/+$/, '')}${normalizedPath}`
}

function toWebSocketUrl(url: string) {
  if (/^wss?:\/\//i.test(url)) {
    return url
  }
  if (/^https?:\/\//i.test(url)) {
    return url.replace(/^http/i, 'ws')
  }
  if (typeof window === 'undefined') {
    return url
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${url.startsWith('/') ? url : `/${url}`}`
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

export function approveHumanNode(
  workflowInstanceId: number | string,
  nodeId: string,
  request: HumanApprovalRequest,
) {
  return apiClient.post<RuntimeExecutionSnapshot>(
    `/workflow/runtime/instances/${encodeURIComponent(String(workflowInstanceId))}/nodes/${encodeURIComponent(nodeId)}/approval`,
    request,
    { source: 'runtime' },
  )
}

export function buildRuntimeSseUrl(workflowId: string) {
  return resolveUrl(
    runtimeEnv.sseBase,
    `/workflow/runtime/stream/${encodeURIComponent(workflowId)}`,
  )
}

export function issueRuntimeStreamToken(workflowId: string) {
  return apiClient.post<WorkflowRuntimeStreamTokenResponse>(
    `/workflow/runtime/stream-token/${encodeURIComponent(workflowId)}`,
    undefined,
    { source: 'runtime' },
  )
}

export function buildRuntimeWebSocketUrl(
  workflowId: string,
  streamToken: string,
  queryParam = 'streamToken',
  cursor?: string,
) {
  const baseUrl = resolveUrl(
    runtimeEnv.wsBase,
    `/workflow/runtime/ws/${encodeURIComponent(workflowId)}`,
  )
  const params = [
    `${encodeURIComponent(queryParam)}=${encodeURIComponent(streamToken)}`,
    ...(cursor ? [`cursor=${encodeURIComponent(cursor)}`] : []),
  ]
  return toWebSocketUrl(`${baseUrl}?${params.join('&')}`)
}
