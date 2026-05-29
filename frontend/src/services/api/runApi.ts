import { toApiError } from '@/api/client/apiError'
import {
  mapObservationToRunPatch,
  mapRuntimeEventsToNodePatches,
  mapRuntimeEventToLogEntry,
} from '@/api/mappers/runtimeMapper'
import { getRuntimeEvents, getRuntimeObservation } from '@/api/modules/runtime'
import { runtimeEnv } from '@/config/runtimeEnv'
import { getStartedRunLink } from '@/services/api/workflowApi'
import type { RunLogEntry, RunNodeState, WorkflowRun } from '@/types/run'

import { mockLogs, mockRuns } from '../mock/runMock'
import { delay } from '../mock/timing'

const RUNTIME_UNAVAILABLE_STATUSES = new Set([0, 404, 408, 502, 503, 504])

export interface RuntimeRecovery {
  runPatch?: Partial<WorkflowRun>
  logs: RunLogEntry[]
  nodePatches: RunNodeState[]
}

function shouldNoopRuntimeRecovery(error: unknown) {
  if (!runtimeEnv.mockFallback) {
    return false
  }

  const apiError = toApiError(error, 'runtime')

  if (apiError.source === 'network') {
    return true
  }

  return typeof apiError.status === 'number' && RUNTIME_UNAVAILABLE_STATUSES.has(apiError.status)
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

function isBackendLookingRunId(runId: string) {
  return Boolean(getStartedRunLink(runId) || backendInstanceIdFromRunId(runId))
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
    status: 'running',
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

  if (isBackendLookingRunId(runId)) {
    return delay(createBackendRunPlaceholder(runId))
  }

  return delay(mockRuns[0])
}

function getLogs(runId: string) {
  const mockRun = mockRuns.find((run) => run.id === runId)
  if (!mockRun && isBackendLookingRunId(runId)) {
    return delay<RunLogEntry[]>([])
  }

  return delay(mockLogs)
}

function listRuns() {
  return delay(mockRuns)
}

export const runApi = {
  listRuns,
  getRun,
  getLogs,
  recoverRuntime,
}
