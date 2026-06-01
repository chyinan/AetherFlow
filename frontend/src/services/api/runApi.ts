import { toApiError } from '@/api/client/apiError'
import {
  getWorkflowInstance,
  getWorkflowInstanceLogs,
  listWorkflowInstances,
  type WorkflowRunLogFrameDTO,
  type WorkflowRunNodeSummaryDTO,
  type WorkflowRunViewDTO,
} from '@/api/modules/workflow'
import {
  mapObservationToRunPatch,
  mapRuntimeEventToLogEntry,
  mapRuntimeEventsToNodePatches,
  mapRuntimeStateToNodeStatus,
  mapRuntimeStateToRunStatus,
} from '@/api/mappers/runtimeMapper'
import { getRuntimeEvents, getRuntimeObservation, type RuntimeState } from '@/api/modules/runtime'
import { runtimeEnv } from '@/config/runtimeEnv'
import { getStartedRunLink } from '@/services/api/workflowApi'
import type { ApiErrorSource } from '@/types/api'
import type { RunLogEntry, RunNodeState, WorkflowRun } from '@/types/run'

import { mockLogs, mockRuns } from '../mock/runMock'
import { delay } from '../mock/timing'

const RUNTIME_UNAVAILABLE_STATUSES = new Set([0, 408, 502, 503, 504])
const RUNTIME_STATES = new Set(['PENDING', 'RUNNING', 'RETRYING', 'SUCCESS', 'FAILED', 'CANCELLED'])

export interface RuntimeRecovery {
  runPatch?: Partial<WorkflowRun>
  logs: RunLogEntry[]
  nodePatches: RunNodeState[]
}

function shouldUseMockFallback(error: unknown, source: ApiErrorSource = 'runtime') {
  if (!runtimeEnv.mockFallback) {
    return false
  }

  const apiError = toApiError(error, source)

  if (apiError.source === 'network') {
    return true
  }

  return typeof apiError.status === 'number' && RUNTIME_UNAVAILABLE_STATUSES.has(apiError.status)
}

function shouldNoopRuntimeRecovery(error: unknown) {
  return shouldUseMockFallback(error, 'runtime')
}

export function backendInstanceIdFromRunId(id: string) {
  const match = /^(?:run-)?(\d+)$/.exec(id)
  return match ? Number(match[1]) : undefined
}

export function runtimeWorkflowIdFromRun(run: Pick<WorkflowRun, 'id' | 'runtimeWorkflowId' | 'backendInstanceId'>) {
  return run.runtimeWorkflowId ?? (
    typeof run.backendInstanceId === 'number'
      ? String(run.backendInstanceId)
      : backendInstanceIdFromRunId(run.id)?.toString()
  )
}

function toRuntimeState(value?: string): RuntimeState | undefined {
  const normalized = String(value ?? '').trim().toUpperCase()
  return RUNTIME_STATES.has(normalized) ? normalized as RuntimeState : undefined
}

function formatDateTime(value?: string) {
  if (!value) {
    return new Date().toLocaleString('zh-CN', { hour12: false })
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function formatTime(value?: string) {
  if (!value) {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false })
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString('zh-CN', { hour12: false })
}

function durationBetween(startedAt?: string, completedAt?: string) {
  if (typeof startedAt !== 'string' || typeof completedAt !== 'string') {
    return undefined
  }

  const started = new Date(startedAt)
  const completed = new Date(completedAt)
  if (Number.isNaN(started.getTime()) || Number.isNaN(completed.getTime()) || completed < started) {
    return undefined
  }

  return completed.getTime() - started.getTime()
}

function normalizeLogLevel(level?: string): RunLogEntry['level'] {
  const normalized = String(level ?? '').toLowerCase()
  if (normalized === 'error') return 'error'
  if (normalized === 'warn' || normalized === 'warning') return 'warn'
  if (normalized === 'debug') return 'debug'
  return 'info'
}

function mapBackendNode(node: WorkflowRunNodeSummaryDTO): RunNodeState {
  const status = mapRuntimeStateToNodeStatus(toRuntimeState(node.status))
  const durationMs = typeof node.durationMs === 'number'
    ? node.durationMs
    : durationBetween(node.startedAt, node.completedAt)

  return {
    nodeId: node.nodeId || 'unknown-node',
    label: node.nodeId || 'Unknown node',
    status,
    durationMs,
    output: node.latestEventType || node.status || status,
  }
}

function progressFromRun(view: WorkflowRunViewDTO, nodeStates: RunNodeState[]) {
  const status = mapRuntimeStateToRunStatus(toRuntimeState(view.status))
  if (status === 'success' || status === 'failed' || status === 'paused') {
    return 100
  }

  if (nodeStates.length === 0) {
    return status === 'running' ? 8 : 0
  }

  const completed = nodeStates.filter((node) => ['success', 'failed', 'paused', 'skipped'].includes(node.status)).length
  return Math.round((completed / Math.max(nodeStates.length, 1)) * 100)
}

function mapBackendRun(view: WorkflowRunViewDTO): WorkflowRun {
  const id = `run-${view.id}`
  const startedRunLink = getStartedRunLink(id)
  const nodeStates = (view.nodes ?? []).map(mapBackendNode)
  const definitionId = view.definitionId ?? startedRunLink?.definitionId
  const workflowId = startedRunLink?.workflowId ?? view.workflowId ?? (definitionId ? `wf-definition-${definitionId}` : `wf-runtime-${view.id}`)

  return {
    id,
    workflowId,
    workflowName: view.workflowName || (definitionId ? `Workflow Definition ${definitionId}` : `Runtime ${view.runtimeWorkflowId ?? view.id}`),
    backendInstanceId: view.id,
    runtimeWorkflowId: view.runtimeWorkflowId ?? String(view.id),
    definitionId,
    currentNodeId: view.currentNodeId,
    backendStatus: view.status,
    status: mapRuntimeStateToRunStatus(toRuntimeState(view.status)),
    startedAt: formatDateTime(view.startedAt ?? view.updatedAt),
    durationMs: Math.max(0, Number(view.durationMs ?? 0)),
    trigger: 'manual',
    owner: view.userId ? `user-${view.userId}` : 'aether.operator',
    traceId: view.traceId || `trace-${view.id}`,
    queueName: 'workflow-runtime',
    progress: progressFromRun(view, nodeStates),
    nodeStates,
    artifactCount: 0,
    artifactNames: [],
  }
}

function createBackendRunPlaceholder(runId: string): WorkflowRun {
  const startedRunLink = getStartedRunLink(runId)
  const backendInstanceId = startedRunLink?.backendInstanceId ?? backendInstanceIdFromRunId(runId)
  const runtimeWorkflowId = startedRunLink?.runtimeWorkflowId ?? backendInstanceId?.toString()

  return {
    id: runId,
    workflowId: startedRunLink?.workflowId ?? `wf-backend-${backendInstanceId ?? runId}`,
    workflowName: startedRunLink?.workflowId ?? `Backend Runtime ${backendInstanceId ?? runId}`,
    backendInstanceId,
    runtimeWorkflowId,
    definitionId: startedRunLink?.definitionId,
    backendStatus: startedRunLink?.backendStatus,
    status: mapRuntimeStateToRunStatus(toRuntimeState(startedRunLink?.backendStatus)),
    startedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    durationMs: 0,
    trigger: 'manual',
    owner: 'aether.operator',
    traceId: `trace-${runId}`,
    queueName: 'workflow-runtime',
    progress: 0,
    nodeStates: [],
    artifactCount: 0,
    artifactNames: [],
  }
}

function mapBackendLog(frame: WorkflowRunLogFrameDTO, index = 0): RunLogEntry {
  return {
    id: frame.id || frame.eventId || `${frame.workflowId ?? 'runtime'}-${frame.eventType ?? 'event'}-${index}`,
    time: formatTime(frame.occurredAt),
    level: normalizeLogLevel(frame.level),
    message: frame.message || `${frame.eventType ?? 'Runtime event'} for ${frame.nodeId ?? frame.workflowId ?? 'workflow'}.`,
    nodeId: frame.nodeId,
  }
}

async function recoverObservation(runtimeWorkflowId: string) {
  try {
    return mapObservationToRunPatch(await getRuntimeObservation(runtimeWorkflowId))
  } catch (error) {
    if (shouldNoopRuntimeRecovery(error)) {
      return undefined
    }
    throw error
  }
}

async function recoverEvents(runtimeWorkflowId: string) {
  try {
    const events = await getRuntimeEvents(runtimeWorkflowId)
    const safeEvents = Array.isArray(events) ? events : []

    return {
      logs: safeEvents.map(mapRuntimeEventToLogEntry),
      nodePatches: mapRuntimeEventsToNodePatches(safeEvents),
    }
  } catch (error) {
    if (shouldNoopRuntimeRecovery(error)) {
      return { logs: [], nodePatches: [] }
    }
    throw error
  }
}

async function recoverRuntime(run: WorkflowRun): Promise<RuntimeRecovery> {
  const runtimeWorkflowId = runtimeWorkflowIdFromRun(run)
  if (!runtimeWorkflowId) {
    return { logs: [], nodePatches: [] }
  }

  const [observationResult, eventsResult] = await Promise.allSettled([
    recoverObservation(runtimeWorkflowId),
    recoverEvents(runtimeWorkflowId),
  ])

  if (observationResult.status === 'rejected') {
    throw observationResult.reason
  }

  if (eventsResult.status === 'rejected') {
    throw eventsResult.reason
  }

  return {
    runPatch: observationResult.value,
    logs: eventsResult.value.logs,
    nodePatches: eventsResult.value.nodePatches,
  }
}

async function getRun(runId: string) {
  const mockRun = mockRuns.find((run) => run.id === runId)
  if (mockRun) {
    return delay(mockRun)
  }

  const backendInstanceId = backendInstanceIdFromRunId(runId)
  if (backendInstanceId) {
    try {
      return mapBackendRun(await getWorkflowInstance(backendInstanceId))
    } catch (error) {
      if (shouldUseMockFallback(error, 'workflow')) {
        return delay(createBackendRunPlaceholder(runId))
      }
      throw error
    }
  }

  return delay(mockRuns[0])
}

async function getLogs(runId: string) {
  const mockRun = mockRuns.find((run) => run.id === runId)
  if (mockRun) {
    return delay(mockLogs)
  }

  const backendInstanceId = backendInstanceIdFromRunId(runId)
  if (backendInstanceId) {
    try {
      const logs = await getWorkflowInstanceLogs(backendInstanceId)
      return Array.isArray(logs) ? logs.map(mapBackendLog) : []
    } catch (error) {
      if (shouldUseMockFallback(error, 'workflow')) {
        return delay<RunLogEntry[]>([])
      }
      throw error
    }
  }

  return delay(mockLogs)
}

async function listRuns() {
  try {
    const page = await listWorkflowInstances({ page: 1, pageSize: 50 })
    return (page.items ?? []).map(mapBackendRun)
  } catch (error) {
    if (shouldUseMockFallback(error, 'workflow')) {
      return delay(mockRuns)
    }
    throw error
  }
}

export const runApi = {
  listRuns,
  getRun,
  getLogs,
  recoverRuntime,
}
