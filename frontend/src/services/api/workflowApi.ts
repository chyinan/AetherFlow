import { toApiError } from '@/api/client/apiError'
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import { createDefinition, startInstance } from '@/api/modules/workflow'
import { runtimeEnv } from '@/config/runtimeEnv'
import { useAuthStore } from '@/stores/authStore'
import type { ApiErrorSource } from '@/types/api'
import type { WorkflowDefinition, WorkflowSummary } from '@/types/workflow'

import { createWorkflow, workflowDefinitions, workflowSummaries } from '../mock/workflowMock'
import { delay } from '../mock/timing'

const DEFINITION_LINKS_STORAGE_KEY = 'aetherflow.workflow.backendDefinitionLinks'
const RUN_LINKS_STORAGE_KEY = 'aetherflow.workflow.backendRunLinks'
const UNAVAILABLE_STATUSES = new Set([0, 408, 502, 503, 504])

export interface StartedRunLink {
  runId: string
  workflowId: string
  backendInstanceId?: number
  runtimeWorkflowId?: string
  definitionId?: number
  backendStatus?: string
}

export type WorkflowRunInput = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readStorageRecord<T>(key: string): Record<string, T> {
  try {
    if (typeof localStorage === 'undefined') {
      return {}
    }

    const parsed = JSON.parse(localStorage.getItem(key) ?? '{}') as unknown
    return isRecord(parsed) ? parsed as Record<string, T> : {}
  } catch {
    return {}
  }
}

function writeStorageRecord<T>(key: string, value: Record<string, T>) {
  try {
    if (typeof localStorage === 'undefined') {
      return
    }

    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Backend success must not be reported as a frontend failure because storage is blocked.
  }
}

function shouldUseMockFallback(error: unknown, source: ApiErrorSource, allowNotFound = false) {
  if (!runtimeEnv.mockFallback) {
    return false
  }

  const apiError = toApiError(error, source)

  if (apiError.source === 'network') {
    return true
  }

  if (allowNotFound && apiError.status === 404) {
    return true
  }

  if (typeof apiError.status === 'number' && UNAVAILABLE_STATUSES.has(apiError.status)) {
    return true
  }

  return apiError.source === 'gateway' && apiError.retryable
}

function updateMockWorkflowCache(workflow: WorkflowDefinition, backendDefinitionId?: number, backendStatus?: string) {
  const savedAt = new Date().toISOString()
  const updatedAt = new Date().toLocaleString('zh-CN', { hour12: false })
  const persistedDefinitionId = backendDefinitionId ?? workflow.backendDefinitionId ?? getBackendDefinitionId(workflow.id)
  const persistedStatus = backendStatus ?? workflow.backendStatus
  const savedWorkflow: WorkflowDefinition = {
    ...structuredClone(workflow),
    backendDefinitionId: persistedDefinitionId,
    backendStatus: persistedStatus,
    savedAt,
  }

  workflowDefinitions[workflow.id] = savedWorkflow
  const summary = workflowSummaries.find((item) => item.id === workflow.id)
  if (summary) {
    summary.status = 'ready'
    summary.updatedAt = updatedAt
    summary.backendDefinitionId = persistedDefinitionId
    summary.backendStatus = persistedStatus
    summary.savedAt = savedAt
  }

  return savedWorkflow
}

function setBackendDefinitionId(workflowId: string, backendDefinitionId: number) {
  const links = readStorageRecord<number>(DEFINITION_LINKS_STORAGE_KEY)
  links[workflowId] = backendDefinitionId
  writeStorageRecord(DEFINITION_LINKS_STORAGE_KEY, links)
}

export function getBackendDefinitionId(workflowId: string) {
  const cachedWorkflow = workflowDefinitions[workflowId]
  return cachedWorkflow?.backendDefinitionId ?? readStorageRecord<number>(DEFINITION_LINKS_STORAGE_KEY)[workflowId]
}

function setStartedRunLink(link: StartedRunLink) {
  const links = readStorageRecord<StartedRunLink>(RUN_LINKS_STORAGE_KEY)
  links[link.runId] = link
  writeStorageRecord(RUN_LINKS_STORAGE_KEY, links)
}

export function getStartedRunLink(runId: string) {
  return readStorageRecord<StartedRunLink>(RUN_LINKS_STORAGE_KEY)[runId]
}

function currentUserId() {
  try {
    return useAuthStore().user?.userId
  } catch {
    return undefined
  }
}

function startMockRun(workflowId: string): Promise<StartedRunLink> {
  return delay({ runId: `run-${Date.now()}`, workflowId }, 220)
}

function normalizeRunInput(input: WorkflowRunInput = {}) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )
}

export const workflowApi = {
  listWorkflows() {
    return delay<WorkflowSummary[]>(workflowSummaries)
  },
  getWorkflow(_id: string) {
    return delay(workflowDefinitions[_id] ?? createWorkflow(_id, _id.replace(/^wf-/, '').replaceAll('-', ' ')))
  },
  registerWorkflowDefinition(workflowId: string, workflowName: string) {
    workflowDefinitions[workflowId] = createWorkflow(workflowId, workflowName)
  },
  async saveWorkflow(workflow: WorkflowDefinition) {
    try {
      const entity = await createDefinition(mapWorkflowToDefinitionDTO(workflow))
      setBackendDefinitionId(workflow.id, entity.id)
      const savedWorkflow = updateMockWorkflowCache(workflow, entity.id, entity.status)
      return {
        ...savedWorkflow,
        backendDefinitionId: entity.id,
        backendStatus: entity.status,
        savedAt: savedWorkflow.savedAt ?? new Date().toISOString(),
      }
    } catch (error) {
      if (shouldUseMockFallback(error, 'workflow')) {
        return delay(updateMockWorkflowCache(workflow), 260)
      }
      throw error
    }
  },
  async startRun(workflowId: string, input: WorkflowRunInput = {}): Promise<StartedRunLink> {
    const backendDefinitionId = getBackendDefinitionId(workflowId)

    if (!backendDefinitionId) {
      return startMockRun(workflowId)
    }

    try {
      const normalizedInput = normalizeRunInput(input)
      const instance = await startInstance(backendDefinitionId, {
        userId: currentUserId(),
        input: normalizedInput,
      })
      const runId = `run-${instance.id}`
      const link: StartedRunLink = {
        runId,
        workflowId,
        backendInstanceId: instance.id,
        runtimeWorkflowId: String(instance.id),
        definitionId: instance.definitionId,
        backendStatus: instance.status,
      }

      setStartedRunLink(link)

      return {
        ...link,
        runId,
        workflowId,
      }
    } catch (error) {
      if (shouldUseMockFallback(error, 'workflow')) {
        return startMockRun(workflowId)
      }
      throw error
    }
  },
}
