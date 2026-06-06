import { apiClient } from '@/api/client/apiClient'

export interface WorkflowNodeCatalogItem {
  type?: string
  nodeType?: string
  displayName?: string
  description?: string
  category?: string
  configSchema?: WorkflowNodeConfigSchema[]
  inputVariables?: WorkflowNodeVariableSchema[]
  outputVariables?: WorkflowNodeVariableSchema[]
  exampleConfig?: Record<string, unknown>
  [key: string]: unknown
}

export interface WorkflowNodeConfigUiSchema {
  mode?: 'basic' | 'advanced' | string
  control?: string
  min?: number
  max?: number
  step?: number
}

export interface WorkflowNodeConfigSchema {
  name: string
  type: string
  required?: boolean
  description?: string
  example?: unknown
  options?: string[]
  ui?: WorkflowNodeConfigUiSchema | null
}

export interface WorkflowNodeVariableSchema {
  name: string
  type?: string
  description?: string
  example?: unknown
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
