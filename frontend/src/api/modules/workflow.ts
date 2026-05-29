import { apiClient } from '@/api/client/apiClient'

export interface WorkflowDefinitionNodeDTO {
  nodeId: string
  nodeType: string
  displayName?: string
  config?: Record<string, unknown>
}

export interface WorkflowDefinitionDTO {
  name: string
  description?: string
  nodes: WorkflowDefinitionNodeDTO[]
}

export interface WorkflowDefinitionEntity {
  id: number
  name: string
  description?: string
  definitionJson?: string
  version?: number
  status?: string
  createdAt?: string
  updatedAt?: string
}

export interface StartWorkflowRequest {
  userId?: number
  input?: Record<string, unknown>
}

export interface WorkflowInstanceEntity {
  id: number
  definitionId: number
  userId?: number
  status?: string
  inputJson?: string
  currentNodeId?: string
  startedAt?: string
  completedAt?: string
  updatedAt?: string
}

export function createDefinition(payload: WorkflowDefinitionDTO) {
  return apiClient.post<WorkflowDefinitionEntity>('/workflows/definitions', payload, {
    source: 'workflow',
  })
}

export function startInstance(definitionId: number, payload: StartWorkflowRequest = {}) {
  return apiClient.post<WorkflowInstanceEntity>(
    `/workflows/definitions/${definitionId}/instances`,
    payload,
    { source: 'workflow' },
  )
}
