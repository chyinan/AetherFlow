import { apiClient } from '@/api/client/apiClient'

export interface WorkflowNodeCatalogItem {
  nodeType?: string
  displayName?: string
  description?: string
  category?: string
  configSchema?: Record<string, unknown>
  [key: string]: unknown
}

export interface WorkflowNodeMetrics {
  [key: string]: unknown
}

export function getNodeCatalog() {
  return apiClient.get<WorkflowNodeCatalogItem[]>('/workflow/node/catalog', { source: 'workflow' })
}

export function getNodeMetrics() {
  return apiClient.get<WorkflowNodeMetrics>('/workflow/node/metrics', { source: 'workflow' })
}
