// pattern: Imperative Shell
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

export type GovernanceSnapshot = {
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

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null
}

export async function getGovernanceSnapshot(): Promise<GovernanceSnapshot> {
  const results = await Promise.allSettled([
    apiClient.get<WorkflowNodeMetricsSnapshot>('/workflow/node/metrics', { source: 'workflow' }),
    apiClient.get<EmbeddingMetricsSnapshot>('/workflow/embedding/metrics', { source: 'workflow' }),
    apiClient.get<OCRMetricsSnapshot>('/workflow/ocr/metrics', { source: 'workflow' }),
    apiClient.get<QueueHealthSnapshot>('/task/metrics', { source: 'task' }),
    apiClient.get<FileStatusResponse>('/file/status', { source: 'file' }),
    apiClient.get<FileMetricsResponse>('/file/metrics', { source: 'file' }),
    apiClient.get<AuthMetricsResponse>('/auth/status', { source: 'auth' }),
    apiClient.get<AuthMetricsResponse>('/auth/metrics', { source: 'auth' }),
    apiClient.get<GatewayStatusResponse>('/gateway/status', { source: 'gateway' }),
  ])

  return {
    workflowNode: settledValue(results[0]),
    embedding: settledValue(results[1]),
    ocr: settledValue(results[2]),
    queue: settledValue(results[3]),
    fileStatus: settledValue(results[4]),
    fileMetrics: settledValue(results[5]),
    authStatus: settledValue(results[6]),
    authMetrics: settledValue(results[7]),
    gateway: settledValue(results[8]),
  }
}
