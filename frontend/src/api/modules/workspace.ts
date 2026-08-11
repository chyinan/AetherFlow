// pattern: Imperative Shell
import { apiClient } from '@/api/client/apiClient'

export type WorkspaceEnvironment = 'dev' | 'staging' | 'prod' | string

export type WorkspaceSummary = {
  id: string
  name: string
  slug?: string
  region?: string
  environment?: WorkspaceEnvironment
  owner?: string
  memberCount?: number
  defaultTimeoutMin?: number
  retentionDays?: number
  updatedAt?: string
}

export type WorkspaceCreateRequest = {
  name: string
  slug?: string
  region?: string
  environment?: WorkspaceEnvironment
  ownerUserId?: number
  ownerName?: string
  memberCount?: number
  defaultTimeoutMin?: number
  retentionDays?: number
}

export type WorkspaceUpdateRequest = Partial<WorkspaceCreateRequest> & {
  status?: string
}

export type WorkspacePageResponse = {
  pageNo: number
  pageSize: number
  total: number
  records: WorkspaceSummary[]
}

export function listWorkspaces(query = '', page = 1, size = 100) {
  return apiClient.get<WorkspacePageResponse>('/workspaces', {
    params: { query, page, size },
    source: 'workflow',
  })
}

export function createWorkspace(payload: WorkspaceCreateRequest) {
  return apiClient.post<WorkspaceSummary>('/workspaces', payload, { source: 'workflow' })
}

export function getWorkspace(workspaceId: number | string) {
  return apiClient.get<WorkspaceSummary>(
    `/workspaces/${encodeURIComponent(String(workspaceId))}`,
    { source: 'workflow' },
  )
}

export function updateWorkspace(workspaceId: number | string, payload: WorkspaceUpdateRequest) {
  return apiClient.put<WorkspaceSummary>(
    `/workspaces/${encodeURIComponent(String(workspaceId))}`,
    payload,
    { source: 'workflow' },
  )
}

export function deleteWorkspace(workspaceId: number | string) {
  return apiClient.delete<void>(
    `/workspaces/${encodeURIComponent(String(workspaceId))}`,
    { source: 'workflow' },
  )
}
