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

export interface WorkflowRunNodeSummaryDTO {
  nodeId?: string
  status?: string
  latestEventType?: string
  startedAt?: string
  completedAt?: string
  durationMs?: number
  attributes?: Record<string, unknown>
}

export interface WorkflowRunViewDTO {
  id: number
  definitionId?: number
  workflowId?: string
  workflowName?: string
  runtimeWorkflowId?: string
  userId?: number
  status?: string
  currentNodeId?: string
  traceId?: string
  startedAt?: string
  completedAt?: string
  updatedAt?: string
  durationMs?: number
  nodes?: WorkflowRunNodeSummaryDTO[]
}

export interface WorkflowRunPageResponse {
  page?: number
  pageSize?: number
  total?: number
  items?: WorkflowRunViewDTO[]
}

export interface WorkflowRunLogFrameDTO {
  id?: string
  eventId?: string
  level?: string
  message?: string
  workflowId?: string
  traceId?: string
  taskId?: string
  nodeId?: string
  eventType?: string
  runtimeState?: string
  occurredAt?: string
  attributes?: Record<string, unknown>
}

export function createDefinition(payload: WorkflowDefinitionDTO) {
  return apiClient.post<WorkflowDefinitionEntity>('/workflows/definitions', payload, {
    source: 'workflow',
  })
}

export function updateDefinition(definitionId: number | string, payload: WorkflowDefinitionDTO) {
  return apiClient.put<WorkflowDefinitionEntity>(
    `/workflows/definitions/${encodeURIComponent(String(definitionId))}`,
    payload,
    { source: 'workflow' },
  )
}

export function deleteDefinition(definitionId: number | string) {
  return apiClient.delete<void>(
    `/workflows/definitions/${encodeURIComponent(String(definitionId))}`,
    { source: 'workflow' },
  )
}

export function listDefinitions() {
  return apiClient.get<WorkflowDefinitionEntity[]>('/workflows/definitions', {
    source: 'workflow',
  })
}

export function getDefinition(definitionId: number | string) {
  return apiClient.get<WorkflowDefinitionEntity>(
    `/workflows/definitions/${encodeURIComponent(String(definitionId))}`,
    { source: 'workflow' },
  )
}

export function startInstance(definitionId: number, payload: StartWorkflowRequest = {}) {
  return apiClient.post<WorkflowInstanceEntity>(
    `/workflows/definitions/${definitionId}/instances`,
    payload,
    { source: 'workflow' },
  )
}

export interface ListWorkflowInstancesParams {
  workflowId?: string
  status?: string
  page?: number
  pageSize?: number
}

export function listWorkflowInstances(params: ListWorkflowInstancesParams = {}) {
  return apiClient.get<WorkflowRunPageResponse>('/workflow-instances', {
    params,
    source: 'workflow',
  })
}

export function getWorkflowInstance(id: number | string) {
  return apiClient.get<WorkflowRunViewDTO>(`/workflow-instances/${encodeURIComponent(String(id))}`, {
    source: 'workflow',
  })
}

export function getWorkflowInstanceLogs(id: number | string) {
  return apiClient.get<WorkflowRunLogFrameDTO[]>(`/workflow-instances/${encodeURIComponent(String(id))}/logs`, {
    source: 'workflow',
  })
}
