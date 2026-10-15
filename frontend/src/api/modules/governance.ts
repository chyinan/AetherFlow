// pattern: Imperative Shell
import { toApiError } from '@/api/client/apiError'
import type { ApiErrorSource } from '@/types/api'
import { apiClient } from '@/api/client/apiClient'

export type WorkflowNodeMetricsSnapshot = {
  executionCount?: number
  retryCount?: number
  failCount?: number
}

export type EmbeddingMetricsSnapshot = {
  embeddingCount?: number
  failCount?: number
  averageDurationMs?: number
  vectorCount?: number
  currentModel?: string
}

export type OCRMetricsSnapshot = {
  ocrCount?: number
  failCount?: number
  averageDurationMs?: number
}

export type QueueHealthSnapshot = {
  status?: string
  busy?: boolean
  reason?: string
  readyMessages?: number
  unackedMessages?: number
  totalMessages?: number
  consumers?: number
  rejectedTaskCount?: number
  checkedAt?: string
}

export type FileStatusResponse = {
  minioStatus?: string
  fileCount?: number
  uploadingTaskCount?: number
  storageSizeBytes?: number
}

export type FileMetricsResponse = FileStatusResponse & {
  averageUploadDurationMs?: number
}

export type AuthMetricsResponse = {
  onlineUserCount?: number
  tokenCount?: number
  loginFailureCount?: number
}

export type GatewayStatusResponse = {
  service?: string
  status?: string
  time?: string
  authEnabled?: boolean
  sentinelEnabled?: boolean
  routeCount?: number
  routes?: string[]
}

export type GovernanceDataSnapshot = {
  workflowNode: WorkflowNodeMetricsSnapshot | null
  embedding: EmbeddingMetricsSnapshot | null
  ocr: OCRMetricsSnapshot | null
  queue: QueueHealthSnapshot | null
  fileStatus: FileStatusResponse | null
  fileMetrics: FileMetricsResponse | null
  authStatus: AuthMetricsResponse | null
  authMetrics: AuthMetricsResponse | null
  gateway: GatewayStatusResponse | null
}

export type GovernanceResourceKey = keyof GovernanceDataSnapshot
export type GovernanceResourceState = 'available' | 'forbidden' | 'unavailable'
export type GovernanceSnapshot = GovernanceDataSnapshot & {
  resources: Partial<Record<GovernanceResourceKey, GovernanceResourceState>>
}

const requests: Record<GovernanceResourceKey, { path: string; source: ApiErrorSource }> = {
  workflowNode: { path: '/workflow/node/metrics', source: 'workflow' },
  embedding: { path: '/workflow/embedding/metrics', source: 'workflow' },
  ocr: { path: '/workflow/ocr/metrics', source: 'workflow' },
  queue: { path: '/task/metrics', source: 'task' },
  fileStatus: { path: '/file/status', source: 'file' },
  fileMetrics: { path: '/file/metrics', source: 'file' },
  authStatus: { path: '/auth/status', source: 'auth' },
  authMetrics: { path: '/auth/metrics', source: 'auth' },
  gateway: { path: '/gateway/status', source: 'gateway' },
}

export const governanceResourceKeys = Object.keys(requests) as GovernanceResourceKey[]

export async function getGovernanceSnapshot(keys = governanceResourceKeys): Promise<GovernanceSnapshot> {
  const snapshot: GovernanceSnapshot = {
    workflowNode: null, embedding: null, ocr: null, queue: null,
    fileStatus: null, fileMetrics: null, authStatus: null, authMetrics: null, gateway: null,
    resources: {},
  }
  await Promise.all(keys.map(async (key) => {
    const request = requests[key]
    try {
      const value = await apiClient.get(request.path, { source: request.source })
      Object.assign(snapshot, { [key]: value })
      snapshot.resources[key] = 'available'
    } catch (error) {
      const apiError = toApiError(error, request.source)
      snapshot.resources[key] = apiError.status === 403 ? 'forbidden' : 'unavailable'
    }
  }))
  return snapshot
}
